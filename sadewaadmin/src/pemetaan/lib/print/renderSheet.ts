/**
 * Sheet renderer — kompositor lembar cetak.
 *
 * Seluruh lembar (kop, muka peta, legenda, panah utara, batang skala, blok
 * tanda tangan, catatan kaki) digambar SATU KALI secara vektor-akurat ke canvas
 * pada DPI target, lalu ditanam ke halaman PDF ukuran exact. Tidak ada
 * tangkapan layar DOM sehingga tidak ada blur html2canvas maupun tile kabur.
 *
 * Pada saat yang sama builder `buildVectorPayload` memproyeksikan geometry yang
 * sama menjadi path "d" SVG untuk route /api/export-pdf (@react-pdf/renderer)
 * sehingga tersedia jalur PDF vektor murni beresolusi tak-batas.
 */

import { jsPDF } from 'jspdf';

import {
  computeLayout,
  computeScaleBar,
  effectiveDpiFor,
  mmToPt,
  mmToPx,
  PX_PER_MM,
  resolvePaper,
  scaleDenominator,
  type PrintLayout,
} from '../paper';
import {
  bboxOfFeatures,
  colorForScore,
  forEachRing,
  formatDateId,
  labelAnchorOfFeature,
  slugify,
} from '../geo';
import { baseLayerOption } from '../defaults';
import {
  makeProjector,
  planTilesForBox,
  projectorViewportBBox,
  type BBox,
  type TilePlan,
} from '../projection';
import type {
  BaseLayerId,
  Bounds,
  PrintConfig,
  RegionFeature,
  RiskCategory,
  Score,
  ScoreMap,
  StatsResult,
} from '../types';

/* -------------------------------------------------------------------------- */
/* Tipe job                                                                    */
/* -------------------------------------------------------------------------- */

export interface SheetJob {
  config: PrintConfig;
  paper: { label: string; width: number; height: number };
  layout: PrintLayout;
  dpi: number;
  category: RiskCategory | null;
  features: RegionFeature[];
  districts: RegionFeature[];
  boundary: RegionFeature | null;
  scores: ScoreMap;
  stats: StatsResult;
  bounds: Bounds | null;
  basemap: BaseLayerId;
  basemapUrl?: string | null;
  basemapAttribution?: string;
  printedAt: Date;
}

export interface SheetRenderResult {
  canvas: HTMLCanvasElement;
  dpi: number;
  tileZoom: number | null;
  tileScale: number;
  tileCount: number;
  scaleLabel: string;
}

export interface JobInput {
  config: PrintConfig;
  category: RiskCategory | null;
  features: RegionFeature[];
  districts: RegionFeature[];
  boundary: RegionFeature | null;
  scores: ScoreMap;
  stats: StatsResult;
  bounds: Bounds | null;
  basemap: BaseLayerId;
  basemapUrl?: string | null;
  basemapAttribution?: string;
}

export function prepareJob(input: JobInput): SheetJob {
  const paper = resolvePaper(
    input.config.paperId,
    input.config.orientation,
    input.config.customWidthMm,
    input.config.customHeightMm,
  );
  const layout = computeLayout(paper.width, paper.height, {
    showLegend: input.config.showLegend,
    showSignature: input.config.showSignature,
  });
  return {
    ...input,
    paper,
    layout,
    dpi: input.config.dpi,
    printedAt: new Date(),
  };
}

/* -------------------------------------------------------------------------- */
/* Helper gambar                                                               */
/* -------------------------------------------------------------------------- */

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, weight: string, size: number, family = 'sans-serif'): number {
  let size_ = size;
  ctx.font = `${weight} ${size_}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && size_ > 6) {
    size_ -= 0.5;
    ctx.font = `${weight} ${size_}px ${family}`;
  }
  return size_;
}

function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'Inter, "Segoe UI", Roboto, Arial, sans-serif';

/* -------------------------------------------------------------------------- */
/* Tile cache & fetch                                                          */
/* -------------------------------------------------------------------------- */

const tileCache = new Map<string, HTMLImageElement | 'failed'>();

function tileUrl(layer: string, plan: TilePlan, x: number, y: number): string | null {
  if (!layer) return null;
  const url = layer
    .replace('{z}', String(plan.zoom))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    .replace('{s}', 'abcd'[Math.abs(hash(x * 31 + y * 7)) % 4])
    .replace('{r}', '@2x'); // retina untuk Carto — tajam saat dicetak HD
  return url;
}

function hash(n: number): number {
  return ((n >> 16) ^ n) * 0x45d9f3b;
}

async function fetchTile(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return null;
  const cached = tileCache.get(url);
  if (cached) return cached === 'failed' ? null : cached;
  const img = await loadImage(url);
  tileCache.set(url, img ?? 'failed');
  return img;
}

/* -------------------------------------------------------------------------- */
/* Renderer utama                                                              */
/* -------------------------------------------------------------------------- */

export async function renderSheetCanvas(
  job: SheetJob,
  onProgress?: (fraction: number, label: string) => void,
): Promise<SheetRenderResult> {
  const { layout, config } = job;

  /* 1 — proyeksi target ------------------------------------------------------ */
  let bbox: BBox | null = bboxOfFeatures([...job.features, ...job.districts]);
  if (!bbox) {
    bbox = [110.1, -8.2, 111.9, -7.4]; // fallback Ponorogo
  }

  /* 2 — DPI & canvas --------------------------------------------------------- */
  const dpi = effectiveDpiFor(layout, config.dpi);
  const scale = dpi / 96;
  const pxW = Math.round(mmToPx(layout.paperWidth) * scale);
  const pxH = Math.round(mmToPx(layout.paperHeight) * scale);

  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia.');
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';

  /* Latar kertas */
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, layout.paperWidth * PX_PER_MM, layout.paperHeight * PX_PER_MM);
  onProgress?.(0.08, 'Menyiapkan lembar…');

  /* 3 — Muka peta ------------------------------------------------------------- */
  const mapX = layout.mapX * PX_PER_MM;
  const mapY = layout.mapY * PX_PER_MM;
  const mapW = layout.mapWidth * PX_PER_MM;
  const mapH = layout.mapHeight * PX_PER_MM;
  const mapPadding = 0.04;
  const project = makeProjector(bbox, mapW, mapH, mapPadding);

  ctx.save();
  ctx.beginPath();
  ctx.rect(mapX, mapY, mapW, mapH);
  ctx.clip();
  ctx.fillStyle = '#eef2f6'; // laut/kosong
  ctx.fillRect(mapX, mapY, mapW, mapH);

  /* 3a — Basemap tiles */
  let plan: TilePlan | null = null;
  onProgress?.(0.15, 'Memuat basemap…');
  let drawnTiles = 0;
  const basemapUrl = job.basemapUrl ?? baseLayerOption(job.basemap).url;

  if (basemapUrl) {
    const tileBounds = projectorViewportBBox(bbox, mapW, mapH, mapPadding);
    plan = planTilesForBox(tileBounds, mapW, mapH, 1.3 * scale);
    const plan_ = plan;
    const tileW = 256 / plan_.tileScale;
    const tileH = 256 / plan_.tileScale;

    const tileJobs: { x: number; y: number; url: string | null }[] = [];
    for (let ty = plan_.y0; ty <= plan_.y1; ty++) {
      for (let tx = plan_.x0; tx <= plan_.x1; tx++) {
        const safeTx = ((tx % 2 ** plan_.zoom) + 2 ** plan_.zoom) % 2 ** plan_.zoom;
        const safeTy = Math.min(ty, 2 ** plan_.zoom - 1);
        tileJobs.push({ x: tx, y: ty, url: tileUrl(basemapUrl, plan_, safeTx, safeTy) });
      }
    }

    const CONCURRENCY = 12;
    let index = 0;
    const step = async () => {
      while (index < tileJobs.length) {
        const item = tileJobs[index++];
        const img = await fetchTile(item.url);
        if (!img) continue;
        const dx = mapX + (item.x * 256 - plan_.naturalX0) / plan_.tileScale;
        const dy = mapY + (item.y * 256 - plan_.naturalY0) / plan_.tileScale;
        try {
          ctx.drawImage(img, dx, dy, tileW + 0.4, tileH + 0.4);
          drawnTiles += 1;
        } catch {
          /* tile gagal (CORS/offline) — biarkan latar */
        }
        if (drawnTiles % 8 === 0) {
          onProgress?.(
            0.15 + 0.4 * (drawnTiles / Math.max(1, tileJobs.length)),
            `Menempel ${drawnTiles}/${tileJobs.length} tile basemap…`,
          );
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, () => step()));
  }

  /* 3b — Poligon choropleth */
  onProgress?.(0.62, 'Menggambar batas wilayah…');
  for (const feature of job.features) {
    const record = job.category ? job.scores[`${job.category.id}::${feature.properties.id}`] : undefined;
    const fill = colorForScore(job.category, record?.score ?? null);
    const fillOpacity = job.category ? 0.62 : 0.35;
    drawFeaturePath(ctx, feature, project, mapX, mapY, {
      fill,
      fillOpacity,
      stroke: '#111111',
      strokeWidth: feature.properties.type === 'kelurahan' ? 0.45 : 0.8,
    });
  }

  /* Batas kecamatan hanya ditumpuk di atas desa, bukan digambar dua kali. */
  if (job.features.some((feature) => feature.properties.type === 'kelurahan')) {
    for (const district of job.districts) {
      drawFeaturePath(ctx, district, project, mapX, mapY, {
        fill: 'none',
        fillOpacity: 0,
        stroke: '#111111',
        strokeWidth: 0.95,
      });
    }
  }

  /* Batas kabupaten */
  if (job.boundary) {
    drawFeaturePath(ctx, job.boundary, project, mapX, mapY, {
      fill: 'none',
      fillOpacity: 0,
      stroke: '#111111',
      strokeWidth: 1.4,
    });
  }

  /* 3c — Label wilayah */
  if (config.showLabels) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelFeatures = config.mapMode === 'desa' ? job.features : job.districts;
    for (const feature of labelFeatures) {
      const anchor = labelAnchorOfFeature(feature);
      const [px, py] = project(anchor.coordinate[0], anchor.coordinate[1]);
      const label = feature.properties.name;
      const fontSize = fitCanvasLabelFont(
        ctx,
        label,
        config.mapMode === 'desa' ? 9.5 : 11,
        anchor.clearanceMeters / project.metersPerUnit,
      );
      if (!fontSize) continue;
      ctx.font = `600 ${fontSize}px ${SANS}`;
      ctx.lineWidth = Math.min(3, fontSize * 0.22);
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeText(label, mapX + px, mapY + py);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(label, mapX + px, mapY + py);
    }
  }

  /* 3e — Panah utara */
  if (config.showNorthArrow) {
    drawNorthArrow(ctx, mapX + mapW - 26, mapY + 42, 14);
  }

  /* 3f — Batang skala */
  let scaleLabel = '';
  if (config.showScaleBar) {
    // groundMetersPerUnit = meter bumi per satuan layout-px (96 dpi basis)
    const metersPerLayoutMm = project.metersPerUnit * PX_PER_MM;
    const bar = computeScaleBar(project.metersPerUnit, 120);
    scaleLabel = `1 : ${scaleDenominator(metersPerLayoutMm).toLocaleString('id-ID')}`;
    drawScaleBar(ctx, mapX + 12, mapY + mapH - 22, bar.pixels, bar.label, scaleLabel);
  }

  ctx.restore();

  /* Bingkai muka peta */
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#94a3b8';
  ctx.strokeRect(mapX, mapY, mapW, mapH);

  onProgress?.(0.74, 'Menyusun legenda & kop…');

  /* 4 — Kop / header ---------------------------------------------------------- */
  if (config.showHeader) {
    await preloadLogo(config.header.logo);
    drawHeader(ctx, layout, config);
  }

  /* 5 — Legenda --------------------------------------------------------------- */
  if (config.showLegend && layout.legendW > 0) {
    drawLegend(ctx, layout, job);
  }

  /* 6 — Strip bawah: catatan skala/tanggal + tanda tangan ---------------------- */
  drawBottomBand(ctx, layout, job);

  onProgress?.(0.9, 'Merender lembar…');

  return {
    canvas,
    dpi,
    tileZoom: plan?.zoom ?? null,
    tileScale: plan?.tileScale ?? 1,
    tileCount: drawnTiles,
    scaleLabel,
  };
}

/* -------------------------------------------------------------------------- */
/* Sub-drawers                                                                 */
/* -------------------------------------------------------------------------- */

function drawFeaturePath(
  ctx: CanvasRenderingContext2D,
  feature: RegionFeature,
  project: (lon: number, lat: number) => [number, number],
  mapX: number,
  mapY: number,
  style: { fill: string; fillOpacity: number; stroke: string; strokeWidth: number; dash?: number[] },
): void {
  ctx.save();
  if (style.fill !== 'none') {
    ctx.globalAlpha = style.fillOpacity;
    ctx.fillStyle = style.fill;
  }
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = style.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (style.dash) {
    ctx.setLineDash(style.dash);
  }

  const path = new Path2D();
  forEachRing(feature, (ring) => {
    ring.forEach(([lon, lat], i) => {
      const [px, py] = project(lon, lat);
      const x = mapX + px;
      const y = mapY + py;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    path.closePath();
  });

  if (style.fill !== 'none') {
    ctx.fill(path, 'evenodd');
  }
  ctx.stroke(path);
  ctx.restore();
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  layout: PrintLayout,
  config: PrintConfig,
): void {
  const w = layout.paperWidth * PX_PER_MM;
  const h = layout.headerHeight * PX_PER_MM;
  const pad = layout.margin * PX_PER_MM;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h + 1);

  /* Logo kiri */
  const logoBox = Math.min(26 * 1.4, h - 8);
  if (config.header.logo) {
    const cached = logoCache.get(config.header.logo);
    if (cached) {
      ctx.drawImage(cached, pad, (h - logoBox) / 2, logoBox, logoBox);
    }
  }

  const textX = config.header.logo ? pad + logoBox + 14 : pad;

  /* Teks instansi baris 1 & 2 */
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  const line1 = fitFont(ctx, config.header.agencyLine1, w - textX - pad - 90, '700', 13, SERIF);
  ctx.font = `700 ${line1}px ${SERIF}`;
  ctx.fillText(config.header.agencyLine1.toUpperCase(), textX, h * 0.35);

  if (config.header.agencyLine2) {
    const line2 = fitFont(ctx, config.header.agencyLine2, w - textX - pad - 90, '500', 11.5, SERIF);
    ctx.font = `500 ${line2 * 0.92}px ${SERIF}`;
    ctx.fillText(config.header.agencyLine2.toUpperCase(), textX, h * 0.59);
  }

  // Garis pemisah ringan antara identitas instansi dan judul peta.
  ctx.beginPath();
  ctx.moveTo(pad, h * 0.75);
  ctx.lineTo(w - pad, h * 0.75);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 0.65;
  ctx.stroke();

  /* Judul peta di tengah bawah kop */
  if (config.header.title) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    const titleSize = fitFont(ctx, config.header.title, w - pad * 2 - 8, '700', 13.5);
    ctx.font = `700 ${titleSize}px ${SANS}`;
    ctx.fillText(config.header.title, w / 2, h * 0.91);
  }
  ctx.restore();
}

/** Cache logo dataURL → HTMLImageElement untuk dipakai berulang. */
const logoCache = new Map<string, HTMLImageElement>();

export async function preloadLogo(src: string | null): Promise<void> {
  if (!src) {
    return;
  }
  if (logoCache.has(src)) return;
  if (src.length > 2_500_000) return; // batas aman ukuran logo
  const img = await loadImage(src);
  if (img) logoCache.set(src, img);
}

/* -------------------------------------------------------------------------- */

function drawLegend(ctx: CanvasRenderingContext2D, layout: PrintLayout, job: SheetJob): void {
  const x = layout.legendX * PX_PER_MM;
  const y = layout.legendY * PX_PER_MM;
  const w = layout.legendW * PX_PER_MM;
  const h = layout.legendH * PX_PER_MM;

  ctx.save();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  let cursorY = y + 14;

  ctx.fillStyle = '#0f172a';
  ctx.font = `700 10px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.fillText('KETERANGAN', x + 10, cursorY);
  cursorY += 8;

  if (job.category) {
    cursorY += 6;
    ctx.font = `600 9px ${SANS}`;
    ctx.fillStyle = '#334155';
    let label = job.category.name.toUpperCase();
    const sized = fitFont(ctx, label, w - 20, '600', 9);
    ctx.font = `600 ${sized}px ${SANS}`;
    ctx.fillText(label, x + 10, cursorY);

    cursorY += 16;
    const rowH = 13;
    const swatch = 10;
    for (let i = 0; i < 5; i++) {
      const score = (i + 1) as Score;
      ctx.fillStyle = job.category.palette[i];
      ctx.fillRect(x + 10, cursorY, swatch, swatch);
      ctx.strokeStyle = 'rgba(15,23,42,0.35)';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(x + 10, cursorY, swatch, swatch);
      ctx.fillStyle = '#334155';
      ctx.font = `500 9px ${SANS}`;
      ctx.fillText(`${score} — ${job.category.bands[i]}`, x + 10 + swatch + 6, cursorY + swatch * 0.85);
      cursorY += rowH;
    }

    // Belum ada data
    ctx.fillStyle = job.category.noDataColor;
    ctx.fillRect(x + 10, cursorY, swatch, swatch);
    ctx.strokeStyle = 'rgba(15,23,42,0.35)';
    ctx.strokeRect(x + 10, cursorY, swatch, swatch);
    ctx.fillStyle = '#64748b';
    ctx.font = `500 9px ${SANS}`;
    ctx.fillText('Belum ada data', x + 10 + swatch + 6, cursorY + swatch * 0.85);
    cursorY += rowH + 6;
  }

  // Ringkasan
  if (job.stats.average != null) {
    cursorY += 6;
    ctx.fillStyle = '#64748b';
    ctx.font = `500 8.5px ${SANS}`;
    ctx.fillText(`Skor rata-rata: ${job.stats.average}`, x + 10, cursorY);
    cursorY += 12;
    ctx.fillText(
      `Wilayah: ${job.stats.scored}/${job.stats.total} ternilai`,
      x + 10,
      cursorY,
    );
  }

  ctx.restore();
}

function drawNorthArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.55, size * 0.55);
  ctx.lineTo(0, size * 0.25);
  ctx.lineTo(-size * 0.55, size * 0.55);
  ctx.closePath();
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // separuh diputar agar setengah arah putih (efek arrow utara klasik)
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(0, size * 0.25);
  ctx.lineTo(-size * 0.55, size * 0.55);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${Math.round(size * 0.78)}px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.fillText('U', 0, -size - 6);
  ctx.restore();
}

function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  widthPx: number,
  label: string,
  denominator: string,
): void {
  const segs = 4;
  const segW = Math.max(12, widthPx / segs);
  const barH = 4;
  ctx.save();

  // penggaris digambar terpisah
  for (let i = 0; i < segs; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#0f172a' : '#ffffff';
    ctx.fillRect(x + i * segW, y, segW, barH);
  }
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(x, y, segW * segs, barH);

  ctx.textAlign = 'left';
  ctx.font = `500 7.5px ${SANS}`;
  ctx.fillStyle = '#1e293b';
  ctx.fillText(label, x, y - 5);
  ctx.fillStyle = '#475569';
  ctx.font = `400 7px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.fillText(denominator, x + segW * segs + 7, y + barH);
  ctx.restore();
}

function drawBottomBand(ctx: CanvasRenderingContext2D, layout: PrintLayout, job: SheetJob): void {
  const w = layout.paperWidth * PX_PER_MM;
  const h = layout.paperHeight * PX_PER_MM;
  const pad = layout.margin * PX_PER_MM;
  const bandTop = h - pad - layout.bottomHeight * PX_PER_MM + 2 * PX_PER_MM;

  ctx.save();
  ctx.textBaseline = 'alphabetic';

  const stampText: string[] = [];
  if (job.config.showTimestamp) {
    stampText.push(`Dicetak: ${formatDateId(job.printedAt, false, true)}`);
  }
  stampText.push(`Basemap: ${job.basemapAttribution ?? baseLayerOption(job.basemap).attribution}`);

  const footLines = job.config.showFooterNote
    ? wrapTextLines(ctx, job.config.footnote, w - pad * 2 - 90 * PX_PER_MM)
    : [];

  ctx.textAlign = 'left';
  ctx.fillStyle = '#475569';
  ctx.font = `500 8.5px ${SANS}`;
  let ly = bandTop + 10;
  for (const line of footLines.slice(0, 3)) {
    ctx.fillText(line, pad, ly);
    ly += 11;
  }
  ly += 4;
  ctx.font = `500 8px ${SANS}`;
  ctx.fillStyle = '#94a3b8';
  for (const line of stampText.slice(0, 2)) {
    ctx.fillText(line, pad, ly);
    ly += 10;
  }

  /* tanda tangan kan bawah */
  if (job.config.showSignature) {
    const signer = job.config.signer;
    const right = w - pad;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = `500 9.5px ${SANS}`;
    ctx.fillText(`${signer.tempat ? `${signer.tempat}, ` : ''}${formatDateId(job.printedAt)}`, right, bandTop + 11);

    ctx.font = `600 10px ${SANS}`;
    ctx.fillText(signer.jabatan.toUpperCase(), right, bandTop + 24);

    ctx.font = `600 10.5px ${SANS}`;
    ctx.fillText(signer.nama || '______________________', right, bandTop + 62);

    ctx.font = `500 9px ${SANS}`;
    ctx.fillText(signer.nip ? `NIP. ${signer.nip}` : 'NIP. ______________________', right, bandTop + 74);
  }

  ctx.restore();
}

/* -------------------------------------------------------------------------- */
/* PDF builders                                                                */
/* -------------------------------------------------------------------------- */

const LARGE_CANVAS_PIXELS = 12_000_000;

/** Canvas HD → jsPDF halaman exact-size (dipakai jalur offline client). */
export function buildPdfBlob(job: SheetJob, canvas: HTMLCanvasElement): Blob {
  const widthPt = mmToPt(job.paper.width);
  const heightPt = mmToPt(job.paper.height);
  const pdf = new jsPDF({
    unit: 'pt',
    orientation: job.paper.width > job.paper.height ? 'landscape' : 'portrait',
    format: [widthPt, heightPt],
    compress: true,
  });

  const px = canvas.width * canvas.height;
  if (px > LARGE_CANVAS_PIXELS) {
    pdf.addImage(canvas, 'JPEG', 0, 0, widthPt, heightPt, undefined, 'FAST');
  } else {
    pdf.addImage(canvas, 'PNG', 0, 0, widthPt, heightPt, undefined, 'FAST');
  }

  return pdf.output('blob');
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function openPrintWindow(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    downloadBlob(blob, fileName);
  } else {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export function buildSheetFileName(job: SheetJob, suffix = ''): string {
  const title = suffix ? `${job.config.header.title} ${suffix}` : job.config.header.title;
  const slug = slugify(title) || 'peta-kerawanan';
  const stamp = new Date().toISOString().slice(0, 10);
  return `${slug}-${job.paper.width}x${job.paper.height}mm-${stamp}.pdf`;
}

/* -------------------------------------------------------------------------- */
/* Payload vektor untuk /api/export-pdf                                        */
/* -------------------------------------------------------------------------- */

export interface VectorLegendRow {
  color: string;
  label: string;
  kind: 'band' | 'noData';
}

export interface VectorPayload {
  paper: { widthMm: number; heightMm: number };
  header: {
    show: boolean;
    agencyLine1: string;
    agencyLine2: string;
    yearLabel: string;
    title: string;
    subtitle: string;
    logo: string | null;
  };
  map: {
    x: number;
    y: number;
    width: number;
    height: number;
    viewBoxWidth: number;
    viewBoxHeight: number;
    paths: { d: string; fill: string | null; fillOpacity: number; stroke: string | null; strokeWidth: number; dash?: string }[];
    labels: { x: number; y: number; text: string; fontSize: number }[];
    north: { x: number; y: number; size: number } | null;
    scaleBar: { x: number; y: number; segWidth: number; segments: number; label: string; denominator: string } | null;
  };
  legend: { show: boolean; x: number; y: number; width: number; height: number; title: string; rows: VectorLegendRow[]; footerLines: string[] };
  footer: {
    showTimestamp: boolean;
    printedAt: string;
    basedNote: string[];
    signature: { show: boolean; dateText: string; jabatan: string; nama: string; nip: string };
  };
}

/** Membangun payload JSON lengkap (koordinat pt) dari job + canvas projector. */
export function buildVectorPayload(job: SheetJob): VectorPayload {
  const PT = 72 / 25.4;
  const { layout, config } = job;

  const bbox = bboxOfFeatures([...job.features, ...job.districts]) ?? [110.1, -8.2, 111.9, -7.4];

  const mapWpt = layout.mapWidth * PT;
  const mapHpt = layout.mapHeight * PT;
  const project = makeProjector(bbox, mapWpt, mapHpt, 0.04);

  const paths: VectorPayload['map']['paths'] = [];

  /* desa / choropleth */
  for (const feature of job.features) {
    const record = job.category ? job.scores[`${job.category.id}::${feature.properties.id}`] : undefined;
    const fillPath = featurePathD(feature, project);
    if (!fillPath) continue;
    paths.push({
      d: fillPath,
      fill: colorForScore(job.category, record?.score ?? null),
      fillOpacity: job.category ? 0.62 : 0.35,
      stroke: '#111111',
      strokeWidth: feature.properties.type === 'kelurahan' ? 0.45 : 0.8,
    });
  }

  /* kecamatan hanya menjadi layer terpisah di atas batas desa. */
  if (job.features.some((feature) => feature.properties.type === 'kelurahan')) {
    for (const district of job.districts) {
      const d = featurePathD(district, project);
      if (!d) continue;
      paths.push({ d, fill: null, fillOpacity: 0, stroke: '#111111', strokeWidth: 0.95 });
    }
  }

  /* kabupaten */
  if (job.boundary) {
    const d = featurePathD(job.boundary, project);
    if (d) {
      paths.push({ d, fill: null, fillOpacity: 0, stroke: '#111111', strokeWidth: 1.4 });
    }
  }

  /* label */
  const labels: { x: number; y: number; text: string; fontSize: number }[] = [];
  if (config.showLabels) {
    const labelFeatures = config.mapMode === 'desa' ? job.features : job.districts;
    for (const feature of labelFeatures) {
      const anchor = labelAnchorOfFeature(feature);
      const [px, py] = project(anchor.coordinate[0], anchor.coordinate[1]);
      const fontSize = fitVectorLabelFont(
        feature.properties.name,
        6.8,
        anchor.clearanceMeters / project.metersPerUnit,
      );
      if (!fontSize) continue;
      labels.push({
        x: Number(px.toFixed(1)),
        y: Number(py.toFixed(1)),
        text: feature.properties.name,
        fontSize,
      });
    }
  }

  /* skala */
  let scaleBar: VectorPayload['map']['scaleBar'] = null;
  if (config.showScaleBar) {
    const bar = computeScaleBar(project.metersPerUnit, 120);
    const segWidth = Math.max(8, (bar.pixels * PT) / 4);
    scaleBar = {
      x: 12,
      y: mapHpt - 26,
      segWidth: Number(segWidth.toFixed(1)),
      segments: 4,
      label: bar.label,
      denominator: `1 : ${scaleDenominator(project.metersPerUnit / PT).toLocaleString('id-ID')}`,
    };
  }

  /* legenda rows */
  const rows: VectorLegendRow[] = [];
  if (job.category) {
    for (let i = 0; i < 5; i++) {
      rows.push({
        color: job.category.palette[i],
        label: `${i + 1} — ${job.category.bands[i]}`,
        kind: 'band',
      });
    }
    rows.push({ color: job.category.noDataColor, label: 'Belum ada data', kind: 'noData' });
  }
  const stampText: string[] = [];
  if (config.showTimestamp) {
    stampText.push(`Dicetak: ${formatDateId(job.printedAt, false, true)}`);
  }
  stampText.push(`Basemap: ${job.basemapAttribution ?? baseLayerOption(job.basemap).attribution}`);

  return {
    paper: { widthMm: job.paper.width, heightMm: job.paper.height },
    header: {
      show: config.showHeader,
      agencyLine1: config.header.agencyLine1,
      agencyLine2: config.header.agencyLine2,
      yearLabel: config.header.yearLabel,
      title: config.header.title,
      subtitle: config.header.subtitle,
      logo: config.header.logo,
    },
    map: {
      x: layout.mapX * PT,
      y: layout.mapY * PT,
      width: mapWpt,
      height: mapHpt,
      viewBoxWidth: mapWpt,
      viewBoxHeight: mapHpt,
      paths,
      labels,
      north: config.showNorthArrow
        ? { x: mapWpt - 26, y: 42, size: 14 }
        : null,
      scaleBar,
    },
    legend: {
      show: config.showLegend && layout.legendW > 0,
      x: (config.showLegend ? layout.legendX : 0) * PT,
      y: layout.legendY * PT,
      width: layout.legendW * PT,
      height: layout.legendH * PT,
      title: 'KETERANGAN',
      rows,
      footerLines: [
        job.category ? `${job.category.name} · ${job.category.description}` : '',
        job.stats.average != null ? `Skor rata-rata kategori ini: ${job.stats.average} (wilayah ternilai ${job.stats.scored}/${job.stats.total})` : '',
      ].filter(Boolean),
    },
    footer: {
      showTimestamp: config.showTimestamp,
      printedAt: formatDateId(job.printedAt, true),
      basedNote: [
        config.showFooterNote ? config.footnote : '',
        ...stampText,
      ].filter(Boolean),
      signature: {
        show: config.showSignature,
        dateText: `${config.signer.tempat ? `${config.signer.tempat}, ` : ''}${formatDateId(job.printedAt)}`,
        jabatan: config.signer.jabatan,
        nama: config.signer.nama,
        nip: config.signer.nip,
      },
    },
  };
}

/** Ukur teks dan kecilkan seperlunya agar seluruh label muat di lingkaran aman polygon. */
function fitCanvasLabelFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  baseSize: number,
  radius: number,
): number | null {
  for (let size = baseSize; size >= 5.5; size -= 0.5) {
    ctx.font = `600 ${size}px ${SANS}`;
    const width = ctx.measureText(text).width;
    const halo = Math.min(3, size * 0.22);
    if (Math.hypot((width + halo) / 2, (size * 1.35 + halo) / 2) <= radius * 0.92) {
      return size;
    }
  }
  return null;
}

/** Helvetica-Bold pada renderer vektor: estimasi lebar konservatif per karakter. */
function fitVectorLabelFont(text: string, baseSize: number, radius: number): number | null {
  for (let size = baseSize; size >= 4; size -= 0.2) {
    const width = text.length * size * 0.62;
    if (Math.hypot((width + 1.6) / 2, (size * 1.25 + 1.6) / 2) <= radius * 0.92) {
      return Number(size.toFixed(1));
    }
  }
  return null;
}

function featurePathD(feature: RegionFeature, project: (lon: number, lat: number) => [number, number]): string | null {
  let d = '';
  forEachRing(feature, (ring) => {
    ring.forEach(([lon, lat], i) => {
      const [px, py] = project(lon, lat);
      d += `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`;
      if (i === ring.length - 1) d += 'Z';
      else d += ' ';
    });
  });
  return d || null;
}
