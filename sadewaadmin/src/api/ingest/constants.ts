/**
 * Konstanta global aplikasi SADEWA.
 * Satu sumber kebenaran untuk identitas aplikasi, kategori laporan, dan
 * metadata yang dipakai oleh server maupun client.
 */

export const APP_NAME = 'SADEWA';
export const APP_VERSION = '1.0.0';
export const APP_TAGLINE = 'Sistem Aksi dan Evaluasi Praja Wibawa';
export const APP_WILAYAH = 'Ponorogo, Jawa Timur';
export const APP_CONTACT_WA = '6285159686554';

/** Bagian wilayah yang selalu menutup alamat pada watermark & laporan. */
export const APP_KABUPATEN = 'Ponorogo';
export const APP_PROVINSI = 'Jawa Timur';
export const APP_NEGARA = 'Indonesia';

/** Titik pusat peta (kota Ponorogo) + zoom default saat memilih koordinat. */
export const MAP_DEFAULT = { lat: -7.8697, lng: 111.4708, zoom: 14 } as const;
/** Zoom saat koordinat sudah diketahui (dipakai modal peta). */
export const MAP_PICK_ZOOM = 18;
/** Batas akurasi GPS (meter) yang masih dianggap layak. */
export const GPS_MAX_ACCURACY_M = 100;

export const DEVELOPER_NAME = 'Ahmad Abdul Basith, S.Tr.I.P';
export const DEVELOPER_ROLE = 'Pengembang';
export const DEVELOPER_PHOTO = '/assets/basith.webp';

/** Nama utama yang dicetak sebagai judul watermark foto, untuk semua kategori. */
export const WATERMARK_BRAND = 'SATPOL PP PONOROGO';

/** Jenis alur kerja sebuah kategori. */
export type FlowKind = 'structured' | 'sadewa';

export interface CategoryDef {
  /** Slug URL, juga dipakai sebagai scope penyimpanan lokal. */
  slug: string;
  /** Label yang tampil di form dan di sheet. */
  name: string;
  description: string;
  href: string;
  /** @deprecated tidak dipakai; kompatibilitas data lama. */
  tone?: string;
  flow: FlowKind;
  /** Penetapan fotos kopi otomatis untuk kategori tanpa label khusus. */
  photoHint: string;
  /** Ilustrasi/foto subkategori 1–10. Logo kategori otomatis (Damkar/Satpol). */
  image: string;
  /** Kategori induk (jika ini subkategori) */
  parentCategory?: { id: string; name: string; slug: string; image?: string };
  /** Logo watermark yang ditetapan ('damkar' atau 'satpol') */
  watermarkLogo?: 'damkar' | 'satpol' | string;
  /** Nama brand instansi untuk watermark (mis. 'DAMKAR PONOROGO' atau 'SATPOL PP PONOROGO') */
  watermarkBrand?: string;
}

/**
 * DATA KATEGORI/SUBKATEGORI/TEMPLATE TIDAK DI-HARDCODE DI APP.
 * Sumber kebenaran runtime = Firestore (report_categories, report_subcategories),
 * diisi via seed: `sadewa/scripts/seed-categories.mts` atau endpoint bootstrap admin.
 */

/** Batas jumlah foto per laporan. */
export const MAX_PHOTOS = 20;

/** Batas ukuran foto setelah diproses (KB). */
export const MAX_PHOTO_KB = 400;

/** Batas ukuran payload server (bytes) — 1 foto per request. */
export const MAX_UPLOAD_BYTES = 400 * 1024;
