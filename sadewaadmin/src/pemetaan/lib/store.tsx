'use client';

/**
 * AppProvider — sumber kebenaran state aplikasi di client.
 * Semua mutasi dipersist ke IndexedDB (store `documents`), geometri ke
 * `geo_cache`. Aplikasi 100% dapat berjalan offline setelah data ter-cache.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { defaultCategories, defaultPrintConfig, DEFAULT_VIEW, normalizeBaseLayer, normalizePrintExtentMode } from './defaults';
import {
  createDemoRecord,
  loadRegionJson,
  REGION_JSON,
  statsFor,
} from './geo';
import { idbDel, idbGet, idbSet, STORE } from './idb';
import type {
  Bounds,
  BackupFile,
  PrintConfig,
  RegionCollection,
  RegionFeature,
  RiskCategory,
  Score,
  ScoreMap,
  ScoreRecord,
  StatsResult,
  ToastMessage,
  ViewState,
} from './types';
import { BACKUP_FORMAT_VERSION } from './types';

const APP_VERSION = '1.2.0';
export const HEADER_TITLE = 'PETA KERAWANAN WILAYAH KABUPATEN PONOROGO'; // kop default SADEWA Satpol PP (lihat defaultPrintConfig)

function normalizeLegacyAgencyText(value: unknown, fallback: string, role = false): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  if (/BPBD|BADAN PENANGGULANGAN BENCANA DAERAH/i.test(value)) {
    return role ? 'Kepala Satuan Polisi Pamong Praja' : 'SATUAN POLISI PAMONG PRAJA';
  }
  return value;
}

export interface MapInfoSnap {
  bounds: Bounds | null;
  zoom: number;
  center: [number, number];
}

interface GeoState {
  kabupaten: RegionCollection | null;
  kecamatan: RegionCollection | null;
  kelurahan: RegionCollection | null;
  usingFull: boolean;
  loading: boolean;
  error: string | null;
}

export type ToastFn = (msg: Omit<ToastMessage, 'id'>) => void;

export interface AppState {
  ready: boolean;
  toasts: ToastMessage[];
  toast: ToastFn;
  dismissToast: (id: string) => void;

  geo: GeoState;
  reloadGeo: (preferFull?: boolean) => Promise<void>;
  clearGeoCache: () => Promise<void>;

  activeCategory: RiskCategory | null;
  categories: RiskCategory[];
  activeCategoryId: string | null;
  setActiveCategory: (id: string) => void;
  upsertCategory: (category: RiskCategory) => void;
  deleteCategory: (id: string) => void;
  scores: ScoreMap;
  setScore: (categoryId: string, regionId: string, score: Score | null, note?: string) => void;
  clearScoresForCategory: (categoryId: string) => void;
  seedDemoScores: (categoryId: string) => void;


  print: PrintConfig;
  updatePrint: (patch: Partial<PrintConfig>) => void;
  updateHeader: (patch: Partial<PrintConfig['header']>) => void;
  updateSigner: (patch: Partial<PrintConfig['signer']>) => void;

  view: ViewState;
  updateView: (patch: Partial<ViewState>) => void;
  mapInfo: MapInfoSnap;
  setMapInfo: (snap: { bounds: Bounds | null; zoom: number; center: [number, number] }) => void;

  selectedRegionId: string | null;
  selectRegion: (id: string | null) => void;


  stats: StatsResult;
  villagesOfSelected: RegionFeature[];
  kecamatanList: RegionFeature[];

  buildBackup: (includeGeo: boolean) => BackupFile;
  importBackup: (raw: string) => Promise<{ ok: boolean; message: string }>;
  resetAll: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp harus dipakai di dalam <AppProvider>.');
  return ctx;
}

function debouncePersist(fn: (value: never) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (value: unknown) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(value as never), ms);
  };
}

async function apiFetch(path: string, token: string | null | undefined, init?: RequestInit) {
  if (!token) throw new Error('Sesi tidak tersedia.');
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data as any)?.success === false) throw new Error((data as any)?.message || `Request gagal (${res.status})`);
  return data as any;
}

export function AppProvider({ children, token }: { children: ReactNode; token?: string | null }) {
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [geo, setGeo] = useState<GeoState>({
    kabupaten: null,
    kecamatan: null,
    kelurahan: null,
    usingFull: false,
    loading: true,
    error: null,
  });
  const [categories, setCategories] = useState<RiskCategory[]>([]);
  const [activeCategoryId, setActiveCategoryIdState] = useState<string | null>(null);
  const [scores, setScores] = useState<ScoreMap>({});
  const [print, setPrint] = useState<PrintConfig>(() => defaultPrintConfig(HEADER_TITLE));
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const mapInfoRef = useRef<MapInfoSnap>({
    bounds: null,
    zoom: 10,
    center: [-7.87, 111.47],
  });
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  const geoRef = useRef<GeoState>(geo);
  geoRef.current = geo;
  const viewRef = useRef(view);
  viewRef.current = view;

  const toast = useCallback<ToastFn>((msg) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { ...msg, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4600);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /* --------------------------- Persist helpers ---------------------------- */
  // Kategori & skor: sumber kebenaran = Firestore (via API). IDB = cache lokal (gesit/offline-read).
  // Print & view & geo: lokal (IDB) untuk performa.

  const cacheCategories = useRef(debouncePersist(
    (value: RiskCategory[]) => void idbSet(STORE.documents, 'categories', value), 240,
  ) as (v: unknown) => void).current;
  const cacheScores = useRef(debouncePersist(
    (value: ScoreMap) => void idbSet(STORE.documents, 'scores', value), 160,
  ) as (v: unknown) => void).current;
  const saveCategories = cacheCategories; // kompatibilitas pemakaian lokal
  const saveScores = cacheScores;
  const savePrint = useRef(debouncePersist(
    (value: PrintConfig) => void idbSet(STORE.documents, 'print', value), 240,
  ) as (v: unknown) => void).current;
  const saveView = useRef(debouncePersist(
    (value: ViewState) => void idbSet(STORE.documents, 'view', value), 240,
  ) as (v: unknown) => void).current;
  const fullGeometryWarmupStarted = useRef(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const seedAttemptedRef = useRef(false);

  const syncFromServer = useCallback(async (silent = true) => {
    if (!tokenRef.current) return;
    try {
      const [catRes, scoreRes] = await Promise.all([
        apiFetch('/api/admin/pemetaan/categories', tokenRef.current),
        apiFetch('/api/admin/pemetaan/scores', tokenRef.current),
      ]);
      let serverCats = Array.isArray(catRes?.categories) ? (catRes.categories as RiskCategory[]) : null;
      const serverScores = scoreRes?.scores && typeof scoreRes.scores === 'object' ? (scoreRes.scores as ScoreMap) : null;
      // Auto-seed preset (termasuk "Kerawanan Kebakaran") ke Firestore bila koleksi kosong — sekali, idempotent.
      if (serverCats && serverCats.length === 0 && !seedAttemptedRef.current) {
        seedAttemptedRef.current = true;
        const defaults = defaultCategories();
        for (const c of defaults) {
          try { await apiFetch('/api/admin/pemetaan/categories', tokenRef.current, { method: 'POST', body: JSON.stringify(c) }); } catch {}
        }
        serverCats = defaults;
      }
      if (serverCats) {
        const nextCats = serverCats.length ? serverCats : defaultCategories();
        setCategories(nextCats);
        cacheCategories(nextCats);
        setActiveCategoryIdState((prev) => (prev && nextCats.some(c => c.id === prev) ? prev : (nextCats[0]?.id ?? null)));
      }
      if (serverScores) { setScores(serverScores); cacheScores(serverScores); }
    } catch (e) {
      if (!silent) toast({ type: 'warning', title: 'Gagal memuat data pemetaan', description: e instanceof Error ? e.message : 'Periksa koneksi.' });
    }
  }, [cacheCategories, cacheScores, toast]);

  /* ------------------------------- Ringkasan Geo --------------------------- */

  const reloadGeo = useCallback(
    async (preferFull = false) => {
      setGeo((g) => ({ ...g, loading: true, error: null }));
      try {
        const cachedKabupaten = await idbGet<RegionCollection>(STORE.geoCache, 'kabupaten');
        const cachedKec = await idbGet<RegionCollection>(STORE.geoCache, 'kecamatan');
        const cachedKel = await idbGet<RegionCollection>(STORE.geoCache, 'kelurahan');

        const kabupaten = cachedKabupaten ?? (await loadRegionJson(REGION_JSON.kabupaten));
        let kecamatan = cachedKec ?? (await loadRegionJson(REGION_JSON.kecamatan));
        let kelurahan = cachedKel ?? (await loadRegionJson(REGION_JSON.kelurahan));
        let usingFull = false;

        if (preferFull) {
          try {
            const cachedKecFull = await idbGet<RegionCollection>(STORE.geoCache, 'kecamatan-full');
            const cachedKelFull = await idbGet<RegionCollection>(STORE.geoCache, 'kelurahan-full');
            kecamatan = cachedKecFull ?? (await loadRegionJson(REGION_JSON.kecamatanFull));
            kelurahan = cachedKelFull ?? (await loadRegionJson(REGION_JSON.kelurahanFull));
            usingFull = true;
            if (!cachedKecFull) await idbSet(STORE.geoCache, 'kecamatan-full', kecamatan);
            if (!cachedKelFull) await idbSet(STORE.geoCache, 'kelurahan-full', kelurahan);
          } catch {
            toast({
              type: 'warning',
              title: 'Geometri resolusi penuh tidak tersedia',
              description: 'Memakai geometri standar (tersederhanakan).',
            });
          }
        }

        if (!cachedKabupaten) await idbSet(STORE.geoCache, 'kabupaten', kabupaten);
        if (!cachedKec) await idbSet(STORE.geoCache, 'kecamatan', kecamatan);
        if (!cachedKel) await idbSet(STORE.geoCache, 'kelurahan', kelurahan);

        setGeo({
          kabupaten,
          kecamatan,
          kelurahan,
          usingFull,
          loading: false,
          error: null,
        });
      } catch (err) {
        // Offline: siasati via cache lokal
        try {
          const [cachedKabupaten, cachedKec, cachedKel] = await Promise.all([
            idbGet<RegionCollection>(STORE.geoCache, 'kabupaten'),
            idbGet<RegionCollection>(STORE.geoCache, 'kecamatan'),
            idbGet<RegionCollection>(STORE.geoCache, 'kelurahan'),
          ]);
          if (cachedKabupaten && cachedKec && cachedKel) {
            setGeo({
              kabupaten: cachedKabupaten,
              kecamatan: cachedKec,
              kelurahan: cachedKel,
              usingFull: false,
              loading: false,
              error: null,
            });
            toast({
              type: 'warning',
              title: 'Menggunakan data luring',
              description: 'Data wilayah dimuat dari cache perangkat.',
            });
            return;
          }
        } catch {
          /* no-op */
        }
        setGeo((g) => ({
          ...g,
          loading: false,
          error: err instanceof Error ? err.message : 'Gagal memuat data wilayah.',
        }));
        toast({
          type: 'error',
          title: 'Data wilayah gagal dimuat',
          description: 'Buka sekali secara daring agar GeoJSON ikut tersimpan luring.',
        });
      }
    },
    [toast],
  );

  /* ------------------------------ Hydration ------------------------------- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Muat cache lokal dulu → gesit, lalu sinkron Firestore (sumber kebenaran).
      const [storedCategories, storedScores, storedPrint, storedView, storedActive] =
        await Promise.all([
          idbGet<RiskCategory[]>(STORE.documents, 'categories'),
          idbGet<ScoreMap>(STORE.documents, 'scores'),
          idbGet<PrintConfig>(STORE.documents, 'print'),
          idbGet<ViewState>(STORE.documents, 'view'),
          idbGet<string>(STORE.documents, 'activeCategoryId'),
        ]);
      if (cancelled) return;

      const cats = storedCategories && storedCategories.length ? storedCategories : defaultCategories();
      setCategories(cats);
      setActiveCategoryIdState(
        storedActive && cats.some((c) => c.id === storedActive) ? storedActive : cats[0]?.id ?? null,
      );
      if (storedScores) setScores(storedScores);
      void idbDel(STORE.documents, 'points');
      if (storedPrint) {
        setPrint((prev) => ({
          ...prev,
          ...storedPrint,
          mapMode: storedPrint.mapMode === 'desa' ? 'desa' : 'kecamatan',
          extentMode: normalizePrintExtentMode(storedPrint.extentMode),
          selectedKecamatanCode: typeof storedPrint.selectedKecamatanCode === 'string'
            ? storedPrint.selectedKecamatanCode
            : null,
          header: {
            ...prev.header,
            ...storedPrint.header,
            agencyLine2: normalizeLegacyAgencyText(
              storedPrint.header?.agencyLine2,
              prev.header.agencyLine2,
            ),
            yearLabel: '',
          },
          signer: {
            ...prev.signer,
            ...storedPrint.signer,
            jabatan: normalizeLegacyAgencyText(
              storedPrint.signer?.jabatan,
              prev.signer.jabatan,
              true,
            ),
          },
        }));
      }
      if (storedView) {
        setView({ ...DEFAULT_VIEW, ...storedView, baseLayer: normalizeBaseLayer(storedView.baseLayer) });
      }
      setReady(true);
      // Sinkron Firestore di latar (kategori & skor) — tetap segar / "realtime-ish"
      void syncFromServer(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [syncFromServer]);

  // Revalidasi saat tab aktif/fokus + interval ringan → menyesuaikan perubahan (realtime-ish)
  useEffect(() => {
    if (!token) return;
    const onVis = () => { if (document.visibilityState === 'visible') void syncFromServer(true); };
    const t = setInterval(() => { if (document.visibilityState === 'visible') void syncFromServer(true); }, 45000);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); };
  }, [token, syncFromServer]);

  useEffect(() => {
    if (ready) void reloadGeo(false);
  }, [ready, reloadGeo]);

  // Simpan geometri detail sedikit setelah peta awal tampil. Skor dan peta
  // tetap langsung bisa dipakai dari geometri ringan; detail ini melengkapi
  // cetak beresolusi tinggi saat perangkat nanti sedang luring.
  useEffect(() => {
    if (!ready || geo.loading || !geo.kecamatan || !geo.kelurahan || fullGeometryWarmupStarted.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    fullGeometryWarmupStarted.current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          if (!(await idbGet<RegionCollection>(STORE.geoCache, 'kecamatan-full'))) {
            const full = await loadRegionJson(REGION_JSON.kecamatanFull);
            await idbSet(STORE.geoCache, 'kecamatan-full', full);
          }
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          if (!(await idbGet<RegionCollection>(STORE.geoCache, 'kelurahan-full'))) {
            const full = await loadRegionJson(REGION_JSON.kelurahanFull);
            await idbSet(STORE.geoCache, 'kelurahan-full', full);
          }
        } catch {
          // Pemuatan latar bersifat tambahan; data peta utama sudah tersimpan.
        }
      })();
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [geo.kecamatan, geo.kelurahan, geo.loading, ready]);

  /* ------------------------------ Mutasi data ----------------------------- */

  const setActiveCategory = useCallback((id: string) => {
    setActiveCategoryIdState(id);
    void idbSet(STORE.documents, 'activeCategoryId', id);
  }, []);

  const upsertCategory = useCallback(
    (category: RiskCategory) => {
      const now = new Date().toISOString();
      let saved: RiskCategory = category;
      setCategories((prev) => {
        const exists = prev.some((c) => c.id === category.id);
        saved = exists ? { ...category, updatedAt: now } : { ...category, createdAt: category.createdAt || now, updatedAt: now };
        const next = exists ? prev.map((c) => (c.id === category.id ? saved : c)) : [...prev, saved];
        saveCategories(next);
        return next;
      });
      setActiveCategoryIdState((active) => active ?? saved.id);
      if (tokenRef.current) {
        void apiFetch('/api/admin/pemetaan/categories', tokenRef.current, { method: 'POST', body: JSON.stringify(saved) })
          .catch((e) => toast({ type: 'warning', title: 'Gagal menyimpan kategori ke server', description: e.message }));
      }
    },
    [saveCategories, toast],
  );

  const deleteCategory = useCallback(
    (id: string) => {
      setCategories((prev) => { const next = prev.filter((c) => c.id !== id); saveCategories(next); return next; });
      setScores((prev) => {
        const next: ScoreMap = {};
        for (const [key, value] of Object.entries(prev)) if (value.categoryId !== id) next[key] = value;
        saveScores(next); return next;
      });
      setActiveCategoryIdState((prevActive) => (prevActive === id ? null : prevActive));
      if (tokenRef.current) {
        void apiFetch(`/api/admin/pemetaan/categories/${encodeURIComponent(id)}`, tokenRef.current, { method: 'DELETE' })
          .catch((e) => toast({ type: 'warning', title: 'Gagal menghapus kategori di server', description: e.message }));
      }
    },
    [saveCategories, saveScores, toast],
  );

  const setScore = useCallback(
    (categoryId: string, regionId: string, score: Score | null, note?: string) => {
      let syncedNote = note ?? '';
      setScores((prev) => {
        const key = `${categoryId}::${regionId}`;
        const existing = prev[key];
        syncedNote = note ?? existing?.note ?? '';
        const next: ScoreMap = { ...prev };
        if (score === null) { delete next[key]; }
        else {
          next[key] = { regionId, categoryId, score, note: syncedNote, updatedAt: new Date().toISOString() };
        }
        saveScores(next);
        return next;
      });
      if (tokenRef.current) {
        const body = score === null
          ? { deletes: [{ categoryId, regionId }] }
          : { upserts: [{ categoryId, regionId, score, note: syncedNote }] };
        void apiFetch('/api/admin/pemetaan/scores', tokenRef.current, { method: 'PUT', body: JSON.stringify(body) })
          .catch(() => {}); // skor sering berubah; gagal sync ditangani revalidasi berikutnya
      }
    },
    [saveScores],
  );

  const clearScoresForCategory = useCallback(
    (categoryId: string) => {
      setScores((prev) => {
        const next: ScoreMap = {};
        for (const [key, value] of Object.entries(prev)) if (value.categoryId !== categoryId) next[key] = value;
        saveScores(next); return next;
      });
      toast({ type: 'info', title: 'Skor kategori dibersihkan.' });
      if (tokenRef.current) {
        void apiFetch(`/api/admin/pemetaan/scores?categoryId=${encodeURIComponent(categoryId)}`, tokenRef.current, { method: 'DELETE' })
          .catch((e) => toast({ type: 'warning', title: 'Gagal membersihkan skor di server', description: e.message }));
      }
    },
    [saveScores, toast],
  );

  const seedDemoScores = useCallback(
    (categoryId: string) => {
      const category = categories.find((c) => c.id === categoryId);
      if (!category) return;
      const v = viewRef.current;
      let features: RegionFeature[] = [];
      let label = 'wilayah';
      if (v.mode === 'desa') {
        const kel = geoRef.current.kelurahan;
        if (!kel) { toast({ type: 'warning', title: 'Data desa belum dimuat' }); return; }
        features = (kel.features as RegionFeature[]).filter(f => !v.selectedKecamatanCode || f.properties.districtCode === v.selectedKecamatanCode);
        label = v.selectedKecamatanCode ? 'desa (kecamatan terpilih)' : 'desa';
      } else {
        const kec = geoRef.current.kecamatan;
        if (!kec) { toast({ type: 'warning', title: 'Data kecamatan belum dimuat' }); return; }
        features = kec.features as RegionFeature[];
        label = 'kecamatan';
      }
      if (!features.length) { toast({ type: 'warning', title: 'Tidak ada wilayah untuk diisi' }); return; }
      const next: ScoreMap = { ...scores };
      const upserts: any[] = [];
      for (const f of features) {
        const rec = createDemoRecord(category, f);
        next[`${categoryId}::${f.properties.id}`] = rec;
        upserts.push({ categoryId, regionId: f.properties.id, score: rec.score, note: rec.note || '' });
      }
      saveScores(next);
      setScores(next);
      toast({ type: 'success', title: 'Contoh skor dimuat', description: `${features.length} ${label} dinilai (tersimpan ke server).` });
      if (tokenRef.current && upserts.length) {
        void apiFetch('/api/admin/pemetaan/scores', tokenRef.current, { method: 'PUT', body: JSON.stringify({ upserts }) })
          .catch((e) => toast({ type: 'warning', title: 'Sebagian skor gagal disinkronkan', description: e.message }));
      }
    },
    [categories, scores, saveScores, toast],
  );

  /* ------------------------------- Settings ------------------------------- */

  const updatePrint = useCallback(
    (patch: Partial<PrintConfig>) => {
      setPrint((prev) => {
        const next = { ...prev, ...patch };
        savePrint(next);
        return next;
      });
    },
    [savePrint],
  );

  const updateHeader = useCallback(
    (patch: Partial<PrintConfig['header']>) => {
      setPrint((prev) => {
        const next = { ...prev, header: { ...prev.header, ...patch } };
        savePrint(next);
        return next;
      });
    },
    [savePrint],
  );

  const updateSigner = useCallback(
    (patch: Partial<PrintConfig['signer']>) => {
      setPrint((prev) => {
        const next = { ...prev, signer: { ...prev.signer, ...patch } };
        savePrint(next);
        return next;
      });
    },
    [savePrint],
  );

  const updateView = useCallback(
    (patch: Partial<ViewState>) => {
      setView((prev) => {
        const next = { ...prev, ...patch };
        saveView(next);
        return next;
      });
    },
    [saveView],
  );

  const setMapInfo = useCallback(
    (snap: { bounds: Bounds | null; zoom: number; center: [number, number] }) => {
      mapInfoRef.current = { bounds: snap.bounds, zoom: snap.zoom, center: snap.center };
    },
    [],
  );

  const selectRegion = useCallback((id: string | null) => {
    setSelectedRegionId(id);
  }, []);

  /* ------------------------------ Derived --------------------------------- */

  const activeCategory = useMemo(
    () => categories.find((c) => c.id === activeCategoryId) ?? null,
    [categories, activeCategoryId],
  );

  const kecamatanList = useMemo(
    () =>
      geo.kecamatan
        ? (geo.kecamatan.features as RegionFeature[])
            .slice()
            .sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'id'))
        : [],
    [geo.kecamatan],
  );

  const villagesOfSelected = useMemo(() => {
    if (!geo.kelurahan || !view.selectedKecamatanCode) return [];
    return (geo.kelurahan.features as RegionFeature[])
      .filter((f) => f.properties.districtCode === view.selectedKecamatanCode)
      .sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'id'));
  }, [geo.kelurahan, view.selectedKecamatanCode]);

  const stats = useMemo<StatsResult>(() => {
    const features =
      view.mode === 'desa'
        ? geo.kelurahan
          ? (geo.kelurahan.features as RegionFeature[])
          : []
        : geo.kecamatan
          ? (geo.kecamatan.features as RegionFeature[])
          : [];
    if (!activeCategory || !features.length) {
      return {
        total: 0,
        scored: 0,
        noData: 0,
        counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        average: null,
      };
    }
    return statsFor(activeCategory, scores, features);
  }, [activeCategory, geo.kelurahan, geo.kecamatan, scores, view.mode]);

  /* ------------------------------- Backup --------------------------------- */

  const buildBackup = useCallback(
    (includeGeo: boolean): BackupFile => ({
      format: 'sig-peta-hd',
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      categories,
      scores,
      settings: { print, view, activeCategoryId },
      ...(includeGeo
        ? { geoCache: { kabupaten: geo.kabupaten, kecamatan: geo.kecamatan, kelurahan: geo.kelurahan } }
        : {}),
    }),
    [categories, scores, print, view, activeCategoryId, geo],
  );

  const importBackup = useCallback(
    async (raw: string): Promise<{ ok: boolean; message: string }> => {
      try {
        const parsed = JSON.parse(raw) as BackupFile;
        if (parsed?.format !== 'sig-peta-hd') return { ok: false, message: 'Format file tidak dikenali.' };
        const geoCache = (
          parsed as unknown as { geoCache?: { kabupaten?: RegionCollection; kecamatan?: RegionCollection; kelurahan?: RegionCollection } }
        ).geoCache;
        if (Array.isArray(parsed.categories) && parsed.categories.length) {
          setCategories(parsed.categories);
          cacheCategories(parsed.categories);
          if (!parsed.categories.some((c) => c.id === activeCategoryId)) {
            setActiveCategoryIdState(parsed.categories[0].id);
            await idbSet(STORE.documents, 'activeCategoryId', parsed.categories[0].id);
          }
          // sinkron kategori ke Firestore
          if (tokenRef.current) {
            for (const c of parsed.categories) {
              try { await apiFetch('/api/admin/pemetaan/categories', tokenRef.current, { method: 'POST', body: JSON.stringify(c) }); } catch {}
            }
          }
        }
        const restoredScores = parsed.scores ?? {};
        setScores(restoredScores);
        cacheScores(restoredScores);
        void idbDel(STORE.documents, 'points');
        if (tokenRef.current && Object.keys(restoredScores).length) {
          const upserts = Object.values(restoredScores).map((r: any) => ({ categoryId: r.categoryId, regionId: r.regionId, score: r.score, note: r.note || '' }));
          try { await apiFetch('/api/admin/pemetaan/scores', tokenRef.current, { method: 'PUT', body: JSON.stringify({ upserts }) }); } catch {}
        }
        if (parsed.settings?.print) {
          const safePrint = {
            ...parsed.settings.print,
            mapMode: parsed.settings.print.mapMode === 'desa' ? 'desa' as const : 'kecamatan' as const,
            extentMode: normalizePrintExtentMode(parsed.settings.print.extentMode),
            selectedKecamatanCode: typeof parsed.settings.print.selectedKecamatanCode === 'string' ? parsed.settings.print.selectedKecamatanCode : null,
            header: { ...defaultPrintConfig(HEADER_TITLE).header, ...parsed.settings.print.header, agencyLine2: normalizeLegacyAgencyText(parsed.settings.print.header?.agencyLine2, defaultPrintConfig(HEADER_TITLE).header.agencyLine2), yearLabel: '' },
            signer: { ...defaultPrintConfig(HEADER_TITLE).signer, ...parsed.settings.print.signer, jabatan: normalizeLegacyAgencyText(parsed.settings.print.signer?.jabatan, defaultPrintConfig(HEADER_TITLE).signer.jabatan, true) },
          };
          setPrint(safePrint); savePrint(safePrint);
        }
        if (parsed.settings?.view) {
          const safeView = { ...DEFAULT_VIEW, ...parsed.settings.view, baseLayer: normalizeBaseLayer(parsed.settings.view.baseLayer) };
          setView(safeView); saveView(safeView);
        }
        if (parsed.settings?.activeCategoryId) {
          setActiveCategoryIdState(parsed.settings.activeCategoryId);
          await idbSet(STORE.documents, 'activeCategoryId', parsed.settings.activeCategoryId);
        }
        if (geoCache?.kabupaten && geoCache?.kecamatan && geoCache?.kelurahan) {
          await Promise.all([
            idbSet(STORE.geoCache, 'kabupaten', geoCache.kabupaten),
            idbSet(STORE.geoCache, 'kecamatan', geoCache.kecamatan),
            idbSet(STORE.geoCache, 'kelurahan', geoCache.kelurahan),
          ]);
        }
        await reloadGeo(false);
        toast({ type: 'success', title: 'Backup berhasil dipulihkan & disinkronkan.' });
        return { ok: true, message: 'OK' };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'Gagal memproses file.' };
      }
    },
    [activeCategoryId, toast, reloadGeo, cacheCategories, cacheScores, savePrint, saveView],
  );

  const resetAll = useCallback(async () => {
    await Promise.all([
      idbDel(STORE.documents, 'categories'),
      idbDel(STORE.documents, 'scores'),
      idbDel(STORE.documents, 'print'),
      idbDel(STORE.documents, 'view'),
      idbDel(STORE.documents, 'activeCategoryId'),
    ]);
    const defaults = defaultCategories();
    setCategories(defaults);
    setScores({});
    setPrint(defaultPrintConfig(HEADER_TITLE));
    setView(DEFAULT_VIEW);
    setActiveCategoryIdState(defaults[0]?.id ?? null);
    cacheCategories(defaults); cacheScores({});
    // sinkron reset ke server (best-effort)
    if (tokenRef.current) {
      try {
        const res = await apiFetch('/api/admin/pemetaan/categories', tokenRef.current);
        for (const c of (res?.categories || [])) {
          try { await apiFetch(`/api/admin/pemetaan/categories/${encodeURIComponent(c.id)}`, tokenRef.current, { method: 'DELETE' }); } catch {}
        }
        for (const c of defaults) {
          try { await apiFetch('/api/admin/pemetaan/categories', tokenRef.current, { method: 'POST', body: JSON.stringify(c) }); } catch {}
        }
      } catch {}
    }
    toast({ type: 'info', title: 'Data pemetaan direset.' });
  }, [toast, cacheCategories, cacheScores]);

  const clearGeoCache = useCallback(async () => {
    await Promise.all([
      idbDel(STORE.geoCache, 'kabupaten'),
      idbDel(STORE.geoCache, 'kecamatan'),
      idbDel(STORE.geoCache, 'kelurahan'),
      idbDel(STORE.geoCache, 'kelurahan-full'),
      idbDel(STORE.geoCache, 'kecamatan-full'),
    ]);
    await reloadGeo(false);
    toast({ type: 'info', title: 'Cache geometri dihapus & dimuat ulang.' });
  }, [reloadGeo, toast]);

  const value = useMemo<AppState>(
    () => ({
      ready,
      toasts,
      toast,
      dismissToast,
      geo,
      reloadGeo,
      clearGeoCache,
      activeCategory,
      categories,
      activeCategoryId,
      setActiveCategory,
      upsertCategory,
      deleteCategory,
      scores,
      setScore,
      clearScoresForCategory,
      seedDemoScores,
      print,
      updatePrint,
      updateHeader,
      updateSigner,
      view,
      updateView,
      get mapInfo() {
        return mapInfoRef.current;
      },
      setMapInfo,
      selectedRegionId,
      selectRegion,
      stats,
      villagesOfSelected,
      kecamatanList,
      buildBackup,
      importBackup,
      resetAll,
    }),
    [
      ready, toasts, toast, dismissToast,
      geo, reloadGeo, clearGeoCache,
      activeCategory, categories, activeCategoryId, setActiveCategory, upsertCategory, deleteCategory,
      scores, setScore, clearScoresForCategory, seedDemoScores,
      print, updatePrint, updateHeader, updateSigner,
      view, updateView, setMapInfo,
      selectedRegionId, selectRegion,
      stats, villagesOfSelected, kecamatanList,
      buildBackup, importBackup, resetAll,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
