export interface SignBlock { kiriJabatan: string; kiriNama: string; kananKota: string; kananJabatan: string; kananNama: string }
export interface PrintSettings {
  kop: { instansi1: string; instansi2: string; sub: string; alamat: string; telepon: string; email: string; website: string; showLogo: boolean; logoLeftUrl: string; logoRightUrl: string };
  tandaTangan: { beritaAcara: SignBlock; rekap: SignBlock };
  footer: string;
}

export const KOP_BUILTIN_LOGOS = [
  { key: 'logo1', label: 'Logo 1 (Satpol PP)', src: '/assets/satpol.webp' },
  { key: 'logo2', label: 'Logo 2 (Damkar)', src: '/assets/damkar.webp' },
  { key: 'logo3', label: 'Logo 3 (Ponorogo)', src: '/assets/ponorogo.webp' },
] as const;

export function normalizeKopLogoValue(v: any): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const low = s.toLowerCase();
  if (low === 'logo1' || low === 'logo2' || low === 'logo3') return low;
  // kompatibilitas lama: path bawaan -> key logo1/2/3
  if (s === '/assets/satpol.webp') return 'logo1';
  if (s === '/assets/damkar.webp') return 'logo2';
  if (s === '/assets/ponorogo.webp') return 'logo3';
  // izinkan URL http(s) atau path aset; selain itu kosongkan agar aman/bersih
  if (/^https?:\/\//i.test(s) || s.startsWith('/assets/')) return s;
  return '';
}

export function resolveKopLogoSrc(v: any): string {
  const n = normalizeKopLogoValue(v);
  if (!n) return '';
  const b = KOP_BUILTIN_LOGOS.find(x => x.key === n);
  return b ? b.src : n;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  kop: { instansi1: 'SATUAN POLISI PAMONG PRAJA', instansi2: 'KABUPATEN PONOROGO', sub: 'SADEWA — Sistem Aksi dan Evaluasi Praja Wibawa', alamat: '', telepon: '', email: '', website: '', showLogo: true, logoLeftUrl: '', logoRightUrl: '' },
  tandaTangan: {
    beritaAcara: { kiriJabatan: 'Pelapor / Petugas', kiriNama: '', kananKota: 'Ponorogo', kananJabatan: 'Mengetahui / Petugas Admin', kananNama: '' },
    rekap: { kiriJabatan: '', kiriNama: '', kananKota: 'Ponorogo', kananJabatan: 'Petugas Admin', kananNama: '' },
  },
  footer: 'Dicetak dari SADEWA Admin',
};

export function mergePrintSettings(raw: any): PrintSettings {
  const d = DEFAULT_PRINT_SETTINGS; const r = raw || {};
  const sb = (x:any, fb:SignBlock): SignBlock => ({ kiriJabatan: String(x?.kiriJabatan ?? fb.kiriJabatan), kiriNama: String(x?.kiriNama ?? fb.kiriNama), kananKota: String(x?.kananKota ?? fb.kananKota), kananJabatan: String(x?.kananJabatan ?? fb.kananJabatan), kananNama: String(x?.kananNama ?? fb.kananNama) });
  return {
    kop: { instansi1: String(r.kop?.instansi1 ?? d.kop.instansi1), instansi2: String(r.kop?.instansi2 ?? d.kop.instansi2), sub: String(r.kop?.sub ?? d.kop.sub), alamat: String(r.kop?.alamat ?? d.kop.alamat), telepon: String(r.kop?.telepon ?? d.kop.telepon), email: String(r.kop?.email ?? d.kop.email), website: String(r.kop?.website ?? d.kop.website), showLogo: r.kop?.showLogo !== false, logoLeftUrl: normalizeKopLogoValue(r.kop?.logoLeftUrl ?? d.kop.logoLeftUrl), logoRightUrl: normalizeKopLogoValue(r.kop?.logoRightUrl ?? d.kop.logoRightUrl) },
    tandaTangan: { beritaAcara: sb(r.tandaTangan?.beritaAcara, d.tandaTangan.beritaAcara), rekap: sb(r.tandaTangan?.rekap, d.tandaTangan.rekap) },
    footer: String(r.footer ?? d.footer),
  };
}
