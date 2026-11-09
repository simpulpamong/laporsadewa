/**
 * Dynamic report parser — config-driven (Firestore/admin), no hardcoded labels.
 * Extracts labeled sections from WhatsApp-style text using format.fields aliases.
 */
import type { ParsedReport } from '../whatsapp/parser';
import { parseIndonesianDate } from '../whatsapp/parser';

export interface DynamicFormatField {
  key: string; label: string; aliases?: string[]; required?: boolean; type?: 'text'|'time'|'number'|'multiline';
}
export interface DynamicFormatConfig {
  template?: string; fields: DynamicFormatField[]; stopLabels?: string[]; version?: number;
}

const MARK_OPEN = '\u0001'; const MARK_CLOSE = '\u0002';
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function normalizeRaw(text: string): string {
  return String(text || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]*[•●▪‣◦\-–—][ \t]+/g, '\n') // bullet/dash list markers at line content
    .replace(/\n\s*[-–—]\s*/g, '\n'); // "- Hari :" style key-value prefix
}
function stripMarkup(text: string): string {
  return text.replace(/[*~`]/g, ' ').replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, ' ');
}
export function cleanDynamicText(text: string): string {
  return stripMarkup(normalizeRaw(text)).replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function tidy(line: string, keepDot = false): string {
  let v = line.replace(/\s+/g, ' ').replace(/^[\s.:;,\-–—]+/, '').replace(/[\s;,]+$/, '');
  if (!keepDot) v = v.replace(/[\s.]+$/, '');
  return v.trim();
}
function linesOf(value = '', keepDot = false): string[] { return value.split('\n').map(l => tidy(l, keepDot)).filter(Boolean); }
const single = (value = '', keepDot = false) => linesOf(value, keepDot).join(' ');

function escRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function aliasPattern(alias: string): string {
  // allow flexible whitespace and optional punctuation in alias text
  const parts = alias.trim().split(/\s+/).filter(Boolean).map(escRe);
  return parts.join('\\s+');
}

function markLabels(raw: string, fields: DynamicFormatField[]): string {
  let t = normalizeRaw(raw)
    .replace(/[ \t]*\b(GPS|KOORDINAT)\b(?=[ \t]*[:：]?[ \t]*[-+]?\d)/gi, '\n$1')
    .replace(/(\bWIB\b)[ \t]*\n[ \t]*(?=[*\u0001A-Z])/gi, '$1 ');
  const defs = fields.map(f => ({ key: f.key, patterns: Array.from(new Set([f.label, ...(f.aliases||[])])).filter(Boolean).map(aliasPattern) }))
    .filter(d => d.patterns.length).sort((a, b) => (b.patterns[0]?.length || 0) - (a.patterns[0]?.length || 0));
  // bold labels (tolerate extra spaces/punctuation)
  for (const d of defs) {
    for (const p of d.patterns) {
      t = t.replace(new RegExp(`\\*[ \\t]*(?:${p})[ \\t]*[:：.,-]*[ \\t]*\\*(?:[ \\t]*[:：.,-]*)?`, 'giu'), `\n${MARK_OPEN}${d.key}${MARK_CLOSE} `);
    }
  }
  // plain labels at line start
  for (const d of defs) {
    for (const p of d.patterns) {
      t = t.replace(new RegExp(`(^|\\n)[ \\t]*(?:${p})(?![\\p{L}\\p{N}])[ \\t]*[:：.,-]*[ \\t]*`, 'giu'), (_m, nl: string) => `${nl}\n${MARK_OPEN}${d.key}${MARK_CLOSE} `);
    }
  }
  return t;
}

function splitSections(raw: string, fields: DynamicFormatField[]): Record<string, string> {
  const marked = stripMarkup(markLabels(raw, fields));
  const parts = marked.split(new RegExp(`${MARK_OPEN}([\\w-]+)${MARK_CLOSE}`));
  const sections: Record<string, string> = {};
  for (let i = 1; i < parts.length; i += 2) { if (!(parts[i] in sections)) sections[parts[i]] = parts[i + 1] || ''; }
  return sections;
}

function normalizeTime(value: string): string {
  if (!value) return '';
  // tolerate "11 .22 wib", "11.25. wib", "13 .30wib", "07:00 - 15:00wib" (take first)
  const s = String(value).replace(/wib|wita|wit/gi, ' ').replace(/\s+/g, ' ').trim();
  const m = /(\d{1,2})\s*[.:,]\s*(\d{1,2})(?:\s*[.:,]\s*(\d{1,2}))?/.exec(s);
  if (m) return `${m[1].padStart(2,'0')}.${m[2].padStart(2,'0')} WIB`;
  const h = /(\d{1,2})\s*(?:jam|j)\b/i.exec(s);
  if (h) return `${h[1].padStart(2,'0')}.00 WIB`;
  // plain "07 00" rare
  const p = /^(\d{1,2})\s+(\d{2})\b/.exec(s);
  if (p) return `${p[1].padStart(2,'0')}.${p[2].padStart(2,'0')} WIB`;
  return single(value);
}
function parseGps(value: string): { latitude: string; longitude: string } {
  let raw = String(value || '').replace(/[°º]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return { latitude: '', longitude: '' };
  // tolerate spaces inside numbers: "7. 930068 S 111. 582775. E" / "-7,9222490, 111,4998960"
  raw = raw.replace(/(\d)[\s]+([.,])[\s]*(\d)/g, '$1$2$3').replace(/([.,][\d]+)[\s]+(\d)/g, '$1$2');
  const m = /([-+]?\d+(?:[.,]\d+)?)\s*([NSns])?\s*[,;\s/]+\s*([-+]?\d+(?:[.,]\d+)?)\s*([EWew])?/.exec(raw)
    || /([-+]?\d+(?:[.,]\d+)?)\s*[,;\s/]+\s*([-+]?\d+(?:[.,]\d+)?)/.exec(raw);
  if (m) {
    const hasDir = /[NSEWnsew]/.test(m[0]);
    let lat = (hasDir ? m[1] : m[1]).replace(',', '.').replace(/^\+/, '');
    let lng = (hasDir ? m[3] : m[2]).replace(',', '.').replace(/^\+/, '');
    if (hasDir && /s/i.test(m[2] || '') && !lat.startsWith('-')) lat = `-${lat}`;
    if (hasDir && /w/i.test(m[4] || '') && !lng.startsWith('-')) lng = `-${lng}`;
    return { latitude: lat, longitude: lng };
  }
  const nums = raw.match(/-?\d{1,3}[.,]\d{3,}/g);
  if (nums && nums.length >= 2) return { latitude: nums[0].replace(',', '.'), longitude: nums[1].replace(',', '.') };
  return { latitude: '', longitude: '' };
}

export interface DynamicParseResult {
  values: Record<string, string>;
  missing: Array<{ key: string; label: string }>;
  parsed: ParsedReport;
  formatVersion?: number;
  derivedFields?: DynamicFormatField[];
}

/** Ekstrak definisi field dari template (baris berlabel "LABEL:"). Berguna sebagai fallback saat fields belum dikonfigurasi. */
export function extractFieldsFromTemplate(template: string): DynamicFormatField[] {
  const lines = String(template || '').split(/\r?\n/);
  const found: DynamicFormatField[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const m = raw.replace(/[*_`~]/g, '').match(/^\s*([A-ZÀ-ÿ0-9 /()&.,-]{3,70}?)\s*[:：]\s*/i);
    if (!m) continue;
    const label = m[1].trim().replace(/\s+/g, ' ');
    if (/^(kepada|yth|tembusan|dokumentasi|lampiran|nomor|hal|perihal)\b/i.test(label)) continue;
    const key = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '').slice(0, 48);
    if (!key || seen.has(key)) continue; seen.add(key);
    const lower = label.toLowerCase();
    const type: DynamicFormatField['type'] = /waktu|jam|pukul/.test(lower) ? 'time' : /kronolog|tindakan|uraian|rincian|kegiatan|kendala|personil|keterangan|catatan/.test(lower) ? 'multiline' : 'text';
    found.push({ key, label, aliases: [label, label.toUpperCase()], required: false, type });
  }
  return found;
}

/**
 * Parse report text using a dynamic format config. Returns canonical ParsedReport-compatible
 * shape (for sheet row mapping) plus raw dynamic values.
 */
export function parseDynamic(rawText: string, format: DynamicFormatConfig): DynamicParseResult {
  let fields = Array.isArray(format?.fields) ? format.fields.filter(f => f && f.key && f.label) : [];
  let derived: DynamicFormatField[] | undefined;
  if (!fields.length && format?.template) {
    derived = extractFieldsFromTemplate(format.template);
    fields = derived;
  }
  const sec = splitSections(rawText, fields);
  const plain = cleanDynamicText(rawText);

  const values: Record<string,string> = {};
  for (const f of fields) {
    const raw = sec[f.key] ?? '';
    if (f.type === 'multiline') {
      const ls = linesOf(String(raw), true);
      values[f.key] = ls.length ? ls.join('\n') : '';
    } else if (f.type === 'time') {
      values[f.key] = normalizeTime(raw);
    } else {
      values[f.key] = single(raw, false);
    }
  }

  const missing = fields.filter(f => f.required).filter(f => !String(values[f.key]||'').trim()).map(f => ({ key: f.key, label: f.label || f.key }));

  // Map to canonical ParsedReport fields for sheet compatibility (robust aliases)
  const get = (...keys: string[]) => { for (const k of keys) { const v = sec[k] ?? values[k]; if (v && tidy(String(v))) return single(String(v)); } return ''; };
  const getB = (...keys: string[]) => { for (const k of keys) { const v = sec[k] ?? values[k]; if (v && linesOf(String(v), true).length) return linesOf(String(v), true).join('\n'); } return ''; };
  const getT = (...keys: string[]) => normalizeTime(get(...keys));

  let hari = get('hari','day','hari_pelaksanaan','hari_pelaksanaan_dan_lokasi_kegiatan');
  let tanggal = get('tanggal','date','tgl','tgl_pelaksanaan','hari_tanggal','hariTanggal','tanggal_pelaksanaan','hari_dan_tanggal','hari_tanggal_pelaksanaan','hari_dan_tanggal_pelaksanaan');
  // split combined "Hari, Tanggal" or "HARI DAN TANGGAL" / value that contains day name
  const splitHariTanggal = (v: string) => {
    const hm = /^(Minggu|Senin|Selasa|Rabu|Kamis|Jum'?at|Jumat|Sabtu)\s*[,/\-]?\s*(.+)$/i.exec(String(v || '').trim());
    if (hm) return { h: hm[1].replace(/jum'?at/i,'Jumat'), t: hm[2].trim() };
    return null;
  };
  if (tanggal && !hari) { const sp = splitHariTanggal(tanggal); if (sp) { hari = sp.h; tanggal = sp.t; } }
  if (hari && !tanggal) { const sp = splitHariTanggal(hari); if (sp) { hari = sp.h; tanggal = sp.t; } }
  // key-value fallback from raw text (tolerant): "- Hari : kamis", "Tgl : 05 November 2026"
  if (!hari) { const m = /\b(?:Hari)\s*[:：]\s*([A-Za-zÀ-ÿ'’]+(?:\s*,[^\n]*)?)/i.exec(plain); if (m) { const sp = splitHariTanggal(m[1]); hari = sp?.h || m[1].replace(/,.*$/,'').trim(); if (sp?.t && !tanggal) tanggal = sp.t; } }
  if (!tanggal) { const m = /\b(?:Tgl|Tanggal)\s*[:：]\s*([^\n]+)/i.exec(plain); if (m) { const v = m[1].trim(); const sp = splitHariTanggal(v); tanggal = sp?.t || v; if (sp?.h && !hari) hari = sp.h; } }
  if (!tanggal) { const m = /(\d{1,2}\s+[A-Za-zÀ-ÿ\.]+\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/.exec(plain); if (m) tanggal = m[1]; }
  if (tanggal) tanggal = tanggal.replace(/\s+/g,' ').trim();
  if (hari) { const dn = DAY_NAMES.find(d => d.toLowerCase() === hari.toLowerCase().replace(/'/g,"'")) || DAY_NAMES.find(d => hari.toLowerCase().startsWith(d.toLowerCase().slice(0,3))); if (dn) hari = dn; }
  const hariFinal = hari || (()=>{ const d=parseIndonesianDate(tanggal); return d ? DAY_NAMES[d.getDay()] : ''; })();

  // GPS / coordinates
  const gpsRaw = get('gps','koordinat','latlng','koordinat_gps','titik_koordinat') || getB('lokasi').match(/GPS\s*[:：]?\s*([^\n]+)/i)?.[1] || '';
  let gps = parseGps(gpsRaw);
  if (!gps.latitude) { const lat = get('latitude','lat'); const lng = get('longitude','lng','long'); if (lat && lng) gps = parseGps(`${lat}, ${lng}`); }
  if (!gps.latitude) { const gmap = get('google_maps','googleMaps','maps','link_maps'); const gm = /[?@](-?\d+\.\d+),(-?\d+\.\d+)/.exec(gmap); if (gm) gps = { latitude: gm[1], longitude: gm[2] }; }
  const googleMaps = gps.latitude && gps.longitude ? `https://www.google.com/maps?q=${gps.latitude},${gps.longitude}` : (get('google_maps','googleMaps','maps','link_maps') || '');

  const namaDanru = get('nama_danru','namaDanru','yang_melaporkan','melaporkan','petugas_pelapor');
  const yangMelaporkan = get('yang_melaporkan','melaporkan','nama_danru','namaDanru','petugas_pelapor') || namaDanru;
  const danru = get('danru','regu','komandan_regu') || yangMelaporkan;

  const parsed: ParsedReport = {
    nomorSpt: get('nomor_spt','nomorSpt','spt','no_spt'),
    lokasi: get('lokasi','alamat','location','lokasi_kejadian','tempat'),
    hari: hariFinal, tanggal,
    identitas: get('identitas','pemilik','objek','pelapor','nama_pelapor'),
    pelapor: get('pelapor','pemberi_informasi','pemohon','nama_pelapor','yang_melapor'),
    pemilik: get('pemilik','owner','pemilik_objek'),
    objek: get('objek','jenis_kejadian','jenis_laporan','kategori_kejadian','header'),
    penghuni: get('penghuni','jumlah_penghuni'),
    latitude: gps.latitude, longitude: gps.longitude, googleMaps,
    korban: get('korban','jumlah_korban'),
    penyebab: get('penyebab','dugaan_penyebab'),
    kronologi: getB('kronologi','kronologi_kejadian','uraian','kejadian'),
    tindakan: getB('tindakan','penanganan','upaya','tindakan_yang_dilakukan'),
    kerugian: get('kerugian','perkiraan_kerugian','taksiran_kerugian'),
    hartaTerselamatkan: get('harta_terselamatkan','harta','aset_terselamatkan'),
    luasArea: get('luas_area','luas','areal','areal_terbakar','luas_terbakar'),
    jarakTempuh: get('jarak','jarak_tempuh'),
    estimasiPerjalanan: get('estimasi','estimasi_waktu','estimasi_perjalanan'),
    waktuLaporan: getT('waktu_masuk','laporan_masuk','waktu_laporan','jam_laporan'),
    waktuBerangkat: getT('waktu_berangkat','berangkat','jam_berangkat'),
    waktuTiba: getT('waktu_tiba','tiba','tiba_di_lokasi','jam_tiba'),
    waktuMulai: getT('waktu_mulai','mulai','mulai_penanganan'),
    waktuSelesai: getT('waktu_selesai','selesai','selesai_penanganan'),
    waktuKembali: getT('waktu_kembali','kembali','tiba_kembali'),
    armada: getB('armada','kendaraan','unit_kendaraan','sarana'),
    personil: getB('personil','personil_terlibat','anggota','petugas'),
    danru, namaDanru, yangMelaporkan,
    jumlahArmada: get('jumlah_unit','jumlah_armada','jumlahArmada','jumlah_kendaraan'),
    kendala: getB('kendala','hambatan'),
    rincianKegiatan: getB('rincian_kegiatan','rincian','kegiatan'),
    keterangan: getB('keterangan','catatan','kronologi'),
    missing: missing.map(m => m.key) as any,
  };
  (parsed as any).dynamic = values;
  (parsed as any).dynamicMissing = missing;
  return { values, missing, parsed, formatVersion: format?.version, derivedFields: derived };
}
