# SADEWA Admin

**SADEWA Admin — Panel Admin Satpol PP Ponorogo** (v1.0.0)  
Workspace admin terpisah: **Vite + React + TypeScript** (frontend) + **Express** (API) — hybrid, siap Vercel. Terintegrasi dengan **Firestore & Google (Drive/Sheets/Apps Script)** yang sama dengan **SADEWA**.

## Fitur utama
- **Autentikasi & RBAC:** login (bcrypt, sesi server-side), **lockout 5× salah (cooldown 5 menit, persisten)**, tema light/dark. Role **`superadmin`** (penuh) dan **`admin`** (scope kategori). Profil, ubah password, bootstrap/seed & user CRUD (guard superadmin terakhir).
- **Beranda:** statistik & grafik pemantauan (ringkas, scope-aware).
- **Rekap:** daftar laporan (scope-aware) tampilkan kolom sesuai header/format, **edit, lightbox, hapus → Sampah (restore/hapus permanen)**, sinkron best-effort ke sheet. **Cetak Rekap & Berita Acara** formal (kop/TTD/footer) memakai **Format Cetak** tersimpan.
- **Peta (2 tab, terintegrasi):**
  - **Peta (Titik Laporan):** titik **GPS/EXIF** laporan/foto, filter kategori/subkategori/rentang tanggal (scope-aware), modal detail, **Buka di Google Maps / Rute / Folder Drive**, kontrol peta & layer.
  - **Pemetaan** (port penuh fitur `/data/PETA`, modular `src/pemetaan/*`): **geojson kecamatan/desa/kabupaten Ponorogo** (`public/data/*`), **choropleth/pewarnaan semua kec & desa** per kategori/tingkat skor, label, batas, inspector/seleksi wilayah, basemap, pengaturan. **Kategori & skor pemetaan di Firestore** (`pemetaan_categories`, `pemetaan_scores`) — *bukan IndexedDB* (IDB hanya cache muat instan/offline-read), **auto-seed preset “Kerawanan Kebakaran”** (beserta preset bawaan) saat koleksi kosong (idempotent), sinkron latar + revalidasi fokus/interval (realtime-ish). **Overlay “Titik Laporan”** (GPS/EXIF, foto thumbnail, popup) dengan **filter kategori/subkategori/rentang tanggal**. **Cetak lengkap** (semua kemampuan PETA): **PDF HD (client/offline)**, **Cetak langsung**, **Peta Vektor (Server)** `POST /api/export-pdf` (+ `/api/pemetaan/export-pdf`, `@react-pdf/renderer`) — **A4–A0, F4, kustom/banner besar, orientasi, DPI, kop/TTD/catatan, legenda, skala, utara, geometri penuh**. Kop default selaras **SADEWA — Satpol PP Kabupaten Ponorogo**.
- **Drive:** file manager **Google Drive API v3** (bukan iframe) — roots scope-aware (global/per kategori), list/breadcrumb, upload/download, rename/pindah ke sampah/hapus permanen.
- **Pengaturan:** profil, ubah password, **Format Cetak/Kop** (tersimpan, dipakai Rekap/BA), **Install App (PWA)** — *card hanya muncul jika belum terinstal*, tentang. (superadmin mengelola format cetak).
- **Kategori & Subkategori:** dinamis (CRUD superadmin), foto/pilihan 1–20 (aset `assets/kategori/1-20.webp` ter-resolve), format & parser (template + field/alias/wajib/tipe), sheet/drive per kategori/sub, **provisioning** spreadsheet/folder per kategori (Apps Script/Google API) & bootstrap default.
- **PWA installable (admin):** manifest + service worker (`sadewa-admin-v1.0.0`), **tanpa modal prompt** — opsi install hanya **card di Pengaturan** (hilang saat sudah terinstal).
- **UI konsisten:** modal/scroll/dropdown/datepicker/alert/lightbox custom (tanpa native alert/confirm), tema gelap/terang.
- **Performa & hemat Firestore:** SWR cache GET client (`src/lib/api.ts`, TTL + invalidasi mutasi + stale-on-focus) → navigasi gesit; cache memori server untuk config/pemetaan GET (TTL, invalidasi mutasi). Perubahan menyesuaikan (realtime-ish, hemat baca).

## Stack
- Frontend: Vite 6, React 19, TypeScript, Tailwind CSS 4, React Router 7, `lucide-react`, `motion`, `recharts`.
- Peta/pemetaan: Leaflet, `react-leaflet`, `jspdf`, `@react-pdf/renderer` (vektor server), `clsx`.
- Backend/API: Express 5, `firebase-admin`/Firestore, `googleapis` (Drive/Sheets), `bcryptjs`, `cors`.
- Deploy: Vercel **hybrid** (`vercel.json` + `api/index.ts` → `handler` Express), `outputDirectory: dist/client`, SPA rewrite; `bodyParser: false` (Express menangani body, incl. upload base64 ~20MB; perhatikan batas body/timeout plan Vercel).

## Struktur (ringkas)
- `src/api/server.ts` — Express API (auth/RBAC, users, kategori/subkategori, rekap+manajemen, drive-config & **Drive API v3** manager, print-settings, bootstrap/provisioning, dashboard, **pemetaan categories/scores Firestore + cache**, **export-pdf** vektor). `src/api/exportPdf.ts` — renderer PDF vektor. `api/index.ts` — handler Vercel.
- `src/pages/` — `Login`, `Beranda`, `Rekap`, `Sampah`, `Peta` (tab **Peta** & **Pemetaan**), `Drive`, `Kategori`, `FormatParser`, `Storage`, `Pengguna`, `Pengaturan`.
- `src/pemetaan/` — port modul PETA (lib+components+print) + `MapCanvas` overlay titik laporan.
- `src/lib/` — `api` (SWR), `printSettings`/cetak util, `kategoriImage`.
- `src/components/` — layout (Sidebar/Topbar/AccountDropdown/JamWib), ui (Modal/Dialog/Dropdown/DatePicker/Lightbox/Toaster), PWA.
- `public/` — `data/*.geojson` (Ponorogo), `assets/kategori/1-20.webp`, `manifest.webmanifest`, `sw.js`.

## Persyaratan
- Node (LTS disarankan), npm.

## Setup lokal
```bash
cd /data/SiproGo/sadewa-admin
npm install
# siapkan .env (lihat variabel). Di workspace ini admin .env bisa symlink ke /data/SiproGo/sadewa/.env (jangan commit).
npm run dev      # tsx src/api/server.ts (API + Vite middleware, default PORT 3010)
```
Build & run produksi mandiri: `npm run build` → `dist/client` + `dist/server.cjs`, lalu `npm start`.

## Skrip
- `npm run dev` — dev (Express + Vite middleware)
- `npm run build` — `vite build` + bundle server (`dist/server.cjs`)
- `npm start` — `node dist/server.cjs`
- `npm run typecheck` — `tsc --noEmit`

## Variabel lingkungan (contoh; rahasia jangan di-commit)
> Set di `.env` lokal / Vercel Project Settings. Sumber env bisa disamakan dengan SADEWA.

- **Firebase (wajib untuk data):** `FIREBASE_SERVICE_ACCOUNT` (JSON service account, proyek sama).
- **Google/Drive/Sheets/Apps Script:** OAuth `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` **atau** `GOOGLE_SERVICE_ACCOUNT_JSON`/`GOOGLE_SERVICE_ACCOUNT_KEY`; `GOOGLE_DRIVE_FOLDER_ID`/`FOLDER_UTAMA_ID`/`SADEWA_DRIVE_FOLDER_ID`; `GOOGLE_SHEET_ID`/`SPREADSHEET_ID`; `APPS_SCRIPT_URL`, `APPS_SCRIPT_TOKEN`; `DRIVE_FOLDER_URL` (opsional).
- **Server/auth/CORS:** `PORT` (default 3010), `ALLOWED_ORIGINS` (CSV; `*.vercel.app` diizinkan di Vercel), `SEED_ADMIN_USERNAME`/`SEED_ADMIN_PASSWORD` (bootstrap), `NODE_ENV`.
- **Opsional:** `CLOUDINARY_*`, `DEVELOPER_EMAIL`. (Sebagian env terbaca untuk kompatibilitas ekosistem SADEWA.)

## Koleksi Firestore (utama)
- `admin_users`, `report_categories`, `report_subcategories` (+ `format` parser & `config` sheet/drive)
- `sadewa_reports` (rekap; ditulis SADEWA / dikelola admin)
- `app_settings/print` (format cetak/kop)
- **Pemetaan:** `pemetaan_categories`, `pemetaan_scores` (kerawanan wilayah) — sumber kebenaran Firestore.

## Bootstrap awal
1. Buat superadmin: `POST /api/auth/bootstrap` (body `{"password":"..."}`) atau set `SEED_ADMIN_PASSWORD` (+ opsional `SEED_ADMIN_USERNAME`).
2. Login superadmin → **Pengguna & Role** atur akun/scope; **Kategori & Subkategori** / bootstrap default bila perlu → sesuaikan format/sheet/drive → **provisioning** spreadsheet+folder per kategori bila diperlukan.
3. **Pemetaan:** kategori kerawanan **auto-seed** (termasuk *Kerawanan Kebakaran*) saat koleksi kosong; dapat ditambah/diedit (tersimpan Firestore).

## Deploy (Vercel, hybrid)
- `vercel.json`: build `npm run build`, output `dist/client`, rewrites `/api/*` → `/api` (serverless function dari `api/index.ts` → Express) dan SPA fallback `/index.html`. `api/index.ts` menonaktifkan bodyParser (Express parsing).
- **Sesi admin:** disimpan di Firestore (`admin_sessions`, token di-hash SHA-256 sebagai ID dokumen) dengan cache memori singkat per instance — dirancang agar tahan lintas instance/cold start Vercel. Rate-limit login tetap in-memory per instance (pertahanan parsial).
- **Batas request:** `express.json` server dibatasi 4MB; upload gambar dikompresi/divalidasi per endpoint. Perhatikan juga **batas body & timeout** function Vercel. Cache memori server bersifat per-instance (bonus hemat baca).

## Catatan operasional
- Kategori/format **sumber kebenaran di Firestore** (app-driven). Rekap/cetak/peta menghormati scope & konfigurasi. Pemetaan skor/kategori = **shared** Firestore (gesit via cache + revalidasi).
- **Apps Script** tetap executor tipis (app-driven); deploy/share & izin sheet/folder sesuai kebutuhan. Firestore rules: deploy bila diubah (server/Admin SDK bypass rules).
- Aksesibilitas & z-index dijaga agar dropdown/modal/lightbox/toast **tak tertutup peta/Leaflet**.

## Lisensi / penggunaan
Internal — Satpol PP Kabupaten Ponorogo. Sesuaikan lisensi bila dipublikasikan.