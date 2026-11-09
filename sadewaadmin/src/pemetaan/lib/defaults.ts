/**
 * Nilai bawaan aplikasi: kategori peta awal, base map, konfigurasi
 * cetak default. Semua didefinisikan satu kali di sini.
 */

import type {
  BaseLayerId,
  PrintConfig,
  RiskCategory,
  ViewState,
} from './types';

/* -------------------------------------------------------------------------- */
/* Kategori peta bawaan                                                        */
/* -------------------------------------------------------------------------- */

export const CATEGORY_ICONS = [
  'Flame',
  'CloudRain',
  'Mountain',
  'Droplets',
  'Car',
  'Zap',
  'TriangleAlert',
  'Factory',
  'Building2',
  'Landmark',
  'Map',
  'ShieldAlert',
] as const;

export function makeCategoryDefaults(partial?: Partial<RiskCategory>): RiskCategory {
  const now = new Date().toISOString();
  return {
    id: `cat-${crypto.randomUUID()}`,
    name: 'Kategori Baru',
    description: '',
    palette: ['#2e9e5b', '#a3d34a', '#f2c744', '#ef7c3b', '#d7263d'],
    bands: ['Rendah', 'Sedang', 'Moderat', 'Tinggi', 'Ekstrem'],
    icon: 'Map',
    noDataColor: '#cbd5e1',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function defaultCategories(): RiskCategory[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'cat-kebakaran',
      name: 'Kerawanan Kebakaran',
      description: 'Tingkat kerawanan kebakaran wilayah berdasarkan lingkungan, kepadatan bangunan, dan fasilitas.',
      palette: ['#2e9e5b', '#a3d34a', '#f2c744', '#ef7c3b', '#d7263d'],
      bands: ['Tidak rawan', 'Rendah', 'Sedang', 'Tinggi', 'Sangat rawan'],
      icon: 'Flame',
      noDataColor: '#cbd5e1',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'cat-kebencanaan',
      name: 'Kerawanan Kebencanaan',
      description: 'Tingkat kerentanan wilayah terhadap bencana alam (banjir, longsor, gempa, kekeringan).',
      palette: ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#dc2626'],
      bands: ['Tidak rentan', 'Rendah', 'Sedang', 'Tinggi', 'Sangat rentan'],
      icon: 'CloudRain',
      noDataColor: '#cbd5e1',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'cat-jalan',
      name: 'Kerawanan Jalan & Transportasi',
      description: 'Titik rawan kecelakaan dan kerusakan jaringan jalan skala kabupaten.',
      palette: ['#14b8a6', '#84cc16', '#eab308', '#ea580c', '#be123c'],
      bands: ['Aman', 'Rendah', 'Sedang', 'Tinggi', 'Sangat rawan'],
      icon: 'Car',
      noDataColor: '#cbd5e1',
      createdAt: now,
      updatedAt: now,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Base map                                                                    */
/* -------------------------------------------------------------------------- */

export interface BaseLayerOption {
  id: BaseLayerId;
  label: string;
  url: string | null;
  attribution: string;
  subdomains?: string;
  maxZoom: number;
}

export const BASE_LAYERS: BaseLayerOption[] = [
  {
    id: 'google-satellite',
    label: 'Google Satellite',
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: 'Tiles © Google',
    maxZoom: 20,
  },
  {
    id: 'google-hybrid',
    label: 'Google Maps',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    attribution: 'Tiles © Google',
    maxZoom: 20,
  },
  {
    id: 'osm',
    label: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19,
  },
  {
    id: 'esri-satellite',
    label: 'Esri Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
  {
    id: 'opentopomap',
    label: 'OpenTopoMap',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap contributors',
    subdomains: 'abc',
    maxZoom: 17,
  },
];

export const baseLayerOption = (id: BaseLayerId): BaseLayerOption =>
  BASE_LAYERS.find((b) => b.id === id) ?? BASE_LAYERS[0];

export const normalizeBaseLayer = (id: unknown): BaseLayerId =>
  BASE_LAYERS.find((layer) => layer.id === id)?.id ?? 'google-satellite';

export const normalizePrintExtentMode = (mode: unknown): PrintConfig['extentMode'] =>
  mode === 'kecamatan' ? 'kecamatan' : 'kabupaten';

/* -------------------------------------------------------------------------- */
/* Default settings                                                            */
/* -------------------------------------------------------------------------- */

export const DEFAULT_VIEW: ViewState = {
  mode: 'kecamatan',
  baseLayer: 'google-satellite',
  labels: true,
  selectedKecamatanCode: null,
};

export function defaultPrintConfig(headerTitle: string): PrintConfig {
  return {
    paperId: 'A3',
    orientation: 'landscape',
    customWidthMm: 600,
    customHeightMm: 400,
    dpi: 300,
    showHeader: true,
    showLegend: true,
    showScaleBar: true,
    showNorthArrow: true,
    showTimestamp: true,
    showSignature: true,
    showFooterNote: true,
    showLabels: true,
    mapMode: 'kecamatan',
    extentMode: 'kabupaten',
    selectedKecamatanCode: null,
    preferFullGeometry: false,
    header: {
      title: headerTitle,
      subtitle: 'SADEWA · Satuan Polisi Pamong Praja Kabupaten Ponorogo',
      agencyLine1: 'PEMERINTAH KABUPATEN PONOROGO',
      agencyLine2: 'SATUAN POLISI PAMONG PRAJA',
      logo: null,
      yearLabel: '',
    },
    footnote: 'Dicetak dari SADEWA (Sistem Aksi dan Evaluasi Praja Wibawa) — Satuan Polisi Pamong Praja Kabupaten Ponorogo. Peta berbasis GeoJSON wilayah & penilaian kerawanan (skor 1–5); skala/batas bersifat indikatif.',
    signer: {
      tempat: 'Ponorogo',
      jabatan: 'Kepala Satuan Polisi Pamong Praja',
      nama: '',
      nip: '',
    },
  };
}

export const NO_DATA_COLOR = '#cbd5e1';
