import type { Request, Response } from 'express';
import {
  buildPhotoFileName, FIELD_LABELS, formatDateFolder, formatMonthFolder, mimeToExt,
  parseIndonesianDate, parseReport,
} from './parser/whatsapp/parser';
import { parseDynamic, type DynamicFormatConfig } from './parser/dynamic/parse';
import { uploadPhotoToDateFolder } from './googleDrive';
import { saveReportWithPhotos, type PhotoLink } from './googleSheets';
import { deleteDraft, getDraft } from './drafts';
import { ApiError, assertImageDataUrl, checkRateLimit, clamp, ok, str, toError } from './http';
import { resolveSubcategory, resolvedStorageConfig, writeRekap } from './dynamicConfig';

const MAX_TEXT = 20_000;
const MAX_PHOTO_CHARS = 6 * 1024 * 1024;
const MAX_PHOTOS = 20;

interface SadewaBody {
  action?: string;
  data?: {
    foto?: { data?: string; mime?: string; source?: string };
    meta?: Record<string, unknown> | null;
    laporan?: string;
    noFoto?: number; jumlahTotal?: number;
    linkFoto?: unknown[];
    folderUrl?: string;
    draftId?: string | null;
    reportId?: string;
    idempotencyKey?: string;
    kategori?: string;
  };
}

function responseMessage(laporan: string, photoCount: number, folderUrl?: string): string {
  const header = '*LAPORAN SADEWA SATPOL PP PONOROGO*';
  const body = String(laporan || '').trim();
  const photoText = folderUrl
    ? `*Dokumentasi (${photoCount} foto):*\n${folderUrl}`
    : `*Dokumentasi:* ${photoCount} foto (tautan folder belum tersedia)`;
  return `${header}\n\n${body}\n\n${photoText}\n\nLaporan tersimpan di Google Drive dan Google Sheets.`;
}

function normalizePhotoLinks(value: unknown): PhotoLink[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return { link: item, namaFile: '' };
    const v = (item || {}) as Record<string, unknown>;
    const meta = v.meta && typeof v.meta === 'object' ? (v.meta as any) : undefined;
    return {
      link: str(v.link ?? v.url, 500),
      namaFile: str(v.namaFile, 200),
      source: str(v.source, 20),
      meta,
      fileId: str(v.fileId, 120),
      folderId: str(v.folderId, 120),
      folderUrl: str(v.folderUrl, 500),
    };
  }).filter((item) => item.link);
}

function describePhoto(photo: PhotoLink): string {
  const origin = photo.source === 'camera' ? 'kamera langsung' : 'galeri perangkat';
  const gps = photo.meta?.hasGps ? 'dengan koordinat GPS/watermark' : 'tanpa koordinat GPS';
  return `Dokumentasi ${origin}, ${gps}.`;
}

async function generateReportId(req: Request, res: Response, body: SadewaBody) {
  const resolved = await resolveSubcategory(str(body.data?.kategori, 120) || 'kebakaran');
  const storage = resolvedStorageConfig(resolved);
  const categoryCode = (storage.driveFolder || storage.reportSheet || 'LAPORAN').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 16) || 'LAPORAN';
  if (process.env.APPS_SCRIPT_URL) {
    try {
      const response = await fetch(process.env.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'generateReportId', token: process.env.APPS_SCRIPT_TOKEN || '', data: { prefix: categoryCode, categoryCode } }),
        cache: 'no-store',
      } as any);
      const result = await response.json().catch(() => ({} as any));
      const reportId = result?.reportId || result?.data?.reportId;
      if (response.ok && result?.success !== false && reportId) return ok(res, { reportId: String(reportId) });
    } catch {}
  }
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return ok(res, { reportId: `${categoryCode}-${stamp}` });
}

async function uploadFoto(req: Request, res: Response, body: SadewaBody) {
  const foto = body.data?.foto;
  const dataUrl = typeof foto?.data === 'string' ? foto.data : '';
  assertImageDataUrl(dataUrl);
  if (dataUrl.length > MAX_PHOTO_CHARS) throw new ApiError('Ukuran foto melebihi batas upload.', 413, 'payload_too_large');
  const source = foto?.source === 'camera' ? 'camera' : 'gallery';
  const mime = str(foto?.mime, 60) || 'image/jpeg';
  const total = clamp(Number(body.data?.jumlahTotal) || 1, 1, MAX_PHOTOS);
  const index = clamp(Number(body.data?.noFoto) || 1, 1, MAX_PHOTOS);

  const resolved = await resolveSubcategory(str(body.data?.kategori, 120) || 'kebakaran');
  const storage = resolvedStorageConfig(resolved);
  const dynamicFormat = (resolved.subcategory as any)?.format as DynamicFormatConfig | undefined;
  const laporan = str(body.data?.laporan, MAX_TEXT);
  const parsed = dynamicFormat?.fields?.length
    ? parseDynamic(laporan, dynamicFormat).parsed
    : parseReport(laporan);
  const reportDate = parseIndonesianDate((parsed as any).tanggal) ?? new Date();

  const fileName = buildPhotoFileName({
    source, date: reportDate,
    namaDanru: (parsed as any).namaDanru || (parsed as any).danru || (parsed as any).pelapor || '',
    index, total, extension: mimeToExt(mime),
  });

  const result = await uploadPhotoToDateFolder({
    folderMonth: formatMonthFolder(reportDate),
    folderDate: formatDateFolder(reportDate),
    category: storage.driveFolder || storage.displayName || str(body.data?.kategori, 60),
    driveFolder: storage.driveFolder,
    driveRootFolderId: storage.driveRootFolderId,
    reportId: str(body.data?.reportId, 100),
    idempotencyKey: str(body.data?.idempotencyKey, 160),
    fileName, mime, dataUrl,
  });

  return ok(res, {
    linkFile: result.linkFile, fileId: result.fileId, folderId: result.folderId,
    namaFile: result.fileName, folderUrl: result.folderUrl, noFoto: index, storage: result.storage,
  });
}

async function submitLaporan(req: Request, res: Response, body: SadewaBody) {
  const laporan = str(body.data?.laporan, MAX_TEXT);
  if (!laporan) throw new ApiError('Teks laporan wajib diisi.', 400, 'empty_report');

  const resolved = await resolveSubcategory(str(body.data?.kategori, 120) || 'kebakaran');
  const storage = resolvedStorageConfig(resolved);
  const format = ((resolved.subcategory as any)?.format || {}) as DynamicFormatConfig;
  const useDynamic = Array.isArray(format.fields) && format.fields.length > 0;

  let parsed: any; let missingLabels: string[] = [];
  if (useDynamic) {
    const dyn = parseDynamic(laporan, format);
    parsed = dyn.parsed; missingLabels = dyn.missing.map(m => m.label || m.key);
  } else if (resolved.source === 'dynamic') {
    const dyn = parseDynamic(laporan, { fields: [], template: format.template || '' });
    parsed = dyn.parsed; missingLabels = [];
  } else {
    parsed = parseReport(laporan);
    missingLabels = (parsed.missing || []).map((field: keyof typeof FIELD_LABELS) => FIELD_LABELS[field]);
  }
  if (missingLabels.length) throw new ApiError(`Data laporan belum lengkap: ${missingLabels.join(', ')}.`, 400, 'incomplete_report');

  const links = normalizePhotoLinks(body.data?.linkFoto);
  if (links.length < 1 || links.length > MAX_PHOTOS) throw new ApiError(`Kirim 1 sampai ${MAX_PHOTOS} foto sebelum menyimpan laporan.`, 400, 'invalid_photo_count');

  const folderUrl = str(body.data?.folderUrl, 500);
  const categoryCode = storage.reportSheet.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 16) || 'LAPORAN';
  const submitDate = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const reportId = str(body.data?.reportId, 100) || `SLK-${categoryCode}-01/${pad(submitDate.getDate())}${pad(submitDate.getMonth() + 1)}${submitDate.getFullYear()}`;

  const isLegacySlug = resolved.staticKey === 'kebakaran' || resolved.staticKey === 'odnk';
  const useFormatColumns = Boolean(resolved.source === 'dynamic' && format.fields?.length && (storage.spreadsheetId || !isLegacySlug));
  const formatFields = useFormatColumns ? format.fields!.map((f: any) => ({ key: String(f.key), label: String(f.label || f.key) })) : undefined;

  await saveReportWithPhotos(
    { parsed, photos: links, folderUrl, kategori: body.data?.kategori, rawText: laporan, reportId },
    links.map((photo) => ({
      idLaporan: reportId, kategori: body.data?.kategori, tanggal: parsed.tanggal,
      danru: parsed.namaDanru || parsed.danru || parsed.pelapor || '-',
      namaFile: photo.namaFile, source: photo.source || 'camera', meta: photo.meta,
      linkDrive: photo.link, fileId: photo.fileId, folderId: photo.folderId, folderUrl: photo.folderUrl || folderUrl,
      fallbackLat: parsed.latitude ? Number(parsed.latitude) : undefined,
      fallbackLng: parsed.longitude ? Number(parsed.longitude) : undefined,
      ket: describePhoto(photo),
    })),
    (resolved.source === 'dynamic')
      ? { reportSheet: storage.reportSheet, photoSheet: storage.photoSheet, narrativeSheet: storage.narrativeSheet, spreadsheetId: storage.spreadsheetId, formatFields, displayName: storage.displayName }
      : undefined,
  );

  const photoWithGps = links.find((p) => p.meta?.hasGps && Number.isFinite(p.meta?.lat) && Number.isFinite(p.meta?.lng));
  const lat = photoWithGps?.meta?.lat ?? (Number.isFinite(Number(parsed.latitude)) ? Number(parsed.latitude) : null);
  const lng = photoWithGps?.meta?.lng ?? (Number.isFinite(Number(parsed.longitude)) ? Number(parsed.longitude) : null);
  const hasGps = Number.isFinite(lat) && Number.isFinite(lng);
  const alamatFoto = (photoWithGps?.meta as any)?.address || null;
  const waktuFoto = photoWithGps?.meta?.datetime || null;
  await writeRekap({
    reportId, categoryId: (resolved as any).category?.id, subcategoryId: (resolved as any).subcategory?.id,
    categoryName: storage.displayName, subcategoryName: (resolved as any).subcategory?.name || storage.displayName,
    waktuSubmit: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
    tanggal: parsed.tanggal, lokasi: parsed.lokasi, pelapor: parsed.yangMelaporkan || parsed.namaDanru || parsed.danru,
    kronologi: parsed.kronologi, tindakan: parsed.tindakan, keterangan: parsed.keterangan, status: 'TERSIMPAN',
    folderDrive: folderUrl, folderId: links[0]?.folderId, jumlahFoto: links.length,
    photos: links.map(p => ({ link: p.link, namaFile: p.namaFile, fileId: p.fileId, folderId: p.folderId, source: p.source })),
    rawText: laporan.slice(0, 15000),
    sheetNames: (resolved.source === 'dynamic') ? { reportSheet: storage.reportSheet, photoSheet: storage.photoSheet, narrativeSheet: storage.narrativeSheet, spreadsheetId: storage.spreadsheetId } : undefined,
    lat, lng, hasGps, alamatFoto, waktuFoto, googleMaps: parsed.googleMaps || (hasGps ? `https://www.google.com/maps?q=${lat},${lng}` : null),
  } as any);

  let draftRemoved = false;
  const draftId = str(body.data?.draftId, 80);
  if (draftId) {
    const draft = await getDraft(draftId);
    if (draft.exists && draft.jumlahFoto === links.length) draftRemoved = await deleteDraft(draftId);
  }

  return ok(res, {
    jumlahFoto: links.length, draftRemoved,
    ringkasan: { lokasi: parsed.lokasi, hari: parsed.hari, tanggal: parsed.tanggal, danru: parsed.danru, namaDanru: parsed.namaDanru },
    whatsapp: { message: responseMessage(laporan, links.length, folderUrl), folderUrl, ready: true },
  });
}

export async function handleSadewaAction(req: Request, res: Response) {
  try {
    checkRateLimit(req, 'sadewa:post', 180, 60_000);
    const body = (req.body || {}) as SadewaBody;
    switch (body.action) {
      case 'generateReportId': checkRateLimit(req, 'sadewa:id', 30, 60_000); return await generateReportId(req, res, body);
      case 'uploadFoto': checkRateLimit(req, 'sadewa:upload', 40, 60_000); return await uploadFoto(req, res, body);
      case 'submitLaporan': checkRateLimit(req, 'sadewa:submit', 20, 60_000); return await submitLaporan(req, res, body);
      default: throw new ApiError(`Aksi tidak dikenal: ${body.action || '(kosong)'}`, 400, 'unknown_action');
    }
  } catch (e) { return toError(res, e); }
}
