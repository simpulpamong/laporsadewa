/**
 * Proyeksi Web Mercator (EPSG:3857) & utilitas tile Slippy — dipakai bersama
 * oleh peta interaktif, renderer lembar cetak HD (canvas), dan pembangun
 * payload vektor ("d" SVG) untuk route API.
 */

import type { Bounds } from './types';

export const EARTH_CIRCUMFERENCE = 40075016.686;

export const lonToFrac = (lon: number): number => (lon + 180) / 360;

export const latToFrac = (lat: number): number => {
  const s = Math.sin((Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};

/* -------------------------------------------------------------------------- */
/* BBox utils                                                                  */
/* -------------------------------------------------------------------------- */

export type BBox = [number, number, number, number];

export interface RingAcc {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  has: boolean;
}

export function newAcc(): RingAcc {
  return { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity, has: false };
}

export function accRing(acc: RingAcc, ring: number[][]): void {
  for (const [lon, lat] of ring) {
    if (lon < acc.minLon) acc.minLon = lon;
    if (lon > acc.maxLon) acc.maxLon = lon;
    if (lat < acc.minLat) acc.minLat = lat;
    if (lat > acc.maxLat) acc.maxLat = lat;
    acc.has = true;
  }
}

export const accToBBox = (acc: RingAcc): BBox | null =>
  acc.has ? [acc.minLon, acc.minLat, acc.maxLon, acc.maxLat] : null;

export function bboxToLeafletBounds(bbox: BBox): Bounds {
  return [
    [bbox[1], bbox[0]],
    [bbox[3], bbox[2]],
  ];
}

/* -------------------------------------------------------------------------- */
/* Proyektor "fit to box" — mengembalikan fungsi (lon,lat) → [x, y] dalam unit  */
/* kanvas/lembar, dipakai untuk menggambar polygon begitu pula SVG "d".         */
/* -------------------------------------------------------------------------- */

export interface Projector {
  /** Mengubah lon/lat menjadi koordinat lokal dalam box target [0..w × 0..h]. */
  (lon: number, lat: number): [number, number];
  boxWidth: number;
  boxHeight: number;
  bbox: BBox;
  /** Meter bumi per satu satuan lokal. */
  metersPerUnit: number;
}

export function makeProjector(
  bbox: BBox,
  boxWidth: number,
  boxHeight: number,
  padRatio = 0.0,
): Projector {
  const fx0 = lonToFrac(bbox[0]);
  const fx1 = lonToFrac(bbox[2]);
  const fy0 = latToFrac(bbox[3]); // frac turun ke bawah → minLat punya frac lebih besar
  const fy1 = latToFrac(bbox[1]);

  const spanFx = Math.max(fx1 - fx0, 1e-9);
  const spanFy = Math.max(fy1 - fy0, 1e-9);

  const padX = spanFx * padRatio;
  const padY = spanFy * padRatio;
  const sFx = spanFx + padX * 2;
  const sFy = spanFy + padY * 2;

  const scale = Math.min(boxWidth / sFx, boxHeight / sFy);
  const cx = (fx0 + fx1) / 2;
  const cy = (fy0 + fy1) / 2;

  const midLat = (bbox[1] + bbox[3]) / 2;
  const metersPerUnit = (EARTH_CIRCUMFERENCE * Math.cos((midLat * Math.PI) / 180)) / scale;

  const project = (lon: number, lat: number): [number, number] => [
    boxWidth / 2 + (lonToFrac(lon) - cx) * scale,
    boxHeight / 2 + (latToFrac(lat) - cy) * scale,
  ];

  return Object.assign(project, { boxWidth, boxHeight, bbox, metersPerUnit });
}

/** Bounds geografis yang benar-benar terlihat setelah proyektor letterbox/padding. */
export function projectorViewportBBox(
  bbox: BBox,
  boxWidth: number,
  boxHeight: number,
  padRatio = 0,
): BBox {
  const fx0 = lonToFrac(bbox[0]);
  const fx1 = lonToFrac(bbox[2]);
  const fy0 = latToFrac(bbox[3]);
  const fy1 = latToFrac(bbox[1]);
  const spanFx = Math.max(fx1 - fx0, 1e-9);
  const spanFy = Math.max(fy1 - fy0, 1e-9);
  const scale = Math.min(
    boxWidth / (spanFx * (1 + 2 * padRatio)),
    boxHeight / (spanFy * (1 + 2 * padRatio)),
  );
  const centerX = (fx0 + fx1) / 2;
  const centerY = (fy0 + fy1) / 2;
  const halfFx = boxWidth / (2 * scale);
  const halfFy = boxHeight / (2 * scale);
  const lon = (fraction: number) => fraction * 360 - 180;
  const lat = (fraction: number) =>
    (Math.atan(Math.sinh(Math.PI * (1 - 2 * fraction))) * 180) / Math.PI;

  return [
    lon(centerX - halfFx),
    lat(centerY + halfFy),
    lon(centerX + halfFx),
    lat(centerY - halfFy),
  ];
}

/* -------------------------------------------------------------------------- */
/* Tile Slippy untuk renderer cetak HD                                         */
/* -------------------------------------------------------------------------- */

export interface TilePlan {
  zoom: number;
  /** Rentang tile (inclusive). */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Lebar tile dalam satuan lokal box (bisa >1 → tile di-upscale). */
  tileScale: number;
  count: number;
  /** Koordinat natural px (slippy) dari sudut kiri-atas bbox pada zoom tsb. */
  naturalX0: number;
  naturalY0: number;
}

/** Memilih zoom tile yang tajam untuk box cetak + klamp jumlah tile. */
export function planTilesForBox(
  bbox: BBox,
  boxWidth: number,
  boxHeight: number,
  quality = 1.3,
  maxTiles = 420,
): TilePlan {
  const fx0 = lonToFrac(bbox[0]);
  const fx1 = lonToFrac(bbox[2]);
  const fy0 = latToFrac(bbox[3]);
  const fy1 = latToFrac(bbox[1]);
  const spanFx = Math.max(fx1 - fx0, 1e-9);
  const spanFy = Math.max(fy1 - fy0, 1e-9);

  let zoom = 0;

  const needed = Math.max((boxWidth * quality) / spanFx / 256, (boxHeight * quality) / spanFy / 256);
  zoom = Math.max(0, Math.min(19, Math.ceil(Math.log2(needed))));

  const countOf = (z: number) =>
    Math.ceil(spanFx * 2 ** z + 1) * Math.ceil(spanFy * 2 ** z + 1);

  while (zoom > 0 && countOf(zoom) > maxTiles) zoom -= 1;

  const n = 2 ** zoom;
  const x0 = Math.floor(fx0 * n);
  const x1 = Math.floor(fx1 * n);
  const y0 = Math.floor(fy0 * n);
  const y1 = Math.floor(fy1 * n);

  return {
    zoom,
    x0,
    x1,
    y0,
    y1,
    tileScale: (spanFx * 256 * n) / boxWidth,
    count: Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1)),
    naturalX0: fx0 * n * 256,
    naturalY0: fy0 * n * 256,
  };
}

/* -------------------------------------------------------------------------- */
/* Titik tengah visual (label)                                                 */
/* -------------------------------------------------------------------------- */

/** Pusat visual ring terbesar (rata-rata vertex) — cukup untuk label kecamatan. */
export function visualCentroid(rings: number[][][]): [number, number] {
  let ring = rings[0];
  for (const r of rings) if (r.length > ring.length) ring = r;
  let sx = 0;
  let sy = 0;
  for (const [lon, lat] of ring) {
    sx += lon;
    sy += lat;
  }
  return [sx / ring.length, sy / ring.length];
}
