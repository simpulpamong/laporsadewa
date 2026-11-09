import { getFirestore } from './firebase';
import { CATEGORY_CONFIG as STATIC_SUBCONFIG, resolveCategory as resolveStatic } from './category-config';

export interface DynamicSubcategory {
  id: string; categoryId: string; name: string; slug: string; description: string;
  image?: string; // "1"-"10" → /assets/kategori/{n}.webp, atau path
  order: number; active: boolean;
  format?: { template?: string; fields?: Array<{ key:string; label:string; aliases?:string[]; required?:boolean; type?:string }>; version?: number };
  config?: { driveFolder?: string; reportSheet?: string; photoSheet?: string; narrativeSheet?: string; spreadsheetId?: string; driveRootFolderId?: string };
}
export interface DynamicCategory {
  id: string; name: string; slug: string; description: string; image?: string; order: number; active: boolean;
  config?: { driveFolder?: string; spreadsheetId?: string; driveRootFolderId?: string };
}

let cache: { at: number; categories: DynamicCategory[]; subcategories: DynamicSubcategory[] } | null = null;
const TTL = 2_000; // near-realtime: perubahan foto/format dari admin cepat tercermin di sadewa

function adminReady() { return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT); }

export async function loadDynamicConfig(opts?: { force?: boolean }) {
  if (!opts?.force && cache && Date.now() - cache.at < TTL) return cache;
  if (!adminReady()) { cache = { at: Date.now(), categories: [], subcategories: [] }; return cache; }
  try {
    const db = getFirestore();
    const [c, s] = await Promise.all([
      db.collection('report_categories').orderBy('order').get(),
      db.collection('report_subcategories').orderBy('order').get(),
    ]);
    cache = {
      at: Date.now(),
      categories: c.docs.map(d => ({ id: d.id, ...(d.data() as any) })).filter((x: any) => x.active !== false),
      subcategories: s.docs.map(d => ({ id: d.id, ...(d.data() as any) })).filter((x: any) => x.active !== false),
    };
  } catch (e) {
    console.warn('[dynamicConfig] fallback static:', (e as Error).message);
    cache = { at: Date.now(), categories: [], subcategories: [] };
  }
  return cache;
}

export async function resolveSubcategory(slugOrId?: string) {
  const key = String(slugOrId || '').toLowerCase().trim();
  const dyn = await loadDynamicConfig();
  const found = dyn.subcategories.find(s => s.slug === key || s.id === key || s.name.toLowerCase() === key);
  if (found) {
    const cat = dyn.categories.find(c => c.id === found.categoryId);
    return { source: 'dynamic' as const, category: cat, subcategory: found, staticKey: (found.slug === 'odnk' ? 'odnk' : found.slug === 'kebakaran' ? 'kebakaran' : null) };
  }
  // static fallback (hanya bila Firestore belum terkonfigurasi/kosong). Jangan paksa default kebakaran untuk slug tak dikenal.
  if (key === 'odnk' || key === 'non-kebakaran' || key === 'kebakaran') {
    const sk = resolveStatic(key === 'odnk' || key === 'non-kebakaran' ? 'odnk' : 'kebakaran');
    return { source: 'static' as const, category: undefined, subcategory: undefined, staticKey: sk };
  }
  return { source: 'static' as const, category: undefined, subcategory: undefined, staticKey: null as any };
}

export function resolvedStorageConfig(resolved: Awaited<ReturnType<typeof resolveSubcategory>>) {
  if (resolved.source === 'dynamic' && resolved.subcategory) {
    const sc = resolved.subcategory.config || {};
    const cc = resolved.category?.config || {};
    return {
      displayName: resolved.subcategory.name,
      driveFolder: sc.driveFolder || resolved.subcategory.name.toUpperCase(),
      reportSheet: sc.reportSheet || resolved.subcategory.name.toUpperCase(),
      photoSheet: sc.photoSheet || `DOKUMENTASI ${resolved.subcategory.name.toUpperCase()}`,
      narrativeSheet: sc.narrativeSheet || `NARASI ${resolved.subcategory.name.toUpperCase()}`,
      spreadsheetId: sc.spreadsheetId || cc.spreadsheetId,
      driveRootFolderId: sc.driveRootFolderId || cc.driveRootFolderId,
      categoryId: resolved.category?.id,
      subcategoryId: resolved.subcategory.id,
      subcategorySlug: resolved.subcategory.slug,
    };
  }
  const sk = resolved.staticKey || 'kebakaran';
  const st = STATIC_SUBCONFIG[sk];
  return { displayName: st.displayName, driveFolder: st.driveFolder, reportSheet: st.reportSheet, photoSheet: st.photoSheet, narrativeSheet: st.narrativeSheet, spreadsheetId: undefined, driveRootFolderId: undefined, categoryId: sk, subcategoryId: sk, subcategorySlug: sk };
}

function stripUndefined(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) { if (v !== undefined) out[k] = stripUndefined(v); }
    return out;
  }
  return obj;
}

export async function writeRekap(entry: Record<string, any>) {
  if (!adminReady()) return;
  try {
    const db = getFirestore();
    const rid = String(entry?.reportId || '').trim();
    const data = stripUndefined({ ...entry, updatedAt: Date.now() });
    if (rid) {
      // id deterministik agar retry submitLaporan tidak membuat duplikat
      const docId = rid.replace(/[\/#?%\s]+/g, '_').slice(0, 180);
      const ref = db.collection('sadewa_reports').doc(docId);
      const existing = await ref.get();
      if (!existing.exists) data.createdAt = Date.now();
      await ref.set(data, { merge: true });
    } else {
      await db.collection('sadewa_reports').add({ ...data, createdAt: Date.now() });
    }
  }
  catch (e) { console.warn('[rekap] gagal simpan:', (e as Error).message); }
}
