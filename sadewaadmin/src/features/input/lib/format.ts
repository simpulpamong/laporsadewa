export function pad2(n: number) { return String(n).padStart(2, '0'); }
export function stampHuman(d = new Date()) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function base64ByteLength(dataUrl: string): number {
  if (!dataUrl) return 0;
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] || '' : dataUrl;
  const padding = (base64.match(/=+$/) || [''])[0].length;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function formatSizeKB(sizeKB: number): string {
  if (!Number.isFinite(sizeKB)) return '-';
  if (sizeKB >= 1024) return `${(sizeKB / 1024).toFixed(1)} MB`;
  return `${Math.max(0, Math.round(sizeKB))} KB`;
}

export function stampCompact(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
