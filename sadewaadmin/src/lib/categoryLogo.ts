/**
 * Logo kategori otomatis (bukan pilihan, tidak disimpan ke Firestore):
 * - Damkar/kebakaran/pemadam/karhutla => /assets/damkar.webp
 * - Selain itu => /assets/satpol.webp
 */
export function isDamkarCategory(cat?: { id?: string; slug?: string; name?: string; description?: string; tone?: string } | null): boolean {
  if (!cat) return false;
  const hay = `${cat.slug || ''} ${cat.name || ''} ${cat.id || ''} ${cat.description || ''}`.toLowerCase();
  return hay.includes('damkar') || hay.includes('kebakaran') || hay.includes('pemadam') || hay.includes('karhutla');
}

export function getCategoryLogoSrc(cat?: { id?: string; slug?: string; name?: string; description?: string; tone?: string } | null): string {
  return isDamkarCategory(cat) ? '/assets/damkar.webp' : '/assets/satpol.webp';
}
