'use client';

import { useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import { useApp } from '../core/AppContext';
import { parseDynamic, extractFieldsFromTemplate, type DynamicFormatConfig, type DynamicFormatField } from '@/lib/parser/dynamic/parse';

const DAY_RE = /(senin|selasa|rabu|kamis|jum'?at|sabtu|minggu)/i;
const DATE_RE = /(\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b|\b\d{1,2}\s+[A-Za-zÀ-ÿ.]+\s+\d{2,4}\b)/i;
const TIME_RE = /\b\d{1,2}\s*[.:]\s*\d{2}\b/;
const GPS_RE = /-?\d{1,2}[.,]\d+\s*[,;]?\s*-?\d{2,3}[.,]\d+|[NS]\s*-?\d|[EW]\s*-?\d/i;

function normKey(s: string) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function enrichAliases(f: DynamicFormatField): DynamicFormatField {
  const base = [f.label, ...(f.aliases || [])].filter(Boolean);
  const k = normKey(f.key + ' ' + f.label);
  const extra: string[] = [];
  const add = (...a: string[]) => { for (const x of a) if (x && !base.some(b => normKey(b) === normKey(x))) extra.push(x); };
  if (/hari|tanggal|tgl/.test(k)) add('HARI DAN TANGGAL', 'HARI, TANGGAL', 'HARI, TANGGAL PELAKSANAAN', 'HARI, TANGGAL Pelaksanaannya', 'Hari Pelaksanaan dan Lokasi Kegiatan', 'Hari Pelaksanaan Dan Lokasi Kegiatan', 'HARI DAN TANGGAL PELAKSANAAN', 'TANGGAL', 'Tgl', 'TGL', 'Tanggal', 'Hari', 'HARI PELAKSANAAN', 'Hari Pelaksanaan', 'Tanggal Pelaksanaan', 'HARI PELAKSANAAN DAN LOKASI KEGIATAN');
  if (/laporan masuk|waktu masuk|jam masuk/.test(k)) add('Laporan masuk', 'LAPORAN MASUK', 'Waktu masuk');
  if (/berangkat/.test(k)) add('Waktu berangkat', 'WAKTU BERANGKAT', 'Berangkat');
  if (/tiba/.test(k) && !/kembali|mako/.test(k)) add('Tiba dilokasi', 'TIBA DILOKASI', 'Tiba di lokasi');
  if (/mulai/.test(k)) add('Mulai Kegiatan', 'MULAI KEGIATAN');
  if (/selesai/.test(k) && !/kembali/.test(k)) add('Selesai Kegiatan', 'SELESAI KEGIATAN');
  if (/kembali|mako/.test(k)) add('Kembali ke Mako', 'KEMBALI KE MAKO', 'TIBA KEMBALI DI MAKO', 'Tiba kembali di Mako');
  if (/lokasi|alamat|tempat/.test(k)) add('LOKASI', 'Lokasi', 'Lokasi Kegiatan');
  if (/gps|koordinat|lintang|bujur/.test(k)) add('GPS', 'Koordinat', 'Titik Koordinat');
  if (/jarak/.test(k)) add('JARAK TEMPUH', 'Jarak tempuh', 'JARAK TEMPUH PERJALANAN');
  if (/estimasi/.test(k)) add('ESTIMASI WAKTU PERJALANAN', 'Estimasi waktu perjalanan', 'ESTIMAS WAKTU PERJALANAN');
  if (/pelapor|pemohon|pemberi informasi|yang melapor/.test(k)) add('PELAPOR / PEMOHON', 'PEMBERI INFORMASI ( PELAPOR / PEMOHON )', 'Pelapor', 'Yang melaporkan', 'YANG MELAPORKAN');
  if (/personil|petugas|regu/.test(k)) add('PERSONIL YANG TERLIBAT', 'Personil', 'Petugas', 'Personil regu');
  if (/kronolog/.test(k)) add('Kronologi', 'KRONOLOGI');
  if (/tindakan|rincian kegiatan|kegiatan/.test(k) && !/rincian$/.test(k)) add('TINDAKAN', 'RINCIAN KEGIATAN', 'Rincian kegiatan');
  if (/armada|kendaraan|unit/.test(k)) add('JUMLAH ARMADA YANG DIGUNAKAN', 'JUMLAH UNIT KENDARAKAN YANG DIGUNAKAN', 'Kendaraan', 'Jenis', 'Nopol');
  if (/penyebab/.test(k)) add('Penyebab', 'PENYEBAB');
  if (/korban/.test(k)) add('KORBAN', 'Korban');
  if (/objek|jenis/.test(k)) add('OBJEK', 'Objek');
  if (/kondisi/.test(k)) add('Kondisi');
  if (/waktu|jam/.test(k) && !/estimasi|perjalanan/.test(k)) add('Waktu', 'Jam');
  return { ...f, aliases: Array.from(new Set([...base, ...extra])) };
}

function fallbackFilled(f: DynamicFormatField, text: string, parsedValue: string) {
  if (String(parsedValue || '').trim()) return true;
  const t = String(text || '');
  const k = normKey(f.key + ' ' + f.label);
  if (/hari|tanggal/.test(k)) return DAY_RE.test(t) || DATE_RE.test(t);
  if (/waktu|jam|masuk|berangkat|tiba|mulai|selesai|kembali/.test(k)) return TIME_RE.test(t);
  if (/gps|koordinat|lat|lng|lintang|bujur/.test(k)) return GPS_RE.test(t);
  // generic: look for label token presence with some content nearby
  const labelToken = String(f.label || '').split(/[/(]/)[0].trim();
  if (labelToken.length >= 4) {
    const re = new RegExp(labelToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[:\\-]?\\s*([^\\n]{2,})', 'i');
    const m = re.exec(t); if (m && m[1] && !/^[-\s.]+$/.test(m[1])) return true;
  }
  return false;
}

function buildEffectiveFields(template: string, format?: DynamicFormatConfig | null, scope?: string): DynamicFormatField[] {
  const fromFormat = Array.isArray(format?.fields) ? format!.fields.filter(f => f && (f.key || f.label)).map(enrichAliases) : [];
  const fromTemplate = template ? extractFieldsFromTemplate(template).map(enrichAliases) : [];
  // prefer template-derived richness when template exists (matches WA formats better), keep format required flags
  let fields = fromTemplate.length >= 4 ? fromTemplate : fromFormat;
  if (!fields.length) fields = fromFormat;
  if (template && fromTemplate.length && fromFormat.length) {
    const req = new Set(fromFormat.filter(f => f.required).map(f => normKey(f.key + ' ' + f.label)));
    fields = fields.map(f => req.has(normKey(f.key + ' ' + f.label)) ? { ...f, required: true } : f);
  }
  // essential fallback for kebakaran/odnk if still sparse
  const essentials: DynamicFormatField[] = [
    { key: 'tanggal', label: 'Hari/Tanggal', aliases: ['HARI DAN TANGGAL', 'Hari, Tanggal', 'Tanggal'], required: true },
    { key: 'lokasi', label: 'Lokasi', aliases: ['LOKASI', 'Alamat'], required: true, type: 'multiline' },
    { key: 'personil', label: 'Personil', aliases: ['PERSONIL YANG TERLIBAT', 'Personil', 'Petugas'], required: scope === 'kebakaran' || scope === 'odnk' },
    { key: 'pelapor', label: 'Pelapor/Yang Melaporkan', aliases: ['PELAPOR', 'YANG MELAPORKAN', 'PEMBERI INFORMASI'], required: false },
  ];
  for (const e of essentials) {
    if (!fields.some(f => normKey(f.key) === normKey(e.key) || normKey(f.label) === normKey(e.label))) fields.push(enrichAliases(e));
  }
  // dedupe by normalized label
  const seen = new Set<string>();
  return fields.filter(f => { const k = normKey(f.label || f.key); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 40);
}

/** Formulir laporan: teks ditempel + checklist kelengkapan field sesuai format. */
export default function SadewaForm({ className = '', template: initialTemplate = '', format = null }: { className?: string; template?: string; format?: DynamicFormatConfig | null }) {
  const { reportText, setReportText, scope } = useApp();
  const [copied, setCopied] = useState(false);
  const template = initialTemplate.trim();
  const length = reportText.trim().length;

  const effectiveFormat = useMemo<DynamicFormatConfig>(() => ({
    template,
    fields: buildEffectiveFields(template, format, scope),
    version: format?.version || 1,
  }), [template, format, scope]);

  const checklist = useMemo(() => {
    const text = reportText || '';
    if (!text.trim()) return effectiveFormat.fields.map(f => ({ field: f, filled: false, value: '' }));
    const parsed = parseDynamic(text, effectiveFormat);
    return effectiveFormat.fields.map(f => {
      const value = String((parsed.values as any)?.[f.key] || '').trim();
      const filled = fallbackFilled(f, text, value);
      return { field: f, filled, value: filled ? (value || 'terisi') : '' };
    });
  }, [reportText, effectiveFormat]);

  const totalCount = checklist.length;
  const allFilled = totalCount > 0 && checklist.every(c => c.filled);

  const loadTemplate = () => { if (template) setReportText(template); };
  const copyTemplate = async () => {
    if (!template) return;
    try { await navigator.clipboard.writeText(template); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* clipboard tidak tersedia */ }
  };

  return (
    <section className={className ? `card ${className}` : 'card'}>
      <div className="card-head">
        <span className="card-ico tone-blue">
          <Icon name="file" />
        </span>
        <h3>Teks Laporan</h3>
        <span className="badge">Wajib</span>
      </div>

      <div className="card-body">
        <textarea
          className="paste-field"
          value={reportText}
          onChange={event => setReportText(event.target.value)}
          placeholder="Tempel teks laporan sesuai format."
          rows={8}
          spellCheck={false}
          aria-label="Teks laporan"
        />
        <div className="paste-meta">
          <span>{length.toLocaleString('id-ID')} karakter</span>
          {template ? (
            <>
              <button type="button" className="link-btn" onClick={loadTemplate} title="Muat template laporan ke kolom">
                Salin template
              </button>
              <button type="button" className="link-btn" onClick={copyTemplate} title="Salin teks template ke clipboard">
                {copied ? 'Tersalin' : 'Salin teks'}
              </button>
            </>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Template belum tersedia</span>
          )}
          {reportText && (
            <button type="button" className="link-btn" onClick={() => setReportText('')}>
              <Icon name="x" /> Bersihkan
            </button>
          )}
        </div>

        {totalCount > 0 && (
          <div className="report-checklist" aria-live="polite">
            <div className="report-checklist-head">
              <div className="report-checklist-title">
                <Icon name={allFilled ? 'circleCheck' : 'file'} />
                <span>Kelengkapan Format</span>
              </div>
            </div>
            <div className="report-checklist-grid">
              {checklist.map(({ field, filled }) => (
                <div key={field.key + field.label} className={`report-check-item ${filled ? 'is-filled' : 'is-missing'} ${field.required ? 'is-required' : ''}`} title={field.required ? 'Disarankan/wajib sesuai format' : 'Opsional'}>
                  <span className="report-check-box" aria-hidden="true">{filled ? '✓' : ''}</span>
                  <span className="report-check-label">{field.label}</span>
                  {field.required ? <span className="report-check-req" aria-label="wajib">*</span> : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
