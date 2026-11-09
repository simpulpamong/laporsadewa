import React, { useEffect, useState } from 'react';
import { Save, Wand2, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, authHeaders } from '@/context/AuthContext';
import { Dropdown, Switch, useDialog } from '@/components/ui';
import type { ReportCategory, ReportSubcategory, FormatField } from '@/types';

function extractFieldsFromTemplate(template: string): FormatField[] {
  const lines = template.split(/\r?\n/);
  const found: FormatField[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    // match *LABEL:* or LABEL: at start
    const m = raw.replace(/\*/g,'').match(/^\s*([A-Z0-9 /()&,-]{3,60}?)\s*[:：]\s*/);
    if (!m) continue;
    const label = m[1].trim().replace(/\s+/g,' ');
    if (/^(kepada|yth|tembusan|dokumentasi)/i.test(label)) continue;
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/(^_|_$)/g,'').slice(0,40);
    if (!key || seen.has(key)) continue; seen.add(key);
    found.push({ key, label, aliases: [label.toUpperCase(), label], required: false, type: 'text' });
  }
  return found;
}

export default function FormatParser() {
  const { token } = useAuth();
  const dialog = useDialog();
  const [cats, setCats] = useState<ReportCategory[]>([]);
  const [subs, setSubs] = useState<ReportSubcategory[]>([]);
  const [sel, setSel] = useState('');
  const [sub, setSub] = useState<ReportSubcategory | null>(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const r = await api<{success:true;categories:ReportCategory[];subcategories:ReportSubcategory[]}>(`/api/admin/categories`, { headers: authHeaders(token) });
    setCats(r.categories); setSubs(r.subcategories);
    if (!sel && r.subcategories?.length) setSel(r.subcategories.find((s:any)=>s.active!==false)?.id || r.subcategories[0].id);
  };
  useEffect(()=>{ load(); }, []); // eslint-disable-line
  useEffect(()=>{ const s = subs.find(x=>x.id===sel) || null; setSub(s ? JSON.parse(JSON.stringify(s)) : null); setMsg(''); }, [sel, subs]);
  useEffect(()=>{ if (subs.length && !subs.some(s=>s.id===sel)) setSel(subs.find(s=>s.active!==false)?.id || subs[0].id); }, [subs]); // eslint-disable-line

  const save = async () => {
    if (!sub) return;
    try { await api(`/api/admin/subcategories/${sub.id}`, { method:'PUT', headers: authHeaders(token), body: JSON.stringify({ format: sub.format, config: sub.config, name: sub.name, description: sub.description, active: sub.active }) }); setMsg('Tersimpan. Parser dinamis memakai konfigurasi ini.'); dialog.toast('Format & parser tersimpan.', 'success'); load(); }
    catch(e:any){ dialog.toast(e.message, 'danger'); }
  };
  const auto = () => {
    if (!sub) return;
    const extracted = extractFieldsFromTemplate(sub.format?.template || '');
    if (!extracted.length) { dialog.toast('Tidak menemukan pola label (LABEL:) pada template.', 'warning'); return; }
    const existing = new Map((sub.format?.fields||[]).map(f=>[f.key,f]));
    const merged = extracted.map(f => existing.get(f.key) ? { ...f, ...existing.get(f.key), aliases: Array.from(new Set([...(f.aliases||[]), ...((existing.get(f.key)?.aliases)||[])])) } : f);
    setSub({ ...sub, format: { ...(sub.format||{template:''}), fields: merged, version: (sub.format?.version||1)+1 } });
    setMsg(`Dibentuk ${merged.length} field dari template (merge dengan field existing).`);
    dialog.toast(`${merged.length} field dibentuk dari template.`, 'success');
  };
  const setField = (i:number, patch: Partial<FormatField>) => { if(!sub) return; const fields=[...(sub.format?.fields||[])]; fields[i]={...fields[i],...patch}; setSub({...sub, format:{...sub.format, template: sub.format?.template||'', fields}}); };
  const addField = () => sub && setSub({...sub, format:{...sub.format, template: sub.format?.template||'', fields:[...(sub.format?.fields||[]), { key:`field_${Date.now()}`, label:'Label Baru', aliases:[], required:false, type:'text' }]}});
  const delField = (i:number) => sub && setSub({...sub, format:{...sub.format, template: sub.format?.template||'', fields:(sub.format?.fields||[]).filter((_,idx)=>idx!==i)}});

  return (
    <div className="space-y-5">

      <div className="flex flex-wrap gap-3 items-end">
        <div className="block min-w-[260px] w-full sm:w-auto">
          <span className="text-xs font-semibold text-slate-500 uppercase">Subkategori</span>
          <div className="mt-1">
            <Dropdown
              value={sel}
              onChange={setSel}
              placeholder="Pilih subkategori…"
              groups={cats.map(c => ({
                label: c.name,
                options: subs.filter(s => s.categoryId === c.id).map(s => ({ value: s.id, label: `${s.name}${s.active === false ? ' (nonaktif)' : ''}` })),
              })).filter(g => g.options.length)}
            />
          </div>
        </div>
        {sub && <><button onClick={auto} className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300 px-4 py-2.5 text-sm font-semibold"><Wand2 className="w-4 h-4"/>Bentuk Parser dari Template</button>
        <button onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 text-sm font-semibold"><Save className="w-4 h-4"/>Simpan</button></>}
      </div>
      {msg && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 px-4 py-3 text-sm">{msg}</div>}
      {sub && (
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-5 space-y-2">
            <div className="font-semibold">Template Laporan ({sub.name})</div>
            <p className="text-xs text-slate-500">Format teks yang ditempel petugas (WhatsApp/dll). Gunakan pola <code className="text-slate-300">LABEL:</code> atau <code className="text-slate-300">*LABEL:*</code>.</p>
            <textarea value={sub.format?.template||''} onChange={e=>setSub({...sub, format:{...(sub.format||{fields:[]}), template:e.target.value}})} rows={18} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-3 py-2.5 text-sm font-mono focus:border-blue-500 focus:outline-none" />
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-5 space-y-3">
            <div className="flex items-center justify-between"><div className="font-semibold">Field Parser ({sub.format?.fields?.length||0})</div><button onClick={addField} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold"><Plus className="w-3.5 h-3.5"/>Field</button></div>
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1 custom-scrollbar">
              {(sub.format?.fields||[]).map((f,i)=>(
                <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2 bg-slate-50/50 dark:bg-slate-900/30">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={f.key} onChange={e=>setField(i,{key:e.target.value})} placeholder="key" className="rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2.5 py-2 text-xs font-mono" />
                    <input value={f.label} onChange={e=>setField(i,{label:e.target.value})} placeholder="Label" className="rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2.5 py-2 text-xs" />
                  </div>
                  <input value={(f.aliases||[]).join(', ')} onChange={e=>setField(i,{aliases:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} placeholder="Alias/label cocok, pisahkan koma" className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2.5 py-2 text-xs" />
                  <div className="flex items-center gap-3 text-xs"><Switch size="sm" checked={!!f.required} onChange={v=>setField(i,{required:v})} label={<span className="text-xs">Wajib</span>} />
                    <div className="w-[130px]"><Dropdown value={f.type||'text'} onChange={v=>setField(i,{type:v as any})} options={[{value:'text',label:'text'},{value:'time',label:'time'},{value:'number',label:'number'},{value:'multiline',label:'multiline'}]} /></div>
                    <button onClick={()=>delField(i)} className="ml-auto text-rose-400 hover:text-rose-300 p-1"><Trash2 className="w-4 h-4"/></button>
                  </div>
                </div>
              ))}
              {!(sub.format?.fields||[]).length && <div className="text-sm text-slate-500 py-6 text-center">Belum ada field. Isi template lalu klik <b>Bentuk Parser dari Template</b>.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
