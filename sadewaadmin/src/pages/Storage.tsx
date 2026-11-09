import React, { useEffect, useState } from 'react';
import { Save, HardDrive, Zap, Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, authHeaders } from '@/context/AuthContext';
import { Switch, useDialog } from '@/components/ui';
import type { ReportCategory, ReportSubcategory } from '@/types';

export default function Storage() {
  const { token, isSuper } = useAuth();
  const dialog = useDialog();
  const [cats, setCats] = useState<ReportCategory[]>([]);
  const [subs, setSubs] = useState<ReportSubcategory[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => { const r = await api<{success:true;categories:ReportCategory[];subcategories:ReportSubcategory[]}>(`/api/admin/categories`, { headers: authHeaders(token) }); setCats(r.categories); setSubs(r.subcategories); };
  useEffect(()=>{ load(); }, []); // eslint-disable-line

  const saveCat = async (c: ReportCategory) => { await api(`/api/admin/categories/${c.id}`, { method:'PUT', headers: authHeaders(token), body: JSON.stringify({ config: c.config, active: c.active }) }); setMsg(`Konfigurasi ${c.name} disimpan.`); };
  const saveSub = async (s: ReportSubcategory) => { await api(`/api/admin/subcategories/${s.id}`, { method:'PUT', headers: authHeaders(token), body: JSON.stringify({ config: s.config, active: s.active }) }); setMsg(`Konfigurasi ${s.name} disimpan.`); };
  const setCat = (id:string, patch:any)=>setCats(cs=>cs.map(c=>c.id===id?{...c, config:{...(c.config||{}), ...(patch.config||{})}, ...(patch.active!==undefined?{active:patch.active}:{})}:c));
  const setSub = (id:string, patch:any)=>setSubs(ss=>ss.map(s=>s.id===id?{...s, config:{...(s.config||{}), ...patch}}:s));

  const provision = async (catId: string, name: string) => {
    const ok = await dialog.confirm({ title: 'Otomasi & Aktifkan', tone: 'info', confirmLabel: 'Aktifkan', message: <>Buat Spreadsheet & Folder Drive terpisah untuk <b>{name}</b> (jika belum ada) lalu simpan ID-nya?</> });
    if (!ok) return;
    setBusy(catId); setMsg('');
    try {
      const r = await api<any>(`/api/admin/categories/${catId}/provision`, { method:'POST', headers: authHeaders(token), body: JSON.stringify({}) });
      setMsg(r.message || `Berhasil diprovision.`); dialog.toast(r.message || 'Berhasil.', 'success'); await load();
    } catch(e:any){ setMsg(`Gagal: ${e.message}`); dialog.toast(`Gagal: ${e.message}`, 'danger'); } finally { setBusy(null); }
  };
  const provisionAll = async () => {
    const ok = await dialog.confirm({ title: 'Otomasi Semua Kategori', tone: 'warning', confirmLabel: 'Proses Semua', message: 'Otomasi & aktifkan SEMUA kategori? Tiap kategori akan mendapat Spreadsheet + Folder Drive sendiri.' });
    if (!ok) return;
    setBusy('ALL'); setMsg('');
    try { const r = await api<any>(`/api/admin/provision-all`, { method:'POST', headers: authHeaders(token), body: JSON.stringify({}) }); setMsg(r.message || 'Selesai.'); dialog.toast(r.message || 'Selesai.', 'success'); await load(); }
    catch(e:any){ setMsg(`Gagal: ${e.message}`); dialog.toast(`Gagal: ${e.message}`, 'danger'); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      {isSuper && <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500 dark:text-slate-400"><span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{cats.length}</span> kategori<span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span><span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{cats.filter(c=>c.config?.spreadsheetId && c.config?.driveRootFolderId).length}</span> siap</div>
        <button onClick={provisionAll} disabled={busy==='ALL'} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white px-4 py-2.5 text-sm font-semibold">{busy==='ALL'?<Loader2 className="w-4 h-4 animate-spin"/>:<Zap className="w-4 h-4"/>}Otomasi Semua Kategori</button>
      </div>}
      {msg && <div className="rounded-xl border border-slate-500/20 bg-slate-500/10 text-slate-200 px-4 py-3 text-sm whitespace-pre-wrap">{msg}</div>}
      {cats.map(cat => {
        const ready = Boolean(cat.config?.spreadsheetId && cat.config?.driveRootFolderId);
        return (
        <div key={cat.id} className={`rounded-2xl border ${ready?'border-emerald-500/30':'border-slate-200 dark:border-slate-800'} bg-white dark:bg-[#0F172A] p-5 space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold flex items-center gap-2">{cat.name} <span className="text-xs font-normal text-slate-500">(kategori utama)</span>{ready && <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3"/>Terpisah & Aktif</span>}</div>
            <div className="flex items-center gap-2 flex-wrap">
              {isSuper && <button onClick={()=>provision(cat.id, cat.name)} disabled={busy===cat.id} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white px-3.5 py-2 text-sm font-semibold">{busy===cat.id?<Loader2 className="w-4 h-4 animate-spin"/>:<Zap className="w-4 h-4"/>}{ready?'Re-provision':'Otomasi & Aktifkan'}</button>}
              <button onClick={()=>saveCat(cat)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-3.5 py-2 text-sm font-semibold"><Save className="w-4 h-4"/>Simpan</button>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Spreadsheet ID (milik kategori)" value={cat.config?.spreadsheetId||''} onChange={v=>setCat(cat.id,{config:{spreadsheetId:v}})} link={cat.config?.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${cat.config.spreadsheetId}` : undefined} />
            <Field label="Root Drive Folder ID (milik kategori)" value={cat.config?.driveRootFolderId||''} onChange={v=>setCat(cat.id,{config:{driveRootFolderId:v}})} link={cat.config?.driveRootFolderId ? `https://drive.google.com/drive/folders/${cat.config.driveRootFolderId}` : undefined} />
            <Field label="Nama Folder Drive" value={cat.config?.driveFolder||''} onChange={v=>setCat(cat.id,{config:{driveFolder:v}})} />
          </div>
          <Switch checked={cat.active!==false} onChange={v=>setCat(cat.id,{active:v})} label={<span className="text-slate-400">Kategori aktif</span>} size="sm" />
          <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
            <div className="text-xs text-slate-500">Subkategori (mewarisi Spreadsheet & Root Folder kategori; atur nama tab/folder):</div>
            {subs.filter(s=>s.categoryId===cat.id).map(sub => (
              <div key={sub.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/40 dark:bg-slate-900/20">
                <div className="flex items-center justify-between"><div className="font-medium text-sm">{sub.name}</div><button onClick={()=>saveSub(sub)} className="text-xs inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5"><Save className="w-3.5 h-3.5"/>Simpan</button></div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <Field label="Folder Drive" value={sub.config?.driveFolder||''} onChange={v=>setSub(sub.id,{driveFolder:v})} small />
                  <Field label="Sheet Laporan" value={sub.config?.reportSheet||''} onChange={v=>setSub(sub.id,{reportSheet:v})} small />
                  <Field label="Sheet Foto" value={sub.config?.photoSheet||''} onChange={v=>setSub(sub.id,{photoSheet:v})} small />
                  <Field label="Sheet Narasi" value={sub.config?.narrativeSheet||''} onChange={v=>setSub(sub.id,{narrativeSheet:v})} small />
                </div>
              </div>
            ))}
            {!subs.filter(s=>s.categoryId===cat.id).length && <div className="text-xs text-slate-500">Belum ada subkategori.</div>}
          </div>
        </div>);})}
      {!cats.length && <div className="text-slate-500">Belum ada kategori.</div>}
    </div>
  );
}
function Field({ label, value, onChange, small, link }: { label:string; value:string; onChange:(v:string)=>void; small?:boolean; link?:string }) {
  return <label className="block"><span className={`font-semibold text-slate-500 uppercase flex items-center gap-1.5 ${small?'text-[10px]':'text-xs'}`}>{label}{link && value && <a href={link} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="text-blue-400 hover:text-blue-300 normal-case font-medium inline-flex items-center gap-0.5"><ExternalLink className="w-3 h-3"/>buka</a>}</span><input value={value} onChange={e=>onChange(e.target.value)} className={`mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent focus:border-blue-500 focus:outline-none ${small?'px-2.5 py-2 text-xs':'px-3 py-2.5 text-sm'}`} /></label>;
}
