import React, { useEffect, useRef, useState } from 'react';
import { UserRound, KeyRound, Save, Shield, Info, Palette, Server, CheckCircle2, AlertCircle, Eye, EyeOff, Printer, Download, Smartphone, Share, Users, Link2, Loader2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, authHeaders } from '@/context/AuthContext';
import { Modal, Switch, useDialog } from '@/components/ui';
import { useInstallPrompt } from '@/lib/useInstallPrompt';
import { DEFAULT_PRINT_SETTINGS, KOP_BUILTIN_LOGOS, mergePrintSettings, normalizeKopLogoValue, resolveKopLogoSrc, type PrintSettings } from '@/lib/printSettings';
import { cn } from '@/lib/cn';
import Pengguna from './Pengguna';

type Tab = 'profil' | 'cetak' | 'pengguna' | 'tentang';

function Card({ children, className='' }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] shadow-sm', className)}>{children}</div>;
}
function CardHead({ title, desc }: { title: string; desc?: string }) {
  return <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800"><div className="font-bold text-slate-800 dark:text-slate-100">{title}</div>{desc && <div className="text-xs text-slate-500 mt-0.5">{desc}</div>}</div>;
}
function Notice({ ok, text }: { ok: boolean; text: string }) {
  if (!text) return null;
  return <div className={cn('rounded-xl border px-4 py-3 text-sm flex items-start gap-2', ok ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300')}>{ok?<CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0"/>:<AlertCircle className="w-4 h-4 mt-0.5 shrink-0"/>}<span>{text}</span></div>;
}
function Inp({ label, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="block"><span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</span><input {...rest} className={cn('mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1120] px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 focus:outline-none transition disabled:opacity-60', rest.className)} /></label>;
}

export default function Pengaturan() {
  const { user, token, isSuper, refresh } = useAuth();
  const dialog = useDialog();
  const pwa = useInstallPrompt();
  const [tab, setTab] = useState<Tab>('profil');
  const [displayName, setDisplayName] = useState((user as any)?.displayName || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ok:boolean;text:string}|null>(null);

  // password
  const [pwOpen, setPwOpen] = useState(false);
  const [cur, setCur] = useState(''); const [npw, setNpw] = useState(''); const [rep, setRep] = useState('');
  const [show, setShow] = useState({c:false,n:false,r:false});
  const [pmsg, setPmsg] = useState<{ok:boolean;text:string}|null>(null);
  const [pbusy, setPbusy] = useState(false);

  // cetak
  const [ps, setPs] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [cmsg, setCmsg] = useState<{ok:boolean;text:string}|null>(null);
  const [cbusy, setCbusy] = useState(false);
  const [printLoading, setPrintLoading] = useState(true);
  const [printLoadError, setPrintLoadError] = useState('');
  const [printRetry, setPrintRetry] = useState(0);

  useEffect(()=>{ setDisplayName((user as any)?.displayName || user?.username || ''); }, [user]);
  useEffect(() => {
    let active = true;
    setPrintLoading(true);
    setPrintLoadError('');
    (async()=>{
      try {
        const r = await api<any>('/api/admin/print-settings', { headers: authHeaders(token), fresh: true });
        if (!r?.settings) throw new Error('Data pengaturan cetak tidak ditemukan.');
        if (active) setPs(mergePrintSettings(r.settings));
      } catch (e: any) {
        if (active) setPrintLoadError(e.message || 'Gagal memuat pengaturan cetak dari Firestore.');
      } finally {
        if (active) setPrintLoading(false);
      }
    })();
    return () => { active = false; };
  }, [token, printRetry]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      await api('/api/auth/me', { method:'PUT', headers: authHeaders(token), body: JSON.stringify({ displayName }) });
      try { await refresh(); } catch {}
      setMsg({ok:true,text:'Profil berhasil diperbarui.'}); dialog.toast('Profil diperbarui.', 'success');
    } catch(e:any){ setMsg({ok:false,text:e.message||'Gagal memperbarui profil.'}); }
    finally { setBusy(false); }
  };

  const openPw = () => { setPmsg(null); setCur(''); setNpw(''); setRep(''); setShow({c:false,n:false,r:false}); setPwOpen(true); };
  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault(); setPmsg(null);
    if (!cur || !npw) return setPmsg({ok:false,text:'Password saat ini dan password baru wajib diisi.'});
    if (npw.length < 8) return setPmsg({ok:false,text:'Password baru minimal 8 karakter dan memuat huruf serta angka.'});
    if (!/[A-Za-z]/.test(npw) || !/[0-9]/.test(npw)) return setPmsg({ok:false,text:'Password baru minimal 8 karakter dan memuat huruf serta angka.'});
    if (npw !== rep) return setPmsg({ok:false,text:'Konfirmasi password tidak cocok.'});
    if (cur === npw) return setPmsg({ok:false,text:'Password baru harus berbeda dari password lama.'});
    setPbusy(true);
    try {
      await api('/api/auth/change-password', { method:'POST', headers: authHeaders(token), body: JSON.stringify({ currentPassword: cur, newPassword: npw }) });
      dialog.toast('Password diperbarui.', 'success');
      setCur(''); setNpw(''); setRep(''); setPwOpen(false);
    } catch(e:any){ setPmsg({ok:false,text:e.message||'Gagal mengubah password.'}); }
    finally { setPbusy(false); }
  };

  const applyLogo = (side: 'left'|'right', raw: string) => {
    const value = normalizeKopLogoValue(raw);
    setPs(p => ({ ...p, kop: { ...p.kop, [side === 'left' ? 'logoLeftUrl' : 'logoRightUrl']: value } }));
  };

  const savePrint = async (e: React.FormEvent) => {
    e.preventDefault(); setCmsg(null);
    if (!isSuper) { setCmsg({ok:false,text:'Hanya superadmin yang dapat menyimpan kop surat. Peran Anda saat ini bukan superadmin.'}); return; }
    if (printLoading) { setCmsg({ok:false,text:'Tunggu hingga pengaturan selesai dimuat.'}); return; }
    if (printLoadError) { setCmsg({ok:false,text:'Pengaturan belum berhasil dimuat dari server. Tekan "Muat ulang pengaturan", lalu simpan lagi.'}); return; }
    setCbusy(true);
    try {
      // snapshot ps sekarang agar nilai logo yang dipilih tidak hilang karena async batching
      const snapshot = mergePrintSettings(ps);
      const r = await api<any>('/api/admin/print-settings', { method:'PUT', headers: authHeaders(token), body: JSON.stringify(snapshot) });
      // verifikasi: pakai data dari server; jika gagal, pakai snapshot lokal (sudah benar)
      let final: PrintSettings = snapshot;
      try {
        const verified = await api<any>('/api/admin/print-settings', { headers: authHeaders(token), fresh: true });
        if (verified?.settings) {
          const fromServer = mergePrintSettings(verified.settings);
          // pertahankan pilihan logo lokal jika server mengembalikan kosong (defensive)
          final = {
            ...fromServer,
            kop: {
              ...fromServer.kop,
              logoLeftUrl: fromServer.kop.logoLeftUrl || snapshot.kop.logoLeftUrl,
              logoRightUrl: fromServer.kop.logoRightUrl || snapshot.kop.logoRightUrl,
            },
          };
        } else if (r?.settings) {
          final = mergePrintSettings(r.settings);
          final = {
            ...final,
            kop: {
              ...final.kop,
              logoLeftUrl: final.kop.logoLeftUrl || snapshot.kop.logoLeftUrl,
              logoRightUrl: final.kop.logoRightUrl || snapshot.kop.logoRightUrl,
            },
          };
        }
      } catch { /* verified gagal — tetap pakai snapshot */ }
      setPs(final);
      setCmsg({ok:true,text:'Kop surat berhasil disimpan ke Firestore. Pengaturan dipakai saat cetak Rekap dan Berita Acara.'});
      dialog.toast('Kop surat berhasil disimpan.', 'success');
    } catch(e:any){
      const msg = e?.status === 403 ? 'Gagal menyimpan: akses ditolak (butuh akun superadmin aktif).' : (e?.message || 'Gagal menyimpan kop surat. Pastikan API admin aktif dan Firestore dapat diakses.');
      setCmsg({ok:false,text: msg});
    }
    finally { setCbusy(false); }
  };

  const setKop = (k: keyof PrintSettings['kop'], v: any) => setPs(p => ({ ...p, kop: { ...p.kop, [k]: v } }));
  const setSign = (kind: 'beritaAcara'|'rekap', k: keyof PrintSettings['tandaTangan']['beritaAcara'], v: string) => setPs(p => ({ ...p, tandaTangan: { ...p.tandaTangan, [kind]: { ...p.tandaTangan[kind], [k]: v } } }));



  const tabs: {id:Tab; label:string; icon:any}[] = [
    { id:'profil', label:'Profil & Akun', icon: UserRound },
    { id:'cetak', label:'Format Cetak / Kop', icon: Printer },
    ...(isSuper ? [{ id:'pengguna' as Tab, label:'Pengguna & Role', icon: Users }] : []),
    { id:'tentang', label:'Tentang Sistem', icon: Info },
  ];

  const roleLabel = isSuper ? 'Superadmin' : `Admin${(user?.categoryScopes || []).length ? ` · ${(user?.categoryScopes || []).length} kategori` : ''}`;

  return (
    <div className="space-y-5">


      {pwa.show ? (
        <Card className="overflow-hidden">
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-800 dark:text-slate-100 text-sm">Pasang SADEWA Admin</div>
              {pwa.isiOS && !pwa.canPrompt ? (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Di iPhone/iPad: ketuk <Share className="inline w-3 h-3 -translate-y-px" /> <b>Bagikan</b>, lalu pilih <b>Tambah ke Layar Utama</b>.
                </div>
              ) : (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Akses cepat dari layar utama sebagai aplikasi. Ringan dan siap dipakai saat sinyal lemah.
                </div>
              )}
            </div>
            {pwa.canPrompt ? (
              <button type="button" onClick={() => void pwa.install()} disabled={pwa.installing}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold px-4 py-2.5 text-sm shadow-sm shrink-0">
                <Download className="w-4 h-4" />{pwa.installing ? 'Memasang…' : 'Pasang Aplikasi'}
              </button>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {tabs.map((t, idx)=>{ const I=t.icon; const on=tab===t.id; const lastOdd = idx === tabs.length - 1 && tabs.length % 2 === 1; return (
          <button key={t.id} onClick={()=>setTab(t.id)} className={cn('inline-flex w-full sm:w-auto items-center justify-center sm:justify-start gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-[13px] sm:text-sm font-semibold border transition-all text-center', lastOdd && 'col-span-2 sm:col-span-1', on?'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-600/20':'bg-white dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60')}>
            <I className="w-4 h-4 shrink-0"/><span className="truncate">{t.label}</span>
          </button>
        );})}
      </div>

      {tab === 'profil' && (
        <div className="grid lg:grid-cols-[1.1fr,.9fr] gap-5">
          <Card>
            <CardHead title="Profil Saya" desc="Informasi identitas akun yang digunakan pada sesi admin." />
            <form onSubmit={saveProfile} className="p-5 space-y-4">
              {msg && <Notice ok={msg.ok} text={msg.text} />}
              <div className="grid sm:grid-cols-2 gap-4">
                <Inp label="Nama Lengkap / Tampilan" value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Nama yang ditampilkan" />
                <Inp label="Username" value={user?.username||''} disabled className="opacity-70 cursor-not-allowed" />
              </div>
              <div className="flex justify-end"><button disabled={busy} type="submit" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold px-4 py-2.5 text-sm shadow-sm"><Save className="w-4 h-4"/>{busy?'Menyimpan…':'Simpan Profil'}</button></div>
            </form>
          </Card>
          <Card>
            <CardHead title="Informasi Akun" desc="Detail akses dan peran Anda." />
            <div className="p-5 space-y-3 text-sm">
              {[['Username', `@${user?.username||'-'}`], ['Nama', (user as any)?.displayName || user?.username || '-'], ['Peran', isSuper?'Superadmin':'Admin'], ['Cakupan', roleLabel]].map(([k,v])=>(
                <div key={String(k)} className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-800/80 last:border-0"><span className="text-slate-500 shrink-0">{k}</span><span className="font-semibold text-slate-700 dark:text-slate-200 text-right">{v}</span></div>
              ))}
              <div className={cn('mt-2 rounded-xl border px-3.5 py-3 text-xs flex items-start gap-2', isSuper?'border-violet-200 dark:border-violet-900/40 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300':'border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300')}>
                <Shield className="w-4 h-4 shrink-0 mt-0.5"/><span>{isSuper ? 'Akses penuh ke seluruh fitur.' : 'Akses sesuai scope kategori.'}</span>
              </div>
              <div className="pt-2">
                <button type="button" onClick={openPw} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-3.5 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition">
                  <KeyRound className="w-4 h-4 text-slate-500"/>Ubah Password
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === 'cetak' && (
        <form onSubmit={savePrint} className="space-y-5">
          {cmsg && <Notice ok={cmsg.ok} text={cmsg.text} />}
          {!isSuper && <Notice ok={false} text="Kop surat hanya bisa disimpan oleh akun Superadmin. Anda bisa melihat pengaturan, tetapi perubahan tidak akan tersimpan. Minta Superadmin untuk menyimpan, atau gunakan akun Superadmin." />}
          {printLoading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin"/>Memuat pengaturan kop surat dari server…</div>}
          {printLoadError && <div className="space-y-2"><Notice ok={false} text={`Gagal memuat pengaturan kop surat dari server: ${printLoadError}. Periksa koneksi/API dan coba muat ulang.`} /><button type="button" onClick={()=>{ setPrintLoadError(''); setPrintRetry(n=>n+1); }} className="text-sm font-semibold text-blue-600 hover:text-blue-500">Muat ulang pengaturan</button></div>}
          <fieldset disabled={printLoading || !!printLoadError || cbusy} className={cn('min-w-0 space-y-5 border-0 p-0 m-0', !isSuper && 'opacity-95')}>
          <Card>
            <CardHead title="Kop Surat / Laporan" />
            <div className="p-5 grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 grid sm:grid-cols-2 gap-4">
                <KopLogo side="left" label="Logo Kiri" value={ps.kop.logoLeftUrl || ''} canEdit={isSuper} onChange={v=>applyLogo('left', v)} />
                <KopLogo side="right" label="Logo Kanan" value={ps.kop.logoRightUrl || ''} canEdit={isSuper} onChange={v=>applyLogo('right', v)} />
              </div>
              <div className="sm:col-span-2"><Switch checked={ps.kop.showLogo} onChange={v=>setKop('showLogo', v)} label="Gunakan logo bawaan jika logo kiri kosong" size="sm" /></div>
              <Inp label="Instansi Baris 1" value={ps.kop.instansi1} onChange={e=>setKop('instansi1', e.target.value)} />
              <Inp label="Instansi Baris 2" value={ps.kop.instansi2} onChange={e=>setKop('instansi2', e.target.value)} />
              <div className="sm:col-span-2"><Inp label="Subjudul / Sistem" value={ps.kop.sub} onChange={e=>setKop('sub', e.target.value)} /></div>
              <div className="sm:col-span-2"><Inp label="Alamat" value={ps.kop.alamat} onChange={e=>setKop('alamat', e.target.value)} placeholder="Opsional" /></div>
              <Inp label="Telepon" value={ps.kop.telepon} onChange={e=>setKop('telepon', e.target.value)} placeholder="Opsional" />
              <Inp label="Email" value={ps.kop.email} onChange={e=>setKop('email', e.target.value)} placeholder="Opsional" />
              <Inp label="Website" value={ps.kop.website} onChange={e=>setKop('website', e.target.value)} placeholder="Opsional" />
            </div>
          </Card>
          <div className="grid lg:grid-cols-2 gap-5">
            <Card>
              <CardHead title="Tanda Tangan — Berita Acara" desc="Blok kiri (pelapor/petugas) & kanan (mengetahui)." />
              <div className="p-5 grid sm:grid-cols-2 gap-4">
                <Inp label="Kiri: Jabatan/Label" value={ps.tandaTangan.beritaAcara.kiriJabatan} onChange={e=>setSign('beritaAcara','kiriJabatan',e.target.value)} />
                <Inp label="Kiri: Nama (opsional)" value={ps.tandaTangan.beritaAcara.kiriNama} onChange={e=>setSign('beritaAcara','kiriNama',e.target.value)} placeholder="Kosong = ikut pelapor / titik-titik" />
                <Inp label="Kanan: Kota" value={ps.tandaTangan.beritaAcara.kananKota} onChange={e=>setSign('beritaAcara','kananKota',e.target.value)} />
                <Inp label="Kanan: Jabatan" value={ps.tandaTangan.beritaAcara.kananJabatan} onChange={e=>setSign('beritaAcara','kananJabatan',e.target.value)} />
                <div className="sm:col-span-2"><Inp label="Kanan: Nama" value={ps.tandaTangan.beritaAcara.kananNama} onChange={e=>setSign('beritaAcara','kananNama',e.target.value)} placeholder="Nama pejabat/petugas (opsional)" /></div>
              </div>
            </Card>
            <Card>
              <CardHead title="Tanda Tangan — Rekap" desc="Blok penandatangan rekapitulasi laporan." />
              <div className="p-5 grid sm:grid-cols-2 gap-4">
                <Inp label="Kiri: Jabatan/Label" value={ps.tandaTangan.rekap.kiriJabatan} onChange={e=>setSign('rekap','kiriJabatan',e.target.value)} placeholder="Opsional" />
                <Inp label="Kiri: Nama" value={ps.tandaTangan.rekap.kiriNama} onChange={e=>setSign('rekap','kiriNama',e.target.value)} placeholder="Opsional" />
                <Inp label="Kanan: Kota" value={ps.tandaTangan.rekap.kananKota} onChange={e=>setSign('rekap','kananKota',e.target.value)} />
                <Inp label="Kanan: Jabatan" value={ps.tandaTangan.rekap.kananJabatan} onChange={e=>setSign('rekap','kananJabatan',e.target.value)} />
                <div className="sm:col-span-2"><Inp label="Kanan: Nama" value={ps.tandaTangan.rekap.kananNama} onChange={e=>setSign('rekap','kananNama',e.target.value)} placeholder="Nama pejabat/petugas (opsional)" /></div>
              </div>
            </Card>
          </div>
          <Card>
            <CardHead title="Footer Dokumen" />
            <div className="p-5"><Inp label="Teks Footer" value={ps.footer} onChange={e=>setPs(p=>({...p, footer:e.target.value}))} placeholder="Contoh: Dicetak dari SADEWA Admin" /></div>
          </Card>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!isSuper && <span className="text-xs text-amber-500 mr-auto">Simpan dinonaktifkan: akun bukan superadmin.</span>}
            <button disabled={cbusy || printLoading || !!printLoadError || !isSuper} type="submit" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-4 py-2.5 text-sm shadow-sm"><Save className="w-4 h-4"/>{cbusy?'Menyimpan…':'Simpan Kop Surat'}</button>
          </div>
          </fieldset>
        </form>
      )}

      {tab === 'pengguna' && isSuper && (
        <Pengguna embedded />
      )}

      {tab === 'tentang' && (
        <div className="grid lg:grid-cols-2 gap-5">
          <Card>
            <CardHead title="Tentang Sistem" desc="SADEWA — Sistem Aksi dan Evaluasi Praja Wibawa." />
            <div className="p-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 border border-blue-500/30 flex items-center justify-center shadow-sm"><img src="/assets/sadewa-white.svg" alt="SADEWA" className="w-8 h-8 object-contain" /></div>
                <div><div className="font-extrabold text-slate-800 dark:text-slate-100">SADEWA Admin</div><div className="text-sm text-slate-500">Satuan Polisi Pamong Praja<br/>Kabupaten Ponorogo</div></div>
              </div>
              <div className="space-y-0 text-sm">{[['Aplikasi','SADEWA Admin Workspace'],['Instansi','Satpol PP Kabupaten Ponorogo'],['Mode','Produksi (integrasi penuh)'],['Sesi','Berbasis token (role & scope)']].map(([k,v])=>(<div key={String(k)} className="flex justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-800/80 last:border-0"><span className="text-slate-500">{k}</span><span className="font-semibold text-slate-700 dark:text-slate-200 text-right">{v}</span></div>))}</div>
            </div>
          </Card>
          <Card>
            <CardHead title="Integrasi & Modul" desc="Komponen yang terhubung (dinamis, app-driven)." />
            <div className="p-5 grid sm:grid-cols-2 gap-2.5">
              {[
                {i:Server,t:'Firestore',d:'SOT: kategori, format/parser, rekap, pengguna, pengaturan cetak'},
                {i:Server,t:'Google Sheets',d:'Laporan per kategori (spreadsheet terpisah)'},
                {i:Server,t:'Server',d:'Google Drive file manager (API v3) per kategori'},
                {i:Server,t:'Apps Script',d:'Executor app-driven (rekap/sampah/sheet)'},
                {i:Palette,t:'Peta',d:'Titik GPS/EXIF (Leaflet, modal + Google Maps)'},
                {i:Shield,t:'Akses',d:'Superadmin & Admin (scope kategori)'},
              ].map(x=>{ const I=x.i; return <div key={x.t} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex gap-3"><span className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-500"><I className="w-4 h-4"/></span><div><div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{x.t}</div><div className="text-[11px] text-slate-500 leading-snug mt-0.5">{x.d}</div></div></div>; })}
            </div>
          </Card>
        </div>
      )}

      <Modal open={pwOpen} onClose={()=>!pbusy && setPwOpen(false)} title="Ubah Password" icon={<KeyRound className="w-4 h-4 text-blue-400"/>} size="sm"
        footer={<><button type="button" onClick={()=>setPwOpen(false)} disabled={pbusy} className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold disabled:opacity-50">Batal</button><button type="submit" form="pw-form" disabled={pbusy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold px-4 py-2 text-sm"><KeyRound className="w-4 h-4"/>{pbusy?'Memproses…':'Simpan Password'}</button></>}>
        <form id="pw-form" onSubmit={changePassword} className="space-y-4">
          {pmsg && <Notice ok={pmsg.ok} text={pmsg.text} />}
          <Pw label="Password Saat Ini" value={cur} onChange={setCur} show={show.c} toggle={()=>setShow(s=>({...s,c:!s.c}))} autoComplete="current-password" />
          <Pw label="Password Baru" value={npw} onChange={setNpw} show={show.n} toggle={()=>setShow(s=>({...s,n:!s.n}))} autoComplete="new-password" placeholder="Min. 6 karakter" />
          <Pw label="Konfirmasi Password Baru" value={rep} onChange={setRep} show={show.r} toggle={()=>setShow(s=>({...s,r:!s.r}))} autoComplete="new-password" />
        </form>
      </Modal>
    </div>
  );
}

function Pw({ label, value, onChange, show, toggle, placeholder, autoComplete }: { label:string; value:string; onChange:(v:string)=>void; show:boolean; toggle:()=>void; placeholder?:string; autoComplete?:string }) {
  return <label className="block"><span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
    <div className="mt-1.5 relative">
      <input type={show?'text':'password'} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete}
        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1120] pl-3.5 pr-10 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 focus:outline-none transition" />
      <button type="button" onClick={toggle} tabIndex={-1} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">{show?<Eye className="w-4 h-4"/>:<EyeOff className="w-4 h-4"/>}</button>
    </div></label>;
}

function KopLogo({ label, value, canEdit, onChange }: { side?: 'left' | 'right'; label: string; value: string; canEdit: boolean; onChange: (v:string)=>void }) {
  const norm = normalizeKopLogoValue(value);
  const previewSrc = resolveKopLogoSrc(norm);
  const [imgErr, setImgErr] = useState(false);
  const isCustomLink = !!norm && !/^logo[123]$/.test(norm);
  const [linkDraft, setLinkDraft] = useState(isCustomLink ? norm : '');

  // Reset imgErr setiap kali src berubah (termasuk saat re-render setelah save)
  const prevSrcRef = useRef(previewSrc);
  if (prevSrcRef.current !== previewSrc) { prevSrcRef.current = previewSrc; setImgErr(false); }

  useEffect(() => {
    const n = normalizeKopLogoValue(value);
    setLinkDraft(n && !/^logo[123]$/.test(n) ? n : '');
  }, [value]);

  const applyLink = () => {
    const v = normalizeKopLogoValue(linkDraft);
    if (linkDraft.trim() && !v) { /* nilai tidak valid, jangan simpan */ return; }
    onChange(v);
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700/70 bg-slate-50/60 dark:bg-slate-900/20 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
        {norm ? <button type="button" onClick={()=>onChange('')} disabled={!canEdit} className="text-[11px] font-semibold text-rose-500 hover:text-rose-400 disabled:opacity-40 inline-flex items-center gap-1"><XCircle className="w-3.5 h-3.5"/>Hapus</button> : null}
      </div>
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
          {previewSrc && !imgErr ? (
            <img key={previewSrc} src={previewSrc} alt={label} className="h-full w-full object-contain p-0.5" onError={() => setImgErr(true)} />
          ) : (
            <span className="text-[10px] text-slate-400 text-center leading-tight px-1">{norm ? (imgErr ? 'Gagal muat' : 'Tautan') : 'Kosong'}</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {KOP_BUILTIN_LOGOS.map(p => {
              const active = norm === p.key;
              return (
                <button key={p.key} type="button" disabled={!canEdit} onClick={()=>onChange(p.key)} title={p.label}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${active ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 ring-1 ring-blue-500' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 disabled:opacity-50'}`}>
                  <img src={p.src} alt="" className="w-4 h-4 object-contain"/>{p.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input value={linkDraft} onChange={e=>setLinkDraft(e.target.value)} onBlur={applyLink} onKeyDown={e=>{ if (e.key === 'Enter') { e.preventDefault(); applyLink(); } }} disabled={!canEdit}
                placeholder="https://… (tautan gambar, opsional)" className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1120] pl-8 pr-2.5 py-2 text-xs text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none disabled:opacity-60" />
            </div>
            <button type="button" onClick={applyLink} disabled={!canEdit} className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-2 text-[11px] font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">Pakai Link</button>
          </div>
          <div className="text-[10px] text-slate-400">Tersimpan di Firestore sebagai: <span className="font-mono text-slate-500">{norm || '— (kosong)'}</span>{/^logo[123]$/.test(norm) ? ' · logo bawaan' : (norm ? ' · tautan' : '')}. Tekan <b>Simpan Kop Surat</b> untuk menyimpan.</div>
        </div>
      </div>
    </div>
  );
}
