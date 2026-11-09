/**
 * Utilitas domain GeoJSON: pemuatan koleksi wilayah, pemfiteran, warna skor,
 * statistik, centroid, dan seeder data demo deterministik.
 */

import type {
  Bounds,
  RegionCollection,
  RegionFeature,
  RiskCategory,
  Score,
  ScoreMap,
  ScoreRecord,
  StatsResult,
} from './types';
import { NO_DATA_COLOR } from './defaults';
import { RISK_SCORES, scoreKey } from './types';
import { accRing, accToBBox, newAcc, type BBox, bboxToLeafletBounds, visualCentroid } from './projection';

/* -------------------------------------------------------------------------- */
/* Pemuatan data                                                               */
/* -------------------------------------------------------------------------- */

export const REGION_JSON = {
  kabupaten: '/data/regions-kabupaten.geojson',
  kecamatan: '/data/regions-kecamatan.geojson',
  kelurahan: '/data/regions-kelurahan.geojson',
  kecamatanFull: '/data/regions-kecamatan-full.geojson',
  kelurahanFull: '/data/regions-kelurahan-full.geojson',
} as const;

export async function loadRegionJson(name: string): Promise<RegionCollection> {
  const res = await fetch(name, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Gagal memuat ${name} (${res.status})`);
  const json = await res.json();
  return json as RegionCollection;
}

/* -------------------------------------------------------------------------- */
/* Ring / geometry helpers                                                     */
/* -------------------------------------------------------------------------- */

export function ringsOf(feature: RegionFeature): number[][][] {
  const g = feature.geometry;
  if (g.type === 'Polygon') return g.coordinates;
  return g.coordinates.flat();
}

/** Iterasi seluruh ring dengan semantics polygon betul-betul terjaga. */
export function forEachRing(feature: RegionFeature, cb: (ring: number[][]) => void): void {
  const g = feature.geometry;
  if (g.type === 'Polygon') g.coordinates.forEach(cb);
  else g.coordinates.forEach((poly) => poly.forEach(cb));
}

export function bboxOfFeatures(features: RegionFeature[]): BBox | null {
  const acc = newAcc();
  for (const f of features) forEachRing(f, (ring) => accRing(acc, ring));
  return accToBBox(acc);
}

export function leafletBoundsOf(features: RegionFeature[]): Bounds | null {
  const bbox = bboxOfFeatures(features);
  return bbox ? bboxToLeafletBounds(bbox) : null;
}

export function centroidOfFeature(feature: RegionFeature): [number, number] {
  return visualCentroid(ringsOf(feature));
}

export interface LabelAnchor {
  coordinate: [number, number];
  /** Jarak aman dari titik label ke batas terdekat, dalam meter. */
  clearanceMeters: number;
}

type PlanarPoint = [number, number];
type LabelCell = { x: number; y: number; h: number; distance: number; max: number };

const labelAnchorCache = new WeakMap<RegionFeature, LabelAnchor>();

/** Cari titik terdalam di dalam polygon (pole of inaccessibility), termasuk lubang. */
export function labelAnchorOfFeature(feature: RegionFeature): LabelAnchor {
  const cached = labelAnchorCache.get(feature);
  if (cached) return cached;

  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const coordinate of ring) {
        minLat = Math.min(minLat, coordinate[1]);
        maxLat = Math.max(maxLat, coordinate[1]);
      }
    }
  }
  const cosine = Math.max(0.01, Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
  let best: LabelAnchor = { coordinate: centroidOfFeature(feature), clearanceMeters: 0 };

  for (const polygon of polygons) {
    const rings: PlanarPoint[][] = polygon.map((ring) =>
      ring.map(([lon, lat]) => [lon * cosine, lat]),
    );
    const outer = rings[0];
    if (!outer || outer.length < 4) continue;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let cx = 0;
    let cy = 0;
    for (const [x, y] of outer) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      cx += x;
      cy += y;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const size = Math.min(width, height);
    if (!(size > 0)) continue;

    const signedDistance = (x: number, y: number): number => {
      let inside = false;
      let minDistanceSq = Infinity;
      for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
        const ring = rings[ringIndex];
        let ringInside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i];
          const [xj, yj] = ring[j];
          const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-20) + xi;
          if (intersects) ringInside = !ringInside;

          const dx = xj - xi;
          const dy = yj - yi;
          const lengthSq = dx * dx + dy * dy;
          const t = lengthSq ? Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / lengthSq)) : 0;
          const ex = x - (xi + t * dx);
          const ey = y - (yi + t * dy);
          minDistanceSq = Math.min(minDistanceSq, ex * ex + ey * ey);
        }
        if (ringIndex === 0) inside = ringInside;
        else if (ringInside) inside = false;
      }
      const distance = Math.sqrt(minDistanceSq);
      return inside ? distance : -distance;
    };

    const makeCell = (x: number, y: number, h: number): LabelCell => {
      const distance = signedDistance(x, y);
      return { x, y, h, distance, max: distance + h * Math.SQRT2 };
    };

    const heap: LabelCell[] = [];
    const push = (cell: LabelCell) => {
      let index = heap.push(cell) - 1;
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (heap[parent].max >= cell.max) break;
        heap[index] = heap[parent];
        index = parent;
      }
      heap[index] = cell;
    };
    const pop = (): LabelCell | undefined => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length && last) {
        let index = 0;
        while (true) {
          const left = index * 2 + 1;
          const right = left + 1;
          if (left >= heap.length) break;
          const child = right < heap.length && heap[right].max > heap[left].max ? right : left;
          if (heap[child].max <= last.max) break;
          heap[index] = heap[child];
          index = child;
        }
        heap[index] = last;
      }
      return top;
    };

    let polygonBest = makeCell(cx / outer.length, cy / outer.length, 0);
    const boxCenter = makeCell((minX + maxX) / 2, (minY + maxY) / 2, 0);
    if (boxCenter.distance > polygonBest.distance) polygonBest = boxCenter;

    for (let x = minX; x < maxX; x += size) {
      for (let y = minY; y < maxY; y += size) push(makeCell(x + size / 2, y + size / 2, size / 2));
    }

    const precision = Math.max(size / 1000, 1e-7);
    let iterations = 0;
    while (heap.length && iterations++ < 12000) {
      const cell = pop()!;
      if (cell.distance > polygonBest.distance) polygonBest = cell;
      if (cell.max - polygonBest.distance <= precision) continue;
      const half = cell.h / 2;
      if (half <= precision / 2) continue;
      push(makeCell(cell.x - half, cell.y - half, half));
      push(makeCell(cell.x + half, cell.y - half, half));
      push(makeCell(cell.x - half, cell.y + half, half));
      push(makeCell(cell.x + half, cell.y + half, half));
    }

    if (polygonBest.distance > best.clearanceMeters / 111_320) {
      best = {
        coordinate: [polygonBest.x / cosine, polygonBest.y],
        clearanceMeters: polygonBest.distance * 111_320,
      };
    }
  }

  labelAnchorCache.set(feature, best);
  return best;
}

export function regionIndex(features: RegionFeature[]): Map<string, RegionFeature> {
  return new Map(features.map((f) => [f.properties.id, f]));
}

/* -------------------------------------------------------------------------- */
/* Warna & skor                                                                */
/* -------------------------------------------------------------------------- */

export function colorForScore(category: RiskCategory | null, score: Score | null): string {
  if (!category) return NO_DATA_COLOR;
  if (!score) return category.noDataColor;
  return category.palette[score - 1] ?? NO_DATA_COLOR;
}

/* -------------------------------------------------------------------------- */
/* Statistik                                                                   */
/* -------------------------------------------------------------------------- */

export function statsFor(
  category: RiskCategory,
  scores: ScoreMap,
  features: RegionFeature[],
): StatsResult {
  const counts: Record<Score, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let scored = 0;
  let sum = 0;

  for (const f of features) {
    const rec = scores[scoreKey(category.id, f.properties.id)];
    if (rec) {
      counts[rec.score] += 1;
      scored += 1;
      sum += rec.score;
    }
  }


  return {
    total: features.length,
    scored,
    noData: features.length - scored,
    counts,
    average: scored > 0 ? Number((sum / scored).toFixed(2)) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Data demo deterministik (panggilan "Isi Contoh")                            */
/* -------------------------------------------------------------------------- */

export function hashInt(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Skor demo berpola spasial: wilayah kecamatan diberi dasar 1–5, desa di dalam
 * kecamatan berosilasi ±1 sehingga peta menunjukkan klaster warna alami.
 */
export function createDemoRecord(
  category: RiskCategory,
  feature: RegionFeature,
  baseBase?: number,
): ScoreRecord {
  const p = feature.properties;
  const base = baseBase ?? ((hashInt(`${p.type}:${p.code}`) % 5) + 1);
  const jitter = (hashInt(p.id) % 3) - 1; // -1..1
  const score = Math.max(1, Math.min(5, base + jitter)) as Score;
  return {
    regionId: p.id,
    categoryId: category.id,
    score,
    note: 'Nilai contoh (demo) — harap diperbarui dengan data resmi.',
    updatedAt: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Format                                                                      */
/* -------------------------------------------------------------------------- */

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function formatDateId(date: Date, withDay = false, withTime = false): string {
  const base = `${date.getDate()} ${BULAN[date.getMonth()]} ${date.getFullYear()}`;
  const day = withDay ? `${HARI[date.getDay()]}, ` : '';
  const time = withTime
    ? ` pukul ${date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`
    : '';
  return day + base + time;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
