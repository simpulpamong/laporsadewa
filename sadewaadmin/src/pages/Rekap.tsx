import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ExternalLink, Filter, MapPin, Pencil, Trash2, Image as ImageIcon, Save, AlertTriangle, Printer, FileSignature, TableProperties } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, authHeaders } from '@/context/AuthContext';
import { Dropdown, DateRangePicker, Modal, ImageLightbox, type LightboxImage } from '@/components/ui';
import { buildBeritaAcara, buildRekap, DEFAULT_PRINT_SETTINGS, mergePrintSettings, type PrintOptions } from '@/lib/cetak';
import { PrintPreviewModal, type PrintDoc } from '@/components/PrintPreviewModal';
import { cn } from '@/lib/cn';
import type { ReportCategory, ReportSubcategory } from '@/types';

type RekapItem = any;

const DEFAULT_FIELDS = [
  { key: 'lokasi', label: 'Lokasi' },
  { key: 'pelapor', label: 'Pelapor/Petugas' },
  { key: 'tanggal', label: 'Tanggal' },
  { key: 'waktu', label: 'Waktu' },
  { key: 'kronologi', label: 'Kronologi' },
  { key: 'tindakan', label: 'Tindakan' },
  { key: 'keterangan', label: 'Keterangan' },
];

function getVal(it: RekapItem, key: string): string {
  if (!key) return '';
  const v = it?.[key] ?? it?.[key.toLowerCase()] ?? it?.fields?.[key] ?? it?.parsed?.[key];
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function Rekap() {
  const { token, isSuper, user } = useAuth();
  const [cats, setCats] = useState<ReportCategory[]>([]);
  const [subs, setSubs] = useState<ReportSubcategory[]>([]);
  const [items, setItems] = useState<RekapItem[]>([]);
  const [catId, setCatId] = useState('');
  const [subId, setSubId] = useState('');
  const [dateRange, setDateRange] = useState<{start:string;end:string}>({start:'',end:''});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [editItem, setEditItem] = useState<RekapItem | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [trashItem, setTrashItem] = useState<RekapItem | null>(null);
  const [lb, setLb] = useState<{ open: boolean; images: LightboxImage[]; index: number }>({ open: false, images: [], index: 0 });
  const [printJob, setPrintJob] = useState<{ build: (opt: PrintOptions) => PrintDoc | null; orientation: 'portrait'|'landscape' } | null>(null);
  const [printSet, setPrintSet] = useState<any>(DEFAULT_PRINT_SETTINGS);

  useEffect(() => { (async()=>{ try{ const r = await api<{success:true;categories:ReportCategory[];subcategories:ReportSubcategory[]}>(`/api/admin/categories`, { headers: authHeaders(token) }); setCats(r.categories); setSubs(r.subcategories); if(!isSuper && r.categories.length===1) setCatId(r.categories[0].id); }catch{}})(); }, []); // eslint-disable-line
  const loadPrintSet = async (fresh = false) => {
    try { const r = await api<any>('/api/admin/print-settings', { headers: authHeaders(token), fresh }); if (r?.settings) { const m = mergePrintSettings(r.settings); setPrintSet(m); return m; } } catch {}
    return mergePrintSettings(DEFAULT_PRINT_SETTINGS);
  };
  useEffect(() => { loadPrintSet(true); }, [token]); // eslint-disable-line
  useEffect(() => { const ref = () => { if (document.visibilityState === 'visible') loadPrintSet(true); }; document.addEventListener('visibilitychange', ref); window.addEventListener('focus', ref); return () => { document.removeEventListener('visibilitychange', ref); window.removeEventListener('focus', ref); }; }, [token]); // eslint-disable-line

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const q = new URLSearchParams(); if (catId) q.set('categoryId', catId); if (subId) q.set('subcategoryId', subId);
      const r = await api<{success:true;items:RekapItem[]}>(`/api/admin/rekap?${q.toString()}`, { headers: authHeaders(token) });
      let rows = r.items || [];
      if (dateRange.start || dateRange.end) {
        rows = rows.filter((it:any) => {
          const raw = it.waktuSubmit || it.tanggal || '';
          const ms = Date.parse(raw); if (!Number.isFinite(ms)) return true;
          const d = new Date(ms); const day = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          if (dateRange.start && day < dateRange.start) return false;
          if (dateRange.end && day > dateRange.end) return false;
          return true;
        });
      }
      setItems(rows);
    } catch(e:any){ setErr(e.message); } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); }, [catId, subId, dateRange.start, dateRange.end]); // eslint-disable-line

  const openEdit = (it: RekapItem) => {
    setEditItem(it);
    setEditForm({ lokasi: it.lokasi||getVal(it,'lokasi'), tanggal: it.tanggal||getVal(it,'tanggal'), pelapor: it.pelapor||getVal(it,'pelapor'), kronologi: it.kronologi||getVal(it,'kronologi'), tindakan: it.tindakan||getVal(it,'tindakan'), keterangan: it.keterangan||getVal(it,'keterangan'), status: it.status||'TERSIMPAN' });
  };
  const saveEdit = async () => {
    if (!editItem) return; setBusy(true); setErr(''); setMsg('');
    try {
      await api(`/api/admin/rekap/${editItem.id}`, { method: 'PUT', headers: authHeaders(token), body: JSON.stringify(editForm) });
      setMsg(`Laporan ${editItem.reportId||''} diperbarui.`); setEditItem(null); load();
    } catch(e:any){ setErr(e.message); } finally { setBusy(false); }
  };
  const doTrash = async () => {
    if (!trashItem) return; setBusy(true); setErr(''); setMsg(''); setTrashItem(null);
    try {
      await api(`/api/admin/rekap/${trashItem.id}/trash`, { method: 'POST', headers: authHeaders(token) });
      setMsg(`Laporan ${trashItem.reportId||''} dipindah ke Sampah (sheet SAMPAH + file Drive masuk Sampah Drive).`);
      load();
    } catch(e:any){ setErr(e.message); } finally { setBusy(false); }
  };
  const openPhotos = (it: RekapItem) => {
    const imgs: LightboxImage[] = (Array.isArray(it.photos) ? it.photos : []).map((p: any) => ({
      src: p.link || (p.fileId ? `https://drive.google.com/uc?export=view&id=${p.fileId}` : ''),
      name: p.namaFile, fileId: p.fileId, link: p.link,
    })).filter((x: LightboxImage) => x.src);
    if (imgs.length) { setLb({ open: true, images: imgs, index: 0 }); return; }
    if (it.folderDrive) window.open(it.folderDrive, '_blank', 'noopener,noreferrer');
    else setErr('Tidak ada foto/tautan Drive untuk laporan ini.');
  };

  const scopeNote = !isSuper ? `Akses dibatasi ke kategori: ${(user?.categoryScopes||[]).map(id=>cats.find(c=>c.id===id)?.name||id).join(', ') || '(belum diatur)'}` : null;
  const catOpts = useMemo(() => (isSuper ? [{value:'',label:'Semua (yang diizinkan)'}] : []).concat(cats.map(c=>({value:c.id,label:c.name}))), [cats,isSuper]);
  const subOpts = useMemo(() => [{value:'',label:'Semua'}].concat(subs.filter(s=>!catId||s.categoryId===catId).map(s=>({value:s.id,label:s.name}))), [subs,catId]);
  const selectedSub = subs.find(s => s.id === subId);
  const gpsCount = items.filter((it:any)=>Number.isFinite(Number(it.lat??it.latitude)) && Number.isFinite(Number(it.lng??it.longitude))).length;

  const formatFields = useMemo(() => {
    if (selectedSub?.format?.fields?.length) return selectedSub.format.fields.map((f:any) => ({ key: f.key, label: f.label || f.key }));
    return DEFAULT_FIELDS;
  }, [selectedSub]);

  const catName = (id:string) => cats.find(c=>c.id===id)?.name || id || '-';
  const subName = (id:string) => subs.find(s=>s.id===id)?.name || id || '-';

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {scopeNote ? <p className="text-xs text-amber-500">{scopeNote}</p> : (
            <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{items.length}</span> laporan<span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span><span className="font-semibold text-blue-600 dark:text-blue-400 tabular-nums">{gpsCount}</span> titik GPS</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={async () => { const ps = await loadPrintSet(true); setPrintJob({ orientation: 'landscape', build: (opt) => buildRekap(items, { catName: cats.find(c=>c.id===catId)?.name, subName: subs.find(s=>s.id===subId)?.name, start: dateRange.start, end: dateRange.end, scope: scopeNote || undefined }, ps, opt) }); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-sm"><Printer className="w-4 h-4"/>Cetak Rekap</button>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700/60"><RefreshCw className={cn('w-4 h-4', loading&&'animate-spin')}/>Muat Ulang</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-2 items-end rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] px-3 py-2.5 shadow-sm">
        <Filter className="w-3.5 h-3.5 text-slate-400 mb-1.5 shrink-0" />
        <div className="block w-full sm:w-auto"><span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Kategori</span><div className="mt-0.5 w-full sm:min-w-[170px]"><Dropdown value={catId} onChange={v=>{setCatId(v); setSubId('');}} options={catOpts} /></div></div>
        <div className="block w-full sm:w-auto"><span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Subkategori</span><div className="mt-0.5 w-full sm:min-w-[190px]"><Dropdown value={subId} onChange={setSubId} options={subOpts} /></div></div>
        <div className="block w-full sm:w-auto"><span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Rentang Tanggal</span><div className="mt-0.5"><DateRangePicker start={dateRange.start} end={dateRange.end} onChange={setDateRange} /></div></div>
        <div className="sm:ml-auto text-right text-[11px] text-slate-500">{selectedSub ? `Format: ${selectedSub.name}` : 'Format: umum'}</div>
      </div>

      {msg && <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-4 py-3 text-sm">{msg}</div>}
      {err && <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 px-4 py-3 text-sm">{err}</div>}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/60 dark:bg-slate-900/30">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500"><TableProperties className="w-3.5 h-3.5"/>Tabel Rekap {selectedSub ? `— ${selectedSub.name}` : '(semua / format umum)'} · kolom mengikuti header format</div>
          <div className="text-[11px] text-slate-400">{formatFields.length} kolom format + meta</div>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-[13px] border-collapse min-w-[980px]">
            <thead className="bg-slate-100/80 dark:bg-slate-900/70 text-slate-600 dark:text-slate-300 text-[11px] uppercase tracking-wider sticky top-0 z-[1]">
              <tr>
                <th className="text-left px-3 py-2.5 font-bold border-b border-r border-slate-200 dark:border-slate-700/80 w-[46px] whitespace-nowrap">No</th>
                <th className="text-left px-3 py-2.5 font-bold border-b border-r border-slate-200 dark:border-slate-700/80 whitespace-nowrap">ID Laporan</th>
                <th className="text-left px-3 py-2.5 font-bold border-b border-r border-slate-200 dark:border-slate-700/80 whitespace-nowrap">Waktu Submit</th>
                {!subId && <th className="text-left px-3 py-2.5 font-bold border-b border-r border-slate-200 dark:border-slate-700/80 whitespace-nowrap">Kategori / Sub</th>}
                {formatFields.map(f => (
                  <th key={f.key} className="text-left px-3 py-2.5 font-bold border-b border-r border-slate-200 dark:border-slate-700/80 whitespace-nowrap min-w-[140px]" title={f.label}>{f.label}</th>
                ))}
                <th className="text-left px-3 py-2.5 font-bold border-b border-r border-slate-200 dark:border-slate-700/80 whitespace-nowrap">Foto/GPS</th>
                <th className="text-left px-3 py-2.5 font-bold border-b border-r border-slate-200 dark:border-slate-700/80 whitespace-nowrap">Status</th>
                <th className="text-left px-3 py-2.5 font-bold border-b border-slate-200 dark:border-slate-700/80 whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it:RekapItem, idx:number)=>{
                const latv = Number(it.lat??it.latitude); const lngv = Number(it.lng??it.longitude); const has = Number.isFinite(latv) && Number.isFinite(lngv);
                return (
                  <tr key={it.id} className={cn('align-top hover:bg-blue-50/40 dark:hover:bg-slate-800/30 transition-colors', idx % 2 === 1 && 'bg-slate-50/40 dark:bg-slate-900/10')}>
                    <td className="px-3 py-2.5 border-b border-r border-slate-100 dark:border-slate-800/80 text-slate-400 tabular-nums">{idx+1}</td>
                    <td className="px-3 py-2.5 border-b border-r border-slate-100 dark:border-slate-800/80 whitespace-nowrap"><div className="font-semibold text-slate-700 dark:text-slate-200">{it.reportId||'-'}</div></td>
                    <td className="px-3 py-2.5 border-b border-r border-slate-100 dark:border-slate-800/80 whitespace-nowrap text-slate-500 text-[12px]">{it.waktuSubmit || (it.createdAt?.toDate ? it.createdAt.toDate().toLocaleString('id-ID') : '-') }</td>
                    {!subId && <td className="px-3 py-2.5 border-b border-r border-slate-100 dark:border-slate-800/80 text-[12px] text-slate-600 dark:text-slate-300 whitespace-nowrap">{catName(it.categoryId)} / {subName(it.subcategoryId)}</td>}
                    {formatFields.map(f => {
                      const val = getVal(it, f.key) || (f.key==='tanggal' ? (it.tanggal||'') : f.key==='lokasi' ? (it.lokasi||'') : f.key==='pelapor' ? (it.pelapor||'') : f.key==='kronologi' ? (it.kronologi||'') : f.key==='tindakan' ? (it.tindakan||'') : f.key==='keterangan' ? (it.keterangan||'') : '');
                      return <td key={f.key} className="px-3 py-2.5 border-b border-r border-slate-100 dark:border-slate-800/80 text-slate-700 dark:text-slate-300 max-w-[260px]"><div className="line-clamp-3 whitespace-pre-wrap break-words" title={val}>{val || <span className="text-slate-300 dark:text-slate-600">-</span>}</div></td>;
                    })}
                    <td className="px-3 py-2.5 border-b border-r border-slate-100 dark:border-slate-800/80 whitespace-nowrap"><div className="flex items-center gap-1.5 flex-wrap"><button onClick={()=>openPhotos(it)} className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"><ImageIcon className="w-3.5 h-3.5"/>{it.jumlahFoto ?? '-'}</button>{has && <span title={`Koordinat: ${latv.toFixed(5)}, ${lngv.toFixed(5)}`} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"><MapPin className="w-2.5 h-2.5"/>GPS</span>}</div></td>
                    <td className="px-3 py-2.5 border-b border-r border-slate-100 dark:border-slate-800/80 whitespace-nowrap"><span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">{it.status||'TERSIMPAN'}</span></td>
                    <td className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800/80"><div className="grid grid-cols-2 gap-0.5 w-max">
                      <button onClick={async ()=>{ const ps = await loadPrintSet(true); setPrintJob({ orientation: 'portrait', build: (opt) => buildBeritaAcara(it, { catName: catName(it.categoryId), subName: subName(it.subcategoryId) }, ps, opt) }); }} title="Cetak Berita Acara" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-violet-500"><FileSignature className="w-4 h-4"/></button>
                      {it.folderDrive && <a href={it.folderDrive} target="_blank" rel="noreferrer" title="Buka Drive" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-500"><ExternalLink className="w-4 h-4"/></a>}
                      <button onClick={()=>openEdit(it)} title="Edit" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-amber-500"><Pencil className="w-4 h-4"/></button>
                      <button onClick={()=>setTrashItem(it)} title="Hapus ke Sampah" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4"/></button>
                    </div></td>
                  </tr>
                );
              })}
              {!items.length && !loading && <tr><td colSpan={formatFields.length + (subId?6:7)} className="px-4 py-12 text-center text-slate-500">Belum ada data rekap pada filter ini. Laporan dari SADEWA akan muncul di sini (kolom mengikuti header format).</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!editItem} onClose={()=>setEditItem(null)} title={`Edit Laporan ${editItem?.reportId||''}`} icon={<Pencil className="w-4 h-4 text-amber-400"/>} size="lg"
        footer={<><button onClick={()=>setEditItem(null)} className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold">Batal</button><button disabled={busy} onClick={saveEdit} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"><Save className="w-4 h-4"/>Simpan</button></>}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Lokasi" value={editForm.lokasi||''} onChange={v=>setEditForm({...editForm,lokasi:v})} />
          <Field label="Tanggal" value={editForm.tanggal||''} onChange={v=>setEditForm({...editForm,tanggal:v})} />
          <Field label="Pelapor" value={editForm.pelapor||''} onChange={v=>setEditForm({...editForm,pelapor:v})} />
          <Field label="Status" value={editForm.status||''} onChange={v=>setEditForm({...editForm,status:v})} />
          <div className="sm:col-span-2"><TextArea label="Kronologi" value={editForm.kronologi||''} onChange={v=>setEditForm({...editForm,kronologi:v})} /></div>
          <div className="sm:col-span-2"><TextArea label="Tindakan" value={editForm.tindakan||''} onChange={v=>setEditForm({...editForm,tindakan:v})} /></div>
          <div className="sm:col-span-2"><TextArea label="Keterangan" value={editForm.keterangan||''} onChange={v=>setEditForm({...editForm,keterangan:v})} rows={2} /></div>
        </div>
        {editItem?.folderDrive && <div className="mt-3 text-xs text-slate-500">Folder Drive: <a className="text-blue-500 hover:underline" href={editItem.folderDrive} target="_blank" rel="noreferrer">buka</a> · Disimpan ke rekap (Firestore) & disinkronkan ke kolom utama Sheet (best-effort).</div>}
      </Modal>

      <Modal open={!!trashItem} onClose={()=>setTrashItem(null)} title="Pindahkan ke Sampah" icon={<AlertTriangle className="w-4 h-4 text-amber-400"/>} size="sm"
        footer={<><button onClick={()=>setTrashItem(null)} className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold">Batal</button><button disabled={busy} onClick={doTrash} className="rounded-xl bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Pindahkan ke Sampah</button></>}>
        <p className="text-sm text-slate-600 dark:text-slate-300">Laporan <b>{trashItem?.reportId}</b> akan dipindah ke <b>Sampah</b>: baris dihapus dari sheet laporan (baris naik) dan dipindah ke sheet <code>SAMPAH - ...</code>; file/folder Drive masuk Sampah Drive. Pulihkan dari menu <b>Sampah</b>.</p>
      </Modal>

      <ImageLightbox open={lb.open} images={lb.images} index={lb.index} onClose={()=>setLb(s=>({...s,open:false}))} onIndex={i=>setLb(s=>({...s,index:i}))} />
      <PrintPreviewModal open={!!printJob} onClose={()=>setPrintJob(null)} build={printJob?.build || (()=>null)} defaultOrientation={printJob?.orientation || 'portrait'} />
    </div>
  );
}

function Field({ label, value, onChange }: { label:string; value:string; onChange:(v:string)=>void }) {
  return <label className="block"><span className="text-[11px] font-semibold text-slate-500 uppercase">{label}</span><input value={value} onChange={e=>onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1120] px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" /></label>;
}
function TextArea({ label, value, onChange, rows=3 }: { label:string; value:string; onChange:(v:string)=>void; rows?:number }) {
  return <label className="block"><span className="text-[11px] font-semibold text-slate-500 uppercase">{label}</span><textarea rows={rows} value={value} onChange={e=>onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1120] px-3 py-2.5 text-sm custom-scrollbar focus:border-blue-500 focus:outline-none" /></label>;
}
