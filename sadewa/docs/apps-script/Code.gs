/**
 * SADEWA / Satpol PP Ponorogo — Google Apps Script Web App
 *
 * Integrasi dengan aplikasi Next.js (src/app/api/sadewa/*, src/lib/server/*).
 * Aksi yang didukung:
 *   - generateReportId : buat ID laporan unik per kategori/tanggal
 *   - upload           : simpan foto (base64) ke Google Drive + set izin
 *   - submit           : append baris ke Google Sheets (buat tab/header bila perlu)
 *
 * Kontrak respons: { success: boolean, ...data, message?: string }
 *
 * === SETUP ===
 * 1) Buat project Apps Script (standalone atau terikat spreadsheet).
 * 2) Salin Code.gs + appsscript.json.
 * 3) Aktifkan Advanced Service: Drive API (v3) — sesuaikan appsscript.json / Services.
 * 4) Project Settings → Script Properties:
 *      APPS_SCRIPT_TOKEN       = token rahasia (sama dengan env Next.js)
 *      GOOGLE_SHEET_ID        = ID spreadsheet target (opsional jika terikat)
 *      GOOGLE_DRIVE_FOLDER_ID  = ID folder Drive root (opsional; bisa dari payload)
 *      DEVELOPER_EMAIL         = email editor opsional
 *      DEFAULT_TIMEZONE        = Asia/Jakarta
 * 5) Deploy → New deployment → Web app
 *      Execute as: Me
 *      Who has access: Anyone (atau Anyone within org) — token tetap wajib.
 * 6) Isi env Next.js: APPS_SCRIPT_URL, APPS_SCRIPT_TOKEN.
 */

/** ===== Konfigurasi / Konstanta (sinkron dengan schema-contract.ts & category-config.ts) ===== */
var TZ = PropertiesService.getScriptProperties().getProperty('DEFAULT_TIMEZONE') || 'Asia/Jakarta';

// Catatan: skema/header, parser, format, dan kategori/subkategori laporan TIDAK ditentukan di Apps Script.
// Semuanya dikendalikan aplikasi (Firestore/Admin/SADEWA). Apps Script hanya eksekutor:
// append/move/restore/delete row, upload/Drive, generate ID, mengikuti instruksi (headers/sheet/nama/prefix/folderId) dari app.

var COUNTER_SHEET = '_SADEWA_COUNTERS';
var IDEMPOTENCY_SHEET = '_SADEWA_IDEMPOTENCY';

/** ===== Entry points ===== */
function doGet(e) {
  return json_({ success: true, service: 'SADEWA Apps Script', time: nowWib_() });
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    var props = PropertiesService.getScriptProperties();
    var expectedToken = String(props.getProperty('APPS_SCRIPT_TOKEN') || '');
    var providedToken = String(body.token || '');
    if (expectedToken && providedToken !== expectedToken) {
      return json_({ success: false, message: 'Token tidak valid.' }, 401);
    }

    var action = String(body.action || '');
    var data = body.data || {};

    switch (action) {
      case 'generateReportId':
        return json_(generateReportId_(body, data));
      case 'upload':
        return json_(uploadFile_(body, data));
      case 'submit':
        return json_(submitRows_(body, data));
      case 'moveToTrash':
        return json_(moveToTrash_(body, data));
      case 'restoreFromTrash':
        return json_(restoreFromTrash_(body, data));
      case 'deletePermanent':
        return json_(deletePermanent_(body, data));
      case 'updateReport':
        return json_(updateReport_(body, data));
      case 'trashDrive':
        return json_(trashDrive_(body, data));
      case 'ping':
        return json_({ success: true, message: 'pong', time: nowWib_() });
      default:
        return json_({ success: false, message: 'Aksi tidak dikenal: ' + action }, 400);
    }
  } catch (err) {
    var msg = (err && err.message) ? err.message : String(err);
    console.error('doPost error: ' + msg + '\n' + (err && err.stack ? err.stack : ''));
    return json_({ success: false, message: msg });
  }
}

/** ===== Actions ===== */
function generateReportId_(body, data) {
  // prefix/kode ID ditentukan app (Firestore/config). Apps Script hanya membuat counter unik.
  var prefix = safeCode_((data && (data.prefix || data.categoryCode || data.category)) || (body && (body.prefix || body.category)), 'LAPORAN').replace(/[^A-Z0-9]/g, '').slice(0, 16) || 'LAPORAN';
  var date = new Date();
  var ddmmyyyy = Utilities.formatDate(date, TZ, 'ddMMyyyy');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ss = getSpreadsheet_();
    ensureSheet_(ss, COUNTER_SHEET, ['Key', 'LastSeq', 'UpdatedAt']);
    var sheet = ss.getSheetByName(COUNTER_SHEET);
    var key = prefix + '_' + ddmmyyyy;
    var found = findRowByKey_(sheet, 1, key); // col A (1-based)
    var seq = 1;
    if (found) {
      seq = Number(sheet.getRange(found, 2).getValue() || 0) + 1;
      sheet.getRange(found, 2).setValue(seq);
      sheet.getRange(found, 3).setValue(nowWib_());
    } else {
      sheet.appendRow([key, seq, nowWib_()]);
    }
    var reportId = prefix + '-' + String(seq).padStart(2, '0') + '/' + ddmmyyyy;
    return { success: true, reportId: reportId, data: { reportId: reportId }, prefix: prefix };
  } finally {
    lock.releaseLock();
  }
}

function uploadFile_(body, data) {
  var fileData = body.fileData || (data && data.fileData) || {};
  var content = String(fileData.content || '');
  var mimeType = String(fileData.mimeType || fileData.mime || 'image/jpeg');
  var name = String(fileData.name || ('foto_' + Date.now() + '.jpg'));
  var idempotencyKey = String(body.idempotencyKey || (data && data.idempotencyKey) || '');
  var targetFolderId = String(body.folderId || (data && data.folderId) || '');

  if (!content) return { success: false, message: 'Konten file kosong.' };

  // Idempotency: jika key sudah pernah diproses, kembalikan hasil lama.
  if (idempotencyKey) {
    var cached = getIdempotent_(idempotencyKey);
    if (cached) return cached;
  }

  var bytes = Utilities.base64Decode(content);
  var blob = Utilities.newBlob(bytes, mimeType, name);

  var folder = resolveFolder_(body, data, targetFolderId);
  // Hindari duplikat nama di folder target bila retry.
  var existing = folder.getFilesByName(name);
  var file = existing.hasNext() ? existing.next() : folder.createFile(blob);
  if (existing.hasNext() || file.getSize() !== bytes.length) {
    // Jika file sudah ada dengan nama sama, pakai yang ada (idempotent upload).
    try { file.setContent(blob.getDataAsString()); } catch (e) { /* DriveApp may not allow binary setContent; keep existing */ }
  }

  makePublicReader_(file);
  shareDeveloper_(file);

  var fileId = file.getId();
  var folderId = folder.getId();
  var result = {
    success: true,
    url: 'https://drive.google.com/uc?export=view&id=' + fileId,
    linkFile: 'https://drive.google.com/file/d/' + fileId + '/view',
    folderUrl: 'https://drive.google.com/drive/folders/' + folderId,
    fileId: fileId,
    folderId: folderId,
    name: file.getName()
  };

  if (idempotencyKey) putIdempotent_(idempotencyKey, result);
  return result;
}

function submitRows_(body, data) {
  var sheetName = String((data && data.sheetName) || body.sheetName || '');
  var rows = (data && data.rows) || body.rows || [];
  var headers = (data && data.headers) || body.headers || []; // dikirim oleh app (sumber skema)
  var replaceHeaders = Boolean((data && data.replaceHeaders) || body.replaceHeaders);
  if (!sheetName) return { success: false, message: 'sheetName wajib diisi.' };
  if (!rows || !rows.length) return { success: true, message: 'Tidak ada baris untuk ditulis.', appended: 0 };

  var ss = getSpreadsheet_((data && data.spreadsheetId) || body.spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  // tulis header bila sheet kosong/baru, atau bila app secara eksplisit mengatur skema (replaceHeaders).
  if (headers && headers.length) {
    var first = sheet.getLastRow() >= 1 ? sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn() || 1)).getValues()[0] : [];
    var empty = !sheet.getLastRow() || first.every(function(v){ return v === '' || v === null; });
    var onlyHeader = sheet.getLastRow() <= 1;
    if (empty || (replaceHeaders && onlyHeader)) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      formatHeader_(sheet, headers.length);
    } else if (replaceHeaders) {
      // sheet berisi data: perbarui header saja (baris 1) agar skema app jadi sumber kebenaran; data lama tetap ada.
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      formatHeader_(sheet, headers.length);
    }
  }

  // Append rows (batch)
  var normalized = rows.map(function(r) { return Array.isArray(r) ? r : [r]; });
  var startRow = sheet.getLastRow() + 1;
  var width = Math.max((headers && headers.length) || 0, normalized.reduce(function(m, r){ return Math.max(m, r.length); }, 0), sheet.getLastColumn() || 0);
  var padded = normalized.map(function(r) {
    var out = r.slice(0, width);
    while (out.length < width) out.push('');
    return out;
  });
  if (padded.length && width) sheet.getRange(startRow, 1, padded.length, width).setValues(padded);

  return { success: true, appended: padded.length, sheetName: sheetName };
}

/** ===== Helpers: Sheets ===== */
function getSpreadsheet_(overrideId) {
  var id = String(overrideId || '').trim();
  if (!id) {
    var props = PropertiesService.getScriptProperties();
    id = String(props.getProperty('GOOGLE_SHEET_ID') || '');
  }
  if (id) return SpreadsheetApp.openById(id);
  // fallback: container-bound spreadsheet
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('GOOGLE_SHEET_ID belum diatur di Script Properties.');
}

function getSheetHeaders_(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return [];
  var lastCol = Math.max(1, sheet.getLastColumn());
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  // Pastikan header baris 1
  var firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var empty = firstRow.every(function(v){ return v === '' || v === null; });
  var mismatch = firstRow.join('|') !== headers.join('|');
  if (sheet.getLastRow() === 0 || empty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else if (mismatch && headers && headers.length) {
    // Jangan overwrite data; update header jika baris 1 tampak seperti header lama/berbeda
    // tapi aman: tulis ulang header di baris 1.
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  formatHeader_(sheet, headers.length);
  return sheet;
}

function formatHeader_(sheet, width) {
  try {
    sheet.setFrozenRows(1);
    var range = sheet.getRange(1, 1, 1, width);
    range.setFontWeight('bold');
    range.setBackground('#1f4f78');
    range.setFontColor('#ffffff');
    range.setWrap(true);
  } catch (e) { /* non-fatal */ }
}

function findRowByKey_(sheet, col, key) {
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var values = sheet.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(key)) return i + 2;
  }
  return null;
}

/** ===== Helpers: Drive ===== */
function resolveFolder_(body, data, targetFolderId) {
  // folderId ter-resolve dari app diprioritaskan. Jika tidak ada, bangun path memakai driveFolder dari app.
  if (targetFolderId && looksLikeId_(targetFolderId)) {
    try { return DriveApp.getFolderById(targetFolderId); } catch (e) { /* fallback to path */ }
  }
  var props = PropertiesService.getScriptProperties();
  var rootId = targetFolderId && looksLikeId_(targetFolderId) ? targetFolderId
    : String((data && data.rootFolderId) || props.getProperty('GOOGLE_DRIVE_FOLDER_ID') || '');
  if (!rootId) throw new Error('Folder Drive target tidak tersedia (folderId/GOOGLE_DRIVE_FOLDER_ID).');
  var root = DriveApp.getFolderById(rootId);
  var driveFolder = String((data && data.driveFolder) || body.driveFolder || (data && data.categoryFolder) || body.category || (data && data.category) || '').trim();
  var dateStr = String(body.date || (data && data.date) || '');
  var reportId = String(body.reportId || (data && data.reportId) || '');
  var folder = root;
  if (driveFolder) folder = getOrCreateChild_(folder, driveFolder);
  if (dateStr) {
    // date expected like dd MMMM yyyy; create month + date structure best-effort
    folder = getOrCreateChild_(folder, monthFromDate_(dateStr));
    folder = getOrCreateChild_(folder, dateStr);
  }
  if (reportId) folder = getOrCreateChild_(folder, reportId);
  return folder;
}

function getOrCreateChild_(parent, name) {
  if (!name) return parent;
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function monthFromDate_(dateStr) {
  // "18 Maret 2026" -> "Maret 2026"; fallback keep original
  var m = String(dateStr).match(/([A-Za-z]+)\s+(\d{4})$/);
  return m ? (m[1] + ' ' + m[2]) : dateStr;
}

function makePublicReader_(file) {
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {
    try { Drive.Files.update({ role: 'reader', type: 'anyone' }, file.getId(), null, { supportsAllDrives: true }); } catch (e2) {}
  }
}

function shareDeveloper_(file) {
  var email = String(PropertiesService.getScriptProperties().getProperty('DEVELOPER_EMAIL') || '');
  if (!email) return;
  try { file.addEditor(email); } catch (e) { console.warn('shareDeveloper: ' + e); }
}

/** ===== Idempotency (best-effort) ===== */
function getIdempotent_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var c = cache.get('idem_' + key);
    if (c) return JSON.parse(c);
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(IDEMPOTENCY_SHEET);
    if (!sheet) return null;
    var row = findRowByKey_(sheet, 1, key);
    if (!row) return null;
    var json = sheet.getRange(row, 2).getValue();
    return json ? JSON.parse(String(json)) : null;
  } catch (e) { return null; }
}

function putIdempotent_(key, result) {
  try {
    CacheService.getScriptCache().put('idem_' + key, JSON.stringify(result), 21600);
    var ss = getSpreadsheet_();
    var sheet = ensureSheet_(ss, IDEMPOTENCY_SHEET, ['Key', 'ResultJson', 'CreatedAt']);
    if (!findRowByKey_(sheet, 1, key)) sheet.appendRow([key, JSON.stringify(result), nowWib_()]);
  } catch (e) { /* best-effort */ }
}


/** ===== Manajemen Laporan: edit / sampah / restore / hapus permanen ===== */
function colIndex_(headers, names) {
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').toUpperCase().trim();
    for (var j = 0; j < names.length; j++) if (h === String(names[j]).toUpperCase()) return i;
  }
  return -1;
}
function findRowIndicesByReportId_(sheet, reportId, idColIdx) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  var last = sheet.getLastRow();
  var vals = sheet.getRange(2, idColIdx + 1, last - 1, 1).getValues();
  var idxs = [];
  var rid = String(reportId || '').trim();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0] || '').trim() === rid) idxs.push(i + 2); // 1-based
  return idxs;
}
function trashSheetName_(name) { return 'SAMPAH - ' + name; }

function moveRowsToTrashSheet_(ss, sourceName, reportId, spreadsheetId) {
  var src = ss.getSheetByName(sourceName);
  if (!src || src.getLastRow() < 2) return { moved: 0, sheet: sourceName };
  var headers = getSheetHeaders_(src);
  var idIdx = colIndex_(headers, ['ID LAPORAN', 'ID_LAPORAN', 'REPORTID']);
  if (idIdx < 0) idIdx = 1; // fallback col B
  var rowsIdx = findRowIndicesByReportId_(src, reportId, idIdx);
  if (!rowsIdx.length) return { moved: 0, sheet: sourceName };
  var tshName = trashSheetName_(sourceName);
  var tsh = ss.getSheetByName(tshName);
  if (!tsh) { tsh = ss.insertSheet(tshName); if (headers.length) { tsh.getRange(1,1,1,headers.length).setValues([headers]); formatHeader_(tsh, headers.length); } }
  else if (tsh.getLastRow() < 1 && headers.length) { tsh.getRange(1,1,1,headers.length).setValues([headers]); formatHeader_(tsh, headers.length); }
  var width = Math.max(headers.length, src.getLastColumn());
  // copy rows
  for (var r = 0; r < rowsIdx.length; r++) {
    var rowNum = rowsIdx[r];
    var row = src.getRange(rowNum, 1, 1, width).getValues()[0];
    tsh.appendRow(row);
  }
  // delete bottom-up
  for (var d = rowsIdx.length - 1; d >= 0; d--) src.deleteRow(rowsIdx[d]);
  return { moved: rowsIdx.length, sheet: sourceName, trashSheet: tshName };
}

function restoreRowsFromTrashSheet_(ss, sourceName, reportId) {
  var tshName = trashSheetName_(sourceName);
  var tsh = ss.getSheetByName(tshName);
  if (!tsh || tsh.getLastRow() < 2) return { restored: 0, sheet: sourceName };
  var headers = getSheetHeaders_(tsh);
  var idIdx = colIndex_(headers, ['ID LAPORAN', 'ID_LAPORAN', 'REPORTID']);
  if (idIdx < 0) idIdx = 1;
  var rowsIdx = findRowIndicesByReportId_(tsh, reportId, idIdx);
  if (!rowsIdx.length) return { restored: 0, sheet: sourceName };
  var src = ss.getSheetByName(sourceName);
  if (!src) { src = ss.insertSheet(sourceName); if (headers.length) { src.getRange(1,1,1,headers.length).setValues([headers]); formatHeader_(src, headers.length); } }
  var width = Math.max(headers.length, tsh.getLastColumn(), src.getLastColumn());
  for (var r = 0; r < rowsIdx.length; r++) {
    var row = tsh.getRange(rowsIdx[r], 1, 1, width).getValues()[0];
    src.appendRow(row);
  }
  for (var d = rowsIdx.length - 1; d >= 0; d--) tsh.deleteRow(rowsIdx[d]);
  return { restored: rowsIdx.length, sheet: sourceName };
}

function deleteRowsFromTrashSheet_(ss, sourceName, reportId) {
  var tshName = trashSheetName_(sourceName);
  var tsh = ss.getSheetByName(tshName);
  if (!tsh || tsh.getLastRow() < 2) return { deleted: 0, sheet: sourceName };
  var headers = tsh.getRange(1, 1, 1, Math.max(1, tsh.getLastColumn())).getValues()[0];
  var idIdx = colIndex_(headers, ['ID LAPORAN', 'ID_LAPORAN', 'REPORTID']);
  if (idIdx < 0) idIdx = 1;
  var rowsIdx = findRowIndicesByReportId_(tsh, reportId, idIdx);
  for (var d = rowsIdx.length - 1; d >= 0; d--) tsh.deleteRow(rowsIdx[d]);
  return { deleted: rowsIdx.length, sheet: tshName };
}

function sheetNamesFromData_(data) {
  var sn = (data && data.sheetNames) || {};
  return {
    reportSheet: String(sn.reportSheet || (data && data.reportSheet) || ''),
    photoSheet: String(sn.photoSheet || (data && data.photoSheet) || ''),
    narrativeSheet: String(sn.narrativeSheet || (data && data.narrativeSheet) || ''),
  };
}

function moveToTrash_(body, data) {
  var reportId = String((data && data.reportId) || body.reportId || '').trim();
  if (!reportId) return { success: false, message: 'reportId wajib.' };
  var ss = getSpreadsheet_((data && data.spreadsheetId) || body.spreadsheetId);
  var names = sheetNamesFromData_(data || body);
  var results = [];
  if (names.reportSheet) results.push(moveRowsToTrashSheet_(ss, names.reportSheet, reportId));
  if (names.photoSheet) results.push(moveRowsToTrashSheet_(ss, names.photoSheet, reportId));
  if (names.narrativeSheet) results.push(moveRowsToTrashSheet_(ss, names.narrativeSheet, reportId));
  // trash Drive
  var trashed = trashDrive_(body, data);
  return { success: true, reportId: reportId, results: results, drive: trashed };
}

function restoreFromTrash_(body, data) {
  var reportId = String((data && data.reportId) || body.reportId || '').trim();
  if (!reportId) return { success: false, message: 'reportId wajib.' };
  var ss = getSpreadsheet_((data && data.spreadsheetId) || body.spreadsheetId);
  var names = sheetNamesFromData_(data || body);
  var results = [];
  if (names.reportSheet) results.push(restoreRowsFromTrashSheet_(ss, names.reportSheet, reportId));
  if (names.photoSheet) results.push(restoreRowsFromTrashSheet_(ss, names.photoSheet, reportId));
  if (names.narrativeSheet) results.push(restoreRowsFromTrashSheet_(ss, names.narrativeSheet, reportId));
  // untrash Drive
  var untrashed = untrashDrive_(body, data);
  return { success: true, reportId: reportId, results: results, drive: untrashed };
}

function deletePermanent_(body, data) {
  var reportId = String((data && data.reportId) || body.reportId || '').trim();
  if (!reportId) return { success: false, message: 'reportId wajib.' };
  var ss = getSpreadsheet_((data && data.spreadsheetId) || body.spreadsheetId);
  var names = sheetNamesFromData_(data || body);
  var results = [];
  if (names.reportSheet) results.push(deleteRowsFromTrashSheet_(ss, names.reportSheet, reportId));
  if (names.photoSheet) results.push(deleteRowsFromTrashSheet_(ss, names.photoSheet, reportId));
  if (names.narrativeSheet) results.push(deleteRowsFromTrashSheet_(ss, names.narrativeSheet, reportId));
  // ensure Drive remains trashed (permanent from app perspective; Drive trash is reversible in Drive UI, but app treats as permanent)
  var drive = trashDrive_(body, data);
  return { success: true, reportId: reportId, results: results, drive: drive };
}

function trashDrive_(body, data) {
  var folderId = String((data && data.folderId) || body.folderId || '');
  var fileIds = (data && data.fileIds) || body.fileIds || [];
  var out = { folder: null, files: 0 };
  if (folderId && looksLikeId_(folderId)) {
    try { DriveApp.getFolderById(folderId).setTrashed(true); out.folder = 'trashed'; } catch (e) { out.folder = 'err:' + e; }
  }
  for (var i = 0; i < fileIds.length; i++) {
    var fid = String(fileIds[i] || '');
    if (fid && looksLikeId_(fid)) { try { DriveApp.getFileById(fid).setTrashed(true); out.files++; } catch (e) {} }
  }
  return out;
}
function untrashDrive_(body, data) {
  var folderId = String((data && data.folderId) || body.folderId || '');
  var fileIds = (data && data.fileIds) || body.fileIds || [];
  var out = { folder: null, files: 0 };
  if (folderId && looksLikeId_(folderId)) {
    try { DriveApp.getFolderById(folderId).setTrashed(false); out.folder = 'restored'; } catch (e) { out.folder = 'err:' + e; }
  }
  for (var i = 0; i < fileIds.length; i++) {
    var fid = String(fileIds[i] || '');
    if (fid && looksLikeId_(fid)) { try { DriveApp.getFileById(fid).setTrashed(false); out.files++; } catch (e) {} }
  }
  return out;
}

function updateReport_(body, data) {
  var reportId = String((data && data.reportId) || body.reportId || '').trim();
  var updates = (data && data.updates) || body.updates || {};
  var sheetName = String((data && data.reportSheet) || (data && data.sheetName) || body.reportSheet || '');
  if (!reportId || !sheetName) return { success: false, message: 'reportId dan reportSheet wajib.' };
  var ss = getSpreadsheet_((data && data.spreadsheetId) || body.spreadsheetId);
  var sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return { success: false, message: 'Sheet/row tidak ditemukan.' };
  var headers = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  var idIdx = colIndex_(headers, ['ID LAPORAN', 'ID_LAPORAN', 'REPORTID']);
  if (idIdx < 0) idIdx = 1;
  var idxs = findRowIndicesByReportId_(sh, reportId, idIdx);
  if (!idxs.length) return { success: false, message: 'Laporan tidak ditemukan di sheet.' };
  var keys = Object.keys(updates);
  for (var r = 0; r < idxs.length; r++) {
    var rowNum = idxs[r];
    for (var k = 0; k < keys.length; k++) {
      var c = colIndex_(headers, [keys[k]]);
      if (c >= 0) sh.getRange(rowNum, c + 1).setValue(updates[keys[k]]);
    }
  }
  return { success: true, reportId: reportId, updated: idxs.length, fields: keys.length };
}

/** ===== Utils ===== */
function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  var txt = e.postData.contents;
  try { return JSON.parse(txt); } catch (err) { return {}; }
}

function json_(obj, status) {
  // Apps Script Web App selalu mengembalikan 200 di HTTP layer untuk ContentService;
  // status logis ada di body.success/message. (status arg disimpan untuk kejelasan)
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

function safeCode_(v, fallback) {
  var s = String(v || '').toUpperCase().replace(/[^A-Z0-9_ -]/g, '').trim().replace(/\s+/g, '_').replace(/_+/g, '_').replace(/(^_|_$)/g, '');
  return s || fallback || 'LAPORAN';
}

function looksLikeId_(s) {
  return /^[a-zA-Z0-9_-]{10,}$/.test(String(s || ''));
}

function nowWib_() {
  return Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss') + ' WIB';
}
