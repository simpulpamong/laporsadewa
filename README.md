# SADEWA (Vite + React)

Migrasi penuh aplikasi **SADEWA — Sistem Aksi dan Evaluasi Praja Wibawa** ke stack **Vite + React (TypeScript)** dengan backend **Express** (API).

## Fitur
- Frontend Vite + React + React Router, modular (komponen & fitur dipisah).
- Backend Express untuk API: `/api/config`, `/api/drafts`, `/api/sadewa` (integrasi Firestore, Google Drive/Sheets, Apps Script, Cloudinary).
- PWA (manifest + service worker), tema gelap/terang, mobile-first.
- Alur laporan dinamis dari konfigurasi Firestore.

## Persyaratan
- Node.js 20+ (disarankan 22.x)
- npm

## Setup
```bash
cd sadewa-vite
npm install
cp .env.example .env   # lalu isi kredensial (atau gunakan .env yang sudah disediakan)
```

## Menjalankan (development)
```bash
npm run dev
```
- Client (Vite): http://localhost:3002
- Server API (Express): http://localhost:3003 (diproxy dari Vite via `/api`)

## Build & production
```bash
npm run build
npm start
```
`npm start` menjalankan server Express yang melayani `dist/` (SPA) dan API pada port `PORT` (default 3003).

Di Vercel, API di-build langsung dari `api/index.ts` dan `server/index.ts` agar seluruh dependency backend ikut terdeteksi. Atur variabel yang diperlukan backend melalui Vercel Project Settings; jangan mengandalkan file `.env` saat deploy.

## Struktur
- `src/` — aplikasi React (pages, components, features, lib, styles)
- `server/` — Express server dan route API
- `public/` — aset statis, manifest, service worker
- `.env` / `.env.example` — konfigurasi lingkungan

## Catatan
- Rahasia di `.env` jangan di-commit.
- Konfigurasi kategori/subkategori bersumber dari Firestore (sama seperti aplikasi asli).
