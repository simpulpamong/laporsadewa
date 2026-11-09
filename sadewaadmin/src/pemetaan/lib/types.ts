/**
 * Domain types — PetaLoka
 * Satu sumber kebenaran untuk seluruh shape data yang diserialisasi ke
 * IndexedDB / backup file / payload API vektor.
 */

import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

/* -------------------------------------------------------------------------- */
/* Region (wilayah administratif dari GeoJSON)                                 */
/* -------------------------------------------------------------------------- */

export type RegionType = 'kabupaten' | 'kecamatan' | 'kelurahan';

export interface RegionProperties {
  /** ID stabil komposit, mis. `kecamatan:001`, `kelurahan:001-005`. */
  id: string;
  /** Kode BPS. */
  code: string;
  name: string;
  type: RegionType;
  /** Kode kecamatan induk (untuk kelurahan), null lainnya. */
  districtCode: string | null;
  districtName: string | null;
}

export type RegionFeature = Feature<Polygon | MultiPolygon, RegionProperties>;
export type RegionCollection = FeatureCollection<Polygon | MultiPolygon, RegionProperties>;

/* -------------------------------------------------------------------------- */
/* Kategori peta & skor kerawanan                                              */
/* -------------------------------------------------------------------------- */

export type Score = 1 | 2 | 3 | 4 | 5;
export const RISK_SCORES: Score[] = [1, 2, 3, 4, 5];

/** Satu tema peta (mis. Kerawanan Kebakaran). Palet urut dari skor 1 → 5. */
export interface RiskCategory {
  id: string;
  name: string;
  description: string;
  palette: [string, string, string, string, string];
  bands: [string, string, string, string, string];
  icon: string;
  /** Warna wilayah yang belum dinilai. */
  noDataColor: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScoreRecord {
  regionId: string;
  categoryId: string;
  score: Score;
  note: string;
  updatedAt: string;
}

/** Kunci: `${categoryId}::${regionId}` */
export type ScoreMap = Record<string, ScoreRecord>;

export const scoreKey = (categoryId: string, regionId: string) =>
  `${categoryId}::${regionId}`;

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* Pengaturan cetak (ukuran kertas, kop, tanda tangan)                         */
/* -------------------------------------------------------------------------- */

export type PaperId = 'A4' | 'F4' | 'A3' | 'A2' | 'A1' | 'A0' | 'custom';
export type Orientation = 'portrait' | 'landscape';

export interface PrintHeader {
  /** Judul di bawah kop, mis. "PETA KERAWANAN KEBARANAN WILAYAH KABUPATEN PONOROGO" */
  title: string;
  subtitle: string;
  agencyLine1: string;
  agencyLine2: string;
  /** Data URL gambar logo (png/jpg), dibaca via FileReader. */
  logo: string | null;
  /** Label kanan kop, mis. "TAHAN ANGGARAN 2026". */
  yearLabel: string;
}

export interface PrintSigner {
  tempat: string;
  jabatan: string;
  nama: string;
  nip: string;
}

export interface PrintConfig {
  paperId: PaperId;
  orientation: Orientation;
  /** Ukuran kustom dalam mm (hanya relevan bila paperId = 'custom'). */
  customWidthMm: number;
  customHeightMm: number;
  /** DPI raster target: 150 … 600. */
  dpi: number;
  showHeader: boolean;
  showLegend: boolean;
  showScaleBar: boolean;
  showNorthArrow: boolean;
  showTimestamp: boolean;
  showSignature: boolean;
  showFooterNote: boolean;
  showLabels: boolean;
  /** Jenis wilayah yang digambar pada keluaran cetak, terpisah dari tampilan peta. */
  mapMode: MapMode;
  /** Cakupan cetak pas pada kecamatan terpilih atau kabupaten. */
  extentMode: 'kecamatan' | 'kabupaten';
  /** Kecamatan khusus untuk cetak peta desa, terpisah dari filter peta/penilaian. */
  selectedKecamatanCode: string | null;
  /** Pakai geometri GeoJSON resolusi penuh (unduhan besar, tetap lokal). */
  preferFullGeometry: boolean;
  header: PrintHeader;
  footnote: string;
  signer: PrintSigner;
}

/* -------------------------------------------------------------------------- */
/* Tampilan peta                                                               */
/* -------------------------------------------------------------------------- */

export type MapMode = 'kecamatan' | 'desa';
export type BaseLayerId =
  | 'google-satellite'
  | 'google-hybrid'
  | 'osm'
  | 'esri-satellite'
  | 'opentopomap';

/** Bounds Leaflet: [[sud,barat],[ laut,timur]] */
export type Bounds = [[number, number], [number, number]];

export interface ViewState {
  mode: MapMode;
  baseLayer: BaseLayerId;
  labels: boolean;
  /** Kecamatan yang dipilih (memfilter desa). */
  selectedKecamatanCode: string | null;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  description?: string;
}

/* -------------------------------------------------------------------------- */
/* Backup / restore                                                            */
/* -------------------------------------------------------------------------- */

export const BACKUP_FORMAT_VERSION = 2 as const;

export interface BackupFile {
  format: 'sig-peta-hd';
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  exportedAt: string;
  appVersion: string;
  categories: RiskCategory[];
  scores: ScoreMap;
  settings: {
    print: PrintConfig;
    view: ViewState;
    activeCategoryId: string | null;
  };
}

/* -------------------------------------------------------------------------- */
/* Statistik                                                                   */
/* -------------------------------------------------------------------------- */

export interface StatsResult {
  total: number;
  scored: number;
  noData: number;
  counts: Record<Score, number>;
  average: number | null;
}
