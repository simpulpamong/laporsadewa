import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Folder, File, FileText, FileSpreadsheet, FileImage, FileArchive, FileVideo, FileAudio, Download, Pencil, Trash2, RotateCcw, XOctagon, Upload, RefreshCw, Search, ChevronRight, Home, FolderOpen, HardDrive, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, authHeaders } from '@/context/AuthContext';
import { Modal, Dropdown, useDialog } from '@/components/ui';
import { cn } from '@/lib/cn';

type DriveFile = { id:string; name:string; mimeType?:string; size?:string; createdTime?:string; modifiedTime?:string; webViewLink?:string; webContentLink?:string; trashed?:boolean };
type Root = { id:string; name:string; type?:string; categoryId?:string };
type Crumb = { id:string; name:string };

const FOLDER_MIME = 'application/vnd.google-apps.folder';
function isFolder(f:DriveFile){ return f.mimeType === FOLDER_MIME; }
function fmtSize(v?:string){ const n=Number(v); if(!Number.isFinite(n)||n<=0) return '-'; const u=['B','KB','MB','GB']; let i=0,x=n; while(x>=1024&&i<u.length-1){x/=1024;i++;} return `${x>=10||i===0?x.toFixed(0):x.toFixed(1)} ${u[i]}`; }
function fmtDate(v?:string){ if(!v) return '-'; const d=new Date(v); return Number.isFinite(d.getTime())?d.toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):v; }
function FileIcon({ f, className='' }: { f:DriveFile; className?:string }){
  const c = cn('w-5 h-5 shrink-0', className);
  if (isFolder(f)) return <Folder className={cn(c,'text-amber-400 fill-amber-400/20')}/>;
  const m = f.mimeType||'';
  if (m.startsWith('image/')) return <FileImage className={cn(c,'text-rose-400')}/>;
  if (m.includes('spreadsheet')||m.includes('excel')||m==='text/csv') return <FileSpreadsheet className={cn(c,'text-emerald-400')}/>;
  if (m.includes('pdf')||m.includes('document')||m.includes('word')||m.startsWith('text/')) return <FileText className={cn(c,'text-blue-400')}/>;
  if (m.includes('zip')||m.includes('archive')||m.includes('compressed')) return <FileArchive className={cn(c,'text-violet-400')}/>;
  if (m.startsWith('video/')) return <FileVideo className={cn(c,'text-fuchsia-400')}/>;
  if (m.startsWith('audio/')) return <FileAudio className={cn(c,'text-cyan-400')}/>;
  return <File className={cn(c,'text-slate-400')}/>;
}

export default function Drive() {
  const { token } = useAuth();
  const dialog = useDialog();
  const [roots, setRoots] = useState<Root[]>([]);
  const [rootId, setRootId] = useState('');
  const [folderId, setFolderId] = useState('');
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [trashed, setTrashed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [qLive, setQLive] = useState('');
  const [ren, setRen] = useState<DriveFile|null>(null);
  const [renName, setRenName] = useState('');

  const [busy, setBusy] = useState<string|null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadRoots = async () => {
    try {
      const r = await api<{success:true;roots:Root[]}>(`/api/admin/drive/roots`, { headers: authHeaders(token) });
      setRoots(r.roots||[]);
      if (!rootId && r.roots?.[0]) { setRootId(r.roots[0].id); setFolderId(r.roots[0].id); setCrumbs([{id:r.roots[0].id,name:r.roots[0].name}]); }
    } catch(e:any){ setErr(e.message); }
  };
  useEffect(()=>{ loadRoots(); }, []); // eslint-disable-line

  const loadFiles = async (fid = folderId, trash = trashed, query = q) => {
    if (!fid) return; setLoading(true); setErr('');
    try {
      const qs = new URLSearchParams({ folderId: fid, trashed: trash ? '1':'0' }); if (query) qs.set('q', query);
      const r = await api<{success:true;files:DriveFile[]}>(`/api/admin/drive/files?${qs}`, { headers: authHeaders(token) });
      setFiles(r.files||[]);
    } catch(e:any){ setErr(e.message); setFiles([]); } finally { setLoading(false); }
  };
  useEffect(()=>{ if (folderId) loadFiles(folderId, trashed, q); }, [folderId, trashed]); // eslint-disable-line

  useEffect(()=>{ const t=setTimeout(()=>{ setQ(qLive); if(folderId) loadFiles(folderId, trashed, qLive); }, 350); return ()=>clearTimeout(t); }, [qLive]); // eslint-disable-line

  const selectRoot = (id:string) => {
    const r = roots.find(x=>x.id===id); if(!r) return;
    setRootId(id); setFolderId(id); setCrumbs([{id:r.id,name:r.name}]); setTrashed(false); setQLive(''); setQ('');
  };
  const openFolder = (f:DriveFile) => { if(!isFolder(f)) return; setCrumbs(c=>[...c,{id:f.id,name:f.name}]); setFolderId(f.id); setQLive(''); setQ(''); };
  const goCrumb = (i:number) => { const next = crumbs.slice(0,i+1); setCrumbs(next); setFolderId(next[next.length-1].id); setQLive(''); setQ(''); };

  const doDownload = async (f:DriveFile) => {
    setBusy('dl-'+f.id); setErr('');
    try {
      const res = await fetch(`/api/admin/drive/download/${f.id}`, { headers: authHeaders(token) });
      if (!res.ok) { let m='Gagal mengunduh.'; try{ m=(await res.json()).message||m; }catch{} throw new Error(m); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download = f.name || 'download'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch(e:any){ setErr(e.message); } finally { setBusy(null); }
  };

  const doRename = async () => {
    if (!ren || !renName.trim()) return; setBusy('ren'); setErr('');
    try { await api(`/api/admin/drive/files/${ren.id}`, { method:'PATCH', headers: authHeaders(token), body: JSON.stringify({ name: renName.trim() }) }); setMsg(`Nama diubah menjadi "${renName.trim()}".`); setRen(null); loadFiles(); }
    catch(e:any){ setErr(e.message); } finally { setBusy(null); }
  };
  const doTrash = async (f:DriveFile) => {
    setBusy('tr-'+f.id); setErr('');
    try { await api(`/api/admin/drive/files/${f.id}`, { method:'PATCH', headers: authHeaders(token), body: JSON.stringify({ trashed: true }) }); setMsg(`"${f.name}" dipindahkan ke Sampah.`); loadFiles(); }
    catch(e:any){ setErr(e.message); } finally { setBusy(null); }
  };
  const doRestore = async (f:DriveFile) => {
    setBusy('rs-'+f.id); setErr('');
    try { await api(`/api/admin/drive/files/${f.id}`, { method:'PATCH', headers: authHeaders(token), body: JSON.stringify({ trashed: false }) }); setMsg(`"${f.name}" dipulihkan.`); loadFiles(); }
    catch(e:any){ setErr(e.message); } finally { setBusy(null); }
  };
  const doDeletePermanent = async (f: DriveFile) => {
    const ok = await dialog.confirm({ title: 'Hapus Permanen', message: <>Hapus permanen <b>{f.name}</b>? Tindakan ini tidak dapat dibatalkan.</>, confirmLabel: 'Hapus Permanen', cancelLabel: 'Batal', tone: 'danger' });
    if (!ok) return;
    setBusy('del'); setErr('');
    try { await api(`/api/admin/drive/files/${f.id}`, { method:'DELETE', headers: authHeaders(token) }); setMsg(`"${f.name}" dihapus permanen.`); loadFiles(); }
    catch(e:any){ setErr(e.message); } finally { setBusy(null); }
  };

  const doUpload = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]; if (!file || !folderId) return; ev.target.value='';
    setUploading(true); setErr(''); setMsg('');
    try {
      const base64 = await new Promise<string>((resolve, reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve(String(fr.result||'')); fr.onerror=()=>reject(new Error('Gagal membaca file.')); fr.readAsDataURL(file); });
      await api(`/api/admin/drive/upload`, { method:'POST', headers: authHeaders(token), body: JSON.stringify({ folderId, fileName: file.name, mimeType: file.type||'application/octet-stream', contentBase64: base64 }) });
      setMsg(`"${file.name}" berhasil diunggah.`); loadFiles();
    } catch(e:any){ setErr(e.message); } finally { setUploading(false); }
  };

  const currentRoot = roots.find(r=>r.id===rootId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-sm text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">{trashed ? 'Sampah Drive' : (currentRoot?.name || 'Drive')}</span>
          <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
          <span className="tabular-nums">{files.length}</span> item
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={fileRef} type="file" className="hidden" onChange={doUpload} />
          <button disabled={!folderId || uploading || trashed} onClick={()=>fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2.5 text-sm font-semibold">{uploading?<Loader2 className="w-4 h-4 animate-spin"/>:<Upload className="w-4 h-4"/>}Upload</button>
          <button onClick={()=>loadFiles()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700/60"><RefreshCw className={cn('w-4 h-4', loading&&'animate-spin')}/>Muat Ulang</button>
        </div>
      </div>

      {msg && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 px-4 py-3 text-sm">{msg}</div>}
      {err && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 px-4 py-3 text-sm flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0"/><span>{err}</span></div>}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] overflow-hidden">
        {/* toolbar */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden text-sm font-semibold">
            <button onClick={()=>setTrashed(false)} className={cn('px-4 py-2 inline-flex items-center gap-2', !trashed?'bg-blue-600 text-white':'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800')}><FolderOpen className="w-4 h-4"/>Root Proyek</button>
            <button onClick={()=>setTrashed(true)} className={cn('px-4 py-2 inline-flex items-center gap-2 border-l border-slate-200 dark:border-slate-700', trashed?'bg-amber-600 text-white':'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800')}><Trash2 className="w-4 h-4"/>Sampah (Trash)</button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Scope:</span>
            <div className="min-w-[220px] max-w-[320px] w-full sm:w-auto">
              <Dropdown value={rootId} onChange={selectRoot} options={roots.length ? roots.map(r=>({value:r.id,label:r.name})) : [{value:'',label:'(tidak ada root terkonfigurasi)'}]} placeholder="Pilih scope…" />
            </div>
          </label>
          <div className="ml-auto relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/>
            <input value={qLive} onChange={e=>setQLive(e.target.value)} placeholder="Cari nama file…" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none"/>
          </div>
        </div>

        {/* breadcrumb */}
        {!trashed && <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1 text-sm flex-wrap">
          <Home className="w-3.5 h-3.5 text-slate-500"/>
          {crumbs.map((c,i)=>(
            <React.Fragment key={c.id+':'+i}>
              {i>0 && <ChevronRight className="w-3.5 h-3.5 text-slate-600"/>}
              <button onClick={()=>goCrumb(i)} className={cn('px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 truncate max-w-[220px]', i===crumbs.length-1?'font-semibold text-slate-200':'text-slate-400')}>{c.name}</button>
            </React.Fragment>
          ))}
          {currentRoot?.id && folderId && folderId!==rootId && <span className="ml-auto"/>}
          {currentRoot && <a href={`https://drive.google.com/drive/folders/${folderId}`} target="_blank" rel="noreferrer" className="ml-auto text-[11px] text-slate-500 hover:text-blue-400 inline-flex items-center gap-1"><ExternalLink className="w-3 h-3"/>Buka di Drive</a>}
        </div>}
        {trashed && <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 text-xs text-amber-300/80 flex items-center gap-2"><Trash2 className="w-3.5 h-3.5"/>Menampilkan item di Sampah dalam folder: <b className="text-amber-200">{currentRoot?.name||folderId}</b>. Pulihkan atau hapus permanen dari sini.</div>}

        {/* table */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs uppercase tracking-wider">
              <tr><th className="text-left px-4 py-3">Nama File</th><th className="text-left px-4 py-3 w-[110px]">Ukuran</th><th className="text-left px-4 py-3 w-[190px]">Dimodifikasi</th><th className="text-left px-4 py-3 w-[170px]">Aksi</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {files.map(f=>{
                const folder = isFolder(f);
                return (
                  <tr key={f.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 group">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileIcon f={f}/>
                        {folder && !trashed ? (
                          <button onClick={()=>openFolder(f)} className="font-medium text-left truncate hover:text-blue-400" title={f.name}>{f.name}</button>
                        ) : (
                          <span className={cn('truncate', folder?'font-medium':'')} title={f.name}>{f.name}</span>
                        )}
                        {folder && !trashed && <ChevronRight className="w-3.5 h-3.5 text-slate-600 opacity-0 group-hover:opacity-100 shrink-0"/>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{folder ? '—' : fmtSize(f.size)}</td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap text-xs">{fmtDate(f.modifiedTime||f.createdTime)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        {!trashed ? (<>
                          {!folder && <IconBtn title="Unduh" busy={busy==='dl-'+f.id} onClick={()=>doDownload(f)}><Download className="w-4 h-4"/></IconBtn>}
                          {f.webViewLink && <a href={f.webViewLink} target="_blank" rel="noreferrer" title="Buka di Drive" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-400"><ExternalLink className="w-4 h-4"/></a>}
                          <IconBtn title="Ganti nama" onClick={()=>{ setRen(f); setRenName(f.name); }}><Pencil className="w-4 h-4"/></IconBtn>
                          <IconBtn title="Pindah ke Sampah" tone="rose" busy={busy==='tr-'+f.id} onClick={()=>doTrash(f)}><Trash2 className="w-4 h-4"/></IconBtn>
                        </>) : (<>
                          <IconBtn title="Pulihkan" tone="emerald" busy={busy==='rs-'+f.id} onClick={()=>doRestore(f)}><RotateCcw className="w-4 h-4"/></IconBtn>
                          <IconBtn title="Hapus permanen" tone="rose" onClick={()=>doDeletePermanent(f)}><XOctagon className="w-4 h-4"/></IconBtn>
                        </>)}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!files.length && !loading && (
                <tr><td colSpan={4} className="px-4 py-14 text-center text-slate-500">
                  <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30"/>
                  <div className="font-semibold">{trashed ? 'Sampah kosong' : 'Folder kosong'}</div>
                  <div className="text-sm mt-1">{trashed ? 'Tidak ada item di sampah untuk folder ini.' : (folderId ? 'Belum ada file. Unggah file atau pastikan folder proyek terkonfigurasi.' : 'Pilih scope/folder proyek.')}</div>
                </td></tr>
              )}
              {loading && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin mx-auto"/></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
          {files.length} item{trashed ? ' (sampah)' : ''}
        </div>
      </div>

      <Modal open={!!ren} onClose={()=>setRen(null)} title="Ganti Nama" icon={<Pencil className="w-4 h-4 text-blue-400"/>} size="sm"
        footer={<><button onClick={()=>setRen(null)} className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold">Batal</button><button disabled={busy==='ren'||!renName.trim()} onClick={doRename} className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Simpan</button></>}>
        <label className="block"><span className="text-xs font-semibold text-slate-500 uppercase">Nama baru</span><input value={renName} onChange={e=>setRenName(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1120] px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"/></label>
      </Modal>


    </div>
  );
}

function IconBtn({ children, onClick, title, tone, busy }: { children:React.ReactNode; onClick:()=>void; title:string; tone?:'rose'|'emerald'; busy?:boolean }) {
  const tones = tone==='rose' ? 'hover:text-rose-400' : tone==='emerald' ? 'hover:text-emerald-400' : 'hover:text-blue-400';
  return <button onClick={onClick} title={title} disabled={busy} className={cn('p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 disabled:opacity-50', tones)}>{busy?<Loader2 className="w-4 h-4 animate-spin"/>:children}</button>;
}
