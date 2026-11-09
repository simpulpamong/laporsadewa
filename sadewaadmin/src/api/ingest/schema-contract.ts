/** Canonical Google Sheets headers. Indices are zero-based and order is contractual. */
export const REPORT_HEADERS = [
  'Waktu Submit', 'ID Laporan', 'Kategori', 'Tanggal Kejadian', 'Hari', 'Lokasi', 'Latitude', 'Longitude',
  'Google Maps', 'Pelapor', 'Objek', 'Pemilik', 'Jumlah Penghuni', 'Korban', 'Penyebab', 'Kronologi',
  'Tindakan', 'Kerugian', 'Harta Terselamatkan', 'Luas Area', 'Jarak Tempuh', 'Estimasi Perjalanan',
  'Waktu Laporan', 'Waktu Berangkat', 'Waktu Tiba', 'Waktu Mulai', 'Waktu Selesai', 'Waktu Kembali',
  'Jumlah Unit Armada', 'Armada', 'Kendala', 'Rincian Kegiatan', 'Personel', 'Yang Melaporkan', 'Folder Drive', 'Jumlah Foto', 'Status',
] as const;
export const PHOTO_HEADERS = [
  'Waktu Upload', 'ID Laporan', 'Kategori', 'Tanggal', 'Nama File', 'URL Drive', 'File ID', 'Folder Drive',
  'Latitude', 'Longitude', 'Google Maps', 'Sumber Foto', 'Ada GPS', 'Waktu Foto', 'Alamat Foto', 'Keterangan', 'Status',
] as const;
export const REPORT_INDEX = Object.freeze(Object.fromEntries(REPORT_HEADERS.map((name, index) => [name, index])));
export const PHOTO_INDEX = Object.freeze(Object.fromEntries(PHOTO_HEADERS.map((name, index) => [name, index])));
