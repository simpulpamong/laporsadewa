export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppMessage(report: string, folderUrl: string, photoCount: number): string {
  return [
    '*LAPORAN SADEWA SATPOL PP PONOROGO*',
    '',
    report.trim(),
    '',
    `*Dokumentasi (${photoCount} foto):*`,
    folderUrl || '(album dokumentasi belum tersedia)',
    '',
    'Laporan telah tersimpan di Google Drive dan Google Sheets.',
  ].join('\n');
}
