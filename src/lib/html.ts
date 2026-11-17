/**
 * Helper kecil untuk menyisipkan teks ke markup modal.
 *
 * Aplikasi memakai `dangerouslySetInnerHTML` agar pesan bisa diformat (bold,
 * line break, warna). Semua nilai yang berasal dari input pengguna, geocoder,
 * atau parser laporan harus dilewatkan `esc()` terlebih dahulu.
 */

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => HTML_ENTITIES[character]);
}

/** Hilangkan seluruh tag HTML dari teks bebas. */
export function stripTags(value: unknown): string {
  return String(value ?? '').replace(/<[^>]*>/g, '');
}

/** Gabungkan potongan markup statis dengan nilai yang sudah di-escape. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((output, part, index) => {
    if (index === 0) return part;
    const value = values[index - 1];
    const safe = value instanceof SafeHtml ? value.value : esc(value);
    return output + safe + part;
  }, '');
}

/** Penanda markup yang sudah tepercaya — dilewati `esc()` oleh `html()`. */
class SafeHtml {
  constructor(readonly value: string) {}
}

export function raw(value: string): SafeHtml {
  return new SafeHtml(value);
}
