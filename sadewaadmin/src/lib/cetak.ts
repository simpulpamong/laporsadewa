import { DEFAULT_PRINT_SETTINGS, mergePrintSettings, resolveKopLogoSrc, type PrintSettings, type SignBlock } from './printSettings';

type AnyItem = Record<string, any>;

export type PaperSize = 'A4' | 'F4';
export type Orientation = 'portrait' | 'landscape';
export interface PrintOptions { paper?: PaperSize; orientation?: Orientation; }

function esc(v: any): string {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function val(v: any, dash = '-') { const s = v == null ? '' : String(v).trim(); return s || dash; }
function nowId() { return new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }); }
function todayLong() { return new Date().toLocaleDateString('id-ID', { timeZone:'Asia/Jakarta', day:'numeric', month:'long', year:'numeric' }); }

export function buildPrintDocument(title: string, bodyHtml: string, opt: PrintOptions = {}) {
  const paper = opt.paper || 'A4';
  const orient = opt.orientation || 'portrait';
  const size = paper === 'F4' ? (orient === 'landscape' ? '330mm 215mm' : '215mm 330mm') : (orient === 'landscape' ? 'A4 landscape' : 'A4 portrait');
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"/><title>${esc(title)}</title>
  <style>
    @page { size: ${size}; margin: 14mm 14mm 16mm; }
    *{box-sizing:border-box} body{font-family:"Times New Roman",Georgia,serif;color:#111;font-size:11pt;line-height:1.5;margin:0;padding:0 2mm}
    .kop{display:flex;gap:14px;align-items:center;border-bottom:3px double #111;padding-bottom:10px;margin-bottom:14px}
    .kop .logo{width:58px;height:58px;object-fit:contain}
    .kop .logo-slot{width:58px;height:58px;flex:0 0 58px}
    .kop .tx{flex:1;text-align:center}
    .kop h1{margin:0;font-size:14pt;letter-spacing:.4px;font-weight:700}
    .kop h2{margin:1px 0 0;font-size:12.5pt;font-weight:700}
    .kop .sub{margin:2px 0 0;font-size:10pt;font-style:italic}
    .kop .contact{margin:2px 0 0;font-size:9pt;color:#333}
    .title{text-align:center;margin:14px 0 10px}
    .title h3{margin:0;font-size:13pt;text-decoration:underline;text-transform:uppercase;letter-spacing:.3px}
    .title p{margin:4px 0 0;font-size:10.5pt}
    table.meta{width:100%;border-collapse:collapse;margin:8px 0 12px;font-size:10.5pt}
    table.meta td{padding:3px 4px;vertical-align:top}
    table.meta td.k{width:175px;color:#222}
    table.meta td.s{width:10px}
    table.grid{width:100%;border-collapse:collapse;font-size:9.5pt;margin-top:6px}
    table.grid th,table.grid td{border:1px solid #333;padding:5px 6px;vertical-align:top}
    table.grid th{background:#f1f5f9;font-weight:700;text-align:left}
    .muted{color:#444;font-size:9.5pt}
    .sign{display:flex;justify-content:space-between;gap:24px;margin-top:28px;page-break-inside:avoid}
    .sign .box{width:46%;text-align:center}
    .sign .gap{height:68px}
    .footer{margin-top:14px;font-size:8.5pt;color:#555;border-top:1px solid #ccc;padding-top:6px;display:flex;justify-content:space-between;gap:8px}
  </style></head><body>${bodyHtml}</body></html>`;
}

function logoSrc(ps: PrintSettings, side: 'left'|'right') {
  const anyPs: any = ps.kop as any;
  let raw = side === 'left' ? (anyPs.logoLeftUrl || '') : (anyPs.logoRightUrl || '');
  if (!raw && ps.kop.showLogo && side === 'left') raw = 'logo1';
  const url = resolveKopLogoSrc(raw);
  if (!url) return '';
  if (url.startsWith('/') && typeof window !== 'undefined') {
    return `${window.location.origin}${url}`;
  }
  return url;
}

function renderKop(ps: PrintSettings) {
  const contact = [ps.kop.alamat, ps.kop.telepon ? `Telp. ${ps.kop.telepon}` : '', ps.kop.email, ps.kop.website].filter(Boolean).join(' · ');
  const L = logoSrc(ps,'left'); const R = logoSrc(ps,'right');
  return `<div class="kop">
    ${L ? `<img class="logo" src="${esc(L)}" alt="" onerror="this.style.display='none'"/>` : `<span class="logo-slot"></span>`}
    <div class="tx">
      <h1>${esc(ps.kop.instansi1)}</h1>
      ${ps.kop.instansi2 ? `<h2>${esc(ps.kop.instansi2)}</h2>` : ''}
      ${ps.kop.sub ? `<div class="sub">${esc(ps.kop.sub)}</div>` : ''}
      ${contact ? `<div class="contact">${esc(contact)}</div>` : ''}
    </div>
    ${R ? `<img class="logo" src="${esc(R)}" alt="" onerror="this.style.display='none'"/>` : `<span class="logo-slot"></span>`}
  </div>`;
}

function renderSign(block: SignBlock, leftNameOverride?: string, leftDateRight?: string) {
  const leftName = leftNameOverride || block.kiriNama || '(............................)';
  const rightCityDate = leftDateRight ? `${esc(block.kananKota)}, ${esc(leftDateRight)}` : `${esc(block.kananKota)}, ${esc(todayLong())}`;
  return `<div class="sign">
    <div class="box">${block.kiriJabatan ? `<div>${esc(block.kiriJabatan)}</div>` : '<div>&nbsp;</div>'}<div class="gap"></div><div><b><u>${esc(leftName)}</u></b></div></div>
    <div class="box"><div>${rightCityDate}</div>${block.kananJabatan ? `<div>${esc(block.kananJabatan)},</div>` : ''}<div class="gap"></div><div><b><u>${esc(block.kananNama || '(............................)')}</u></b></div></div>
  </div>`;
}

function renderFooter(ps: PrintSettings) {
  return `<div class="footer"><span>${esc(ps.footer || 'SADEWA Admin')}</span><span>Dicetak: ${esc(nowId())} WIB</span></div>`;
}

export function buildBeritaAcara(it: AnyItem, meta: { catName?: string; subName?: string }, settings?: any, opt: PrintOptions = {}) {
  const ps = mergePrintSettings(settings ?? DEFAULT_PRINT_SETTINGS);
  const lat = Number(it.lat ?? it.latitude); const lng = Number(it.lng ?? it.longitude);
  const hasGps = Number.isFinite(lat) && Number.isFinite(lng);
  const photos = Array.isArray(it.photos) ? it.photos : [];
  const waktu = val(it.waktuSubmit || (it.createdAt?.toDate ? it.createdAt.toDate().toLocaleString('id-ID') : '') || it.tanggal);
  const rows: Array<[string, any]> = [
    ['ID Laporan', it.reportId],
    ['Kategori / Subkategori', `${meta.catName || it.categoryId || '-'} / ${meta.subName || it.subcategoryId || '-'}`],
    ['Waktu / Tanggal', waktu],
    ['Lokasi', it.lokasi],
    ['Pelapor / Petugas', it.pelapor],
    ['Status', it.status || 'TERSIMPAN'],
    ['Kronologi', it.kronologi],
    ['Tindakan / Penanganan', it.tindakan],
    ['Keterangan / Kendala', it.keterangan],
  ];
  if (hasGps) rows.push(['Koordinat (GPS/EXIF)', `${lat.toFixed(6)}, ${lng.toFixed(6)}`]);
  if (photos.length) rows.push(['Dokumentasi Foto', `${photos.length} file${it.folderDrive ? ` (folder Drive tersedia)` : ''}`]);
  else if (it.jumlahFoto != null) rows.push(['Dokumentasi Foto', `${it.jumlahFoto} file`]);
  if (it.folderDrive) rows.push(['Folder Drive', it.folderDrive]);
  if (it.rawText) rows.push(['Isi Laporan (mentah)', String(it.rawText).slice(0, 4000)]);

  const body = `${renderKop(ps)}
    <div class="title"><h3>Berita Acara Laporan</h3><p>Nomor: ${esc(val(it.reportId))}</p></div>
    <p style="text-align:justify">Pada hari ini, berdasarkan laporan yang masuk dan tercatat pada sistem SADEWA, dengan ini dibuat Berita Acara dengan rincian sebagai berikut:</p>
    <table class="meta">${rows.map(([k,v])=>`<tr><td class="k">${esc(k)}</td><td class="s">:</td><td>${esc(val(v)).replace(/\n/g,'<br/>')}</td></tr>`).join('')}</table>
    <p style="text-align:justify">Demikian Berita Acara ini dibuat dengan sebenar-benarnya untuk dapat dipergunakan sebagaimana mestinya.</p>
    ${renderSign(ps.tandaTangan.beritaAcara, val(it.pelapor, ps.tandaTangan.beritaAcara.kiriNama || '(............................)'), waktu || todayLong())}
    ${renderFooter(ps)}`;
  const title = `Berita Acara - ${val(it.reportId,'Laporan')}`;
  return { title, html: buildPrintDocument(title, body, { orientation: 'portrait', ...opt }), orientation: (opt.orientation || 'portrait') as Orientation };
}

export function printBeritaAcara(it: AnyItem, meta: { catName?: string; subName?: string }, settings?: any) {
  const doc = buildBeritaAcara(it, meta, settings);
  printDocumentHtml(doc.html);
}

export function buildRekap(items: AnyItem[], meta: { catName?: string; subName?: string; start?: string; end?: string; scope?: string }, settings?: any, opt: PrintOptions = {}) {
  const ps = mergePrintSettings(settings ?? DEFAULT_PRINT_SETTINGS);
  const period = meta.start || meta.end ? `${meta.start || '…'} s.d. ${meta.end || '…'}` : 'Semua tanggal';
  const rows = items.map((it, i) => {
    const lat = Number(it.lat ?? it.latitude); const lng = Number(it.lng ?? it.longitude);
    const hasGps = Number.isFinite(lat) && Number.isFinite(lng);
    const waktu = val(it.waktuSubmit || it.tanggal);
    return `<tr>
      <td style="text-align:center">${i+1}</td>
      <td>${esc(val(it.reportId))}<div class="muted">${esc(val(meta.catName || it.categoryId))} / ${esc(val(meta.subName || it.subcategoryId))}</div></td>
      <td>${esc(waktu)}</td>
      <td>${esc(val(it.lokasi))}</td>
      <td>${esc(val(it.pelapor))}</td>
      <td style="text-align:center">${esc(val(it.jumlahFoto ?? 0))}${hasGps ? ' · GPS' : ''}</td>
      <td>${esc(val(it.status || 'TERSIMPAN'))}</td>
    </tr>`;
  }).join('');
  const body = `${renderKop(ps)}
    <div class="title"><h3>Rekapitulasi Laporan</h3><p>${esc(ps.kop.sub || 'SADEWA — Satpol PP Kabupaten Ponorogo')}</p></div>
    <table class="meta">
      <tr><td class="k">Periode</td><td class="s">:</td><td>${esc(period)}</td></tr>
      <tr><td class="k">Kategori</td><td class="s">:</td><td>${esc(val(meta.catName,'Semua (scope)'))}</td></tr>
      <tr><td class="k">Subkategori</td><td class="s">:</td><td>${esc(val(meta.subName,'Semua'))}</td></tr>
      ${meta.scope ? `<tr><td class="k">Cakupan Akses</td><td class="s">:</td><td>${esc(meta.scope)}</td></tr>` : ''}
      <tr><td class="k">Jumlah Laporan</td><td class="s">:</td><td><b>${items.length}</b> laporan</td></tr>
    </table>
    <table class="grid">
      <thead><tr><th style="width:36px;text-align:center">No</th><th>ID / Kategori</th><th style="width:135px">Waktu</th><th>Lokasi</th><th style="width:125px">Pelapor</th><th style="width:76px;text-align:center">Foto/GPS</th><th style="width:92px">Status</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#666;padding:14px">Tidak ada data.</td></tr>'}</tbody>
    </table>
    ${renderSign(ps.tandaTangan.rekap)}
    ${renderFooter(ps)}`;
  const title = 'Rekap Laporan SADEWA';
  return { title, html: buildPrintDocument(title, body, { orientation: 'landscape', ...opt }), orientation: (opt.orientation || 'landscape') as Orientation };
}

export function printDocumentHtml(html: string) {
  const w = window.open('', '_blank');
  if (!w) { if (typeof document !== 'undefined') { const el = document.createElement('div'); el.setAttribute('style','position:fixed;z-index:99999;top:16px;right:16px;padding:12px 14px;border-radius:14px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font:600 13px/1.4 system-ui,sans-serif'); el.textContent='Popup diblokir. Izinkan popup untuk mencetak.'; document.body.appendChild(el); setTimeout(()=>el.remove(),4500);} return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 350);
}

export function printRekap(items: AnyItem[], meta: { catName?: string; subName?: string; start?: string; end?: string; scope?: string }, settings?: any) {
  const doc = buildRekap(items, meta, settings);
  printDocumentHtml(doc.html);
}

export { DEFAULT_PRINT_SETTINGS, mergePrintSettings };
export type { PrintSettings };
