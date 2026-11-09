import { getSpreadsheetId, withSheetsFallback } from './googleAuth';
import { parseReport } from '../parser/whatsapp/parser';
import { formatWib } from '../format';
import { REPORT_HEADERS as CONTRACT_REPORT_HEADERS, PHOTO_HEADERS as CONTRACT_PHOTO_HEADERS } from './schema-contract';
import { CATEGORY_CONFIG, resolveCategory, type ReportCategory } from './category-config';

export const SHEET = {
  reports: { kebakaran: CATEGORY_CONFIG.kebakaran.reportSheet, odnk: CATEGORY_CONFIG.odnk.reportSheet },
  photos: { kebakaran: CATEGORY_CONFIG.kebakaran.photoSheet, odnk: CATEGORY_CONFIG.odnk.photoSheet },
  narratives: { kebakaran: CATEGORY_CONFIG.kebakaran.narrativeSheet, odnk: CATEGORY_CONFIG.odnk.narrativeSheet },
} as const;

function categoryKey(category?: string): ReportCategory {
  return resolveCategory(category);
}

export interface DynamicFormatFieldRef { key: string; label: string }
export interface DynamicSheetNames {
  reportSheet: string; photoSheet: string; narrativeSheet: string; spreadsheetId?: string;
  /** App-driven: when provided, report sheet uses these fields as columns (no hardcoded schema). */
  formatFields?: DynamicFormatFieldRef[];
  displayName?: string;
}

/** Jumlah kolom foto pada sheet INPUT (kolom M sampai V). */
export const PHOTO_COLUMNS = 10;

export { parseReport, buildPhotoFileName, parseIndonesianDate, mimeToExt } from '../parser/whatsapp/parser';
export type { ParsedReport } from '../parser/whatsapp/parser';

/* ── Struktur baris ─────────────────────────────────────────────── */

/** Canonical column order for both report tabs (KEBAKARAN and ODNK). */
export const REPORT_HEADERS = CONTRACT_REPORT_HEADERS;
export const PHOTO_HEADERS = CONTRACT_PHOTO_HEADERS;
export const NARRATIVE_HEADERS = ['Waktu Submit', 'ID Laporan', 'Kategori', 'Narasi Asli', 'Folder Drive'];

export interface PhotoMeta {
  hasGps?: boolean;
  lat?: number | null;
  lng?: number | null;
  datetime?: string | null;
  address?: string | null;
  source?: string;
}

export interface PhotoLink {
  link: string;
  namaFile: string;
  source?: string;
  meta?: PhotoMeta | null;
  fileId?: string;
  folderId?: string;
  folderUrl?: string;
}

export interface ReportRowInput {
  parsed: ReturnType<typeof parseReport>;
  photos: PhotoLink[];
  folderUrl?: string;
  createdAt?: Date;
  kategori?: string;
  rawText?: string;
  reportId?: string;
}

export interface PhotoRowInput {
  idLaporan?: string;
  kategori?: string;
  tanggal: string;
  danru: string;
  namaFile: string;
  source: string;
  meta?: PhotoMeta | null;
  linkDrive: string;
  fileId?: string;
  folderId?: string;
  folderUrl?: string;
  fallbackLat?: number;
  fallbackLng?: number;
  ket?: string;
  createdAt?: Date;
}

/* ── Pembentuk baris (fungsi murni) ──────────────────────────────── */

const DYNAMIC_REPORT_PREFIX = ['Waktu Submit', 'ID Laporan', 'Kategori'] as const;
const DYNAMIC_REPORT_SUFFIX = ['Folder Drive', 'Jumlah Foto', 'Status'] as const;

/** Cegah formula injection saat nilai user-controlled ditulis ke spreadsheet. */
function safeSheetCell(v: string | number | null | undefined): string | number {
  if (v == null) return '-';
  if (typeof v === 'number') return Number.isFinite(v) ? v : '-';
  const s = String(v);
  if (!s) return '-';
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function safeRow(row: (string | number | null | undefined)[]): (string | number)[] {
  return row.map(safeSheetCell);
}

export function buildDynamicReportHeaders(fields: DynamicFormatFieldRef[]): string[] {
  return [...DYNAMIC_REPORT_PREFIX, ...fields.map(f => f.label || f.key), ...DYNAMIC_REPORT_SUFFIX];
}

export function buildDynamicReportRow(input: ReportRowInput, fields: DynamicFormatFieldRef[], displayName: string): (string | number)[] {
  const { parsed, photos } = input;
  const dyn: Record<string, string> = (parsed as any)?.dynamic || {};
  const values = fields.map(f => dyn[f.key] ?? (parsed as any)?.[f.key] ?? '-');
  return safeRow([formatWib(input.createdAt ?? new Date()), input.reportId || parsed.nomorSpt || '-', displayName || '-', ...values, input.folderUrl || '', photos.length, 'DITERIMA']);
}

/** Baris utama laporan di sheet INPUT (skema statis kontrak kebakaran/odnk — fallback legacy). */
export function buildReportRow(input: ReportRowInput): (string | number)[] {
  const { parsed, photos } = input;
  return safeRow([
    formatWib(input.createdAt ?? new Date()), input.reportId || parsed.nomorSpt || '-', categoryKey(input.kategori) === 'odnk' ? 'ODNK' : 'Kebakaran',
    parsed.tanggal || '-', parsed.hari || '-', parsed.lokasi || '-', parsed.latitude || '-', parsed.longitude || '-', parsed.googleMaps || '-',
    parsed.pelapor || '-', parsed.objek || '-', parsed.pemilik || '-', parsed.penghuni || '-', parsed.korban || '-', parsed.penyebab || '-', parsed.kronologi || '-', parsed.tindakan || '-', parsed.kerugian || '-', parsed.hartaTerselamatkan || '-', parsed.luasArea || '-', parsed.jarakTempuh || '-', parsed.estimasiPerjalanan || '-', parsed.waktuLaporan || '-', parsed.waktuBerangkat || '-', parsed.waktuTiba || '-', parsed.waktuMulai || '-', parsed.waktuSelesai || '-', parsed.waktuKembali || '-', parsed.jumlahArmada || '-', parsed.armada || '-', parsed.kendala || '-', parsed.rincianKegiatan || '-', parsed.personil || '-', parsed.yangMelaporkan || '-', input.folderUrl || '', photos.length, 'DITERIMA',
  ]);
}

/** Baris log detail foto di sheet "Detail Foto". */
export function buildPhotoRow(options: PhotoRowInput, displayName?: string): (string | number)[] {
  const meta = options.meta || {};
  const hasExifCoordinates = typeof meta.lat === 'number' && typeof meta.lng === 'number';
  const hasCoordinates = hasExifCoordinates || Boolean(options.fallbackLat !== undefined && options.fallbackLng !== undefined);
  const catLabel = displayName || (options.kategori === 'odnk' ? 'ODNK' : 'Kebakaran');
  return safeRow([
    formatWib(options.createdAt ?? new Date()), options.idLaporan || '', catLabel, options.tanggal || '-',
    options.namaFile || '-', options.linkDrive || '', options.fileId || '', options.folderUrl || '',
    hasCoordinates ? (hasExifCoordinates ? (meta.lat as number) : options.fallbackLat!) : '-', hasCoordinates ? (hasExifCoordinates ? (meta.lng as number) : options.fallbackLng!) : '-',
    hasCoordinates ? `https://www.google.com/maps?q=${hasExifCoordinates ? meta.lat : options.fallbackLat},${hasExifCoordinates ? meta.lng : options.fallbackLng}` : '-', options.source === 'camera' ? 'KAMERA' : options.source === 'gallery' ? 'GALERI' : 'MOBILE',
    hasCoordinates ? 'YA' : 'TIDAK', meta.datetime || '-', meta.address || '-',
    options.ket || '-', 'DITERIMA',
  ]);
}

/* ── Penulisan sheet ─────────────────────────────────────────────── */

async function ensureSheetStructure(): Promise<void> {
  const spreadsheetId = getSpreadsheetId();
  await withSheetsFallback(async sheets => {
    const book = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
    const existing = new Map((book.data.sheets || []).map(sheet => [sheet.properties?.title || '', sheet.properties?.sheetId || 0]));
    const requests: any[] = [];
    for (const definition of [
      { title: SHEET.reports.kebakaran, headers: REPORT_HEADERS },
      { title: SHEET.reports.odnk, headers: REPORT_HEADERS },
      { title: SHEET.photos.kebakaran, headers: PHOTO_HEADERS },
      { title: SHEET.photos.odnk, headers: PHOTO_HEADERS },
      { title: SHEET.narratives.kebakaran, headers: NARRATIVE_HEADERS },
      { title: SHEET.narratives.odnk, headers: NARRATIVE_HEADERS },
    ]) {
      const sheetId = existing.get(definition.title);
      if (sheetId === undefined) requests.push({ addSheet: { properties: { title: definition.title } } });
    }
    if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    const refreshed = requests.length
      ? await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
      : book;
    const byTitle = new Map((refreshed.data.sheets || []).map(sheet => [sheet.properties?.title || '', sheet.properties?.sheetId || 0]));
    const values = [
      { title: SHEET.reports.kebakaran, headers: REPORT_HEADERS },
      { title: SHEET.reports.odnk, headers: REPORT_HEADERS },
      { title: SHEET.photos.kebakaran, headers: PHOTO_HEADERS },
      { title: SHEET.photos.odnk, headers: PHOTO_HEADERS },
      { title: SHEET.narratives.kebakaran, headers: NARRATIVE_HEADERS },
      { title: SHEET.narratives.odnk, headers: NARRATIVE_HEADERS },
    ];
    for (const definition of values) {
      const sheetId = byTitle.get(definition.title);
      if (!sheetId) continue;
      await sheets.spreadsheets.values.update({ spreadsheetId, range: `'${definition.title.replace(/'/g, "''")}'!A1`, valueInputOption: 'RAW', requestBody: { values: [Array.from(definition.headers)] } });
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId, title: definition.title, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } }, { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.12, green: 0.31, blue: 0.47 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } }] } });
    }
  });
}

let sheetsEnsuredAt = 0;
async function appendRows(sheetName: string, rows: (string | number)[][], opts?: { spreadsheetId?: string; skipEnsure?: boolean; headers?: readonly string[] | string[]; replaceHeaders?: boolean }): Promise<void> {
  if (!rows.length) return;
  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  // Direct API path: ensure static structure (throttled). Apps Script path: app mengirim headers (skema dikendalikan app).
  if (!appsScriptUrl) {
    if (!opts?.skipEnsure && Date.now() - sheetsEnsuredAt > 10 * 60_000) { await ensureSheetStructure().catch(() => {}); sheetsEnsuredAt = Date.now(); }
  }
  if (appsScriptUrl) {
    const response = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'submit',
        token: process.env.APPS_SCRIPT_TOKEN || '',
        data: { reportId: String(rows[0][1] || ''), sheetName, rows, headers: opts?.headers ? Array.from(opts.headers) : undefined, replaceHeaders: Boolean(opts?.replaceHeaders), spreadsheetId: opts?.spreadsheetId || undefined },
      }),
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({} as any)) as { success?: boolean; message?: string };
    if (!response.ok || result.success === false) throw new Error(result.message || 'Apps Script gagal menulis spreadsheet.');
    return;
  }
  const spreadsheetId = opts?.spreadsheetId || getSpreadsheetId();
  try {
    await withSheetsFallback(sheets =>
      sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${sheetName.replace(/'/g, "''")}'!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: rows },
      } as never),
    );
  } catch (error) {
    const status = (error as { code?: number; response?: { data?: { error?: { message?: string } } } })?.code;
    const detail = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
    if (status === 404) {
      throw new Error(
        `Spreadsheet tidak ditemukan atau tidak dapat diakses. Periksa GOOGLE_SHEET_ID (${spreadsheetId}) dan pastikan akun OAuth/service account memiliki akses Editor. Pastikan tab ${sheetName} sudah tersedia. Detail Google: ${detail || 'NOT_FOUND'}`,
      );
    }
    throw error;
  }
}

/** Tulis baris laporan beserta seluruh detail foto. App-driven: dynamic menerima headers/sheet/spreadsheet dari admin; formatFields menghasilkan kolom laporan sesuai format. */
export async function saveReportWithPhotos(
  report: ReportRowInput,
  photos: PhotoRowInput[],
  dynamic?: DynamicSheetNames,
): Promise<void> {
  const isDynamic = Boolean(dynamic);
  const hasFormat = Boolean(isDynamic && dynamic!.formatFields && dynamic!.formatFields.length);
  const category = categoryKey(report.kategori);
  const displayCat = dynamic?.displayName || (isDynamic ? (dynamic!.reportSheet || 'LAPORAN') : (category === 'odnk' ? 'ODNK' : 'Kebakaran'));

  const reportHeaders = hasFormat ? buildDynamicReportHeaders(dynamic!.formatFields!) : Array.from(REPORT_HEADERS);
  const reportRows = hasFormat
    ? [buildDynamicReportRow({ ...report }, dynamic!.formatFields!, displayCat)]
    : [buildReportRow({ ...report, kategori: isDynamic ? undefined : report.kategori })];
  if (!hasFormat && isDynamic && reportRows[0]) reportRows[0][2] = displayCat;

  const photoRows = photos.map(p => buildPhotoRow(p, isDynamic ? displayCat : undefined));
  if (!isDynamic) { /* legacy rows already carry static label */ }

  const narrativeRows = [safeRow([formatWib(report.createdAt ?? new Date()), report.reportId || report.parsed.nomorSpt || '-', displayCat, report.rawText || report.parsed.keterangan || '-', report.folderUrl || ''])];
  const reportSheet = dynamic?.reportSheet || SHEET.reports[category];
  const photoSheet = dynamic?.photoSheet || SHEET.photos[category];
  const narrativeSheet = dynamic?.narrativeSheet || SHEET.narratives[category];
  const base = { spreadsheetId: dynamic?.spreadsheetId, skipEnsure: isDynamic };
  await appendRows(reportSheet, reportRows, { ...base, headers: reportHeaders, replaceHeaders: hasFormat });
  if (photoRows.length) await appendRows(photoSheet, photoRows, { ...base, headers: Array.from(PHOTO_HEADERS) });
  await appendRows(narrativeSheet, narrativeRows, { ...base, headers: Array.from(NARRATIVE_HEADERS) });
}
