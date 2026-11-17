/** Parser laporan operasional Satpol PP dari format WhatsApp. */
const MONTH_INDEX: Record<string, number> = {
  januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
  juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
};

// Identitas bersifat opsional karena laporan evakuasi/non-kebakaran dapat memakai
// objek (mis. Kucing) dan laporan kebakaran dapat tidak mencantumkan pemilik.
export const REQUIRED_FIELDS = ['lokasi', 'hari', 'tanggal', 'personil', 'danru'] as const;
export type ReportField = (typeof REQUIRED_FIELDS)[number];
export const FIELD_LABELS: Record<ReportField, string> = {
  lokasi: 'Lokasi kejadian', hari: 'Hari', tanggal: 'Tanggal',
  personil: 'Personil Satpol PP', danru: 'Regu / Danru',
};

/* ------------------------------------------------------------------ */
/* Daftar label. Urutan penting: label yang lebih spesifik lebih dulu. */
/* optionalColon: label boleh tanpa titik dua (mis. *Kronologi*).      */
/* ------------------------------------------------------------------ */
interface LabelDef { key: string; pattern: string; optionalColon?: boolean }

const LABELS: LabelDef[] = [
  { key: 'header', pattern: 'Mohon\\s+ij[iì]n\\s+Melaporkan[^:\\n*]*', optionalColon: true },
  { key: 'nomorSpt', pattern: 'NOMOR\\s*SPT' },
  { key: 'objek', pattern: 'OBJEK|JENIS\\s+KEJADIAN' },
  { key: 'hariTanggal', pattern: 'HARI\\s*(?:(?:DAN|&|,|/)\\s*)?TANGGAL(?:\\s+PELAKSANAAN(?:NYA)?)?' },
  { key: 'tanggal', pattern: 'TANGGAL(?:\\s+PELAKSANAAN(?:NYA)?)?' },
  { key: 'hari', pattern: 'HARI' },
  { key: 'laporanMasuk', pattern: 'LAPORAN\\s+MASUK' },
  { key: 'berangkat', pattern: 'WAKTU\\s+BERANGKAT|BERANGKAT' },
  { key: 'tiba', pattern: 'TIBA\\s+DI\\s*LOKASI' },
  { key: 'mulai', pattern: 'MULAI\\s+KEGIATAN' },
  { key: 'selesai', pattern: 'SELESAI\\s+KEGIATAN' },
  { key: 'kembali', pattern: 'TIBA\\s+KEMBALI(?:\\s+DI\\s+MAKO)?' },
  { key: 'lokasi', pattern: 'LOKASI(?:\\s+KEJADIAN)?|ALAMAT(?:\\s+KEJADIAN)?' },
  { key: 'gps', pattern: 'GPS|KOORDINAT', optionalColon: true },
  { key: 'jarak', pattern: 'JARAK\\s+TEMPUH(?:\\s+PERJALANAN)?' },
  { key: 'estimasi', pattern: 'ESTIMASI\\s+WAKTU(?:\\s+PERJALANAN)?' },
  { key: 'pelapor', pattern: 'PEMBERI\\s+INFORMASI(?:\\s*\\(\\s*PELAPOR\\s*/\\s*PEMOHON\\s*\\))?|PELAPOR\\s*/\\s*PEMOHON|PELAPOR|PEMOHON' },
  { key: 'pemilik', pattern: 'PEMILIK(?:\\s*NYA)?' },
  { key: 'penghuni', pattern: 'JUMLAH\\s+PENGHUNI(?:\\s+RUMAH)?(?:\\s+YANG\\s+TERDAMPAK)?' },
  { key: 'luas', pattern: 'LUAS\\s+AREA(?:\\s+(?:YANG\\s+)?TERBAKAR)?|LUAS\\s+TERBAKAR' },
  { key: 'areal', pattern: 'AREAL?\\s+YANG\\s+TERBAKAR' },
  { key: 'korban', pattern: 'KORBAN' },
  { key: 'kendala', pattern: 'KENDALA' },
  { key: 'penyebab', pattern: 'PENYEBAB(?:\\s+KEBAKARAN)?' },
  { key: 'kronologi', pattern: 'KRONOLOGI(?:\\s+KEJADIAN)?', optionalColon: true },
  { key: 'kerugian', pattern: 'PERKIRAAN\\s+KERUGIAN|KERUGIAN' },
  { key: 'harta', pattern: 'PERKIRAAN\\s+HARTA(?:\\s+BENDA)?\\s+YANG\\s+TERSELAMATKAN|(?:HARTA\\s+)?BENDA\\s+YANG\\s+TERSELAMATKAN|HARTA\\s+BENDA\\s+TERSELAMATKAN' },
  { key: 'tindakan', pattern: 'TINDAKAN', optionalColon: true },
  { key: 'rincian', pattern: 'RINCIAN\\s+KEGIATAN' },
  { key: 'armada', pattern: 'JUMLAH\\s+UNIT\\s+KENDARA(?:AN|KAN)(?:\\s+YANG\\s+DIGUNAKAN)?|JUMLAH\\s+(?:KENDARAAN|ARMADA)(?:\\s+YANG\\s+DIGUNAKAN)?' },
  { key: 'personil', pattern: 'PERSONIL(?:\\s+YANG\\s+TERLIBAT)?' },
  { key: 'penutup', pattern: 'Pelaksanaan\\s+kegiatan\\s+tersebut|Demikian\\s+yang', optionalColon: true },
  { key: 'dokumentasi', pattern: 'DOKUMENTASI(?:\\s+TERLAMPIR)?', optionalColon: true },
  { key: 'melaporkan', pattern: 'YANG\\s+MELAPORKAN' },
  { key: 'tembusan', pattern: 'TEMBUSAN' },
];

const MARK_OPEN = '\u0001';
const MARK_CLOSE = '\u0002';

/** Normalisasi dasar: karakter tak terlihat, CRLF, bullet menjadi baris baru. */
function normalizeRaw(text: string): string {
  return String(text || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]*[•●▪‣◦][ \t]*/g, '\n');
}

function stripMarkup(text: string): string {
  return text
    .replace(/[*~`]/g, ' ')
    .replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, ' ');
}

/** Teks bersih tanpa penanda format WhatsApp (dipertahankan untuk kompatibilitas). */
export function cleanReportText(text: string): string {
  return stripMarkup(normalizeRaw(text))
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Sisipkan penanda pada setiap label yang dikenali. */
function markLabels(raw: string): string {
  let t = normalizeRaw(raw)
    // GPS kadang menempel di akhir alamat pada baris yang sama.
    .replace(/[ \t]*\b(GPS|KOORDINAT)\b(?=[ \t]*[:：]?[ \t]*[-+]?\d)/gi, '\n$1');

  // Tahap 1: label tebal WhatsApp: *LABEL :*  /  *Kronologi*  /  *Areal*:
  for (const { key, pattern } of LABELS) {
    t = t.replace(
      new RegExp(`\\*[ \\t]*(?:${pattern})[ \\t]*[:：]?[ \\t]*\\*(?:[ \\t]*[:：])?`, 'gi'),
      `\n${MARK_OPEN}${key}${MARK_CLOSE} `,
    );
  }
  // Tahap 2: label tanpa tanda bintang, harus di awal baris.
  for (const { key, pattern, optionalColon } of LABELS) {
    t = t.replace(
      new RegExp(`(^|\\n)[ \\t]*(?:${pattern})(?![\\p{L}\\p{N}])[ \\t]*${optionalColon ? '[:：]?' : '[:：]'}[ \\t]*`, 'giu'),
      (_m, nl: string) => `${nl}\n${MARK_OPEN}${key}${MARK_CLOSE} `,
    );
  }
  return t;
}

function splitSections(raw: string): Record<string, string> {
  const marked = stripMarkup(markLabels(raw));
  const parts = marked.split(new RegExp(`${MARK_OPEN}(\\w+)${MARK_CLOSE}`));
  const sections: Record<string, string> = {};
  for (let i = 1; i < parts.length; i += 2) {
    if (!(parts[i] in sections)) sections[parts[i]] = parts[i + 1] || '';
  }
  return sections;
}

/** Rapikan satu baris: spasi, tanda baca di awal/akhir. "-" saja = kosong. */
function tidy(line: string, keepDot = false): string {
  let v = line.replace(/\s+/g, ' ').replace(/^[\s.:;,\-–—]+/, '').replace(/[\s;,]+$/, '');
  if (!keepDot) v = v.replace(/[\s.]+$/, '');
  return v.trim();
}
function linesOf(value = '', keepDot = false): string[] {
  return value.split('\n').map((l) => tidy(l, keepDot)).filter(Boolean);
}
const single = (value = '', keepDot = false) => linesOf(value, keepDot).join(' ');

function normalizeDay(value: string): string {
  const day = value.replace(/,.*$/, '').trim().toLowerCase().replace(/[’'‘`´\s]/g, '');
  const names: Record<string, string> = {
    senin: 'Senin', selasa: 'Selasa', rabu: 'Rabu', kamis: 'Kamis',
    jumat: 'Jumat', sabtu: 'Sabtu', minggu: 'Minggu',
  };
  return names[day] || value.replace(/,.*$/, '').trim();
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const DATE_RE = /(\d{1,2}\s+[A-Za-zÀ-ÿ]+\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/;
const DAY_BEFORE_RE = /([A-Za-zÀ-ÿ]+(?:['’‘`´][A-Za-zÀ-ÿ]+)?)\s*,?\s*$/;

function extractDayDate(source: string): { hari: string; tanggal: string } {
  const m = DATE_RE.exec(source);
  if (!m) return { hari: '', tanggal: '' };
  const before = source.slice(0, m.index);
  const d = DAY_BEFORE_RE.exec(before);
  const candidate = d ? normalizeDay(d[1]) : '';
  const isDay = DAY_NAMES.includes(candidate);
  return { hari: isDay ? candidate : '', tanggal: m[1].replace(/\s+/g, ' ').trim() };
}

function normalizeTime(value: string): string {
  const s = String(value || '').replace(/wib|wita|wit/gi, ' ').replace(/\s+/g, ' ').trim();
  const m = /(\d{1,2})\s*[.:,]\s*(\d{1,2})(?:\s*[.:,]\s*(\d{1,2}))?/.exec(s);
  if (m) return `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')} WIB`;
  const h = /(\d{1,2})\s*(?:jam|j)\b/i.exec(s);
  if (h) return `${h[1].padStart(2, '0')}.00 WIB`;
  return '';
}

function parseGps(value: string): { latitude: string; longitude: string } {
  let raw = String(value || '').replace(/[°º]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return { latitude: '', longitude: '' };
  raw = raw.replace(/(\d)[\s]+([.,])[\s]*(\d)/g, '$1$2$3').replace(/([.,][\d]+)[\s]+(\d)/g, '$1$2');
  const m = /([-+]?\d+(?:[.,]\d+)?)\s*([NSns])?\s*[,;\s/]+\s*([-+]?\d+(?:[.,]\d+)?)\s*([EWew])?/.exec(raw)
    || /([-+]?\d+(?:[.,]\d+)?)\s*[,;\s/]+\s*([-+]?\d+(?:[.,]\d+)?)/.exec(raw);
  if (m) {
    const hasDir = /[NSEWnsew]/.test(m[0]);
    let lat = m[1].replace(',', '.').replace(/^\+/, '');
    let lng = (hasDir ? m[3] : m[2]).replace(',', '.').replace(/^\+/, '');
    if (hasDir && /s/i.test(m[2] || '') && !lat.startsWith('-')) lat = `-${lat}`;
    if (hasDir && /w/i.test(m[4] || '') && !lng.startsWith('-')) lng = `-${lng}`;
    return { latitude: lat, longitude: lng };
  }
  const nums = raw.match(/-?\d{1,3}[.,]\d{3,}/g);
  if (nums && nums.length >= 2) return { latitude: nums[0].replace(',', '.'), longitude: nums[1].replace(',', '.') };
  return { latitude: '', longitude: '' };
}

export interface ParsedReport {
  nomorSpt: string; lokasi: string; hari: string; tanggal: string;
  identitas: string; pelapor: string; pemilik: string; objek: string; penghuni: string;
  latitude: string; longitude: string; googleMaps: string;
  korban: string; penyebab: string; kronologi: string; tindakan: string;
  kerugian: string; hartaTerselamatkan: string; luasArea: string;
  jarakTempuh: string; estimasiPerjalanan: string; waktuLaporan: string;
  waktuBerangkat: string; waktuTiba: string; waktuMulai: string;
  waktuSelesai: string; waktuKembali: string; armada: string;
  personil: string; danru: string; namaDanru: string; yangMelaporkan: string; jumlahArmada: string; kendala: string;
  rincianKegiatan: string; keterangan: string; missing: ReportField[];
}

export function parseReport(rawText: string): ParsedReport {
  const sec = splitSections(rawText);
  const plain = cleanReportText(rawText);

  // Hari & tanggal
  let { hari, tanggal } = extractDayDate(sec.hariTanggal || '');
  if (!tanggal) {
    const t = extractDayDate(`${sec.hari || ''} ${sec.tanggal || ''}`);
    tanggal = t.tanggal;
    hari = hari || t.hari;
  }
  if (!tanggal) {
    const t = extractDayDate(plain);
    tanggal = t.tanggal;
    hari = hari || t.hari;
  }
  if (!hari && sec.hari) hari = normalizeDay(single(sec.hari));
  if (!hari && tanggal) {
    const d = parseIndonesianDate(tanggal);
    if (d) hari = DAY_NAMES[d.getDay()];
  }

  // GPS
  const gps = parseGps(sec.gps || '');
  const googleMaps = gps.latitude && gps.longitude
    ? `https://www.google.com/maps?q=${gps.latitude},${gps.longitude}` : '';

  // Armada: "2 unit" + daftar plat/nama kendaraan
  let jumlahArmada = '';
  const armadaRest = linesOf(sec.armada).map((l) => {
    const m = /^\(?\s*(\d+)\s*unit\b\)?\s*/i.exec(l);
    if (m && !jumlahArmada) { jumlahArmada = m[1]; return l.slice(m[0].length); }
    return l;
  }).map((l) => l.replace(/[()]/g, '').trim()).filter(Boolean);
  if (!jumlahArmada && armadaRest.length) jumlahArmada = String(armadaRest.length);

  // Yang melaporkan: "SARJUNO, S. Sos Komandan Regu C Satpol PP Ponorogo."
  const melaporkan = single(sec.melaporkan, true);
  const cm = /^(.*?)\s*Komandan\s+Regu\s+([A-Za-z])\b/i.exec(melaporkan);
  const namaDanru = cm ? tidy(cm[1], true) : tidy(linesOf(sec.melaporkan, true)[0] || '', true);
  const reguLetter = cm?.[2]
    || /\bRegu\s+([A-Z])\b/.exec(`${single(sec.personil)} ${single(sec.rincian)}`)?.[1]
    || /\bRegu\s+([A-Z])\s+(?:Damkar|Satpol\s+PP)/i.exec(plain)?.[1]
    || '';
  const danru = reguLetter ? `Regu ${reguLetter.toUpperCase()}` : '';

  const objek = single(sec.objek) || single(sec.header);
  const pelapor = single(sec.pelapor);
  const pemilik = single(sec.pemilik);

  const parsed: ParsedReport = {
    nomorSpt: single(sec.nomorSpt),
    lokasi: single(sec.lokasi),
    hari,
    tanggal,
    identitas: pemilik || objek || pelapor,
    pelapor,
    pemilik,
    objek,
    penghuni: single(sec.penghuni),
    latitude: gps.latitude,
    longitude: gps.longitude,
    googleMaps,
    korban: single(sec.korban),
    penyebab: single(sec.penyebab),
    kronologi: single(sec.kronologi, true),
    tindakan: single(sec.tindakan, true),
    kerugian: single(sec.kerugian),
    hartaTerselamatkan: single(sec.harta),
    luasArea: single(sec.luas) || single(sec.areal),
    jarakTempuh: single(sec.jarak),
    estimasiPerjalanan: single(sec.estimasi),
    waktuLaporan: normalizeTime(sec.laporanMasuk || ''),
    waktuBerangkat: normalizeTime(sec.berangkat || ''),
    waktuTiba: normalizeTime(sec.tiba || ''),
    waktuMulai: normalizeTime(sec.mulai || ''),
    waktuSelesai: normalizeTime(sec.selesai || ''),
    waktuKembali: normalizeTime(sec.kembali || ''),
    armada: armadaRest.join(', '),
    personil: linesOf(sec.personil).join('\n'),
    danru,
    namaDanru,
    yangMelaporkan: namaDanru,
    jumlahArmada,
    kendala: single(sec.kendala),
    rincianKegiatan: single(sec.rincian, true),
    keterangan: single(sec.kronologi, true),
    missing: [],
  };
  parsed.missing = REQUIRED_FIELDS.filter((field) => !parsed[field]);
  return parsed;
}

/** Tanggal Indonesia ("Sabtu, 26 September 2026") menjadi Date. */
export function parseIndonesianDate(value: string): Date | null {
  if (!value) return null;
  const normalized = value.replace(/^[A-Za-z]+,?\s*/i, '').trim().toLowerCase();
  const long = /(\d{1,2})\s+([a-z]+)\s+(\d{4})/.exec(normalized);
  if (long && MONTH_INDEX[long[2]] !== undefined) {
    return new Date(Number(long[3]), MONTH_INDEX[long[2]], Number(long[1]));
  }
  const short = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(value);
  if (short) {
    return new Date(Number(short[3]), Number(short[2]) - 1, Number(short[1]));
  }
  return null;
}

/** Nama berkas foto di Drive, mis. "[KAMERA]_26 September 2026_Suyatno_1.jpg". */
export function buildPhotoFileName(options: {
  source: string;
  date: Date;
  namaDanru?: string;
  index: number;
  total: number;
  extension: string;
}): string {
  const prefix = options.source === 'camera' ? '[KAMERA]' : '[GALERI]';
  const person = options.namaDanru
    ? '_' + options.namaDanru.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)
    : '';
  const suffix = options.total > 1 ? `_${options.index}` : '';
  return `${prefix}_${formatDateFolder(options.date)}${person}${suffix}${options.extension}`;
}

const MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function formatMonthFolder(date: Date): string {
  return `${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateFolder(date: Date): string {
  return `${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

export function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'image/bmp': '.bmp',
  };
  return map[(mime || '').toLowerCase()] || '.jpg';
}
