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
  { key: 'nomorSpt', pattern: 'NOMOR\\s*SPT', optionalColon: true },
  { key: 'objek', pattern: 'OBJEK|JENIS\\s+KEJADIAN', optionalColon: true },
  { key: 'hariTanggal', pattern: 'HARI\\s*(?:(?:DAN|&|,|/)\\s*)?TANGGAL(?:\\s+PELAKSANAAN(?:NYA)?)?', optionalColon: true },
  { key: 'tanggal', pattern: 'TANGGAL(?:\\s+PELAKSANAAN(?:NYA)?)?', optionalColon: true },
  { key: 'hari', pattern: 'HARI', optionalColon: true },
  { key: 'laporanMasuk', pattern: 'LAPORAN\\s+MASUK', optionalColon: true },
  { key: 'berangkat', pattern: 'WAKTU\\s+BERANGKAT|BERANGKAT', optionalColon: true },
  { key: 'tiba', pattern: 'TIBA\\s+DI\\s*LOKASI', optionalColon: true },
  { key: 'mulai', pattern: 'MULAI\\s+KEGIATAN', optionalColon: true },
  { key: 'selesai', pattern: 'SELESAI\\s+KEGIATAN', optionalColon: true },
  { key: 'kembali', pattern: 'TIBA\\s+KEMBALI(?:\\s+(?:DI\\s+)?MAKO)?|KEMBALI(?:\\s+KE\\s+MAKO)?', optionalColon: true },
  { key: 'lokasi', pattern: 'LOKASI(?:\\s+KEJADIAN)?|ALAMAT(?:\\s+KEJADIAN)?', optionalColon: true },
  { key: 'gps', pattern: 'GPS|KOORDINAT', optionalColon: true },
  { key: 'jarak', pattern: 'JARAK\\s+TEMPUH(?:\\s+PERJALANAN)?', optionalColon: true },
  { key: 'estimasi', pattern: 'ESTIMASI\\s+WAKTU(?:\\s+PERJALANAN)?', optionalColon: true },
  { key: 'pelapor', pattern: 'PEMBERI\\s+INFORMASI(?:\\s*\\(\\s*PELAPOR\\s*/\\s*PEMOHON\\s*\\))?|PELAPOR\\s*/\\s*PEMOHON|PELAPOR|PEMOHON', optionalColon: true },
  { key: 'pemilik', pattern: 'PEMILIK(?:\\s*NYA)?', optionalColon: true },
  { key: 'penghuni', pattern: 'JUMLAH\\s+PENGHUNI(?:\\s+RUMAH)?(?:\\s+YANG\\s+TERDAMPAK)?', optionalColon: true },
  { key: 'luas', pattern: 'LUAS\\s+AREA(?:\\s+(?:YANG\\s+)?TERBAKAR)?|LUAS\\s+TERBAKAR', optionalColon: true },
  { key: 'areal', pattern: 'AREAL?\\s+YANG\\s+TERBAKAR', optionalColon: true },
  { key: 'korban', pattern: 'KORBAN', optionalColon: true },
  { key: 'kendala', pattern: 'KENDALA', optionalColon: true },
  { key: 'penyebab', pattern: 'PENYEBAB(?:\\s+KEBAKARAN)?', optionalColon: true },
  { key: 'kronologi', pattern: 'KRONOLOGI(?:\\s+KEJADIAN)?', optionalColon: true },
  { key: 'kerugian', pattern: 'PERKIRAAN\\s+KERUGIAN|KERUGIAN', optionalColon: true },
  { key: 'harta', pattern: 'PERKIRAAN\\s+HARTA(?:\\s+BENDA)?\\s+YANG\\s+TERSELAMATKAN|(?:HARTA\\s+)?BENDA\\s+YANG\\s+TERSELAMATKAN|HARTA\\s+BENDA\\s+TERSELAMATKAN', optionalColon: true },
  { key: 'tindakan', pattern: 'TINDAKAN', optionalColon: true },
  { key: 'rincian', pattern: 'RINCIAN\\s+KEGIATAN', optionalColon: true },
  { key: 'armada', pattern: 'JUMLAH\\s+UNIT\\s+KENDARA(?:AN|KAN)(?:\\s+YANG\\s+DIGUNAKAN)?|JUMLAH\\s+(?:KENDARAAN|ARMADA)(?:\\s+YANG\\s+DIGUNAKAN)?', optionalColon: true },
  { key: 'personil', pattern: 'PERSONIL(?:\\s+YANG\\s+TERLIBAT)?', optionalColon: true },
  { key: 'penutup', pattern: 'Pelaksanaan\\s+kegiatan\\s+tersebut|Demikian\\s+yang', optionalColon: true },
  { key: 'dokumentasi', pattern: 'DOKUMENTASI(?:\\s+TERLAMPIR)?', optionalColon: true },
  { key: 'melaporkan', pattern: 'YANG\\s+MELAPORKAN', optionalColon: true },
  { key: 'tembusan', pattern: 'TEMBUSAN', optionalColon: true },
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
    .replace(/(^|[^\p{L}\p{N}])_([^\p{L}\p{N}]|$)/gu, '$1 $2')
    .replace(/(^|[^\p{L}\p{N}])_/gu, '$1 ')
    .replace(/_([^\p{L}\p{N}]|$)/gu, ' $1');
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
    .replace(/[ \t]*\b(GPS|KOORDINAT)\b(?=[ \t]*[:：]?[ \t]*[-+]?\d)/gi, '\n$1')
    // label penting kadang menyatu di baris yang sama setelah teks lain (mis. "... PERSONIL YANG TERLIBAT :")
    .replace(/([^\n])[ \t]{2,}(?=(PERSONIL(?:\s+YANG\s+TERLIBAT)?|JUMLAH\s+UNIT\s+KENDARA(?:AN|KAN)|RINCIAN\s+KEGIATAN|YANG\s+MELAPORKAN|JUMLAH\s+PENGHUNI|PEMBERI\s+INFORMASI)\b)/gi, '$1\n');

  // Tahap 1: label tebal WhatsApp: *LABEL :*  /  *Kronologi*  /  *Areal*:  (juga tangani *LABEL tanpa penutup)
  for (const { key, pattern } of LABELS) {
    t = t.replace(
      new RegExp(`\\*[ \\t]*(?:${pattern})[ \\t]*[:：]?[ \\t]*\\*(?:[ \\t]*[:：])?`, 'gi'),
      `\n${MARK_OPEN}${key}${MARK_CLOSE} `,
    );
    t = t.replace(
      new RegExp(`(^|\\n)[ \\t]*\\*[ \\t]*(?:${pattern})(?![\\p{L}\\p{N}])[ \\t]*[:：]?[ \\t]*`, 'giu'),
      (_m, nl: string) => `${nl}\n${MARK_OPEN}${key}${MARK_CLOSE} `,
    );
  }
  // Tahap 2: label tanpa tanda bintang, harus di awal baris (toleran awalan ., -, #, dll)
  for (const { key, pattern, optionalColon } of LABELS) {
    t = t.replace(
      new RegExp(`(^|\\n)[ \\t]*[.#\\-–—*]*[ \\t]*(?:${pattern})(?![\\p{L}\\p{N}])[ \\t]*${optionalColon ? '[:：]?' : '[:：]'}[ \\t]*`, 'giu'),
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
    const key = parts[i];
    const value = parts[i + 1] || '';
    if (!(key in sections)) sections[key] = value;
    else sections[key] = `${sections[key]}\n${value}`.trim();
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
const DATE_RE = /(\d{1,2}[\s.,-]*[A-Za-zÀ-ÿ]+[\s.,-]*\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/;
const DAY_BEFORE_RE = /([A-Za-zÀ-ÿ]+(?:['’‘`´][A-Za-zÀ-ÿ]+)?)\s*,?\s*$/;

function extractDayDate(source: string): { hari: string; tanggal: string } {
  const m = DATE_RE.exec(source);
  if (!m) return { hari: '', tanggal: '' };
  const before = source.slice(0, m.index);
  const d = DAY_BEFORE_RE.exec(before);
  const candidate = d ? normalizeDay(d[1]) : '';
  const isDay = DAY_NAMES.includes(candidate);
  let tanggal = m[1].replace(/\s+/g, ' ').trim();
  // "31Oktober 2026" -> "31 Oktober 2026"
  tanggal = tanggal.replace(/^(\d{1,2})([A-Za-zÀ-ÿ]+)/, '$1 $2').replace(/([A-Za-zÀ-ÿ]+)(\d{4})$/, '$1 $4');
  tanggal = tanggal.replace(/\s*,\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return { hari: isDay ? candidate : '', tanggal };
}

function normalizeTime(value: string): string {
  let s = String(value || '')
    .replace(/wib|wita|wit/gi, ' ')
    .replace(/[.:,]{2,}/g, '.')
    .replace(/([.:,])\s+([.:,])/g, '$1') // "10. .45" -> "10.45"
    .replace(/(\d)\s+([.:,])\s*(\d)/g, '$1$2$3') // "10. 05" / "10 .30" -> "10.05"/"10.30"
    .replace(/(\d)\s*([.:,])\s+(\d)/g, '$1$2$3')
    .replace(/\s+/g, ' ')
    .trim();
  const m = /(\d{1,2})\s*[.:,]\s*(\d{1,2})(?:\s*[.:,]\s*(\d{1,2}))?/.exec(s);
  if (m) return `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')} WIB`;
  const h = /(\d{1,2})\s*(?:jam|j)\b/i.exec(s);
  if (h) return `${h[1].padStart(2, '0')}.00 WIB`;
  return '';
}

function parseGps(value: string): { latitude: string; longitude: string } {
  let raw = String(value || '').replace(/[°º⁰]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return { latitude: '', longitude: '' };
  raw = raw
    .replace(/(\d)\s*[.,]\s+(\d)/g, '$1.$2')
    .replace(/(\d)\s+([.,])\s*(\d)/g, '$1$2$3')
    .replace(/([.,]\d+)\s+(\d)/g, '$1$2')
    // "111 468440" -> "111.468440" (koordinat tanpa titik desimal)
    .replace(/\b(\d{2,3})\s+(\d{5,7})\b/g, '$1.$2')
    // "787473" (6-7 digit menempel, lat/lng Indonesia tanpa desimal) -> sisipkan titik setelah digit awal yang masuk akal
    .replace(/(^|[^0-9.])(-?)(\d)(\d{5,7})\b(?=\s*[NSns,;\s\/]|$)/g, (_m, p, sign, a, b) => `${p}${sign}${a}.${b}`)
    // "7-961167" -> "7.961167" (salah ketik pemisah desimal)
    .replace(/(\d)-(\d{4,7})\b/g, '$1.$2');
  // normalize direction markers: keep space before direction but remove stray dots/spaces around
  raw = raw
    .replace(/([0-9])\s*([NSns])\b/g, '$1 $2')
    .replace(/([0-9])\s*([EWew])\b/g, '$1 $2')
    .replace(/\b([NSns])\s*[.,]\s*/g, '$1 ')
    .replace(/\b([EWew])\s*[.,]\s*/g, '$1 ')
    .replace(/([.,])\s*([EWew])\b/g, ' $2');

  const mDir = /([-+]?\d+(?:[.,]\d+)?)\s*([NSns])\s*[,;\s/]+\s*([-+]?\d+(?:[.,]\d+)?)\s*[\s.,;/]*([EWew])\b/.exec(raw);
  if (mDir) {
    let lat = mDir[1].replace(',', '.').replace(/^\+/, '');
    let lng = mDir[3].replace(',', '.').replace(/^\+/, '');
    if (/s/i.test(mDir[2]) && !lat.startsWith('-')) lat = `-${lat}`;
    if (/w/i.test(mDir[4]) && !lng.startsWith('-')) lng = `-${lng}`;
    if (isValidCoord(lat, lng)) return { latitude: lat, longitude: lng };
  }

  const pairRe = /([-+]?\d+(?:[.,]\d+)?)\s*[,;\s/]+\s*([-+]?\d+(?:[.,]\d+)?)/g;
  let pair: RegExpExecArray | null;
  while ((pair = pairRe.exec(raw))) {
    const lat = pair[1].replace(',', '.').replace(/^\+/, '');
    const lng = pair[2].replace(',', '.').replace(/^\+/, '');
    if (isValidCoord(lat, lng)) return { latitude: lat, longitude: lng };
  }

  const nums = raw.match(/-?\d{1,3}[.,]\d{3,}/g) || [];
  for (let i = 0; i + 1 < nums.length; i++) {
    const lat = nums[i].replace(',', '.');
    const lng = nums[i + 1].replace(',', '.');
    if (isValidCoord(lat, lng)) return { latitude: lat, longitude: lng };
  }
  return { latitude: '', longitude: '' };
}

function isValidCoord(latS: string, lngS: string): boolean {
  const lat = Number(latS);
  const lng = Number(lngS);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
  // Hindari pasangan angka acak (mis. kode pos + latitude). Untuk konteks laporan Indonesia, prefer koordinat Indonesia; tetap izinkan koordinat valid umum.
  if (lat >= -11.5 && lat <= 6.5 && lng >= 94.5 && lng <= 141.5) return true;
  // bila salah satu punya presisi koordinat (desimal) dan pasangan valid global, terima
  return /[.,]\d{3,}/.test(latS) && /[.,]\d{3,}/.test(lngS);
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

  // GPS: dari label GPS/KOORDINAT, atau fallback dari lokasi/seluruh teks (sering koordinat ditulis di blok lokasi tanpa label GPS)
  let gps = parseGps(sec.gps || '');
  if (!gps.latitude || !gps.longitude) gps = parseGps(sec.lokasi || '');
  if (!gps.latitude || !gps.longitude) gps = parseGps(plain);
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
  let lokasi = linesOf(sec.lokasi).join('\n');
  // rapikan: buang sub-label "Alamat"/"GPS"/"Koordinat" dan baris koordinat (sudah diekstrak ke field lat/lng)
  lokasi = lokasi
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !/^(alamat|gps|koordinat)\b[:\s.-]*$/i.test(l))
    .filter(l => {
      const n = l.replace(/[°º⁰]/g, '').replace(/\s+/g, ' ').trim();
      return !/^[-+]?\d{1,3}(?:[.,]\s*\d+)?\s*([NSns])?\s*[,;\s/]+\s*[-+]?\d{1,3}(?:[.,]\s*\d+)?\s*([EWew])?\s*$/i.test(n);
    })
    .join(' ')
    .replace(/[-+]?\d{1,3}[.,]\s*\d+\s*[NSns]?\s*[,;\/\s]+\s*[-+]?\d{1,3}[.,]\s*\d+\s*[EWew]?/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^(alamat|lokasi)\s*[:.-]\s*/i, '')
    .trim();

  const parsed: ParsedReport = {
    nomorSpt: single(sec.nomorSpt),
    lokasi,
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
  const normalized = value.replace(/^[A-Za-zÀ-ÿ'’`´.\s]+,?\s*/i, '').trim().toLowerCase().replace(/^[\s,.-]+/, '');
  const long = /(\d{1,2})[\s,.-]*([a-zà-ÿ]+)[\s,.-]*(\d{4})/i.exec(normalized) || /(\d{1,2})[\s,.-]*([a-zà-ÿ]+)[\s,.-]*(\d{4})/i.exec(value.toLowerCase());
  if (long && MONTH_INDEX[long[2]] !== undefined) {
    return new Date(Number(long[3]), MONTH_INDEX[long[2]], Number(long[1]));
  }
  // handle "31Oktober 2026" (no space)
  const glued = /(\d{1,2})([a-zà-ÿ]+)(\d{4})/i.exec(normalized) || /(\d{1,2})([a-zà-ÿ]+)(\d{4})/i.exec(value.toLowerCase());
  if (glued && MONTH_INDEX[glued[2]] !== undefined) {
    return new Date(Number(glued[3]), MONTH_INDEX[glued[2]], Number(glued[1]));
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
