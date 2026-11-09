/** Resolve foto kategori/sub: "1"-"10" → /assets/kategori/{n}.webp, path → as-is, else fallback. */
export function resolveKategoriImage(image?: string | number | null, fallback = '/assets/sadewa.svg'): string {
  if (image === null || image === undefined || image === '') return fallback;
  const s = String(image).trim();
  if (!s) return fallback;
  if (/^\d{1,2}$/.test(s)) {
    const n = Number(s);
    if (n >= 1 && n <= 10) return `/assets/kategori/${n}.webp`;
  }
  if (s.startsWith('/') || s.startsWith('http://') || s.startsWith('https://')) return s;
  return `/assets/kategori/${s}`;
}

export function resolveKategoriImageOrNull(image?: string | number | null): string | null {
  if (image === null || image === undefined || image === '') return null;
  const s = String(image).trim();
  if (!s) return null;
  if (/^\d{1,2}$/.test(s)) {
    const n = Number(s);
    if (n >= 1 && n <= 10) return `/assets/kategori/${n}.webp`;
  }
  if (s.startsWith('/') || s.startsWith('http://') || s.startsWith('https://')) return s;
  return `/assets/kategori/${s}`;
}
