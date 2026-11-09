import {
  buildPhotoFileName,
  FIELD_LABELS,
  formatDateFolder,
  formatMonthFolder,
  mimeToExt,
  parseIndonesianDate,
  parseReport,
} from '@/lib/parser/whatsapp/parser';
import { parseDynamic, type DynamicFormatConfig } from '@/lib/parser/dynamic/parse';
import { uploadPhotoToDateFolder } from '@/lib/server/googleDrive';
import { saveReportWithPhotos, type PhotoLink } from '@/lib/server/googleSheets';
import { deleteDraft, getDraft } from '@/lib/server/drafts';
import { ApiError, assertImageDataUrl, checkRateLimit, ok, readJson, route, str } from '@/lib/server/http';
import { MAX_PHOTOS } from '@/lib/constants';
import { resolveSubcategory, resolvedStorageConfig, writeRekap } from '@/lib/server/dynamicConfig';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_TEXT = 20_000;
const MAX_PHOTO_CHARS = 6 * 1024 * 1024;

interface SadewaBody {
  action?: string;
  data?: {
    foto?: { data?: string; mime?: string; source?: string };
    meta?: Record<string, unknown> | null;
    laporan?: string;
    noFoto?: number;
    jumlahTotal?: number;
    linkFoto?: unknown[];
    folderUrl?: string;
    draftId?: string | null;
    reportId?: string;
    idempotencyKey?: string;
    kategori?: 'kebakaran' | 'odnk';
  };
}

/** Endpoint aksi untuk alur Sadewa: foto → Drive, data → Spreadsheet. */
export async function POST(request: Request) {
  return route(async () => {
    checkRateLimit(request, 'sadewa:post', 180, 60_000); // generous: id + up to 20 uploads + submit + retries
    const body = await readJson<SadewaBody>(request);

    switch (body.action) {
      case 'generateReportId':
        checkRateLimit(request, 'sadewa:id', 30, 60_000);
        return generateReportId(body);
      case 'uploadFoto':
        checkRateLimit(request, 'sadewa:upload', 40, 60_000);
        return uploadFoto(body);
      case 'submitLaporan':
        checkRateLimit(request, 'sadewa:submit', 20, 60_000);
        return submitLaporan(body);
      default:
        throw new ApiError(
          `Aksi tidak dikenal: ${body.action || '(kosong)'}`,
          400,
          'unknown_action',
        );
    }
  });
}

async function generateReportId(body: SadewaBody) {
  const resolved = await resolveSubcategory(str(body.data?.kategori, 120) || 'kebakaran');
  const storage = resolvedStorageConfig(resolved);
  const categoryCode = (storage.driveFolder || storage.reportSheet || 'LAPORAN').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 16) || 'LAPORAN';
  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  if (appsScriptUrl) {
    const response = await fetch(appsScriptUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'generateReportId', token: process.env.APPS_SCRIPT_TOKEN || '', data: { prefix: categoryCode, categoryCode } }),
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({} as any)) as { success?: boolean; reportId?: string; data?: { reportId?: string }; message?: string };
    const reportId = result.reportId || result.data?.reportId;
    if (response.ok && result.success !== false && reportId) return ok({ reportId });
    // fall through to local ID if Apps Script can't generate (e.g. unsupported dynamic category) — still functional
  }
  const now = new Date();
  const stamp = `${String(now.getDate()).padStart(2,'0')}${String(now.getMonth()+1).padStart(2,'0')}${now.getFullYear()}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
  return ok({ reportId: `${categoryCode}-${stamp}` });
}

async function uploadFoto(body: SadewaBody) {
  const foto = body.data?.foto;
  const dataUrl = typeof foto?.data === 'string' ? foto.data : '';
  assertImageDataUrl(dataUrl, 'foto');
  if (dataUrl.length > MAX_PHOTO_CHARS) {
    throw new ApiError('Ukuran foto melebihi batas upload.', 413, 'payload_too_large');
  }

  const source = foto?.source === 'camera' ? 'camera' : 'gallery';
  const mime = str(foto?.mime, 60) || 'image/jpeg';
  const total = clamp(Number(body.data?.jumlahTotal) || 1, 1, MAX_PHOTOS);
  const index = clamp(Number(body.data?.noFoto) || 1, 1, MAX_PHOTOS);

  const resolved = await resolveSubcategory(str(body.data?.kategori, 120) || 'kebakaran');
  const storage = resolvedStorageConfig(resolved);
  const dynamicFormat = (resolved.subcategory as any)?.format as DynamicFormatConfig | undefined;
  const parsed = (dynamicFormat && Array.isArray(dynamicFormat.fields) && dynamicFormat.fields.length)
    ? (parseDynamic(str(body.data?.laporan, MAX_TEXT), dynamicFormat) as any).parsed
    : parseReport(str(body.data?.laporan, MAX_TEXT));
  const reportDate = parseIndonesianDate(parsed.tanggal) ?? new Date();

  const fileName = buildPhotoFileName({
    source,
    date: reportDate,
    namaDanru: parsed.namaDanru || parsed.danru || parsed.pelapor || '',
    index,
    total,
    extension: mimeToExt(mime),
  });

  const result = await uploadPhotoToDateFolder({
    folderMonth: formatMonthFolder(reportDate),
    folderDate: formatDateFolder(reportDate),
    category: storage.driveFolder || storage.displayName || str(body.data?.kategori, 60),
    driveFolder: storage.driveFolder,
    driveRootFolderId: storage.driveRootFolderId,
    reportId: str(body.data?.reportId, 100),
    idempotencyKey: str(body.data?.idempotencyKey, 160),
    fileName,
    mime,
    dataUrl,
  });

  return ok({
    linkFile: result.linkFile,
    fileId: result.fileId,
    folderId: result.folderId,
    namaFile: result.fileName,
    folderUrl: result.folderUrl,
    noFoto: index,
    storage: result.storage,
  });
}

async function submitLaporan(body: SadewaBody) {
  const laporan = str(body.data?.laporan, MAX_TEXT);
  if (!laporan) {
    throw new ApiError('Teks laporan kosong. Tempel teks laporan lebih dulu.', 400, 'empty_report');
  }

  const resolved = await resolveSubcategory(str(body.data?.kategori, 120) || 'kebakaran');
  const storage = resolvedStorageConfig(resolved);
  const format = (resolved.subcategory as any)?.format as DynamicFormatConfig | undefined;
  const useDynamic = Boolean(format && Array.isArray(format.fields) && format.fields.length);

  let parsed: any;
  let missingLabels: string[] = [];
  if (useDynamic) {
    const dyn = parseDynamic(laporan, format!);
    parsed = dyn.parsed;
    missingLabels = dyn.missing.map(m => m.label || m.key);
  } else if (resolved.source === 'dynamic') {
    // subkategori dinamis tanpa format.fields terdefinisi: parse best-effort, jangan paksa validasi statis kebakaran/odnk
    const dyn = parseDynamic(laporan, { fields: [], template: (format as any)?.template || '' });
    parsed = dyn.parsed;
    missingLabels = [];
  } else {
    parsed = parseReport(laporan);
    missingLabels = parsed.missing.map((field: any) => FIELD_LABELS[field as keyof typeof FIELD_LABELS] || String(field));
  }
  if (missingLabels.length) {
    throw new ApiError(`Bagian laporan belum lengkap: ${missingLabels.join(', ')}. Lengkapi lalu kirim ulang.`, 400, 'incomplete_report');
  }

  const links = normalizePhotoLinks(body.data?.linkFoto);
  if (!links.length || links.length > MAX_PHOTOS) {
    throw new ApiError(`Jumlah foto harus antara 1 dan ${MAX_PHOTOS}.`, 400, 'invalid_photo_count');
  }

  const folderUrl = str(body.data?.folderUrl, 500);
  const categoryCode = storage.reportSheet.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 16) || 'LAPORAN';
  const submitDate = new Date();
  const reportId = str(body.data?.reportId, 100) || `SLK-${categoryCode}-01/${String(submitDate.getDate()).padStart(2, '0')}${String(submitDate.getMonth() + 1).padStart(2, '0')}${submitDate.getFullYear()}`;

  const isLegacySlug = resolved.staticKey === 'kebakaran' || resolved.staticKey === 'odnk';
  const useFormatColumns = Boolean(
    resolved.source === 'dynamic' && format && Array.isArray((format as any).fields) && (format as any).fields.length
    && (storage.spreadsheetId || !isLegacySlug)
  );
  const formatFields = useFormatColumns ? (format as any).fields.map((f: any) => ({ key: String(f.key), label: String(f.label || f.key) })) : undefined;
  await saveReportWithPhotos(
    { parsed, photos: links, folderUrl, kategori: body.data?.kategori, rawText: laporan, reportId },
    links.map(photo => ({
      idLaporan: reportId,
      kategori: body.data?.kategori,
      tanggal: parsed.tanggal,
      danru: parsed.namaDanru || parsed.danru || parsed.pelapor || '-',
      namaFile: photo.namaFile,
      source: photo.source || 'camera',
      meta: photo.meta,
      linkDrive: photo.link,
      fileId: photo.fileId,
      folderId: photo.folderId,
      folderUrl: photo.folderUrl || folderUrl,
      fallbackLat: parsed.latitude ? Number(parsed.latitude) : undefined,
      fallbackLng: parsed.longitude ? Number(parsed.longitude) : undefined,
      ket: describePhoto(photo),
    })),
    (resolved.source === 'dynamic') ? { reportSheet: storage.reportSheet, photoSheet: storage.photoSheet, narrativeSheet: storage.narrativeSheet, spreadsheetId: storage.spreadsheetId, formatFields, displayName: storage.displayName } : undefined,
  );

  const photoWithGps = links.find(p => (p.meta as any)?.hasGps && typeof (p.meta as any)?.lat === 'number' && typeof (p.meta as any)?.lng === 'number');
  const lat = (photoWithGps?.meta as any)?.lat ?? (parsed.latitude ? Number(parsed.latitude) : null);
  const lng = (photoWithGps?.meta as any)?.lng ?? (parsed.longitude ? Number(parsed.longitude) : null);
  const alamatFoto = (photoWithGps?.meta as any)?.address || null;
  const waktuFoto = (photoWithGps?.meta as any)?.datetime || null;
  const folderId = links.find(p => p.folderId)?.folderId || '';
  const photos = links.map(p => ({ link: p.link || '', namaFile: p.namaFile || '', fileId: p.fileId || '', folderId: p.folderId || '', source: p.source || 'camera' }));
  const sheetNames: any = { reportSheet: storage.reportSheet, photoSheet: storage.photoSheet, narrativeSheet: storage.narrativeSheet };
  if (storage.spreadsheetId) sheetNames.spreadsheetId = storage.spreadsheetId;
  await writeRekap({
    reportId, categoryId: storage.categoryId, subcategoryId: storage.subcategoryId,
    categoryName: resolved.category?.name, subcategoryName: storage.displayName,
    waktuSubmit: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
    tanggal: parsed.tanggal || '', lokasi: parsed.lokasi || '', pelapor: parsed.pelapor || parsed.yangMelaporkan || parsed.namaDanru || '',
    kronologi: parsed.kronologi || '', tindakan: parsed.tindakan || '', keterangan: parsed.keterangan || '',
    status: 'TERSIMPAN', folderDrive: folderUrl, folderId, jumlahFoto: links.length, photos,
    rawText: laporan.slice(0, 15000), sheetNames,
    lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null,
    hasGps: Boolean(Number.isFinite(lat) && Number.isFinite(lng)),
    alamatFoto, waktuFoto, googleMaps: parsed.googleMaps || (Number.isFinite(lat) && Number.isFinite(lng) ? `https://www.google.com/maps?q=${lat},${lng}` : null),
    deleted: false,
  });

  // Draft adalah salinan sementara: hapus setelah laporan resmi tersimpan,
  // tetapi hanya bila jumlah foto sama agar tidak ada data yang hilang.
  const draftId = str(body.data?.draftId, 80);
  let draftRemoved = false;
  if (draftId) {
    const draft = await getDraft(draftId);
    if (draft.exists && draft.jumlahFoto === links.length) {
      await deleteDraft(draftId);
      draftRemoved = true;
    }
  }

  return ok({
    jumlahFoto: links.length,
    draftRemoved,
    ringkasan: {
      lokasi: parsed.lokasi,
      hari: parsed.hari,
      tanggal: parsed.tanggal,
      danru: parsed.danru,
      namaDanru: parsed.namaDanru,
    },
    whatsapp: {
      message: responseMessage(laporan, links.length, folderUrl),
      folderUrl,
      ready: true,
    },
  });
}

function responseMessage(
  laporan: string,
  photoCount: number,
  folderUrl: string,
) {
  const lines = [
    '*LAPORAN SADEWA SATPOL PP PONOROGO*',
    '',
    laporan.trim(),
    '',
    `*Dokumentasi (${photoCount} foto):*`,
    folderUrl || '(album dokumentasi belum tersedia)',
    '',
    'Laporan tersimpan di Google Drive dan Google Sheets.',
  ];
  return lines.join('\n');
}

function normalizePhotoLinks(value: unknown): PhotoLink[] {
  if (!Array.isArray(value)) return [];
  const links: PhotoLink[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const link = item.trim();
      if (link) links.push({ link, namaFile: link.split('/').pop() || 'foto' });
      continue;
    }
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const link = str(record.link || record.url, 500);
      if (!link) continue;
      links.push({
        link,
        namaFile: str(record.namaFile, 200) || link.split('/').pop() || 'foto',
        source: str(record.source, 20) || 'camera',
        meta: (record.meta as PhotoLink['meta']) ?? null,
        fileId: str(record.fileId, 200),
        folderId: str(record.folderId, 200),
        folderUrl: str(record.folderUrl, 500),
      });
    }
  }
  return links;
}

function describePhoto(photo: PhotoLink): string {
  const source = photo.source === 'camera' ? 'kamera' : 'galeri';
  if (photo.meta?.hasGps) {
    return source === 'kamera'
      ? 'Foto kamera dengan GPS. Koordinat terverifikasi.'
      : 'Foto galeri dengan deteksi lokasi otomatis via OCR.';
  }
  return source === 'kamera'
    ? 'Foto kamera tanpa data GPS EXIF.'
    : 'Foto galeri. Lokasi dari input manual.';
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}
