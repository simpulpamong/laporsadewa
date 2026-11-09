/**
 * Geometri lembar cetak — semua dimensi dalam milimeter sehingga layout yang
 * sama menggerakkan pratinjau, PDF client (raster HD), dan PDF vektor server.
 */

import type { Orientation, PaperId } from './types';

/** CSS pixel per milimeter pada acuan 96 DPI. */
export const PX_PER_MM = 96 / 25.4;
export const mmToPx = (mm: number): number => mm * PX_PER_MM;
export const mmToPt = (mm: number): number => Math.round(((mm * 72) / 25.4) * 100) / 100;

export interface PaperOption {
  id: PaperId;
  label: string;
  /** Dimensi portrait (lebar × tinggi) dalam mm. */
  width: number;
  height: number;
}

export const PAPERS: PaperOption[] = [
  { id: 'A4', label: 'A4', width: 210, height: 297 },
  { id: 'F4', label: 'F4 / Folio', width: 215, height: 330 },
  { id: 'A3', label: 'A3', width: 297, height: 420 },
  { id: 'A2', label: 'A2', width: 420, height: 594 },
  { id: 'A1', label: 'A1', width: 594, height: 841 },
  { id: 'A0', label: 'A0', width: 841, height: 1189 },
];

export const DPI_OPTIONS = [150, 200, 300, 450, 600];

/** Batas aman browser untuk ukuran canvas (klamp DPI agar tidak crash). */
export const CANVAS_LIMITS = {
  maxDimension: 14000,
  maxArea: 260_000_000,
};

/** Resolves: {width,height} mm mengikuti orientasi (custom pakai input user). */
export function resolvePaper(
  paperId: PaperId,
  orientation: Orientation,
  customWidthMm: number,
  customHeightMm: number,
): { label: string; width: number; height: number } {
  let base: PaperOption | undefined;
  let width: number;
  let height: number;

  if (paperId === 'custom') {
    width = Math.max(50, Math.min(3000, Math.round(customWidthMm) || 600));
    height = Math.max(50, Math.min(3000, Math.round(customHeightMm) || 400));
    base = { id: 'custom', label: `Kustom ${width}×${height} mm`, width, height };
  } else {
    base = PAPERS.find((p) => p.id === paperId) ?? PAPERS[0];
    width = base.width;
    height = base.height;
  }

  const landscape = orientation === 'landscape';
  return {
    label: landscape && !base.label.includes('mm') ? `${base.label} Lanskap` : base.label,
    width: landscape ? Math.max(width, height) : Math.min(width, height),
    height: landscape ? Math.min(width, height) : Math.max(width, height),
  };
}

export interface PrintLayout {
  paperWidth: number;
  paperHeight: number;
  margin: number;
  headerHeight: number;
  footerHeight: number;
  /** Seluruh strip bawah (catatan kaki + blok tanda tangan). */
  bottomHeight: number;
  legendWidth: number;
  legendHeight: number;
  gap: number;
  mapX: number;
  mapY: number;
  mapWidth: number;
  mapHeight: number;
  legendX: number;
  legendY: number;
  legendW: number;
  legendH: number;
}

export interface LayoutOptions {
  showLegend: boolean;
  showSignature: boolean;
}

/**
 * Menghitung layout lembar.
 * - Landscape: legenda di kanan peta, tanda tangan di strip bawah.
 * - Portrait : legenda pita di bawah peta, tanda tangan mengambil sisi kiri strip.
 */
export function computeLayout(
  paperWidth: number,
  paperHeight: number,
  opts: LayoutOptions,
): PrintLayout {
  const margin = 10;
  const headerHeight = 30;
  const gap = 5;
  const legendWidth = 62;
  const legendStripHeight = 50;
  const sigHeight = opts.showSignature ? 30 : 0;
  const footerHeight = 9;

  const bottomHeight = sigHeight + footerHeight;
  const isLandscape = paperWidth > paperHeight;

  const mapX = margin;
  const mapY = margin + headerHeight;
  const contentWidth = paperWidth - margin * 2;
  const contentHeight = paperHeight - margin * 2 - headerHeight - bottomHeight;

  let mapWidth: number;
  let mapHeight: number;
  let legendX: number;
  let legendY: number;
  let legendW: number;
  let legendH: number;

  if (opts.showLegend && isLandscape) {
    mapWidth = contentWidth - legendWidth - gap;
    mapHeight = contentHeight;
    legendX = mapX + mapWidth + gap;
    legendY = mapY;
    legendW = legendWidth;
    legendH = contentHeight;
  } else if (opts.showLegend) {
    mapWidth = contentWidth;
    mapHeight = contentHeight - legendStripHeight - gap;
    legendX = margin;
    legendY = mapY + mapHeight + gap;
    legendW = contentWidth;
    legendH = legendStripHeight;
  } else {
    mapWidth = contentWidth;
    mapHeight = contentHeight;
    legendX = margin;
    legendY = mapY;
    legendW = 0;
    legendH = 0;
  }

  return {
    paperWidth,
    paperHeight,
    margin,
    headerHeight,
    footerHeight,
    bottomHeight,
    legendWidth,
    legendHeight: legendStripHeight,
    gap,
    mapX,
    mapY,
    mapWidth,
    mapHeight,
    legendX,
    legendY,
    legendW,
    legendH,
  };
}

/* -------------------------------------------------------------------------- */
/* Batang skala kartografis                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Memilih angka "bulat" yang enak untuk panjang batang skala.
 */
export function computeScaleBar(groundMetersPerPx: number, targetPx = 130): {
  distance: number;
  pixels: number;
  label: string;
} {
  if (!Number.isFinite(groundMetersPerPx) || groundMetersPerPx <= 0) {
    return { distance: 1000, pixels: 100, label: '1 km' };
  }

  const rawMeters = groundMetersPerPx * targetPx;
  const magnitude = 10 ** Math.floor(Math.log10(rawMeters));
  const normalized = rawMeters / magnitude;
  const niceFactor = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  const distance = niceFactor * magnitude;

  const label =
    distance >= 1000
      ? `${(distance / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} km`
      : `${Math.round(distance).toLocaleString('id-ID')} m`;

  return { distance, pixels: distance / groundMetersPerPx, label };
}

/** Skala 1 : X dari meter-per-mm pada lembar. */
export function scaleDenominator(metersPerLayoutMm: number): number {
  return Math.round(metersPerLayoutMm * 1000);
}

/** DPI efektif setelah diklamp ke batas canvas browser. */
export function effectiveDpiFor(
  layout: { paperWidth: number; paperHeight: number },
  wanted: number,
): number {
  let scale = Math.max(96, Math.min(600, Math.round(wanted) || 300)) / 96;
  const pxW = layout.paperWidth * PX_PER_MM;
  const pxH = layout.paperHeight * PX_PER_MM;
  const fits = (factor: number) =>
    pxW * factor <= CANVAS_LIMITS.maxDimension &&
    pxH * factor <= CANVAS_LIMITS.maxDimension &&
    pxW * pxH * factor * factor <= CANVAS_LIMITS.maxArea;

  while (scale > 1 && !fits(scale)) scale -= 0.25;
  return Math.round(96 * scale);
}
