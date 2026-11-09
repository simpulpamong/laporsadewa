import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, RotateCcw, Trash2, AlertTriangle, Filter, Image as ImageIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, authHeaders } from '@/context/AuthContext';
import { Dropdown, Modal, ImageLightbox, type LightboxImage } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ReportCategory, ReportSubcategory } from '@/types';

export default function Sampah() {
  const { token, isSuper, user } = useAuth();
  const [cats, setCats] = useState<ReportCategory[]>([]);
  const [subs, setSubs] = useState<ReportSubcategory[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [catId, setCatId] = useState(''); const [subId, setSubId] = useState('');
  const [loading, setLoading] = useState(false); const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [lb, setLb] = useState<{ open: boolean; images: LightboxImage[]; index: number }>({ open: false, images: [], index: 0 });

  useEffect(() => { (async()=>{ try{ const r = await api<{success:true;categories:ReportCategory[];subcategories:ReportSubcategory[]}>(`/api/admin/categories`, { headers: authHeaders(token) }); setCats(r.categories); setSubs(r.subcategories); if(!isSuper && r.categories.length===1) setCatId(r.categories[0].id); }catch{}})(); }, []); // eslint-disable-line

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const q = new URLSearchParams({ trash: '1' }); if (catId) q.set('categoryId', catId); if (subId) q.set('subcategoryId', subId);
      const r = await api<{success:true;items:any[]}>(`/api/admin/rekap?${q}`, { headers: authHeaders(token) });
      setItems(r.items || []);
    } catch(e:any){ setErr(e.message); } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); }, [catId, subId]); // eslint-disable-line

  const restore = async (it: any) => {
    setBusy(true); setMsg('');
    try { await api(`/api/admin/rekap/${it.id}/restore`, { method: 'POST', headers: authHeaders(token) }); setMsg(`Dipulihkan: ${it.reportId||it.id}. Baris dikembalikan dari sheet SAMPAH.`); load(); }
    catch(e:any){ setErr(e.message); } finally { setBusy(false); }
  };
  const delPermanent = async (it: any) => {
    setBusy(true); setMsg(''); setConfirm(null);
    try { await api(`/api/admin/rekap/${it.id}`, { method: 'DELETE', headers: authHeaders(token) }); setMsg(`Dihapus permanen: ${it.reportId||it.id}. Data dihapus dari sheet SAMPAH dan file Drive dipindah ke Sampah Drive.`); load(); }
    catch(e:any){ setErr(e.message); } finally { setBusy(false); }
  };
  const openPhotos = (it: any) => {
    const imgs: LightboxImage[] = (Array.isArray(it.photos) ? it.photos : []).map((p: any) => ({ src: p.link || (p.fileId ? `https://drive.google.com/uc?export=view&id=${p.fileId}` : ''), name: p.namaFile, fileId: p.fileId, link: p.link })).filter((x: LightboxImage) => x.src);
    if (!imgs.length) { setErr('Tidak ada tautan foto tersimpan untuk laporan ini.'); return; }
    setLb({ open: true, images: imgs, index: 0 });
  };

  const scopeNote = !isSuper ? `Akses scope: ${(user?.categoryScopes||[]).map(id=>cats.find(c=>c.id===id)?.name||id).join(', ')||'(belum diatur)'}` : null;
  const catOpts = useMemo(() => (isSuper ? [{value:'',label:'Semua'}] : []).concat(cats.map(c=>({value:c.id,label:c.name}))), [cats,isSuper]);
  const subOpts = useMemo(() => [{value:'',label:'Semua'}].concat(subs.filter(s=>!catId||s.categoryId===catId).map(s=>({value:s.id,label:s.name}))), [subs,catId]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {scopeNote ? <p className="text-xs text-amber-500">{scopeNote}</p> : <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{items.length}</span> item di sampah</p>}
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700/60"><RefreshCw className={cn('w-4 h-4', loading&&'animate-spin')}/>Muat Ulang</button>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-2 items-end rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] px-3 py-2.5">
        <Filter className="w-3.5 h-3.5 text-slate-400 mb-1.5 shrink-0" />
        <div className="block w-full sm:w-auto"><span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Kategori</span><div className="mt-0.5 w-full sm:min-w-[170px]"><Dropdown value={catId} onChange={v=>{setCatId(v); setSubId('');}} options={catOpts} /></div></div>
        <div className="block w-full sm:w-auto"><span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Subkategori</span><div className="mt-0.5 w-full sm:min-w-[190px]"><Dropdown value={subId} onChange={setSubId} options={subOpts} /></div></div>
      </div>
      {msg && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 px-4 py-3 text-sm">{msg}</div>}
      {err && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 px-4 py-3 text-sm">{err}</div>}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs uppercase tracking-wider"><tr><th className="text-left px-4 py-3">Waktu/Hapus</th><th className="text-left px-4 py-3">ID/Kategori</th><th className="text-left px-4 py-3">Lokasi</th><th className="text-left px-4 py-3">Foto</th><th className="text-left px-4 py-3">Aksi</th></tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {items.map((it:any)=>(
                <tr key={it.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500"><div>{it.waktuSubmit||'-'}</div>{it.deletedAt && <div className="text-[11px] text-amber-400">Dihapus</div>}</td>
                  <td className="px-4 py-3"><div className="font-medium">{it.reportId||'-'}</div><div className="text-xs text-slate-500">{cats.find(c=>c.id===it.categoryId)?.name||it.categoryId} / {subs.find(s=>s.id===it.subcategoryId)?.name||it.subcategoryId||'-'}</div></td>
                  <td className="px-4 py-3 max-w-[240px] truncate" title={it.lokasi}>{it.lokasi||'-'}</td>
                  <td className="px-4 py-3"><button onClick={()=>openPhotos(it)} className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"><ImageIcon className="w-3.5 h-3.5"/>{it.jumlahFoto ?? '-'}</button></td>
                  <td className="px-4 py-3"><div className="flex items-center gap-2 flex-wrap">
                    <button disabled={busy} onClick={()=>restore(it)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 px-2.5 py-1.5 text-xs font-semibold hover:bg-emerald-500/10 disabled:opacity-50"><RotateCcw className="w-3.5 h-3.5"/>Pulihkan</button>
                    <button disabled={busy} onClick={()=>setConfirm(it)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 text-rose-400 px-2.5 py-1.5 text-xs font-semibold hover:bg-rose-500/10 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5"/>Hapus Permanen</button>
                  </div></td>
                </tr>
              ))}
              {!items.length && !loading && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Sampah kosong.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!confirm} onClose={()=>setConfirm(null)} title="Hapus Permanen" icon={<AlertTriangle className="w-4 h-4 text-rose-400"/>} size="sm"
        footer={<><button onClick={()=>setConfirm(null)} className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold">Batal</button><button disabled={busy} onClick={()=>delPermanent(confirm)} className="rounded-xl bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Hapus Permanen</button></>}>
        <p className="text-sm text-slate-600 dark:text-slate-300">Laporan <b>{confirm?.reportId}</b> akan dihapus permanen dari sheet <code>SAMPAH</code> dan file/folder Drive dipindahkan ke <b>Sampah Drive</b>. Tindakan ini tidak dapat dibatalkan dari aplikasi.</p>
      </Modal>
      <ImageLightbox open={lb.open} images={lb.images} index={lb.index} onClose={()=>setLb(s=>({...s,open:false}))} onIndex={i=>setLb(s=>({...s,index:i}))} />
    </div>
  );
}
