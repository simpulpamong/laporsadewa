'use client';

/**
 * PrintDialog — pusat kendali percetakan HD:
 *  · Ukuran kertas A4, F4, A3, A2, A1, A0, dan kustom (mm apa pun — banner/spanduk),
 *  · Orientasi + DPI 150–600 dengan clamp otomatis sesuai batas canvas browser,
 *  · Kop instansi, judul, tahun, catatan kaki, blok tanda tangan,
 *  · Rentang peta (tampilan saat ini / seluruh wilayah), geometri resolusi penuh,
 *  · Tiga jalur keluaran:
 *      1) PDF HD client (raster 300–600 DPI + jsPDF)  — bekerja 100% offline,
 *      2) Cetak langsung ( PDF ke tab printer ),  
 *      3) Peta Vektor Server via POST /api/export-pdf (@react-pdf/renderer).
 */

import clsx from 'clsx';
import { Download, FileDown, Loader2, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button, Card, Dropdown, Field, Modal, ProgressBar, Segmented, Switch, TextArea, TextInput } from '@/pemetaan/components/ui';
import { DPI_OPTIONS, effectiveDpiFor, mmToPx, PAPERS, resolvePaper } from '@/pemetaan/lib/paper';
import { baseLayerOption } from '@/pemetaan/lib/defaults';
import {
  buildPdfBlob,
  buildSheetFileName,
  buildVectorPayload,
  downloadBlob,
  openPrintWindow,
  preloadLogo,
  prepareJob,
  renderSheetCanvas,
  type JobInput,
  type SheetJob,
} from '@/pemetaan/lib/print/renderSheet';
import { loadRegionJson, REGION_JSON, slugify, statsFor } from '@/pemetaan/lib/geo';
import { useApp } from '@/pemetaan/lib/store';
import { authHeaders, useAuth } from '@/context/AuthContext';
import type { Orientation, PrintConfig, RegionCollection, RegionFeature } from '@/pemetaan/lib/types';

export function PrintDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const { token } = useAuth();
  const [progress, setProgress] = useState<{ frac: number; label: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setProgress(null);
      setDone(null);
    }
  }, [open]);

  const config = app.print;
  const selectedPrintDistrict = app.kecamatanList.find(
    (feature) => feature.properties.code === config.selectedKecamatanCode,
  );
  const printExtentMode: PrintConfig['extentMode'] =
    config.mapMode === 'desa' && config.extentMode === 'kecamatan' && selectedPrintDistrict
      ? 'kecamatan'
      : 'kabupaten';
  const selectedDistrictName = selectedPrintDistrict?.properties.name;
  const effectiveHeaderTitle = printExtentMode === 'kecamatan' && selectedDistrictName
    ? `PETA KERAWANAN WILAYAH KECAMATAN ${selectedDistrictName.toLocaleUpperCase('id-ID')}`
    : config.header.title;
  const resolved = resolvePaper(config.paperId, config.orientation, config.customWidthMm, config.customHeightMm);
  const layoutEstimate = { paperWidth: resolved.width, paperHeight: resolved.height };
  const effDpi = effectiveDpiFor(layoutEstimate, config.dpi);
  const pxW = Math.round(mmToPx(resolved.width) * (effDpi / 96));
  const pxH = Math.round(mmToPx(resolved.height) * (effDpi / 96));

  /* ------------------------------------------------------------------ job */

  const buildJob = async (): Promise<SheetJob> => {
    const activeCategory = app.activeCategory;
    let districts: RegionFeature[] = [];
    let villages: RegionFeature[] = [];
    let boundary: RegionFeature | null = null;

    if (app.geo.kecamatan) districts = app.geo.kecamatan.features as RegionFeature[];
    if (app.geo.kelurahan) villages = app.geo.kelurahan.features as RegionFeature[];
    if (app.geo.kabupaten?.features.length) boundary = app.geo.kabupaten.features[0] as RegionFeature;

    /* geometri resolusi penuh opsional (dipakai untuk cetak sangat besar) */
    if (config.preferFullGeometry) {
      try {
        app.toast({ type: 'info', title: 'Memuat geometri resolusi penuh…', description: 'Perbaikan detail batas untuk ukuran A0/banner. Hanya sekali, lalu tersimpan lokal.' });
        const [kecFull, kelFull] = await Promise.all([
          loadRegionJson(REGION_JSON.kecamatanFull),
          loadRegionJson(REGION_JSON.kelurahanFull),
        ]);
        districts = kecFull.features as RegionFeature[];
        villages = kelFull.features as RegionFeature[];
      } catch {
        app.toast({ type: 'warning', title: 'Geometri penuh tidak tersedia, memakai standar.' });
      }
    }

    const selectedDistrictCode = printExtentMode === 'kecamatan' ? config.selectedKecamatanCode : null;
    const selectedDistrict = selectedDistrictCode
      ? districts.find((feature) => feature.properties.code === selectedDistrictCode) ?? null
      : null;

    /* Cetak kecamatan hanya mencakup desa dan batas kecamatan yang dipilih. */
    const features = config.mapMode === 'desa'
      ? printExtentMode === 'kecamatan' && selectedDistrictCode
        ? villages.filter((f) => f.properties.districtCode === selectedDistrictCode)
        : villages
      : districts;
    const printDistricts = printExtentMode === 'kecamatan'
      ? selectedDistrict
        ? [selectedDistrict]
        : []
      : districts;
    const printBoundary = printExtentMode === 'kabupaten' ? boundary : null;
    const printConfig = {
      ...config,
      extentMode: printExtentMode,
      header: {
        ...config.header,
        title: printExtentMode === 'kecamatan' && selectedDistrict
          ? `PETA KERAWANAN WILAYAH KECAMATAN ${selectedDistrict.properties.name.toLocaleUpperCase('id-ID')}`
          : config.header.title,
      },
    };

    const stats = activeCategory
      ? statsFor(activeCategory, app.scores, features)
      : { total: 0, scored: 0, noData: 0, counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, average: null };

    let basemapUrl: string | null = null;
    let basemapAttribution: string | undefined;
    try {
      const selectedLayer = baseLayerOption(app.view.baseLayer);
      if (!selectedLayer.url) throw new Error('URL tile basemap belum tersedia.');
      const source = { url: selectedLayer.url, attribution: selectedLayer.attribution };
      basemapUrl = source.url;
      basemapAttribution = source.attribution;
    } catch {
      app.toast({
        type: 'warning',
        title: `Basemap ${baseLayerOption(app.view.baseLayer).label} tidak tersedia untuk ekspor`,
        description: 'PDF tetap dibuat dari geometri GeoJSON dan warna kategori.',
      });
    }

    const jobInput: JobInput = {
      config: printConfig,
      category: activeCategory,
      features,
      districts: printDistricts,
      boundary: printBoundary,
      scores: app.scores,
      stats,
      bounds: null,
          basemap: app.view.baseLayer,
      basemapUrl,
      basemapAttribution,
    };

    await preloadLogo(config.header.logo ?? null);
    return prepareJob(jobInput);
  };

  const flash = (frac: number, label: string) => setProgress({ frac, label });

  /* --------------------------------------------------------------- export */

  const exportClientPdf = async (mode: 'download' | 'print') => {
    try {
      setProgress({ frac: 0.04, label: 'Menyiapkan data…' });
      const job = await buildJob();
      const result = await renderSheetCanvas(job, flash);
      setProgress({ frac: 0.95, label: 'Menulis PDF…' });
      await new Promise((r) => setTimeout(r, 30));
      const blob = buildPdfBlob(job, result.canvas);
      if (mode === 'download') {
        downloadBlob(blob, buildSheetFileName(job));
        setDone(`PDF tersimpan — ${result.dpi} DPI, ${result.canvas.width}×${result.canvas.height} px, ${result.tileCount} tile.`);
      } else {
        openPrintWindow(blob, buildSheetFileName(job));
        setDone('PDF dibuka di tab baru untuk dicetak.');
      }
      app.toast({
        type: 'success',
        title: mode === 'download' ? 'PDF HD berhasil dibuat.' : 'Siap dicetak.',
        description: `${result.dpi} DPI · ${result.canvas.width}×${result.canvas.height} px`,
      });
      setProgress(null);
    } catch (err) {
      setProgress(null);
      app.toast({
        type: 'error',
        title: 'Cetak PDF gagal.',
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const exportServerVector = async () => {
    try {
      setProgress({ frac: 0.1, label: 'Membangun payload vektor…' });
      const job = await buildJob();
      const payload = buildVectorPayload(job);
      setProgress({ frac: 0.5, label: 'Merender PDF vektor di server…' });
      const res = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        throw new Error(detail.detail || detail.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      downloadBlob(blob, `peta-vektor-${slugify(config.header.title)}-${resolved.width}x${resolved.height}mm.pdf`);
      setDone('PDF vektor murni berhasil dirender di server.');
      app.toast({ type: 'success', title: 'PDF vektor berhasil dibuat.', description: 'Teks & garis 100% vektor — tajam di ukuran apa pun.' });
      setProgress(null);
    } catch (err) {
      setProgress(null);
      app.toast({
        type: 'error',
        title: 'Generasi PDF Vektor Server gagal.',
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const busy = progress !== null;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Cetak Peta HD"
      description="Kertas A4–A0/banner kustom · DPI hingga 600 · kop surat + legenda kartografis lengkap"
      width="max-w-3xl"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* ------------------------------------------------- kertas & orientasi */}
        <Card title="Ukuran Kertas & Orientasi" className="md:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {PAPERS.map((paper) => (
              <PaperChip
                key={paper.id}
                active={config.paperId === paper.id}
                label={paper.label}
                onClick={() => app.updatePrint({ paperId: paper.id })}
              />
            ))}
            <PaperChip
              active={config.paperId === 'custom'}
              label="Kustom"
              onClick={() => app.updatePrint({ paperId: 'custom' })}
            />
          </div>

          {config.paperId === 'custom' ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Lebar (mm)" hint="mis. 3000 untuk spanduk 3 m">
                <TextInput
                  min={50}
                  max={6000}
                  type="number"
                  value={config.customWidthMm}
                  onChange={(e) => app.updatePrint({ customWidthMm: Number(e.target.value) })}
                />
              </Field>
              <Field label="Tinggi (mm)">
                <TextInput
                  min={50}
                  max={6000}
                  type="number"
                  value={config.customHeightMm}
                  onChange={(e) => app.updatePrint({ customHeightMm: Number(e.target.value) })}
                />
              </Field>
            </div>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Orientasi">
              <Segmented<Orientation>
                value={config.orientation}
                onChange={(orientation) => app.updatePrint({ orientation })}
                options={[
                  { value: 'portrait', label: 'Potret' },
                  { value: 'landscape', label: 'Lanskap' },
                ]}
              />
            </Field>
            <Field label="Kualitas (DPI)">
              <Dropdown
                value={String(config.dpi)}
                ariaLabel="Kualitas cetak DPI"
                onChange={(value) => app.updatePrint({ dpi: Number(value) })}
                options={DPI_OPTIONS.map((dpi) => ({ value: String(dpi), label: `${dpi} DPI` }))}
              />
            </Field>
          </div>

          <div className="mt-2.5 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            Saat ini: <span className="font-semibold text-slate-700">{resolved.label}</span> ·{' '}
            {resolved.width}×{resolved.height} mm · cetak {pxW}×{pxH} px{' '}
            <span className="font-semibold text-slate-700">({effDpi} DPI efektif)</span>
            {effDpi < config.dpi ? (
              <span className="text-amber-600"> — DPI diturunkan otomatis mengikuti batas canvas browser.</span>
            ) : null}
          </div>
        </Card>

        {/* ------------------------------------------------------- rentang peta */}
        <Card title="Wilayah Cetak">
          <div className="flex flex-col gap-2.5">
            <Segmented
              value={config.mapMode}
              onChange={(mapMode) => app.updatePrint({
                mapMode,
                ...(mapMode === 'kecamatan' ? { extentMode: 'kabupaten' as const } : {}),
              })}
              options={[
                { value: 'kecamatan', label: `Peta Kecamatan (${app.kecamatanList.length || 21})` },
                { value: 'desa', label: 'Peta Desa/Kelurahan' },
              ]}
            />
            {config.mapMode === 'desa' ? (
              <>
                <Segmented
                  value={config.extentMode}
                  onChange={(extentMode) => app.updatePrint({
                    extentMode,
                    ...(extentMode === 'kecamatan' && !config.selectedKecamatanCode && app.kecamatanList[0]
                      ? { selectedKecamatanCode: app.kecamatanList[0].properties.code }
                      : {}),
                  })}
                  options={[
                    { value: 'kabupaten', label: 'Seluruh Kabupaten' },
                    { value: 'kecamatan', label: 'Kecamatan tertentu' },
                  ]}
                />
                {config.extentMode === 'kecamatan' ? (
                  <Dropdown
                    value={selectedPrintDistrict?.properties.code ?? ''}
                    ariaLabel="Pilih kecamatan untuk peta cetak desa"
                    onChange={(selectedKecamatanCode) => app.updatePrint({ selectedKecamatanCode })}
                    options={[
                      { value: '', label: 'Pilih kecamatan' },
                      ...app.kecamatanList.map((district) => ({
                        value: district.properties.code,
                        label: `Kec. ${district.properties.name}`,
                      })),
                    ]}
                  />
                ) : null}
              </>
            ) : null}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            {config.mapMode === 'kecamatan'
              ? 'Menampilkan seluruh wilayah kecamatan di Kabupaten Ponorogo.'
              : printExtentMode === 'kecamatan'
                ? 'Menampilkan desa/kelurahan dan batas kecamatan terpilih.'
                : 'Menampilkan seluruh desa/kelurahan se-Kabupaten Ponorogo.'}{' '}
            Cakupan peta otomatis pas pada batas wilayah.
          </p>
          <div className="mt-2">
            <Switch
              label="Geometri resolusi penuh (±8 MB, disimpan luring untuk pengecetakan berikutnya)"
              checked={config.preferFullGeometry}
              onChange={(preferFullGeometry) => app.updatePrint({ preferFullGeometry })}
            />
          </div>
        </Card>

        {/* ------------------------------------------------- elemen kartografis */}
        <Card title="Elemen Peta">
          <div className="grid grid-cols-1">
            <Switch label="Legenda" checked={config.showLegend} onChange={(v) => app.updatePrint({ showLegend: v })} />
            <Switch label="Batang skala" checked={config.showScaleBar} onChange={(v) => app.updatePrint({ showScaleBar: v })} />
            <Switch label="Panah utara" checked={config.showNorthArrow} onChange={(v) => app.updatePrint({ showNorthArrow: v })} />
            <Switch
              label={config.mapMode === 'desa' ? 'Label nama desa/kelurahan' : 'Label nama kecamatan'}
              checked={config.showLabels}
              onChange={(v) => app.updatePrint({ showLabels: v })}
            />
            <Switch label="Kop surat" checked={config.showHeader} onChange={(v) => app.updatePrint({ showHeader: v })} />
            <Switch label="Tanggal cetak" checked={config.showTimestamp} onChange={(v) => app.updatePrint({ showTimestamp: v })} />
            <Switch label="Blok tanda tangan" checked={config.showSignature} onChange={(v) => app.updatePrint({ showSignature: v })} />
          </div>
        </Card>

        {/* ------------------------------------------------------------ kop & ttd */}
        <Card title="Kop & Penandatangan" className="md:col-span-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label={printExtentMode === 'kecamatan' ? 'Judul peta (otomatis)' : 'Judul peta'}>
              <TextInput
                value={effectiveHeaderTitle}
                readOnly={printExtentMode === 'kecamatan'}
                onChange={(e) => app.updateHeader({ title: e.target.value })}
              />
            </Field>
            <Field label="Subjudul (opsional)">
              <TextInput value={config.header.subtitle} onChange={(e) => app.updateHeader({ subtitle: e.target.value })} />
            </Field>
            <Field label="Instansi baris 1">
              <TextInput value={config.header.agencyLine1} onChange={(e) => app.updateHeader({ agencyLine1: e.target.value })} />
            </Field>
            <Field label="Instansi baris 2">
              <TextInput value={config.header.agencyLine2} onChange={(e) => app.updateHeader({ agencyLine2: e.target.value })} />
            </Field>
            <Field label="Catatan kaki">
              <TextArea
                className="min-h-[60px] text-xs"
                value={config.footnote}
                onChange={(e) => app.updatePrint({ footnote: e.target.value })}
              />
            </Field>
            <Field label="Blok tanda tangan">
              <div className="grid grid-cols-2 gap-2">
                <TextInput placeholder="Nama jabatan" value={config.signer.jabatan} onChange={(e) => app.updateSigner({ jabatan: e.target.value })} />
                <TextInput placeholder="Nama (maks. 30 huruf)" value={config.signer.nama} onChange={(e) => app.updateSigner({ nama: e.target.value })} />
                <TextInput placeholder="NIP" value={config.signer.nip} onChange={(e) => app.updateSigner({ nip: e.target.value })} />
                <TextInput placeholder="Tempat ditetapkan" value={config.signer.tempat} onChange={(e) => app.updateSigner({ tempat: e.target.value })} />
              </div>
            </Field>
            <Field label="Logo instansi (PNG/JPG)">
              <div className="flex items-center gap-2">
                {config.header.logo ? (
                  <>
                    <img src={config.header.logo} alt="Logo" className="h-10 w-10 border border-slate-200 rounded-lg object-contain bg-white" />
                    <Button variant="ghost" size="sm" onClick={() => app.updateHeader({ logo: null })}>
                      Hapus logo
                    </Button>
                  </>
                ) : (
                  <label className="cursor-pointer rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 transition hover:border-brand-400 hover:text-brand-600">
                    Unggah logo…
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => app.updateHeader({ logo: String(reader.result) });
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                )}
              </div>
            </Field>
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------- keluaran */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        {progress ? (
          <div className="mb-3">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-600">
              <Loader2 size={13} className="animate-spin text-brand-600" />
              {progress.label}
            </div>
            <ProgressBar value={progress.frac * 100} />
          </div>
        ) : null}
        {done ? <p className="mb-3 text-xs font-medium text-emerald-600">{done}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button loading={busy} onClick={() => exportClientPdf('download')}>
            <Download size={15} /> Unduh PDF HD
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => exportClientPdf('print')}>
            <Printer size={15} /> Cetak langsung
          </Button>
          <Button variant="soft" disabled={busy} onClick={exportServerVector}>
            <FileDown size={15} /> Peta Vektor (Server)
          </Button>
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
          “Unduh PDF HD” & “Cetak langsung” dirender di perangkat (berfungsi luring penuh).
          “Peta Vektor (Server)” menghasilkan PDF vektor murni via API — teks dan garis tidak
          pernah rasterisasi, ideal untuk percetakan skala besar A0/banner.
        </p>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function PaperChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
        active
          ? 'border-brand-500 bg-brand-600 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900',
      )}
    >
      {label}
    </button>
  );
}
