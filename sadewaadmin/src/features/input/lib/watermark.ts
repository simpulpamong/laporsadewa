
import { formatExifTime, nowStamp } from './exif';
import { base64ByteLength } from './format';
import { APP_KABUPATEN, APP_NEGARA, APP_PROVINSI, WATERMARK_BRAND } from './constants';
import type { GeoAddress, GpsPoint } from './types';

/**
 * Pemrosesan foto: cap watermark (logo + teks + QR lokasi), lalu kompresi
 * adaptif agar selalu di bawah batas ukuran.
 */

export interface WatermarkContext {
  /** Nama program laporan, mis. "Sadewa", "Poskamling", "Posyandu". */
  program: string;
  /** Nama Danru / petugas (kosong bila kategori tidak punya nama petugas). */
  unit: string;
  /** Alamat fallback bila foto tidak punya EXIF lokasi. */
  fallbackAddress: string;
  gps?: GpsPoint | null;
  /** True bila koordinat berasal dari isian/pemetaan manual, bukan EXIF. */
  manualGps?: boolean;
  address?: GeoAddress | null;
  capturedAt: string;
  /** Nama brand/instansi (mis. "DAMKAR PONOROGO" atau "SATPOL PP PONOROGO"). */
  brand?: string;
  /** Logo yang dipakai ('damkar' atau 'satpol'). */
  watermarkLogo?: string;
}

export interface ProcessedPhoto {
  data: string;
  mime: string;
  sizeKB: number;
  compressed: boolean;
  watermarked: boolean;
}

export interface ProcessPhotoOptions {
  /** Berkas asal (Blob) — di-decode langsung tanpa perantara base64. */
  source: Blob;
  /** Asal foto untuk gaya cap. */
  sourceKind: 'camera' | 'gallery';
  /** Aktifkan watermark. */
  watermark: boolean;
  /** Logo watermark per kategori (Firestore/config): damkar.webp atau satpol.webp. */
  watermarkLogo?: 'damkar' | 'satpol' | string | null;
  context: WatermarkContext;
  /** Batas ukuran dalam byte. */
  maxBytes: number;
  /** Sisi terpanjang canvas. */
  maxEdge?: number;
}

// 2048px keeps report photos sharp while reducing canvas memory and JPEG work
// substantially on mobile devices (compared with the previous 2400px cap).
const MAX_EDGE = 2048;
const MIN_QUALITY = 0.32;
const BASE_QUALITY = 0.9;

/* ── Sumber gambar ──────────────────────────────────────────────── */

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * Decode foto.
 *
 * `createImageBitmap` dipakai lebih dulu: lebih cepat dan menerapkan orientasi
 * EXIF sehingga foto potret dari ponsel tidak terbalik saat digambar ke canvas.
 * Jalur <img> dipakai sebagai cadangan bila bitmap tidak tersedia/gagal.
 */
async function decode(blob: Blob): Promise<DecodedImage | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      /* lanjut ke jalur <img> */
    }
  }

  return new Promise(resolve => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () =>
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

/* ── Logo ───────────────────────────────────────────────────────── */

const logoPromises = new Map<string, Promise<HTMLImageElement | null>>();

export function resolveWatermarkLogoSrc(key?: string | null): string {
  if (key === 'damkar') return '/assets/damkar.webp';
  if (key === 'satpol') return '/assets/satpol.webp';
  if (typeof key === 'string' && (key.startsWith('/') || key.startsWith('http://') || key.startsWith('https://'))) return key;
  return '/assets/satpol.webp'; // default bawaan
}

/** Otomatis: kategori damkar/kebakaran → damkar.webp, selain itu → satpol.webp. */
export function autoWatermarkLogo(category?: {
  slug?: string | null;
  name?: string | null;
  id?: string | null;
  watermarkLogo?: string | null;
  parentCategory?: { id?: string | null; name?: string | null; slug?: string | null } | null;
  parentSlug?: string | null;
  parentName?: string | null;
  description?: string | null;
} | null): 'damkar' | 'satpol' {
  if (category?.watermarkLogo === 'damkar' || category?.watermarkLogo === 'satpol') {
    return category.watermarkLogo;
  }
  const hay = `${category?.parentSlug || ''} ${category?.parentName || ''} ${category?.parentCategory?.slug || ''} ${category?.parentCategory?.name || ''} ${category?.slug || ''} ${category?.name || ''} ${category?.id || ''} ${category?.description || ''}`.toLowerCase();
  const isDamkar = hay.includes('damkar') || hay.includes('kebakaran') || hay.includes('pemadam') || hay.includes('karhutla');
  return isDamkar ? 'damkar' : 'satpol';
}

export function preloadWatermarkLogo(key?: string | null) {
  if (typeof document === 'undefined') return;
  void getLogo(key);
}

function getLogo(key?: string | null): Promise<HTMLImageElement | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const src = resolveWatermarkLogoSrc(key);
  const cached = logoPromises.get(src);
  if (cached) return cached;
  const p = new Promise<HTMLImageElement | null>(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      // fallback tanpa crossOrigin bila lingkungan lokal/webview memblokir CORS
      const fallback = new Image();
      fallback.onload = () => resolve(fallback);
      fallback.onerror = () => resolve(null);
      fallback.src = src;
    };
    image.crossOrigin = 'anonymous';
    image.src = src;
  });
  logoPromises.set(src, p);
  return p;
}

/* ── QR ─────────────────────────────────────────────────────────── */

/**
 * Pustaka QR dimuat saat pertama kali dibutuhkan agar tidak masuk ke bundel
 * awal halaman — sebagian besar pengguna tidak memfoto dengan GPS.
 */
let qrModule: Promise<typeof import('qrcode')> | null = null;

function loadQr() {
  if (!qrModule) qrModule = import('qrcode');
  return qrModule;
}

async function makeQrCanvas(gps: GpsPoint, size: number): Promise<HTMLCanvasElement | null> {
  try {
    const url = `https://www.google.com/maps?q=${gps.lat.toFixed(6)},${gps.lng.toFixed(6)}`;
    const QRCode = await loadQr();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    await QRCode.toCanvas(canvas, url, {
      width: size,
      margin: 0,
      errorCorrectionLevel: 'L',
      color: { dark: '#000000', light: '#ffffff' },
    });
    return canvas;
  } catch (error) {
    console.warn('[watermark] QR lokasi tidak dapat dibuat', error);
    return null;
  }
}

/* ── Menggambar cap ─────────────────────────────────────────────── */

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  const value = text.trim();
  if (!value) return [];
  if (ctx.measureText(value).width <= maxWidth) return [value];

  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = ctx.measureText(last).width > maxWidth ? `${last.slice(0, -1)}…` : last;
  }
  return lines;
}

export interface DrawWatermarkArgs {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  source: 'camera' | 'gallery';
  context: WatermarkContext;
  qr: HTMLCanvasElement | null;
  logo: HTMLImageElement | null;
}

export function drawWatermark(args: DrawWatermarkArgs) {
  const { ctx, width, height, source, context, qr, logo } = args;

  const bar = Math.max(3, Math.round(width * 0.005));
  const pad = Math.round(width * 0.018);
  const padV = Math.round(pad * 0.6);
  const logoSize = Math.round(Math.min(width, height) * 0.09);

  const fontBody = Math.max(9, Math.round(logoSize * 0.3));
  const fontSmall = Math.max(7, Math.round(fontBody * 0.72));
  const lineHeight = Math.round(fontBody * 1.45);
  const textX = bar + Math.round(pad * 0.45) + logoSize + Math.round(pad * 0.55);
  const isDamkar = (context.watermarkLogo === 'damkar') || (Boolean(context.brand) && context.brand!.toLowerCase().includes('damkar'));
  const brand = context.brand || (isDamkar ? 'DAMKAR PONOROGO' : WATERMARK_BRAND);
  const categoryLabel = String(context.program || '').trim();
  const title = categoryLabel ? `${brand} • ${categoryLabel}` : brand;

  const address = (context.address?.full || context.fallbackAddress || '').trim();
  const gps = context.gps || null;
  const time = source === 'camera' ? formatExifTime({ dto: context.capturedAt }) : `${nowStamp()} WIB`;
  const coords = gps
    ? `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}${context.manualGps ? ' · manual' : ''}`
    : source === 'gallery'
      ? 'Lokasi manual'
      : 'Koordinat tidak tersedia';
  const person = (context.unit || '').trim();

  // QR block (centered vertically in strip; placed in a balanced right zone)
  const qrLabelFont = qr ? Math.max(7, Math.round(fontSmall * 0.82)) : 0;
  const qrLabelGap = qr ? Math.max(2, Math.round(pad * 0.14)) : 0;
  const qrFrame = qr ? Math.max(2, Math.round(width * 0.0035)) : 0;
  const qrSize = qr ? Math.max(62, Math.min(150, Math.round(Math.min(width, height) * 0.115))) : 0;
  const qrBlockW = qr ? qrSize + qrFrame * 2 : 0;
  const qrBlockH = qr ? qrLabelFont + qrLabelGap + qrSize + qrFrame * 2 : 0;
  const qrZoneW = qr ? qrBlockW + pad * 1.2 : 0;

  const textWidth = Math.max(90, width - textX - pad - qrZoneW);
  const baseTitle = Math.max(10, Math.round(logoSize * 0.34));
  const fontTitle = Math.max(9, Math.min(baseTitle, Math.floor((textWidth / Math.max(1, title.length)) * 1.7)));

  ctx.save();
  ctx.font = `500 ${fontBody}px "Helvetica Neue", Arial, sans-serif`;
  const addressLines = wrapText(ctx, address, textWidth, 2);
  const contentLines = 1 /*title*/ + 1 /*time*/ + addressLines.length + 1 /*coords*/ + (person ? 1 : 0);
  const contentHeight = Math.round(fontTitle * 1.35) + (contentLines - 1) * lineHeight;
  const stripHeight = Math.max(
    Math.round(height * 0.082),
    padV * 2 + contentHeight,
    padV * 2 + Math.max(logoSize, qrBlockH),
  );
  const stripY = height - stripHeight;

  // Background gradient
  const background = ctx.createLinearGradient(0, stripY, 0, height);
  background.addColorStop(0, 'rgba(5,12,24,0.34)');
  background.addColorStop(0.45, 'rgba(5,12,24,0.64)');
  background.addColorStop(1, 'rgba(5,12,24,0.84)');
  ctx.fillStyle = background;
  ctx.fillRect(0, stripY, width, stripHeight);

  // Left accent
  const accent = ctx.createLinearGradient(0, stripY, 0, height);
  accent.addColorStop(0, 'rgba(37,120,214,0.72)');
  accent.addColorStop(1, 'rgba(24,74,168,0.94)');
  ctx.fillStyle = accent;
  ctx.fillRect(0, stripY, bar, stripHeight);

  // Logo centered vertically
  if (logo && logo.complete && logo.naturalWidth > 0) {
    try {
      ctx.globalAlpha = 0.97;
      ctx.drawImage(
        logo,
        bar + Math.round(pad * 0.35),
        stripY + Math.round((stripHeight - logoSize) / 2),
        logoSize,
        logoSize,
      );
      ctx.globalAlpha = 1;
    } catch {
      /* optional */
    }
  }

  // QR centered vertically in strip, in a balanced right zone (tidy, no wasted space)
  if (qr && qrSize) {
    const qx = width - pad - qrFrame - qrSize;
    const qy = stripY + Math.round((stripHeight - qrBlockH) / 2) + qrLabelFont + qrLabelGap + qrFrame;
    const r = Math.max(4, Math.round(qrSize * 0.06));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const rx = qx - qrFrame, ry = qy - qrFrame, rw = qrSize + qrFrame * 2, rh = qrSize + qrFrame * 2;
    // rounded rect
    ctx.moveTo(rx + r, ry); ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, r); ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, r); ctx.arcTo(rx, ry + rh, rx, ry, r); ctx.arcTo(rx, ry, rx + rw, ry, r); ctx.closePath();
    ctx.fill();
    try { ctx.drawImage(qr, qx, qy, qrSize, qrSize); } catch {}
    ctx.font = `700 ${qrLabelFont}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.76)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('LOKASI', qx + qrSize / 2, stripY + Math.round((stripHeight - qrBlockH) / 2));
  }

  // Text
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let y = stripY + Math.max(padV, Math.round((stripHeight - contentHeight) / 2));

  ctx.font = `800 ${fontTitle}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = 'rgba(255,212,92,0.97)';
  ctx.fillText(title, textX, y, textWidth);
  y += Math.round(fontTitle * 1.35);

  if (person) {
    ctx.font = `600 ${fontBody}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(`Danru: ${person}`, textX, y, textWidth);
    y += lineHeight;
  }

  ctx.font = `500 ${fontBody}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = 'rgba(186,225,255,0.94)';
  ctx.fillText(time, textX, y, textWidth);
  y += lineHeight;

  ctx.font = `500 ${fontBody}px "Helvetica Neue", Arial, sans-serif`;
  const verified = Boolean(context.address?.road);
  ctx.fillStyle = verified ? 'rgba(177,248,214,0.95)' : 'rgba(206,245,222,0.88)';
  for (const line of addressLines) {
    ctx.fillText(line, textX, y, textWidth);
    y += lineHeight;
  }

  ctx.font = `400 ${fontSmall}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = 'rgba(184,206,230,0.9)';
  ctx.fillText(coords, textX, y, textWidth);

  // SADEWA wordmark
  const brandSize = Math.max(7, Math.round(width * 0.016));
  ctx.textAlign = qr ? 'left' : 'right';
  ctx.textBaseline = 'bottom';
  ctx.font = `800 ${brandSize}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = 'rgba(255,205,0,0.48)';
  if (qr) {
    // place small wordmark above strip edge area? keep tidy at left-bottom of text zone not overlapping
    ctx.fillText('SADEWA', textX, stripY - Math.max(2, Math.round(pad * 0.12)), Math.round(width * 0.2));
  } else {
    ctx.fillText('SADEWA', width - Math.round(pad * 0.4), height - Math.round(pad * 0.22), Math.round(width * 0.22));
  }
  ctx.restore();
}

/* ── Kompresi ───────────────────────────────────────────────────── */

function compress(canvas: HTMLCanvasElement, maxBytes: number, mime: string) {
  let best = canvas.toDataURL(mime, BASE_QUALITY);
  if (base64ByteLength(best) <= maxBytes) {
    return { data: best, compressed: false };
  }

  let low = MIN_QUALITY;
  let high = BASE_QUALITY;
  // Pencarian biner 6 langkah: toDataURL sudah mengaburkan kualitas, jadi
  // iterasi panjang hanya menambah encode sia-sia.
  for (let step = 0; step < 6; step++) {
    const mid = (low + high) / 2;
    const trial = canvas.toDataURL(mime, mid);
    if (base64ByteLength(trial) <= maxBytes) {
      best = trial;
      low = mid;
    } else {
      high = mid;
    }
    if (high - low < 0.04) break;
  }

  return { data: best, compressed: true };
}

/* ── Alur utama ─────────────────────────────────────────────────── */

export async function processPhoto(options: ProcessPhotoOptions): Promise<ProcessedPhoto | null> {
  const { source: blob, sourceKind, watermark, watermarkLogo, context, maxBytes, maxEdge = MAX_EDGE } = options;

  const decoded = await decode(blob);
  if (!decoded) return null;

  try {
    let width = decoded.width;
    let height = decoded.height;
    if (!width || !height) return null;

    if (width > maxEdge || height > maxEdge) {
      if (width > height) {
        height = Math.round((height * maxEdge) / width);
        width = maxEdge;
      } else {
        width = Math.round((width * maxEdge) / height);
        height = maxEdge;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, 0, 0, width, height);

    if (watermark) {
      const gps = context.gps || null;
      const qr = gps
        ? await makeQrCanvas(gps, Math.max(96, Math.min(260, Math.round(Math.min(width, height) * 0.16))))
        : null;
      drawWatermark({ ctx, width, height, source: sourceKind, context, qr, logo: await getLogo(watermarkLogo) });
    }

    const { data, compressed } = compress(canvas, maxBytes, 'image/jpeg');
    return {
      data,
      mime: 'image/jpeg',
      sizeKB: Math.round(base64ByteLength(data) / 1024),
      compressed,
      watermarked: watermark,
    };
  } finally {
    decoded.release();
  }
}

/** Alamat gabungan dari lokasi manual (khusus sadewa). */
export function composeManualAddress(location: {
  jalan: string;
  nodukuh: string;
  desa: string;
  kec: string;
  kab: string;
  prov: string;
}): string {
  const parts: string[] = [];
  if (location.jalan) {
    parts.push(location.nodukuh ? `${location.jalan} / ${location.nodukuh}` : location.jalan);
  } else if (location.nodukuh) {
    parts.push(location.nodukuh);
  }
  if (location.desa) parts.push(location.desa);
  if (location.kec) parts.push(`Kec. ${location.kec}`);
  if (location.kab) parts.push(location.kab);
  if (location.prov) parts.push(location.prov);
  parts.push(APP_NEGARA);
  return parts.join(', ');
}

/**
 * Alamat lengkap kategori terstruktur, selalu diakhiri wilayah app:
 * `detail alamat, kelurahan, kecamatan, Ponorogo, Jawa Timur, Indonesia`.
 * Bagian kosong dilewati agar tidak ada koma menggantung.
 */
export function composeReportAddress(report: {
  detailAlamat: string;
  desaKelurahan: string;
  kecamatan: string;
}): string {
  return [
    report.detailAlamat,
    report.desaKelurahan,
    report.kecamatan,
    APP_KABUPATEN,
    APP_PROVINSI,
    APP_NEGARA,
  ]
    .map(part => part.trim())
    .filter(Boolean)
    .join(', ');
}
