export type DynamicCategory = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  order?: number;
  active?: boolean;
};

export type DynamicSubcategory = DynamicCategory & {
  categoryId: string;
  format?: DynamicFormat;
};

export interface DynamicFormat {
  template?: string;
  fields?: Array<{
    key: string;
    label: string;
    aliases?: string[];
    required?: boolean;
    type?: string;
  }>;
  version?: number;
}

export type DynamicConfig = {
  success: boolean;
  fallback: boolean;
  categories: DynamicCategory[];
  subcategories: DynamicSubcategory[];
  message?: string;
};

const MEM: { data: DynamicConfig | null; at: number; inflight: Promise<DynamicConfig> | null } = { data: null, at: 0, inflight: null };
const KEY = 'sadewa:cfg:v1';
const TTL = 4_000; // cepat berefek setelah admin simpan (ikon/kategori/sub/format)

function readSession(): { data: DynamicConfig; at: number } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (
      value?.data?.success === true &&
      Array.isArray(value.data.categories) &&
      Array.isArray(value.data.subcategories) &&
      typeof value.at === 'number'
    ) return value;
  } catch {}
  return null;
}
function writeSession(data: DynamicConfig) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ data, at: Date.now() })); } catch {}
}

async function fetchFresh(force = false): Promise<DynamicConfig> {
  const url = force ? '/api/config?force=1' : '/api/config';
  const r = await fetch(url, { cache: 'no-store' });
  const data = await r.json().catch(() => null) as DynamicConfig | null;
  if (!r.ok || !data?.success || !Array.isArray(data.categories) || !Array.isArray(data.subcategories)) {
    throw new Error(data?.message || `Gagal memuat kategori laporan (HTTP ${r.status}).`);
  }
  MEM.data = data;
  MEM.at = Date.now();
  writeSession(data);
  return data;
}

/** Stale-while-revalidate: kembalikan cache instan bila ada, revalidasi di latar. Gesit & tetap segar. */
export async function fetchConfigSWR(opts?: { force?: boolean }): Promise<DynamicConfig> {
  const now = Date.now();
  if (!opts?.force && MEM.data?.categories.length && now - MEM.at < TTL) return MEM.data;
  if (!opts?.force && !MEM.data) {
    const s = readSession();
    if (s) {
      MEM.data = s.data;
      MEM.at = s.at;
      if (s.data.categories.length && now - s.at < TTL) return s.data;
    }
  }
  if (MEM.inflight) {
    return opts?.force || !MEM.data?.categories.length ? MEM.inflight : MEM.data;
  }
  MEM.inflight = fetchFresh(Boolean(opts?.force)).finally(() => { MEM.inflight = null; });
  if (opts?.force || !MEM.data?.categories.length) return MEM.inflight;
  MEM.inflight.catch(() => {});
  return MEM.data;
}
