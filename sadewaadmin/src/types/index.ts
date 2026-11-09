export type Role = 'superadmin' | 'admin';

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  /** Parent category IDs this admin can access. Empty/omitted for superadmin = all. */
  categoryScopes: string[];
  active: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface SessionUser extends AdminUser {
  token?: string;
}

export interface SheetDriveConfig {
  /** Google Spreadsheet ID override (empty = use global/env) */
  spreadsheetId?: string;
  /** Google Drive root folder ID override */
  driveRootFolderId?: string;
  /** Sheet/tab names per kind */
  reportSheet?: string;
  photoSheet?: string;
  narrativeSheet?: string;
  /** Drive folder name for this scope */
  driveFolder?: string;
}

export interface ReportCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  /** (Legacy) tidak dipakai; logo kategori otomatis (Damkar/Satpol). */
  image?: string;
  order: number;
  active: boolean;
  config: SheetDriveConfig;
  createdAt?: number;
  updatedAt?: number;
}

export interface FormatField {
  key: string;
  label: string;
  /** Aliases/label patterns to match in pasted text (one per line or comma) */
  aliases: string[];
  required?: boolean;
  /** hint: text, time, number, multiline */
  type?: 'text' | 'time' | 'number' | 'multiline';
}

export interface FormatConfig {
  /** Template text shown/copied to users */
  template: string;
  /** Ordered field definitions used by dynamic parser */
  fields: FormatField[];
  /** Section/stop labels */
  stopLabels?: string[];
  version?: number;
}

export interface ReportSubcategory {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  /** Foto subkategori: "1"-"10" (→ /assets/kategori/{n}.webp) atau path/nama file. */
  image?: string;
  order: number;
  active: boolean;
  format: FormatConfig;
  config: SheetDriveConfig;
  createdAt?: number;
  updatedAt?: number;
}

export interface RekapRow {
  id: string;
  categoryId: string;
  subcategoryId: string;
  reportId?: string;
  waktuSubmit?: string;
  tanggal?: string;
  lokasi?: string;
  pelapor?: string;
  status?: string;
  folderDrive?: string;
  jumlahFoto?: number;
  raw?: Record<string, unknown>;
}
