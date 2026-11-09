# SADEWA — Apps Script (Satpol PP Ponorogo)

Google Apps Script Web App untuk integrasi **SADEWA** (Next.js): pembuatan ID laporan, upload foto ke Google Drive, dan penulisan data ke Google Sheets.

## Fitur
- **`generateReportId`**: ID unik per kategori + tanggal (`KEBAKARAN-01/ddMMyyyy`, `ODNK-01/ddMMyyyy`) dengan lock (aman dari race condition).
- **`upload`**: terima foto base64, simpan ke Drive (struktur folder kategori/bulan/tanggal/ID laporan bila tersedia), set *Anyone with link → Viewer*, bagikan ke `DEVELOPER_EMAIL` (opsional), dukung idempotency (`idempotencyKey`).
- **`submit`**: append baris ke sheet target; otomatis membuat tab + header + format (sinkron `schema-contract.ts` / `category-config.ts`).
- Validasi token (`APPS_SCRIPT_TOKEN`), logging error, respons JSON konsisten `{ success, ... }`.

## Kontrak (sesuai kode Next.js)
| Action | Payload penting | Respons penting |
|---|---|---|
| `generateReportId` | `token`, `data.category` (`KEBAKARAN`/`ODNK`) | `reportId` (juga `data.reportId`) |
| `upload` | `token`, `fileData{content,mimeType,name}`, `category`, `date`, `reportId`, `folderId`, `idempotencyKey` | `url`/`linkFile`, `folderUrl`, `fileId`, `folderId` |
| `submit` | `token`, `data.sheetName`, `data.rows[][]` | `appended`, `sheetName` |

Header/sheet mengikuti:
- Laporan: `KEBAKARAN`, `ODNK` (37 kolom, lihat `REPORT_HEADERS`)
- Foto: `DOKUMENTASI KEBAKARAN`, `DOKUMENTASI ODNK` (17 kolom)
- Narasi: `NARASI KEBAKARAN`, `NARASI ODNK` (5 kolom)

## Setup
1. Buat project **Apps Script** (disarankan *standalone*; atau terikat ke spreadsheet target).
2. Tambahkan file `Code.gs` dan `appsscript.json` (aktifkan tampilan manifest di Project Settings).
3. **Services**: aktifkan **Drive API v3** (Advanced Google Service) — sesuaikan dengan `appsscript.json`.
4. **Project Settings → Script Properties**:
   - `APPS_SCRIPT_TOKEN` = token rahasia (harus sama dengan env aplikasi)
   - `GOOGLE_SHEET_ID` = ID spreadsheet target (wajib jika standalone)
   - `GOOGLE_DRIVE_FOLDER_ID` = ID folder root Drive (opsional; app bisa kirim `folderId`)
   - `DEVELOPER_EMAIL` = email opsional (diberi akses editor file)
   - `DEFAULT_TIMEZONE` = `Asia/Jakarta`
5. **Deploy → New deployment → Web app**
   - *Execute as*: **Me**
   - *Who has access*: **Anyone** (atau sesuai kebijakan org). Keamanan tetap dijaga oleh `APPS_SCRIPT_TOKEN`.
6. Salin URL deployment ke env Next.js:
   - `APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec`
   - `APPS_SCRIPT_TOKEN=<token-yang-sama>`

## Catatan operasional
- `doPost` menerima JSON (`text/plain`/JSON) — sesuai cara Next.js mengirim request.
- Counter ID memakai sheet tersembunyi `_SADEWA_COUNTERS` + `LockService` (kuat untuk beban paralel moderat).
- Upload memakai idempotency best-effort via `CacheService` + sheet `_SADEWA_IDEMPOTENCY`.
- Jika ingin *hanya* memakai Google API langsung dari Next.js, Apps Script bisa dinonaktifkan; namun `generateReportId` pada implementasi saat ini membutuhkan `APPS_SCRIPT_URL`.

## Uji cepat (opsional)
Kirim POST JSON ke `APPS_SCRIPT_URL`:
```json
{ "action": "ping", "token": "<token>" }
```
Ekspektasi: `{ "success": true, "message": "pong", ... }`
