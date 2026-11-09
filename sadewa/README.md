# SADEWA

**SADEWA — Sistem Aksi dan Evaluasi Praja Wibawa** (v1.0.0)  
Aplikasi pelaporan Satpol PP Kabupaten Ponorogo berbasis **Next.js (App Router)**: dinamis/app-driven (kategori & subkategori dari Firestore/admin), PWA installable, mobile-first, dengan ekstraksi GPS **EXIF** foto kamera → rekap & pemetaan.

## Fitur utama
- **Dinamis & app-driven (tanpa hardcode kategori):** kategori/subkategori dibaca dari Firestore (dikelola **SADEWA Admin**) via `GET /api/config` (SWR header). Resolver dinamis-first dengan fallback aman.
- **Pelaporan per kategori/subkategori (slug dinamis):** form + template/format per subkategori (parser/format mengikuti konfigurasi), upload foto, GPS dari **EXIF** kamera (dan/atau koordinat laporan) → tersimpan ke rekap.
- **Integrasi backend:** simpan laporan/rekap ke Firestore (`sadewa_reports`) dan alur **Google Drive + Google Sheets** via Apps Script (executor tipis, menghormati payload/format per kategori). Draft (`/api/drafts`) bila tersedia.
- **PWA installable:** manifest + service worker (cache `sadewa-v1.0.0`), **banner/notif install** (saat belum terinstal, bisa ditutup sementara) + **opsi Install di Pengaturan** (muncul bila belum terinstal).
- **UI/UX:** landing & halaman kategori **rapi khusus mobile**, tema, komponen modal/alert/picker custom. Tanpa menu/link admin tersemat di landing (admin adalah aplikasi terpisah).
- **Performa & hemat Firestore:** cache server `loadDynamicConfig` (TTL) + **SWR cache** client (`src/lib/configCache.ts`, memori+sessionStorage, revalidasi fokus) → navigasi gesit namun tetap menyesuaikan perubahan.
- **Aset kategori:** `/public/assets/kategori/1-20.webp` (termasuk `19.webp`=kebakaran, `20.webp`=odnk), resolver `.webp`.
- **Aksesibilitas/SEO dasar:** `lang="id"`, metadata/manifest/robots, struktur heading, viewport.

## Stack
- Next.js **16** (App Router, Turbopack dev), React 19, TypeScript, Tailwind CSS 3.
- Firebase Admin / Firestore, Google APIs (Drive/Sheets) + Apps Script, Cloudinary (opsional), PWA (manifest + SW).

## Struktur (ringkas)
- `src/app/` — routes: landing, `[category]` (dinamis), `api/config`, `api/sadewa`, `api/drafts`, `laporan`, `manifest`, `robots`.
- `src/features/core` — `AppContext` (provider form/laporan, fallback kategori dinamis), storage, watermark, geocoding/upload.
- `src/features/sadewa` — form/submit/parser flow.
- `src/lib/server/` — `dynamicConfig` (Firestore, cached), Google Drive/Sheets/auth, rekap writer.
- `src/lib/` — `configCache` (SWR), `kategoriImage` (1-20 `.webp`), `constants` (APP v1.0.0), parser.
- `src/components/` — landing, header, PWA install, settings, map/UI.
- `public/` — `sw.js`, `assets/` (ikon & `kategori/1-20.webp`).
- `scripts/seed-production.mts` — seed/utility produksi.

## Persyaratan
- Node **22.x** (lihat `engines`), npm.

## Setup lokal
```bash
cd /data/SiproGo/sadewa
npm install
# siapkan .env (lihat variabel di bawah)
npm run dev      # http://localhost:3002
```

## Skrip
- `npm run dev` — dev server (port 3002)
- `npm run build` — build produksi Next.js
- `npm start` — jalankan build
- `npm run typecheck` / `npm run lint` / `npm run check` — verifikasi
- `npm run seed:production` — `tsx scripts/seed-production.mts`

## Variabel lingkungan (contoh; set sesuai kebutuhan)
> Rahasia (service account/token/secret) **jangan di-commit**. Di Vercel set via Project Settings → Environment Variables.

- **Firebase/Firestore (server):** `FIREBASE_SERVICE_ACCOUNT` (JSON service account, proyek sama dengan Admin).
- **Google (Drive/Sheets/Apps Script):** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (OAuth) **atau** `GOOGLE_SERVICE_ACCOUNT_JSON`/`GOOGLE_SERVICE_ACCOUNT_KEY`; `GOOGLE_DRIVE_FOLDER_ID`/`FOLDER_UTAMA_ID`; `GOOGLE_SHEET_ID`/`SPREADSHEET_ID`; `APPS_SCRIPT_URL`, `APPS_SCRIPT_TOKEN` (executor).
- **Cloudinary (opsional):** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- **Lainnya:** `DEVELOPER_EMAIL` (opsional).

## Deploy (Vercel)
- Deploy sebagai **Next.js** (native). Build: `npm run build`. Pastikan semua env di atas ter-set.
- Konfigurasi dinamis & rekap bergantung pada Firestore + kredensial Google + Apps Script (share/deploy & izin folder/sheet). `force-dynamic` dipakai pada rute data dinamis; cache/SWR menjaga performa & biaya baca.

## Catatan operasional
- **Sumber kebenaran kategori/format:** Firestore (dikelola SADEWA Admin). Jika Firestore belum terisi/terjangkau, resolver memakai fallback aman (tidak crash pada slug dinamis).
- **Rekap:** penulisan rekap via `writeRekap` (Firestore). Titik peta memakai koordinat **EXIF/GPS** laporan/foto.
- **Apps Script:** gunakan versi app-driven di `docs/apps-script/*` (sinkron dengan format per kategori) bila diterapkan di project ini.
- `sadewa-admin/.env` di workspace ini bisa berupa **symlink** ke env bersama — jangan commit rahasia.

## Lisensi / penggunaan
Internal — Satpol PP Kabupaten Ponorogo. Sesuaikan lisensi bila dipublikasikan.