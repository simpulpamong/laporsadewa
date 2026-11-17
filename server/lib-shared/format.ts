/** Utilitas format yang dipakai lintas fitur (konsisten untuk semua alur). */

const MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export { MONTHS_LONG };

export function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** "26-09-2026 14:05" — untuk nama file. */
export function stampCompact(date = new Date()): string {
  return [
    pad2(date.getDate()),
    pad2(date.getMonth() + 1),
    date.getFullYear(),
    '_',
    pad2(date.getHours()),
    pad2(date.getMinutes()),
  ].join('-');
}

/** "26/09/2026 14:05:33" — untuk watermark & label. */
export function stampHuman(date = new Date()): string {
  return [
    pad2(date.getDate()),
    pad2(date.getMonth() + 1),
    date.getFullYear(),
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds()),
  ].join('/');
}

/** "26/09/2026 14:05:33" dalam zona WIB — untuk label & watermark. */
export function formatWib(date = new Date()): string {
  // Zona WIB dihitung eksplisit agar hasil sama di server maupun perangkat.
  const wib = new Date(date.getTime() + date.getTimezoneOffset() * 60_000 + 7 * 60 * 60_000);
  return `${pad2(wib.getDate())}/${pad2(wib.getMonth() + 1)}/${wib.getFullYear()} ${pad2(wib.getHours())}:${pad2(wib.getMinutes())}:${pad2(wib.getSeconds())}`;
}

export function formatSizeKB(sizeKB: number): string {
  return sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)}MB` : `${sizeKB}KB`;
}

/** Perkiraan ukuran byte dari data URL base64 tanpa decoding penuh. */
export function base64ByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}

/** "2026-09-26" dari objek Date lokal. */
export function toDateInputValue(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatDateInput(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day || month > 12 || day > 31) return '';
  return `${day} ${MONTHS_LONG[month - 1]} ${year}`;
}
