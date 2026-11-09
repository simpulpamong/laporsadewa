export interface GpsPoint { lat: number; lng: number }
export interface GeoAddress { full: string; road: string; parts: string[] }
export interface ExifData { gps?: GpsPoint; dto?: string; dtd?: string; dateTime?: string; tzOff?: number }

export interface ProcessedPhoto {
  id: string;
  data: string;
  mime: string;
  sizeKB: number;
  source: 'camera' | 'gallery';
  exif: ExifData | null;
  exifAddr: GeoAddress | null;
  watermarked: boolean;
  processing?: boolean;
  procLabel?: string;
  ts?: string;
}

export interface PhotoMetaPayload {
  hasGps: boolean;
  lat: number | null;
  lng: number | null;
  datetime: string | null;
  address: string | null;
  source: string;
}
