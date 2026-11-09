/**
 * Dynamic report parser (ported for SADEWA Admin input) — config-driven.
 */
export interface DynamicFormatField {
  key: string; label: string; aliases?: string[]; required?: boolean; type?: 'text'|'time'|'number'|'multiline';
}
export interface DynamicFormatConfig {
  template?: string; fields: DynamicFormatField[]; stopLabels?: string[]; version?: number;
}

const MARK_OPEN = '\u0001'; const MARK_CLOSE = '\u0002';
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_INDEX: Record<string, number> = { januari:0,februari:1,maret:2,april:3,mei:4,juni:5,juli:6,agustus:7,september:8,oktober:9,november:10,desember:11 };

export function parseIndonesianDate(value: string): Date | null {
  if (!value) return null;
  const normalized = value.replace(/^[A-Za-z]+,?\s*/i, '').trim().toLowerCase();
  const long = /(\d{1,2})\s+([a-z]+)\s+(\d{4})/.exec(normalized);
  if (long && MONTH_INDEX[long[2]] !== undefined) return new Date(Number(long[3]), MONTH_INDEX[long[2]], Number(long[1]));
  const short = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(value);
  if (short) return new Date(Number(short[3]), Number(short[2]) - 1, Number(short[1]));
  return null;
}

function normalizeRaw(text: string): string {
  return String(text || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00A0/g, ' ').replace(/\r\n?/g, '\n')
    .replace(/[ \t]*[•●▪‣◦\-–—][ \t]+/g, '\n')
    .replace(/\n\s*[-–—]\s*/g, '\n');
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
  const parts = alias.trim().split(/\s+/).filter(Boolean).map(escRe);
  return parts.join('\\s+');
}

function markLabels(raw: string, fields: DynamicFormatField[]): string {
  let t = normalizeRaw(raw)
    .replace(/[ \t]*\b(GPS|KOORDINAT)\b(?=[ \t]*[:：]?[ \t]*[-+]?\d)/gi, '\n$1')
    .replace(/(\bWIB\b)[ \t]*\n[ \t]*(?=[*\u0001A-Z])/gi, '$1 ');
  const defs = fields.map(f => ({ key: f.key, patterns: Array.from(new Set([f.label, ...(f.aliases||[])])).filter(Boolean).map(aliasPattern) }))
    .filter(d => d.patterns.length).sort((a, b) => (b.patterns[0]?.length || 0) - (a.patterns[0]?.length || 0));
  for (const d of defs) for (const p of d.patterns)
    t = t.replace(new RegExp(`\\*[ \\t]*(?:${p})[ \\t]*[:：.,-]*[ \\t]*\\*(?:[ \\t]*[:：.,-]*)?`, 'giu'), `\n${MARK_OPEN}${d.key}${MARK_CLOSE} `);
  for (const d of defs) for (const p of d.patterns)
    t = t.replace(new RegExp(`(^|\\n)[ \\t]*(?:${p})(?![\\p{L}\\p{N}])[ \\t]*[:：.,-]*[ \\t]*`, 'giu'), (_m, nl: string) => `${nl}\n${MARK_OPEN}${d.key}${MARK_CLOSE} `);
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
  const s = String(value).replace(/wib|wita|wit/gi, ' ').replace(/\s+/g, ' ').trim();
  const m = /(\d{1,2})\s*[.:,]\s*(\d{1,2})(?:\s*[.:,]\s*(\d{1,2}))?/.exec(s);
  if (m) return `${m[1].padStart(2,'0')}.${m[2].padStart(2,'0')} WIB`;
  const h = /(\d{1,2})\s*(?:jam|j)\b/i.exec(s);
  if (h) return `${h[1].padStart(2,'0')}.00 WIB`;
  const p = /^(\d{1,2})\s+(\d{2})\b/.exec(s);
  if (p) return `${p[1].padStart(2,'0')}.${p[2].padStart(2,'0')} WIB`;
  return single(value);
}

export interface DynamicParseResult {
  values: Record<string, string>;
  missing: Array<{ key: string; label: string }>;
  derivedFields?: DynamicFormatField[];
}

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

export function parseDynamic(rawText: string, format: DynamicFormatConfig): DynamicParseResult {
  let fields = Array.isArray(format?.fields) ? format.fields.filter(f => f && f.key && f.label) : [];
  let derived: DynamicFormatField[] | undefined;
  if (!fields.length && format?.template) { derived = extractFieldsFromTemplate(format.template); fields = derived; }
  const sec = splitSections(rawText, fields);
  const plain = cleanDynamicText(rawText);
  void plain;

  const values: Record<string,string> = {};
  for (const f of fields) {
    const raw = sec[f.key] ?? '';
    if (f.type === 'multiline') { const ls = linesOf(String(raw), true); values[f.key] = ls.length ? ls.join('\n') : ''; }
    else if (f.type === 'time') values[f.key] = normalizeTime(raw);
    else values[f.key] = single(raw, false);
  }
  const missing = fields.filter(f => f.required).filter(f => !String(values[f.key]||'').trim()).map(f => ({ key: f.key, label: f.label || f.key }));
  return { values, missing, derivedFields: derived };
}
