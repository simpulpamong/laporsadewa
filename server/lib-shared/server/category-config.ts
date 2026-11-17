/**
 * FALLBACK DARURAT saja — sumber kebenaran config sheet/drive/subkategori = Firestore
 * (report_subcategories.config), diisi via `sadewa/scripts/seed-categories.mts` atau bootstrap admin.
 * Dipakai hanya bila Firestore belum punya data untuk slug kebakaran/odnk.
 */
export type ReportCategory = 'kebakaran' | 'odnk';

export interface CategoryConfig {
  key: ReportCategory;
  displayName: string;
  reportSheet: string;
  photoSheet: string;
  narrativeSheet: string;
  driveFolder: string;
}

export const CATEGORY_CONFIG: Record<ReportCategory, CategoryConfig> = {
  kebakaran: { key: 'kebakaran', displayName: 'Kebakaran', reportSheet: 'KEBAKARAN', photoSheet: 'DOKUMENTASI KEBAKARAN', narrativeSheet: 'NARASI KEBAKARAN', driveFolder: 'KEBAKARAN' },
  odnk: { key: 'odnk', displayName: 'ODNK', reportSheet: 'ODNK', photoSheet: 'DOKUMENTASI ODNK', narrativeSheet: 'NARASI ODNK', driveFolder: 'ODNK' },
};

export function resolveCategory(value?: string): ReportCategory {
  return String(value || '').toLowerCase() === 'odnk' ? 'odnk' : 'kebakaran';
}
