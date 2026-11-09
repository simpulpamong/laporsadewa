/**
 * Pembungkus IndexedDB minimal berbasis promise.
 * Data disimpan dalam dua object store:
 *  - `documents`  : KV nilai-nilai kecil (kategori, skor, pengaturan)
 *  - `geo_cache`  : blob geometri (kabupaten / kecamatan / kelurahan, penuh & ringan)
 *
 * Fallback aman: jika IndexedDB tidak tersedia (private mode iOS dsb.), wrapper
 * jatuh ke objek memori dalam sesi sehingga aplikasi tetap berfungsi.
 */

const DB_NAME = 'sig_peta_hd';
const DB_VERSION = 1;

export const STORE = {
  documents: 'documents',
  geoCache: 'geo_cache',
} as const;

export type StoreName = (typeof STORE)[keyof typeof STORE];

let dbPromise: Promise<IDBDatabase> | null = null;

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/** Fallback in-memory bila IDB tidak dapat dipakai. */
const memory = new Map<string, unknown>();
let memoryMode = false;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      const err = new Error('IndexedDB tidak tersedia.');
      reject(err);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE.documents)) db.createObjectStore(STORE.documents);
      if (!db.objectStoreNames.contains(STORE.geoCache)) db.createObjectStore(STORE.geoCache);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Gagal membuka IndexedDB.'));
  });

  dbPromise.catch(() => {
    memoryMode = true;
    dbPromise = null;
  });

  return dbPromise;
}

export async function idbGet<T>(storeName: StoreName, key: string): Promise<T | undefined> {
  try {
    const db = await openDatabase();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    memoryMode = true;
    return memory.get(`${storeName}:${key}`) as T | undefined;
  }
}

export async function idbSet<T>(storeName: StoreName, key: string, value: T): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memoryMode = true;
    memory.set(`${storeName}:${key}`, value);
  }
}

export async function idbDel(storeName: StoreName, key: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memoryMode = true;
    memory.delete(`${storeName}:${key}`);
  }
}

/** Estimasi ringkas kuota tersedia (untuk UI status). */
export async function idbQuota(): Promise<{ usage: number; quota: number } | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est) return null;
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return null;
  }
}
