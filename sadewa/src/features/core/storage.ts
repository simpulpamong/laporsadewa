/**
 * Penyimpanan lokal (IndexedDB) — dipakai untuk:
//  - cache foto agar tidak hilang saat aplikasi ditutup,
 *  - cache teks laporan (draft dysing) dan preferensi.
 *
 * Semua data dipisahkan per `scope` (slug kategori) supaya foto dari satu
 * kategori tidak pernah bocor ke kategori lain.
 */

import type { PhotoData } from './types';

const DB_NAME = 'sadewa';
const DB_VERSION = 3;
const STORE_PHOTOS = 'photos';
const STORE_META = 'meta';
const LEGACY_DB = 'sadewa_cam_v1';

export type Scope = string;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function isBrowser() {
  return typeof indexedDB !== 'undefined';
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function openStorage(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (!isBrowser()) {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
          const store = db.createObjectStore(STORE_PHOTOS, { keyPath: 'id' });
          store.createIndex('scope', 'scope', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        void dropLegacyDatabase();
        void pruneAllScopes();
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Database lama (v1 aplikasi sebelum refactor) menyimpan foto semua kategori
 * dalam satu namespace sehingga tidak bisa dipetakan dengan aman. Buang agar
 * kuota storage perangkat tidak terus terkuras.
 */
function dropLegacyDatabase(): Promise<void> {
  return new Promise((resolve) => {
    if (!isBrowser()) {
      resolve();
      return;
    }
    try {
      const req = indexedDB.deleteDatabase(LEGACY_DB);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/* ── Foto ────────────────────────────────────────────────────────── */

interface StoredPhoto extends PhotoData {
  scope: string;
}

export async function savePhoto(scope: Scope, photo: PhotoData): Promise<void> {
  const db = await openStorage();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_PHOTOS, 'readwrite');
    const record: StoredPhoto = {
      ...photo,
      scope,
      processing: false,
    };
    await request(tx.objectStore(STORE_PHOTOS).put(record));
    await transactionDone(tx);
  } catch {
    /* penyimpanan lokal bersifat best-effort */
  }
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await openStorage();
  if (!db || !id) return;
  try {
    const tx = db.transaction(STORE_PHOTOS, 'readwrite');
    await request(tx.objectStore(STORE_PHOTOS).delete(id));
    await transactionDone(tx);
  } catch {
    /* abaikan */
  }
}

export async function deletePhotos(ids: string[]): Promise<void> {
  const db = await openStorage();
  if (!db || !ids.length) return;
  try {
    const tx = db.transaction(STORE_PHOTOS, 'readwrite');
    const store = tx.objectStore(STORE_PHOTOS);
    for (const id of ids) await request(store.delete(id));
    await transactionDone(tx);
  } catch {
    /* abaikan */
  }
}

export async function loadPhotos(scope: Scope, limit = 20): Promise<PhotoData[]> {
  const db = await openStorage();
  if (!db) return [];
  try {
    const tx = db.transaction(STORE_PHOTOS, 'readonly');
    const rows = await request<StoredPhoto[]>(tx.objectStore(STORE_PHOTOS).index('scope').getAll(scope));
    return rows
      .filter(row => typeof row?.data === 'string' && row.data.startsWith('data:image/'))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .slice(0, limit)
      .map(({ scope: _scope, ...photo }) => ({ ...photo, processing: false }));
  } catch {
    return [];
  }
}

export async function clearScope(scope: Scope): Promise<void> {
  const db = await openStorage();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_PHOTOS, 'readwrite');
    const store = tx.objectStore(STORE_PHOTOS);
    const keys = await request<IDBValidKey[]>(store.index('scope').getAllKeys(scope));
    for (const key of keys) await request(store.delete(key));
    await transactionDone(tx);
  } catch {
    /* abaikan */
  }
}

/** Buang foto terlama bila sebuah scope menumpuk terlalu banyak. */
export async function pruneScope(scope: Scope, keep: number): Promise<void> {
  const db = await openStorage();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_PHOTOS, 'readwrite');
    const store = tx.objectStore(STORE_PHOTOS);
    const rows = await request<StoredPhoto[]>(store.index('scope').getAll(scope));
    if (rows.length <= keep) return;
    const surplus = rows
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .slice(0, rows.length - keep);
    for (const row of surplus) await request(store.delete(row.id));
    await transactionDone(tx);
  } catch {
    /* abaikan */
  }
}

async function pruneAllScopes(): Promise<void> {
  const db = await openStorage();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_PHOTOS, 'readonly');
    const rows = await request<StoredPhoto[]>(tx.objectStore(STORE_PHOTOS).getAll());
    const byScope = new Map<string, number>();
    for (const row of rows) {
      const key = row.scope || 'umum';
      byScope.set(key, (byScope.get(key) || 0) + 1);
    }
    for (const scope of byScope.keys()) await pruneScope(scope, 12);
  } catch {
    /* abaikan */
  }
}

/* ── Meta (teks laporan, preferensi) ─────────────────────────────── */

export async function metaGet<T>(key: string): Promise<T | null> {
  const db = await openStorage();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE_META, 'readonly');
    const value = await request<T | undefined>(tx.objectStore(STORE_META).get(key));
    await transactionDone(tx);
    return value ?? null;
  } catch {
    return null;
  }
}

export async function metaSet(key: string, value: unknown): Promise<void> {
  const db = await openStorage();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_META, 'readwrite');
    await request(tx.objectStore(STORE_META).put(value, key));
    await transactionDone(tx);
  } catch {
    /* abaikan */
  }
}

export async function metaDel(key: string): Promise<void> {
  const db = await openStorage();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_META, 'readwrite');
    await request(tx.objectStore(STORE_META).delete(key));
    await transactionDone(tx);
  } catch {
    /* abaikan */
  }
}
