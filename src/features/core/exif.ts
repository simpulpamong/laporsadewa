import { pad2, stampHuman } from '@/lib/format';
import type { ExifData } from './types';

/** Pembaca EXIF tanpa dependensi eksternal — cukup untuk GPS + waktu. */

export async function readExif(file: File | Blob): Promise<ExifData | null> {
  try {
    const buffer = await file.arrayBuffer();
    return parseExif(new DataView(buffer));
  } catch {
    return null;
  }
}

function parseExif(view: DataView): ExifData | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset < view.byteLength - 4) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint16(offset);
    const length = view.getUint16(offset + 2);
    if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
      return parseTiff(view, offset + 10);
    }
    if (length < 2) break;
    offset += 2 + length;
  }
  return null;
}

function parseTiff(view: DataView, base: number): ExifData | null {
  const littleEndian = view.getUint16(base) === 0x4949;
  const read16 = (o: number) => view.getUint16(o, littleEndian);
  const read32 = (o: number) => view.getUint32(o, littleEndian);
  const readString = (o: number, length: number) => {
    let text = '';
    for (let i = 0; i < length; i++) {
      const code = view.getUint8(o + i);
      if (!code) break;
      text += String.fromCharCode(code);
    }
    return text.trim();
  };
  const readRatio = (o: number) => {
    const numerator = read32(o);
    const denominator = read32(o + 4);
    return denominator ? numerator / denominator : 0;
  };

  const result: ExifData = {};
  const ifd0 = read32(base + 4);
  const entries0 = read16(base + ifd0);

  let exifOffset = 0;
  let gpsOffset = 0;

  for (let i = 0; i < entries0; i++) {
    const entry = base + ifd0 + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = read16(entry);
    const count = read32(entry + 4);
    const value = entry + 8;
    if (tag === 0x8769) exifOffset = read32(value);
    if (tag === 0x8825) gpsOffset = read32(value);
    if (tag === 0x0132) result.dateTime = readString(base + read32(value), count);
  }

  if (exifOffset) {
    const exifBase = base + exifOffset;
    const entries = read16(exifBase);
    for (let i = 0; i < entries; i++) {
      const entry = exifBase + 2 + i * 12;
      if (entry + 12 > view.byteLength) break;
      const tag = read16(entry);
      const count = read32(entry + 4);
      const value = entry + 8;
      if (tag === 0x9003) result.dto = readString(base + read32(value), count);
      if (tag === 0x9004) result.dtd = readString(base + read32(value), count);
      if (tag === 0x882a) result.tzOff = view.getInt16(value, littleEndian);
    }
  }

  if (gpsOffset) {
    const gpsBase = base + gpsOffset;
    const entries = read16(gpsBase);
    const gps: Record<string, unknown> = {};
    for (let i = 0; i < entries; i++) {
      const entry = gpsBase + 2 + i * 12;
      if (entry + 12 > view.byteLength) break;
      const tag = read16(entry);
      const value = entry + 8;
      if (tag === 0x0001) gps.latRef = String.fromCharCode(view.getUint8(value));
      if (tag === 0x0002) {
        const at = base + read32(value);
        gps.lat = [readRatio(at), readRatio(at + 8), readRatio(at + 16)];
      }
      if (tag === 0x0003) gps.lngRef = String.fromCharCode(view.getUint8(value));
      if (tag === 0x0004) {
        const at = base + read32(value);
        gps.lng = [readRatio(at), readRatio(at + 8), readRatio(at + 16)];
      }
    }
    const lat = toDecimal(gps.lat as number[] | undefined, gps.latRef as string | undefined, 90);
    const lng = toDecimal(gps.lng as number[] | undefined, gps.lngRef as string | undefined, 180);
    if (lat !== null && lng !== null) result.gps = { lat, lng };
  }

  return Object.keys(result).length ? result : null;
}

function toDecimal(dms: number[] | undefined, ref: string | undefined, maxDegrees: number): number | null {
  if (!dms || dms.length < 3) return null;
  const direction = ref?.toUpperCase();
  if (!['N', 'S', 'E', 'W'].includes(direction || '')) return null;
  if (dms.some(value => !Number.isFinite(value) || value < 0)) return null;
  if (dms[0] > maxDegrees || dms[1] >= 60 || dms[2] >= 60) return null;
  const value = dms[0] + dms[1] / 60 + dms[2] / 3600;
  if (value > maxDegrees) return null;
  return Number((direction === 'S' || direction === 'W' ? -value : value).toFixed(6));
}

export function nowStamp(): string {
  return stampHuman();
}

/** "26/09/2026 14:05:33 WIB" — dari EXIF bila ada. */
export function formatExifTime(exif: ExifData | null | undefined): string {
  if (!exif) return `${nowStamp()} WIB`;
  const raw = exif.dto || exif.dtd || exif.dateTime;
  if (!raw) return `${nowStamp()} WIB`;

  const match = /(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!match) return `${nowStamp()} WIB`;

  const zone =
    exif.tzOff !== undefined
      ? ` GMT${exif.tzOff >= 0 ? '+' : '-'}${pad2(Math.abs(exif.tzOff))}`
      : ' WIB';

  return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}:${match[6]}${zone}`;
}
