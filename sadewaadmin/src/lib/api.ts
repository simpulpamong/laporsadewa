type CacheEntry = { data: any; at: number; inflight?: Promise<any> | null };
const MEM = new Map<string, CacheEntry>();
const TTL = 30_000; // gesit + tetap segar

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

function cacheKey(path: string, init?: RequestInit) {
  const auth = (init?.headers as any)?.Authorization || (init?.headers as any)?.authorization || '';
  // key per path + auth identity (hindari bocor antar sesi)
  const who = auth ? String(auth).slice(-12) : 'anon';
  return `${who}|${path}`;
}

function invalidatePrefix(prefix: string) {
  for (const k of Array.from(MEM.keys())) if (k.includes(prefix)) MEM.delete(k);
}

export async function api<T>(path: string, init?: RequestInit & { swr?: boolean; fresh?: boolean }): Promise<T> {
  const method = String(init?.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  const useSWR = isGet && init?.swr !== false && init?.fresh !== true && (init as any)?.cache !== 'no-store';

  if (!isGet) {
    // mutasi → invalidasi cache terkait area
    const seg = path.split('?')[0].split('/').slice(0, 4).join('/');
    invalidatePrefix(seg);
  }

  const key = cacheKey(path, init);
  const now = Date.now();
  if (useSWR) {
    const hit = MEM.get(key);
    if (hit && now - hit.at < TTL) return hit.data as T;
    if (hit?.data) {
      // stale-while-revalidate: kembalikan stale, segarkan di latar
      if (!hit.inflight) {
        hit.inflight = doFetch<T>(path, init).then(d => { MEM.set(key, { data: d, at: Date.now(), inflight: null }); return d; }).catch(() => { if (MEM.get(key) === hit) hit.inflight = null; return hit.data; }) as any;
      }
      return hit.data as T;
    }
    if (hit?.inflight) return hit.inflight as Promise<T>;
  }

  const p = doFetch<T>(path, init);
  if (useSWR) MEM.set(key, { data: null as any, at: 0, inflight: p as any });
  const data = await p;
  if (useSWR) MEM.set(key, { data, at: Date.now(), inflight: null });
  return data;
}

async function doFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // headers HARUS digabung terakhir agar Content-Type tidak tertimpa oleh ...init spread.
  const { headers: extraHeaders, ...restInit } = init || {};
  const res = await fetch(path, {
    credentials: 'include',
    ...restInit,
    headers: {
      'Content-Type': 'application/json',
      ...(extraHeaders || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new ApiError((data as any)?.message || `Request gagal (${res.status})`, res.status);
  }
  return data as T;
}

/** Paksa muat ulang (lewati cache) — berguna setelah mutasi/realtime refresh. */
export async function apiFresh<T>(path: string, init?: RequestInit): Promise<T> {
  MEM.delete(cacheKey(path, init));
  return api<T>(path, { ...(init as any), fresh: true });
}

/** Revalidasi di latar (panggil saat tab fokus / interval) untuk kesegaran realtime. */
export function revalidatePath(path: string, init?: RequestInit) {
  const key = cacheKey(path, init);
  const hit = MEM.get(key);
  if (hit?.inflight) return;
  const p = doFetch(path, init).then(d => { MEM.set(key, { data: d, at: Date.now(), inflight: null }); }).catch(() => {});
  MEM.set(key, { ...(hit || { data: null, at: 0 }), inflight: p as any });
}

/** Tandai cache stale saat fokus agar akses berikutnya revalidasi (perubahan menyesuaikan). */
function markStale() { for (const v of MEM.values()) v.at = 0; }
if (typeof window !== 'undefined') {
  window.addEventListener('focus', markStale);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') markStale(); });
}
