export interface GpsPoint {
  lat: number;
  lng: number;
}

export interface GeoAddress {
  full: string;
  road: string;
  parts: string[];
}

export interface ExifData {
  gps?: GpsPoint;
  /** DateTimeOriginal */
  dto?: string;
  /** DateTimeDigitized */
  dtd?: string;
  /** DateTime (IFD0) */
  dateTime?: string;
  /** Timezone offset dalam jam. */
  tzOff?: number;
}

export interface PhotoData {
  id: string;
  /** Data URL hasil proses; null saat masih diproses. */
  data: string | null;
  mime: string;
  sizeKB: number;
  compressed: boolean;
  processing: boolean;
  procLabel: string;
  source: 'camera' | 'gallery';
  exif: ExifData | null;
  exifAddr: GeoAddress | null;
  /** Cap waktu pengambilan foto (format DD/MM/YYYY HH:MM:SS). */
  ts: string;
  /** Urutan tampil. */
  order: number;
  watermarked?: boolean;
  /** Foto yang dipulihkan dari draft server. */
  fromDraft?: boolean;
}

/** Pengaturan tampilan & fitur — disimpan per sesi perangkat. */
export interface AppSettings {
  wmCam: boolean;
  wmGal: boolean;
  ocrGal: boolean;
  minimap: boolean;
  theme: 'light' | 'dark';
}

export const defaultSettings: AppSettings = {
  wmCam: true,
  wmGal: false,
  ocrGal: false,
  minimap: true,
  theme: 'dark',
};

/** Lokasi manual untuk foto tanpa EXIF (khusus alur sadewa). */
export interface ManualLocation {
  jalan: string;
  nodukuh: string;
  desa: string;
  kec: string;
  kab: string;
  prov: string;
}

export const defaultLocation: ManualLocation = {
  jalan: '',
  nodukuh: '',
  desa: '',
  kec: '',
  kab: 'Ponorogo',
  prov: 'Jawa Timur',
};

/** Sumber koordinat: GPS perangkat atau dipilih manual dari peta. */
export type CoordSource = 'gps' | 'manual';

/** Data laporan kategori terstruktur. */
export interface StructuredReport {
  kegiatan: string;
  tanggal: string;
  kecamatan: string;
  desaKelurahan: string;
  detailAlamat: string;
  keterangan: string;
  /** Koordinat lokasi — dari GPS perangkat atau picked dari peta. */
  lat: number | null;
  lng: number | null;
  coordSource: CoordSource | null;
  /** Akurasi GPS (meter); null bila koordinat dipilih manual. */
  coordAccuracy: number | null;
}

export const emptyStructuredReport: StructuredReport = {
  kegiatan: '',
  tanggal: '',
  kecamatan: '',
  desaKelurahan: '',
  detailAlamat: '',
  keterangan: '',
  lat: null,
  lng: null,
  coordSource: null,
  coordAccuracy: null,
};

/** Metadata foto ringkas yang dikirim ke server. */
export interface PhotoMetaPayload {
  hasGps: boolean;
  lat: number | null;
  lng: number | null;
  datetime: string | null;
  address: string | null;
  source: string;
}

export type AlertType = 'success' | 'error' | 'warn' | 'info';

export interface AlertConfig {
  type: AlertType;
  title: string;
  /** Markup statis + nilai yang sudah di-escape. */
  message: string;
}

export interface ConfirmConfig {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

export type LoadingKind = 'submit' | 'draft' | 'generic';

export interface LoadingStep {
  icon: string;
  label: string;
}

export interface LoadingOverlayState {
  show: boolean;
  kind: LoadingKind;
  title: string;
  sub: string;
  progress: number;
  step: number;
  steps: LoadingStep[];
}

export interface MapModalState {
  lat: number;
  lng: number;
  info: string;
}

export interface ServerConfig {
  cloudinary: boolean;
  firebase: boolean;
  google: boolean;
  sheet: boolean;
  drive: boolean;
  appsScript: boolean;
}

export type UploadMode = 'direct' | 'server';
