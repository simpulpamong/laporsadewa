export type DynamicConfig = { success?: boolean; fallback?: boolean; categories: any[]; subcategories: any[]; message?: string };

const MEM: { data: DynamicConfig | null; at: number; inflight: Promise<DynamicConfig> | null } = { data: null, at: 0, inflight: null };
const KEY = 'sadewa:cfg:v1';
const TTL = 4_000; // cepat berefek setelah admin simpan (ikon/kategori/sub/format)

function readSession(): { data: DynamicConfig; at: number } | null {
  try { const raw = sessionStorage.getItem(KEY); if (!raw) return null; const v = JSON.parse(raw); if (v?.data && v?.at) return v; } catch {}
  return null;
}
function writeSession(data: DynamicConfig) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ data, at: Date.now() })); } catch {}
}

async function fetchFresh(force = false): Promise<DynamicConfig> {
  const url = force ? '/api/config?force=1' : '/api/config';
  const r = await fetch(url, { cache: 'no-store' });
  const data = (await r.json()) as DynamicConfig;
  if (data && data.categories) { MEM.data = data; MEM.at = Date.now(); writeSession(data); }
  return data;
}

/** Stale-while-revalidate: kembalikan cache instan bila ada, revalidasi di latar. Gesit & tetap segar. */
export async function fetchConfigSWR(opts?: { force?: boolean }): Promise<DynamicConfig> {
  const now = Date.now();
  if (!opts?.force && MEM.data && now - MEM.at < TTL) return MEM.data;
  if (!opts?.force && !MEM.data) {
    const s = readSession();
    if (s) { MEM.data = s.data; MEM.at = s.at; if (now - s.at < TTL) return s.data; }
  }
  if (MEM.inflight) return opts?.force ? MEM.inflight : (MEM.data ?? MEM.inflight);
  MEM.inflight = fetchFresh(Boolean(opts?.force)).finally(() => { MEM.inflight = null; });
  if (opts?.force || !MEM.data) return MEM.inflight;
  MEM.inflight.catch(() => {});
  return MEM.data;
}

export function primeConfigCache(data: DynamicConfig) { MEM.data = data; MEM.at = Date.now(); writeSession(data); }
