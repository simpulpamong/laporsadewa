import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, ImagePlus, Send, Trash2, FileText, CheckCircle2, AlertCircle, Loader2, MapPin, Copy, RotateCcw,
  ChevronDown, ChevronUp, Settings2, Save, FolderOpen, Download, Eye, GripVertical, X, ExternalLink, Image as ImageIcon,
  ChevronLeft, ChevronRight, Navigation, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, authHeaders } from '@/context/AuthContext';
import { Dropdown, Switch, useDialog, Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ReportCategory, ReportSubcategory } from '@/types';
import { readExif, formatExifTime } from '@/features/input/lib/exif';
import { reverseGeocode } from '@/features/input/lib/geocoding';
import { processPhoto, autoWatermarkLogo, composeManualAddress } from '@/features/input/lib/watermark';
import { extractOcrCoordinates, releaseOcrWorker } from '@/features/input/lib/ocr';
import { formatSizeKB, stampCompact } from '@/features/input/lib/format';
import type { ExifData, GeoAddress, GpsPoint } from '@/features/input/lib/types';
import { parseDynamic, extractFieldsFromTemplate, type DynamicFormatField, type DynamicFormatConfig } from '@/features/input/lib/dynamicParse';
import { MAX_PHOTOS, MAX_PHOTO_KB, APP_KABUPATEN, APP_PROVINSI, APP_NEGARA } from '@/features/input/lib/constants';

type LocalPhoto = {
  id: string; data: string; mime: string; sizeKB: number; source: 'camera' | 'gallery';
  exif: ExifData | null; exifAddr: GeoAddress | null; watermarked: boolean;
  status: 'processing' | 'ready' | 'error'; error?: string; procLabel?: string; sourceFileName?: string; fromDraft?: boolean;
};
interface ManualLocation { jalan: string; nodukuh: string; desa: string; kec: string; kab: string; prov: string }
const defaultLocation: ManualLocation = { jalan: '', nodukuh: '', desa: '', kec: '', kab: APP_KABUPATEN, prov: APP_PROVINSI };
const SESSION_KEY = 'sadewa-admin:input:v1';

function normKey(s: string) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function enrichAliases(f: DynamicFormatField): DynamicFormatField {
  const base = [f.label, ...(f.aliases || [])].filter(Boolean);
  const k = normKey(f.key + ' ' + f.label);
  const extra: string[] = [];
  const add = (...a: string[]) => { for (const x of a) if (x && !base.some(b => normKey(b) === normKey(x))) extra.push(x); };
  if (/hari|tanggal|tgl/.test(k)) add('HARI DAN TANGGAL','HARI, TANGGAL','HARI, TANGGAL PELAKSANAAN','Tgl','Tanggal','Hari Pelaksanaan','HARI DAN TANGGAL PELAKSANAAN');
  if (/laporan masuk|waktu masuk/.test(k)) add('Laporan masuk','LAPORAN MASUK');
  if (/berangkat/.test(k)) add('Waktu berangkat','WAKTU BERANGKAT');
  if (/tiba/.test(k) && !/kembali/.test(k)) add('Tiba dilokasi','TIBA DILOKASI','TIBA DI LOKASI');
  if (/mulai/.test(k)) add('Mulai Kegiatan','MULAI KEGIATAN');
  if (/selesai/.test(k) && !/kembali/.test(k)) add('Selesai Kegiatan','SELESAI KEGIATAN');
  if (/kembali|mako/.test(k)) add('Kembali ke Mako','KEMBALI KE MAKO','TIBA KEMBALI DI MAKO');
  if (/lokasi|alamat|tempat/.test(k)) add('LOKASI','Lokasi','Alamat');
  if (/gps|koordinat|lintang|bujur/.test(k)) add('GPS','Koordinat');
  if (/personil|petugas/.test(k)) add('PERSONIL YANG TERLIBAT','Personil','Petugas');
  if (/armada|kendaraan|unit|nopol|jenis|kondisi|rincian/.test(k)) add('JUMLAH ARMADA YANG DIGUNAKAN','JUMLAH UNIT KENDARANAN YANG DIGUNAKAN','Jenis','Nopol','Kendaraan','Kondisi/Rincian kegiatan');
  if (/kronolog/.test(k)) add('Kronologi','KRONOLOGI');
  if (/pelapor|pemohon|pemberi informasi|yang melaporkan/.test(k)) add('PELAPOR','PEMOHON','PEMBERI INFORMASI','Yang melaporkan','YANG MELAPORKAN');
  return { ...f, aliases: Array.from(new Set([...base, ...extra])) };
}
const DAY_RE = /(senin|selasa|rabu|kamis|jum'?at|sabtu|minggu)/i;
const DATE_RE = /(\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b|\b\d{1,2}\s+[A-Za-zÀ-ÿ.]+\s+\d{2,4}\b)/i;
const TIME_RE = /\b\d{1,2}\s*[.:]\s*\d{2}\b/;
const GPS_RE = /-?\d{1,2}[.,]\d+\s*[,;]?\s*-?\d{2,3}[.,]\d+|[NS]\s*-?\d|[EW]\s*-?\d/i;
function fallbackFilled(f: DynamicFormatField, text: string, parsedValue: string) {
  if (String(parsedValue || '').trim()) return true;
  const t = String(text || '');
  const k = normKey(f.key + ' ' + f.label);
  if (/hari|tanggal|tgl/.test(k)) return DAY_RE.test(t) || DATE_RE.test(t);
  if (/waktu|jam|masuk|berangkat|tiba|mulai|selesai|kembali/.test(k)) return TIME_RE.test(t);
  if (/gps|koordinat|lat|lng/.test(k)) return GPS_RE.test(t);
  const labelToken = String(f.label || '').split(/[/(]/)[0].trim();
  if (labelToken.length >= 4) {
    const re = new RegExp(labelToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[:\\-]?\\s*([^\\n]{2,})', 'i');
    const m = re.exec(t); if (m && m[1] && !/^[-\s.]+$/.test(m[1])) return true;
  }
  return false;
}
function buildEffectiveFields(template: string, format?: DynamicFormatConfig | null, scope?: string): DynamicFormatField[] {
  const fromFormat = Array.isArray(format?.fields) ? format!.fields.filter(f => f && (f.key || f.label)).map(enrichAliases) : [];
  const fromTemplate = template ? extractFieldsFromTemplate(template).map(enrichAliases) : [];
  let fields = fromTemplate.length >= 4 ? fromTemplate : fromFormat;
  if (!fields.length) fields = fromFormat;
  if (template && fromTemplate.length && fromFormat.length) {
    const req = new Set(fromFormat.filter(f => f.required).map(f => normKey(f.key + ' ' + f.label)));
    fields = fields.map(f => req.has(normKey(f.key + ' ' + f.label)) ? { ...f, required: true } : f);
  }
  const essentials: DynamicFormatField[] = [
    { key: 'tanggal', label: 'Hari/Tanggal', required: true, aliases: ['hari dan tanggal','hari,tanggal'] },
    { key: 'lokasi', label: 'Lokasi', required: true, aliases: ['alamat','tempat kejadian'], type: 'multiline' as any },
    { key: 'personil', label: 'Personil', required: scope === 'kebakaran' || scope === 'odnk', aliases: ['petugas','regu','personil yang terlibat'] },
    { key: 'pelapor', label: 'Pelapor/Yang Melaporkan', required: false, aliases: ['pelapor','pemohon','pemberi informasi'] },
  ].map(enrichAliases);
  for (const e of essentials) if (!fields.some(f => normKey(f.key+' '+f.label) === normKey(e.key+' '+e.label) || normKey(f.label) === normKey(e.label))) fields.push(e);
  const seen = new Set<string>();
  return fields.filter(f => { const k = normKey(f.label || f.key); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 40);
}
function uid() { return `ph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
function parseCoord(v: string): number | null { const n = Number(String(v || '').trim().replace(',', '.')); return Number.isFinite(n) ? n : null; }
function esc(s: string) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export default function InputLaporan() {
  const { token, user } = useAuth();
  const dialog = useDialog();
  const isSuper = user?.role === 'superadmin';
  const scopes: string[] = useMemo(() => (user as any)?.categoryScopes || [], [(user as any)?.categoryScopes]);

  const [cats, setCats] = useState<ReportCategory[]>([]);
  const [subs, setSubs] = useState<ReportSubcategory[]>([]);
  const [catId, setCatId] = useState('');
  const [subId, setSubId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [wmCam, setWmCam] = useState(true);
  const [wmGal, setWmGal] = useState(false);
  const [ocrGal, setOcrGal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [locOpen, setLocOpen] = useState(false);
  const [loc, setLoc] = useState<ManualLocation>(defaultLocation);
  const [coords, setCoords] = useState({ lat: '', lng: '' });
  const [viewer, setViewer] = useState<number | null>(null);
  const [mapModal, setMapModal] = useState<number | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [draftBusy, setDraftBusy] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  const loadMeta = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadErr('');
    try {
      const r = await api<{ success: true; categories: ReportCategory[]; subcategories: ReportSubcategory[] }>(
        '/api/admin/categories',
        { headers: authHeaders(token), fresh: true } as any,
      );
      const rawCats = Array.isArray(r?.categories) ? r.categories : Array.isArray((r as any)) ? (r as any) : [];
      const rawSubs = Array.isArray(r?.subcategories) ? r.subcategories : [];
      const vc = rawCats.filter((x: any) => x && x.active !== false).filter((x: any) => isSuper || !scopes.length || scopes.includes(x.id));
      const allowed = new Set(vc.map((c: any) => c.id));
      const vs = rawSubs.filter((x: any) => x && x.active !== false).filter((x: any) => allowed.has(x.categoryId));
      setCats(vc as any); setSubs(vs as any);
      setCatId(prev => (prev && vc.some((c: any) => c.id === prev) ? prev : (vc.length === 1 ? vc[0].id : '')));
      if (!vc.length) setLoadErr(isSuper ? 'Belum ada kategori aktif. Buat/aktifkan kategori & subkategori di menu Kategori.' : 'Akun ini belum punya scope kategori. Minta superadmin mengatur akses.');
    } catch (e: any) {
      const msg = e?.message || 'Gagal memuat kategori/subkategori.';
      setLoadErr(msg);
      if (!silent) dialog.toast(msg, 'danger');
    } finally { setLoading(false); }
  }, [token, isSuper, scopes, dialog]);

  useEffect(() => { void loadMeta(); }, [loadMeta]);
  useEffect(() => { try { const raw = sessionStorage.getItem(SESSION_KEY); if (raw) { const s = JSON.parse(raw); if (s.loc) setLoc({ ...defaultLocation, ...s.loc }); if (s.coords) setCoords({ lat: s.coords.lat || '', lng: s.coords.lng || '' }); if (s.wmCam != null) setWmCam(!!s.wmCam); if (s.wmGal != null) setWmGal(!!s.wmGal); if (s.ocrGal != null) setOcrGal(!!s.ocrGal); } } catch {} }, []);
  useEffect(() => { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ loc, coords, wmCam, wmGal, ocrGal })); } catch {} }, [loc, coords, wmCam, wmGal, ocrGal]);

  useEffect(() => {
    const scoped = subs.filter(s => s.categoryId === catId);
    setSubId(prev => (prev && scoped.some(s => s.id === prev)) ? prev : (scoped.length === 1 ? scoped[0].id : ''));
  }, [catId, subs]);

  const cat = cats.find(c => c.id === catId) || null;
  const scopedSubs = subs.filter(s => s.categoryId === catId);
  const sub = subs.find(s => s.id === subId) || null;
  const template = String((sub as any)?.format?.template || '').trim();
  const format: DynamicFormatConfig | null = (sub as any)?.format || null;
  const scope = String(sub?.slug || sub?.id || '');
  const fields = useMemo(() => buildEffectiveFields(template, format, scope), [template, format, scope]);

  const checklist = useMemo(() => {
    if (!text.trim() || !fields.length) return fields.map(f => ({ field: f, filled: false, value: '' }));
    const parsed = parseDynamic(text, { template, fields, version: format?.version } as any);
    return fields.map(f => {
      const value = String((parsed.values as any)?.[f.key] || '').trim();
      const filled = fallbackFilled(f, text, value);
      return { field: f, filled, value: filled ? (value || 'terisi') : '' };
    });
  }, [text, fields, template, format]);
  const filledCount = checklist.filter(c => c.filled).length;
  const requiredMissing = checklist.filter(c => c.field.required && !c.filled).length;

  const manualGps = useMemo<GpsPoint | null>(() => {
    const lat = parseCoord(coords.lat), lng = parseCoord(coords.lng);
    if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  }, [coords]);
  const fallbackAddress = useMemo(() => composeManualAddress(loc), [loc]);

  const addFiles = async (files: FileList | null, source: 'camera' | 'gallery') => {
    if (!files?.length || !sub) return;
    const room = Math.max(0, MAX_PHOTOS - photos.length);
    const arr = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, room);
    if (!arr.length) { dialog.toast(`Maksimal ${MAX_PHOTOS} foto.`, 'warning'); return; }
    const wmLogo = autoWatermarkLogo({ slug: cat?.slug, name: cat?.name, id: cat?.id, watermarkLogo: (cat as any)?.watermarkLogo, parentCategory: cat ? { id: cat.id, name: cat.name, slug: cat.slug } : null } as any);
    const isDamkar = wmLogo === 'damkar';
    const brand = (cat as any)?.watermarkBrand || (isDamkar ? 'DAMKAR PONOROGO' : 'SATPOL PP PONOROGO');
    const categoryLabel = String((cat as any)?.parentCategory?.name || cat?.name || 'LAPORAN').trim().toUpperCase();
    const watermark = source === 'camera' ? wmCam : wmGal;

    for (const file of arr) {
      const id = uid();
      setPhotos(p => [...p, { id, data: '', mime: 'image/jpeg', sizeKB: 0, source, exif: null, exifAddr: null, watermarked: false, status: 'processing', procLabel: 'Menyiapkan foto...', sourceFileName: file.name }]);
      (async () => {
        try {
          let exif: ExifData | null = await readExif(file).catch(() => null);
          let addr: GeoAddress | null = null;
          if (exif?.gps) {
            setPhotos(p => p.map(x => x.id === id ? { ...x, procLabel: 'Mencari nama jalan...' } : x));
            addr = await reverseGeocode(exif.gps.lat, exif.gps.lng).catch(() => null);
          } else if (source === 'gallery' && ocrGal) {
            setPhotos(p => p.map(x => x.id === id ? { ...x, procLabel: 'Mendeteksi lokasi (OCR)...' } : x));
            try {
              const detected = await extractOcrCoordinates(file);
              if (detected) {
                addr = await reverseGeocode(detected.lat, detected.lng).catch(() => null);
                exif = { ...(exif || {}), gps: detected };
              }
            } finally { await releaseOcrWorker().catch(() => {}); }
          }
          const gps = exif?.gps || manualGps;
          const ctx = {
            program: categoryLabel, unit: '', fallbackAddress,
            gps, manualGps: !exif?.gps && !!gps, address: addr,
            capturedAt: exif?.dto || exif?.dtd || exif?.dateTime || '',
            brand, watermarkLogo: wmLogo,
          };
          setPhotos(p => p.map(x => x.id === id ? { ...x, procLabel: watermark ? 'Menerapkan watermark...' : 'Mengompresi foto...' } : x));
          const result = await processPhoto({ source: file, sourceKind: source, watermark, watermarkLogo: wmLogo, context: ctx as any, maxBytes: MAX_PHOTO_KB * 1024 });
          if (!result) throw new Error('Gagal memproses foto.');
          setPhotos(p => p.map(x => x.id === id ? { ...x, ...result, exif, exifAddr: addr, status: 'ready', procLabel: '' } : x));
        } catch (e: any) {
          setPhotos(p => p.map(x => x.id === id ? { ...x, status: 'error', error: e?.message || 'Gagal memproses foto.', procLabel: '' } : x));
        }
      })();
    }
  };

  const removePhoto = (id: string) => setPhotos(p => p.filter(x => x.id !== id));
  const movePhoto = (from: number, to: number) => setPhotos(p => { if (from === to || from < 0 || to < 0 || from >= p.length || to >= p.length) return p; const n = [...p]; const [it] = n.splice(from, 1); n.splice(to, 0, it); return n; });
  const clearAll = async () => {
    const ok = await dialog.confirm({ title: 'Bersihkan Input', message: 'Hapus teks dan semua foto? (Draft server tidak terpengaruh.)', confirmLabel: 'Bersihkan', tone: 'warning' });
    if (ok) { setText(''); setPhotos([]); }
  };
  const copyTemplate = async () => {
    if (!template) return;
    try { await navigator.clipboard.writeText(template); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { dialog.toast('Clipboard tidak tersedia.', 'warning'); }
  };

  const metaOf = (ph: LocalPhoto) => ({
    hasGps: !!ph.exif?.gps,
    lat: ph.exif?.gps?.lat ?? null,
    lng: ph.exif?.gps?.lng ?? null,
    datetime: ph.exif ? formatExifTime(ph.exif) : null,
    address: ph.exifAddr?.full || null,
    source: ph.source,
  });

  const submit = async () => {
    if (!sub || !cat) return dialog.toast('Pilih kategori dan subkategori terlebih dahulu.', 'warning');
    if (!text.trim()) return dialog.toast('Teks laporan wajib diisi.', 'warning');
    const ready = photos.filter(p => p.status === 'ready' && p.data);
    if (!ready.length) return dialog.toast('Tambahkan minimal 1 foto yang berhasil diproses.', 'warning');
    if (photos.some(p => p.status === 'processing')) return dialog.toast('Tunggu semua foto selesai diproses.', 'warning');
    const parsed = parseDynamic(text, { template, fields, version: format?.version } as any);
    if (parsed.missing.length) return dialog.toast(`Field wajib belum terisi: ${parsed.missing.map(m => m.label).join(', ')}`, 'warning');

    setBusy(true); setProgress('Membuat ID laporan...');
    try {
      const kategori = sub.slug || sub.id;
      const idRes = await api<any>('/api/admin/sadewa', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ action: 'generateReportId', data: { kategori } }) });
      const reportId = String(idRes?.reportId || '');
      if (!reportId) throw new Error(idRes?.message || 'Gagal membuat ID laporan.');
      const uploaded: any[] = [];
      for (let i = 0; i < ready.length; i++) {
        const ph = ready[i];
        setProgress(`Mengunggah foto ${i + 1}/${ready.length}...`);
        const up = await api<any>('/api/admin/sadewa', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({
          action: 'uploadFoto',
          data: {
            foto: { data: ph.data, mime: ph.mime, source: ph.source },
            meta: metaOf(ph),
            laporan: text, kategori, reportId, noFoto: i + 1, jumlahTotal: ready.length,
            idempotencyKey: `${reportId}-${i + 1}-${(ph.data || '').slice(-24)}`,
          }
        }) });
        uploaded.push({ link: up?.linkFile, namaFile: up?.namaFile, source: ph.source, meta: metaOf(ph), fileId: up?.fileId, folderId: up?.folderId, folderUrl: up?.folderUrl });
      }
      setProgress('Menyimpan laporan...');
      const subRes = await api<any>('/api/admin/sadewa', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({
        action: 'submitLaporan',
        data: { laporan: text, kategori, reportId, linkFoto: uploaded, folderUrl: uploaded[0]?.folderUrl || null, draftId: activeDraftId }
      }) });
      const waMsg = subRes?.whatsapp?.message || subRes?.whatsappMessage || '';
      const waUrl = waMsg ? `https://wa.me/?text=${encodeURIComponent(waMsg)}` : '';
      dialog.alert({
        title: 'Laporan Terkirim',
        tone: 'success',
        message: (
          <div className="text-sm leading-relaxed space-y-2">
            <div><b>{reportId}</b> tersimpan. {ready.length} foto terunggah.{subRes?.draftRemoved ? ' Draft server ikut dihapus.' : ''}</div>
            {waUrl ? <a href={waUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 text-sm font-bold">Bagikan ke WhatsApp</a> : null}
          </div>
        ),
      } as any);
      setText(''); setPhotos([]); setActiveDraftId(null);
    } catch (e: any) {
      dialog.alert({ title: 'Gagal Mengirim', message: e?.message || 'Terjadi kesalahan saat mengirim laporan. Data di perangkat masih aman, silakan coba lagi.', tone: 'danger' } as any);
    } finally { setBusy(false); setProgress(''); }
  };

  // Drafts (native admin endpoints, mandiri)
  const refreshDrafts = async () => {
    setDraftBusy(true);
    try {
      const r = await api<any>('/api/admin/drafts?scope=sadewa', { headers: authHeaders(token), fresh: true } as any);
      setDrafts(Array.isArray(r?.drafts) ? r.drafts : []);
    } catch (e: any) { dialog.toast(e?.message || 'Gagal memuat draft.', 'danger'); }
    finally { setDraftBusy(false); }
  };
  const openDrafts = async () => { setDraftOpen(true); await refreshDrafts(); };
  const saveDraft = async () => {
    if (!text.trim() && !photos.some(p => p.status === 'ready' && p.data)) return dialog.toast('Isi teks atau tambahkan foto dulu.', 'warning');
    if (photos.some(p => p.status === 'processing')) return dialog.toast('Tunggu foto selesai diproses.', 'warning');
    const ready = photos.filter(p => p.status === 'ready' && p.data);
    if (!ready.length) return dialog.toast('Draft minimal memuat satu foto.', 'warning');
    setBusy(true); setProgress('Menyimpan draft...');
    try {
      const cr = await api<any>('/api/admin/drafts', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ action: 'create', scope: 'sadewa', teks: text, label: sub?.name || cat?.name || 'Draft' }) });
      const draftId = String(cr?.draftId || '');
      if (!draftId) throw new Error(cr?.message || 'Gagal membuat draft.');
      setActiveDraftId(draftId);
      for (let i = 0; i < ready.length; i++) {
        const ph = ready[i];
        setProgress(`Simpan draft foto ${i + 1}/${ready.length}...`);
        await api<any>('/api/admin/drafts', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({
          action: 'append', draftId, scope: 'sadewa',
          photoKey: `${draftId}-${ph.sizeKB}-${(ph.data || '').slice(-24) || i}`,
          foto: { data: ph.data, mime: ph.mime, source: ph.source },
          sizeKB: ph.sizeKB, exifMeta: metaOf(ph),
        }) });
      }
      dialog.alert({ title: 'Draft Tersimpan', tone: 'success', message: <div className="text-sm"><b>{ready.length}</b> foto dan teks tersimpan. <span className="text-slate-500">ID: {draftId}</span></div> } as any);
    } catch (e: any) { dialog.toast(e?.message || 'Gagal menyimpan draft. Draft yang berhasil tersimpan sebagian tetap bisa dicek dari menu Draft.', 'danger'); }
    finally { setBusy(false); setProgress(''); }
  };
  const loadDraft = async (draftId: string) => {
    setDraftOpen(false);
    if (photos.length >= MAX_PHOTOS) return dialog.toast('Kapasitas foto sudah penuh. Hapus foto lama sebelum memuat draft.', 'warning');
    setBusy(true); setProgress('Memuat draft dari server...');
    try {
      const r = await api<any>('/api/admin/drafts', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ action: 'load', draftId }) });
      if (r?.teks) setText(String(r.teks));
      const incoming = Array.isArray(r?.photos) ? r.photos : [];
      const room = Math.max(0, MAX_PHOTOS - photos.length);
      const loaded: LocalPhoto[] = incoming.slice(0, room).map((p: any, i: number) => {
        const meta = p.exifMeta || {};
        const lat = Number(meta.lat), lng = Number(meta.lng);
        const hasGps = (meta.hasGps === true || meta.hasGps === 'true') && Number.isFinite(lat) && Number.isFinite(lng);
        const gps = hasGps ? { lat, lng } : undefined;
        const exif: ExifData | null = gps ? { gps } : null;
        const data = String(p.data || p.dataUrl || '');
        return { id: uid() + i, data, mime: String(p.mime || 'image/jpeg'), sizeKB: Number(p.sizeKB) || 0, source: p.source === 'camera' ? 'camera' : 'gallery', exif, exifAddr: meta.address ? { full: String(meta.address), road: '', parts: [] } : null, watermarked: false, status: data ? 'ready' : 'error', error: data ? undefined : 'Data foto draft tidak tersedia.', fromDraft: true };
      });
      setPhotos(prev => [...prev, ...loaded.filter(p => p.status === 'ready')]);
      setActiveDraftId(null);
      setDrafts(current => current.filter(item => item.draftId !== draftId));
      const okCount = loaded.filter(p => p.status === 'ready').length;
      dialog.alert({ title: 'Draft Dimuat', tone: okCount ? 'success' : 'warning', message: <div className="text-sm"><b>{okCount}</b> foto dan teks dipulihkan. <span className="text-slate-500">Draft dihapus permanen dari server setelah dimuat.</span></div> } as any);
    } catch (e: any) { dialog.toast(e?.message || 'Gagal memuat draft.', 'danger'); }
    finally { setBusy(false); setProgress(''); }
  };
  const removeDraft = async (draftId: string) => {
    const ok = await dialog.confirm({ title: 'Hapus Draft', message: 'Draft dan fotonya akan dihapus permanen dari server.', confirmLabel: 'Hapus', tone: 'danger' });
    if (!ok) return;
    try { await api<any>('/api/admin/drafts', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ action: 'delete', draftId }) }); setDrafts(d => d.filter(x => x.draftId !== draftId)); }
    catch (e: any) { dialog.toast(e?.message || 'Gagal menghapus draft.', 'danger'); }
  };

  const processingCount = photos.filter(p => p.status === 'processing').length;
  const readyCount = photos.filter(p => p.status === 'ready').length;
  const viewPhoto = viewer != null ? photos[viewer] : null;
  const mapPhoto = mapModal != null ? photos[mapModal] : null;
  const canNav = (idx: number | null, dir: -1 | 1) => idx != null && photos[idx + dir]?.status === 'ready';

  const confirmRemovePhoto = async (id: string) => {
    const ok = await dialog.confirm({ title: 'Hapus Foto', message: 'Yakin ingin menghapus foto ini dari daftar?', confirmLabel: 'Hapus', tone: 'danger' });
    if (ok) removePhoto(id);
  };
  const openMap = (idx: number) => { if (photos[idx]?.exif?.gps) setMapModal(idx); };
  const downloadPhoto = (ph: LocalPhoto, i: number) => {
    if (!ph.data) return;
    const a = document.createElement('a');
    a.href = ph.data;
    a.download = `SADEWA_Foto${i + 1}_${stampCompact()}.jpg`;
    a.click();
  };

  useEffect(() => {
    if (viewer == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewer(null);
      else if (e.key === 'ArrowRight') setViewer(v => (v != null && canNav(v, 1) ? v + 1 : v));
      else if (e.key === 'ArrowLeft') setViewer(v => (v != null && canNav(v, -1) ? v - 1 : v));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer, photos]);

  useEffect(() => {
    if (mapModal == null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMapModal(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mapModal]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Input Laporan</h2>
            <p className="text-sm text-slate-500 mt-0.5">Paritas Sadewa (mandiri): foto EXIF/GPS, geocoding cepat, watermark+QR (kategori), lokasi manual, OCR galeri, checklist format dinamis, draft, dan kirim native ke Drive/Sheet/Rekap.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={openDrafts} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 relative">
              <FolderOpen className="w-4 h-4"/>Draft
              {activeDraftId ? <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#0F172A]" title={`Draft aktif: ${activeDraftId}`} /> : null}
            </button>
            <button type="button" onClick={saveDraft} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"><Save className="w-4 h-4"/>Simpan Draft</button>
            <button type="button" onClick={clearAll} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"><RotateCcw className="w-4 h-4"/>Bersihkan</button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Kategori</span>
              {!loading && <button type="button" onClick={() => void loadMeta()} disabled={busy} className="text-[11px] font-semibold text-blue-500 hover:text-blue-400 disabled:opacity-50">Muat ulang</button>}
            </div>
            <div className="mt-1"><Dropdown value={catId} onChange={setCatId} placeholder={loading ? 'Memuat...' : (cats.length ? 'Pilih kategori' : 'Tidak ada kategori')} options={cats.map(c => ({ value: c.id, label: c.name }))} disabled={loading||busy||!cats.length} /></div>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Subkategori</span>
            <div className="mt-1"><Dropdown value={subId} onChange={setSubId} placeholder={!catId ? 'Pilih kategori dulu' : (scopedSubs.length ? 'Pilih subkategori' : 'Tidak ada subkategori aktif')} options={scopedSubs.map(s => ({ value: s.id, label: s.name }))} disabled={!catId||busy||!scopedSubs.length} /></div>
          </div>
        </div>
        {!loading && loadErr ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-300">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="min-w-0"><div>{loadErr}</div><button type="button" onClick={() => void loadMeta()} className="mt-1 text-xs font-semibold underline underline-offset-2">Coba muat ulang</button></div>
          </div>
        ) : null}
        {!loading && !loadErr && cats.length > 0 && catId && !scopedSubs.length ? (
          <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300">Kategori ini belum punya subkategori aktif. Tambahkan di menu <b>Kategori</b>.</div>
        ) : null}
        {sub && (
          <div className="mt-3 text-xs text-slate-500 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1"><FileText className="w-3.5 h-3.5"/>{template ? 'Template tersedia' : 'Tanpa template (pakai field format)'}</span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1">Scope: <b>{scope}</b></span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1">{fields.length} field{fields.some(f=>f.required)?' · wajib':' '}</span>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700/70 overflow-hidden">
          <button type="button" onClick={() => setLocOpen(o => !o)} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <span className="inline-flex items-center gap-2"><Settings2 className="w-4 h-4 text-slate-400"/>Pengaturan Foto & Lokasi Manual {manualGps ? <span className="text-[10px] font-bold rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5">GPS manual</span> : null}</span>
            {locOpen ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
          </button>
          {locOpen && (
            <div className="px-3 pb-3 pt-1 border-t border-slate-200 dark:border-slate-700/70 space-y-3">
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <Switch checked={wmCam} onChange={setWmCam} label="Watermark kamera" size="sm" />
                <Switch checked={wmGal} onChange={setWmGal} label="Watermark galeri" size="sm" />
                <Switch checked={ocrGal} onChange={setOcrGal} label="OCR lokasi galeri (tanpa EXIF)" size="sm" />
              </div>
              <p className="text-[11px] text-slate-500">Lokasi manual dipakai sebagai fallback pada foto galeri/foto tanpa GPS (watermark/QR). Paritas Sadewa.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {([['jalan','Jalan/Gang'],['nodukuh','No/Dukuh'],['desa','Desa/Kelurahan'],['kec','Kecamatan'],['kab','Kabupaten'],['prov','Provinsi']] as const).map(([k,label]) => (
                  <label key={k} className="text-xs">
                    <span className="text-slate-500">{label}</span>
                    <input value={(loc as any)[k]} onChange={e => setLoc(p => ({ ...p, [k]: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1120] px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
                  </label>
                ))}
                <label className="text-xs"><span className="text-slate-500">Latitude</span><input value={coords.lat} onChange={e => setCoords(p => ({ ...p, lat: e.target.value }))} inputMode="decimal" placeholder="-7.865900" className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1120] px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none" /></label>
                <label className="text-xs"><span className="text-slate-500">Longitude</span><input value={coords.lng} onChange={e => setCoords(p => ({ ...p, lng: e.target.value }))} inputMode="decimal" placeholder="111.464900" className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1120] px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none" /></label>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-500 truncate">{manualGps ? `${manualGps.lat.toFixed(6)}, ${manualGps.lng.toFixed(6)}` : 'Koordinat manual belum valid'}</span>
                <button type="button" onClick={() => { setLoc({ ...defaultLocation }); setCoords({ lat: '', lng: '' }); }} className="font-semibold text-blue-500 hover:text-blue-400 shrink-0">Reset lokasi</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_.8fr] gap-5">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-semibold">Teks Laporan</h3>
            <div className="flex items-center gap-2">
              {template && <button type="button" onClick={() => setText(template)} className="text-xs font-semibold text-blue-500 hover:text-blue-400 inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5"/>Muat template</button>}
              {template && <button type="button" onClick={copyTemplate} className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 inline-flex items-center gap-1"><Copy className="w-3.5 h-3.5"/>{copied ? 'Tersalin' : 'Salin template'}</button>}
            </div>
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} disabled={busy} placeholder="Tempel teks laporan (format WhatsApp) sesuai subkategori..." rows={12}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1120] px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none custom-scrollbar" />
          <div className="text-xs text-slate-500">{text.trim().length.toLocaleString('id-ID')} karakter {text.trim() ? <button type="button" onClick={() => setText('')} className="ml-2 text-slate-400 hover:text-slate-600">Bersihkan teks</button> : null}</div>

          {fields.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/70 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-sm font-semibold inline-flex items-center gap-1.5">{requiredMissing ? <AlertCircle className="w-4 h-4 text-amber-500"/> : <CheckCircle2 className="w-4 h-4 text-emerald-500"/>}Kelengkapan Format</div>
                <div className={cn('text-xs font-semibold rounded-lg px-2 py-1', requiredMissing ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400')}>
                  {filledCount}/{fields.length} terisi{requiredMissing ? ` · ${requiredMissing} wajib belum` : fields.length ? ' · lengkap' : ''}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {checklist.map(({ field, filled }) => (
                  <div key={field.key + field.label} title={field.required ? 'Wajib' : 'Opsional'} className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs border', filled ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300' : 'border-slate-200 dark:border-slate-700 text-slate-500')}>
                    <span className={cn('w-4 h-4 rounded-md inline-flex items-center justify-center text-[10px] font-bold shrink-0', filled ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700')}>{filled ? '✓' : ''}</span>
                    <span className="truncate">{field.label}</span>
                    {field.required ? <span className="ml-auto text-[10px] text-amber-500 shrink-0">wajib</span> : null}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Terdeteksi otomatis (toleran variasi label/waktu `11 .22`, GPS spasi). Parser menyesuaikan format subkategori.</p>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-semibold">Dokumentasi Foto</h3>
              <span className="text-xs text-slate-500">{readyCount}/{photos.length} siap · maks {MAX_PHOTOS}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { void addFiles(e.target.files, 'camera'); e.target.value = ''; }} />
              <input ref={galRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { void addFiles(e.target.files, 'gallery'); e.target.value = ''; }} />
              <button type="button" onClick={() => camRef.current?.click()} disabled={busy || !sub || photos.length >= MAX_PHOTOS} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3.5 py-2 text-sm font-semibold"><Camera className="w-4 h-4"/>Kamera</button>
              <button type="button" onClick={() => galRef.current?.click()} disabled={busy || !sub || photos.length >= MAX_PHOTOS} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"><ImagePlus className="w-4 h-4"/>Galeri</button>
            </div>
            {!sub && <p className="mt-2 text-xs text-amber-500">Pilih subkategori dulu agar watermark/kategori/format sesuai.</p>}
            <div className="mt-3 space-y-2 max-h-[460px] overflow-y-auto custom-scrollbar pr-1">
              {photos.map((ph, i) => (
                <div key={ph.id}
                  draggable={!busy && ph.status !== 'processing'}
                  onDragStart={(e) => { dragFrom.current = i; try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); } catch {} }}
                  onDragOver={e => { e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch {} }}
                  onDrop={(e) => { e.preventDefault(); if (dragFrom.current != null) movePhoto(dragFrom.current, i); dragFrom.current = null; }}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700/70 p-2 group bg-white dark:bg-transparent">
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <button type="button" disabled={busy || i === 0} onClick={() => movePhoto(i, i - 1)} className="p-0.5 rounded text-slate-400 hover:text-slate-600 disabled:opacity-25" title="Naik"><ArrowUp className="w-3.5 h-3.5"/></button>
                    <span className="text-slate-300 dark:text-slate-600 cursor-grab" title="Geser/drag untuk urutkan"><GripVertical className="w-4 h-4"/></span>
                    <button type="button" disabled={busy || i === photos.length - 1} onClick={() => movePhoto(i, i + 1)} className="p-0.5 rounded text-slate-400 hover:text-slate-600 disabled:opacity-25" title="Turun"><ArrowDown className="w-3.5 h-3.5"/></button>
                  </div>
                  <button type="button" onClick={() => ph.status === 'ready' && ph.data && setViewer(i)} className="w-14 h-14 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center relative ring-offset-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40">
                    {ph.data ? <img src={ph.data} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" loading="lazy" /> : <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
                    {ph.status === 'ready' ? <span className="absolute inset-0 bg-black/0 hover:bg-black/20 transition flex items-center justify-center"><Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 drop-shadow"/></span> : null}
                    <span className="absolute top-0.5 left-0.5 min-w-[18px] h-[18px] rounded-md bg-black/55 text-white text-[10px] font-bold flex items-center justify-center px-1">{i + 1}</span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">Foto {i + 1} <span className="text-slate-400 font-normal">· {ph.source === 'camera' ? 'Kamera' : 'Galeri'}{ph.fromDraft ? ' · draft' : ''}</span></div>
                    <div className="text-xs text-slate-500 truncate">
                      {ph.status === 'processing' ? (ph.procLabel || 'Memproses...') : ph.status === 'error' ? <span className="text-rose-500">{ph.error}</span> : <span className="inline-flex items-center gap-1 flex-wrap">{ph.exif?.gps ? <><MapPin className="w-3 h-3 text-emerald-500"/>GPS{ph.exifAddr?.road ? ` · ${ph.exifAddr.road}` : ''}</> : (manualGps ? 'GPS manual (watermark)' : 'Tanpa GPS')} · {ph.watermarked ? 'watermark+QR' : 'tanpa watermark'} · {formatSizeKB(ph.sizeKB)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {ph.exif?.gps ? <button type="button" onClick={() => openMap(i)} className="p-2 rounded-lg hover:bg-sky-500/10 text-sky-600 dark:text-sky-400" title="Lihat peta"><MapPin className="w-4 h-4"/></button> : null}
                    {ph.status === 'ready' && ph.data ? <button type="button" onClick={() => downloadPhoto(ph, i)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600" title="Unduh"><Download className="w-4 h-4"/></button> : null}
                    <button type="button" onClick={() => void confirmRemovePhoto(ph.id)} disabled={busy} className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 disabled:opacity-50" title="Hapus foto"><Trash2 className="w-4 h-4"/></button>
                  </div>
                </div>
              ))}
              {!photos.length && <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-sm text-slate-500"><ImageIcon className="w-7 h-7 mx-auto mb-2 text-slate-300 dark:text-slate-600"/>Belum ada foto. Kamera disarankan agar GPS/watermark/lokasi akurat. Foto bisa diurut (drag/geser atau tombol naik-turun).</div>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-4 sm:p-5">
            <button type="button" onClick={submit} disabled={busy || !sub || !text.trim() || !readyCount || processingCount > 0}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 text-sm font-bold shadow-sm">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin"/>{progress || 'Memproses...'}</> : <><Send className="w-4 h-4"/>Kirim Laporan</>}
            </button>
            <p className="mt-2 text-[11px] text-slate-500 text-center">Mandiri (native admin): generate ID → upload Drive → simpan Sheet/Rekap. Pastikan env Google/Firebase/Apps Script/Cloudinary (draft) di deploy admin.</p>
          </div>
        </div>
      </div>

      {viewer != null && viewPhoto ? (
        <div className="fixed inset-0 z-[12000] bg-black/88 flex items-center justify-center p-3 sm:p-4" onClick={() => setViewer(null)}>
          <div className="relative w-full max-w-5xl max-h-[94vh] flex flex-col" onClick={e => e.stopPropagation()}
            onTouchStart={e => { touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
            onTouchEnd={e => {
              const s = touchRef.current; touchRef.current = null; if (!s) return;
              const dx = e.changedTouches[0].clientX - s.x; const dy = Math.abs(e.changedTouches[0].clientY - s.y);
              if (Math.abs(dx) > 48 && dy < 80) setViewer(v => v == null ? v : (dx < 0 ? (canNav(v, 1) ? v + 1 : v) : (canNav(v, -1) ? v - 1 : v)));
            }}>
            <div className="flex items-center justify-between gap-2 mb-2 text-white">
              <div className="min-w-0">
                <div className="text-sm font-semibold">Foto {viewer + 1} / {photos.length} · {viewPhoto.source === 'camera' ? 'Kamera' : 'Galeri'}</div>
                <div className="text-[11px] text-white/70 truncate">{viewPhoto.exif?.gps ? `GPS ${viewPhoto.exif.gps.lat.toFixed(6)}, ${viewPhoto.exif.gps.lng.toFixed(6)}${viewPhoto.watermarked ? ' · watermark+QR' : ''}` : (manualGps ? 'Tanpa EXIF GPS' : 'Tanpa GPS')} · {formatSizeKB(viewPhoto.sizeKB)}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {viewPhoto.exif?.gps ? <button type="button" onClick={() => openMap(viewer)} className="p-2 rounded-lg bg-white/10 hover:bg-white/20" title="Lihat peta"><MapPin className="w-4 h-4"/></button> : null}
                <button type="button" onClick={() => downloadPhoto(viewPhoto, viewer)} className="p-2 rounded-lg bg-white/10 hover:bg-white/20" title="Unduh"><Download className="w-4 h-4"/></button>
                <button type="button" onClick={() => setViewer(null)} className="p-2 rounded-lg bg-white/10 hover:bg-white/20" title="Tutup (Esc)"><X className="w-4 h-4"/></button>
              </div>
            </div>
            <div className="relative flex-1 min-h-0 flex items-center justify-center">
              <button type="button" disabled={!canNav(viewer, -1)} onClick={() => setViewer(v => v != null && canNav(v, -1) ? v - 1 : v)} className="absolute left-1 sm:left-2 z-10 p-2 rounded-full bg-black/35 hover:bg-black/55 text-white disabled:opacity-25"><ChevronLeft className="w-5 h-5"/></button>
              <img src={viewPhoto.data} alt={`Foto ${viewer + 1}`} className="max-w-full max-h-[72vh] sm:max-h-[76vh] object-contain rounded-xl bg-black select-none" draggable={false} />
              <button type="button" disabled={!canNav(viewer, 1)} onClick={() => setViewer(v => v != null && canNav(v, 1) ? v + 1 : v)} className="absolute right-1 sm:right-2 z-10 p-2 rounded-full bg-black/35 hover:bg-black/55 text-white disabled:opacity-25"><ChevronRight className="w-5 h-5"/></button>
            </div>
            {viewPhoto.exifAddr?.full ? <div className="mt-2 text-xs text-white/80 text-center px-2 line-clamp-2">{viewPhoto.exifAddr.full}</div> : null}
            <div className="mt-2 text-[11px] text-white/50 text-center">Geser kiri/kanan atau gunakan tombol panah untuk navigasi. Esc untuk menutup.</div>
          </div>
        </div>
      ) : null}

      {mapModal != null && mapPhoto?.exif?.gps ? (
        <div className="fixed inset-0 z-[12100] bg-black/70 flex items-center justify-center p-3 sm:p-4" onClick={() => setMapModal(null)}>
          <div className="w-full max-w-3xl rounded-2xl overflow-hidden bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <div className="min-w-0">
                <div className="text-sm font-bold inline-flex items-center gap-2"><MapPin className="w-4 h-4 text-sky-500"/>Lokasi Foto {mapModal + 1}</div>
                <div className="text-xs text-slate-500 truncate">{mapPhoto.exif.gps.lat.toFixed(6)}, {mapPhoto.exif.gps.lng.toFixed(6)}{mapPhoto.exifAddr?.road ? ` · ${mapPhoto.exifAddr.road}` : ''}</div>
              </div>
              <button type="button" onClick={() => setMapModal(null)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4"/></button>
            </div>
            <iframe title="Peta lokasi foto" className="w-full h-[50vh] min-h-[280px] bg-slate-100 dark:bg-slate-900"
              src={`https://www.google.com/maps?q=${mapPhoto.exif.gps.lat},${mapPhoto.exif.gps.lng}&output=embed&z=17`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-700">
              <div className="text-xs text-slate-500 truncate max-w-full">{mapPhoto.exifAddr?.full || 'Koordinat dari EXIF/OCR foto.'}</div>
              <div className="flex items-center gap-2">
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${mapPhoto.exif.gps.lat},${mapPhoto.exif.gps.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white px-3 py-2 text-xs font-semibold"><Navigation className="w-3.5 h-3.5"/>Buka Rute</a>
                <a href={`https://www.google.com/maps?q=${mapPhoto.exif.gps.lat},${mapPhoto.exif.gps.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"><ExternalLink className="w-3.5 h-3.5"/>Buka Maps</a>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Modal open={draftOpen} onClose={() => setDraftOpen(false)} title="Draft Tersimpan" size="lg">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2"><p className="text-sm text-slate-500">Draft server (scope sadewa). Memuat draft akan menghapusnya dari server.</p><button type="button" onClick={refreshDrafts} disabled={draftBusy} className="text-xs font-semibold text-blue-500">Muat ulang</button></div>
          {draftBusy && !drafts.length ? <div className="py-8 text-center text-sm text-slate-500"><Loader2 className="w-5 h-5 animate-spin inline mr-2"/>Memuat...</div> : null}
          {!draftBusy && !drafts.length ? <div className="py-8 text-center text-sm text-slate-500">Belum ada draft.</div> : null}
          {drafts.map((d: any) => (
            <div key={d.draftId} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-medium truncate">{d.draftId}</div><div className="text-xs text-slate-500 truncate">{d.jumlahFoto ?? 0} foto · {d.timestamp ? new Date(d.timestamp).toLocaleString('id-ID') : ''} · {String(d.teksPreview || '').slice(0, 80)}</div></div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => void loadDraft(d.draftId)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold">Muat</button>
                <button type="button" onClick={() => void removeDraft(d.draftId)} className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-600 text-xs font-semibold">Hapus</button>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
