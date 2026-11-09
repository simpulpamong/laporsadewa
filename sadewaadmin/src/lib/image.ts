/** Resolve pilihan foto kategori/sub (1-10 atau path, format webp) ke src yang bisa dipakai <img>. */
export function resolveKategoriImage(image?: string | number | null): string | null {
  if (image === null || image === undefined || image === '') return null;
  const s = String(image).trim();
  if (!s) return null;
  if (/^\d{1,2}$/.test(s)) {
    const n = Number(s);
    if (n >= 1 && n <= 10) return `/assets/kategori/${n}.webp`;
  }
  if (s.startsWith('/') || s.startsWith('http://') || s.startsWith('https://')) return s;
  // bare filename
  return `/assets/kategori/${s}`;
}

export const KATEGORI_IMAGE_OPTIONS = Array.from({ length: 10 }, (_, i) => String(i + 1));
