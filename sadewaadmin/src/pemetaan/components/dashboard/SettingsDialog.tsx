'use client';

/**
 * Dialog pengaturan: kop instansi & logo, penandatangan, backup/restore penuh,
 * reset data lokal, dan manajemen cache geometri luring.
 */

import { Database, FolderDown, Printer, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button, Card, Field, Modal, Switch, TextInput } from '@/pemetaan/components/ui';
import { idbQuota } from '@/pemetaan/lib/idb';
import { slugify } from '@/pemetaan/lib/geo';
import { useApp } from '@/pemetaan/lib/store';

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [includeGeo, setIncludeGeo] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [quota, setQuota] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cetak' | 'data'>('cetak');

  const tabs = [
    { id: 'cetak' as const, label: 'Cetak', Icon: Printer },
    { id: 'data' as const, label: 'Data & backup', Icon: Database },
  ];

  const moveTab = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    setActiveTab(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  const refreshQuota = async () => {
    const est = await idbQuota();
    if (est) setQuota(`${(est.usage / 1024 / 1024).toFixed(1)} MB terpakai dari ${(est.quota / 1024 / 1024).toFixed(0)} MB`);
  };

  useEffect(() => {
    if (open) void refreshQuota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const exportBackup = () => {
    const backup = app.buildBackup(includeGeo);
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup-sig-peta-${slugify(new Date().toLocaleString('id-ID').replace(/[^0-9]/g, '-').slice(0, 24))}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    app.toast({ type: 'success', title: 'Backup diunduh.', description: includeGeo ? 'Termasuk geometri wilayah.' : 'Data saja (tanpa geometri).' });
  };

  const importBackup = async (file: File) => {
    try {
      const text = await file.text();
      const result = await app.importBackup(text);
      if (!result.ok) {
        app.toast({ type: 'error', title: 'Restore gagal.', description: result.message });
        return;
      }
      app.toast({ type: 'success', title: 'Backup berhasil dipulihkan.' });
      await refreshQuota();
    } catch (error) {
      app.toast({
        type: 'error',
        title: 'Restore gagal.',
        description: error instanceof Error ? error.message : 'Berkas backup tidak dapat dibaca.',
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pengaturan"
      description="Atur keluaran cetak, data lokal, dan informasi aplikasi."
      width="max-w-2xl"
    >
      <div className="flex flex-col gap-3">
        <div role="tablist" aria-label="Bagian pengaturan" className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
          {tabs.map(({ id, label, Icon }, index) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                ref={(element) => { tabRefs.current[index] = element; }}
                id={`settings-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`settings-panel-${id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(id)}
                onKeyDown={(event) => moveTab(event, index)}
                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold transition sm:text-xs ${selected ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200/70' : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'}`}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div
          id="settings-panel-cetak"
          role="tabpanel"
          aria-labelledby="settings-tab-cetak"
          tabIndex={0}
          hidden={activeTab !== 'cetak'}
          className={activeTab === 'cetak' ? 'flex flex-col gap-3 outline-none' : 'hidden'}
        >
        {/* ------------------------------------------------------- Kop instansi */}
        <Card title="Kop Instansi">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Baris 1 (utama)">
              <TextInput value={app.print.header.agencyLine1} onChange={(e) => app.updateHeader({ agencyLine1: e.target.value })} />
            </Field>
            <Field label="Baris 2">
              <TextInput value={app.print.header.agencyLine2} onChange={(e) => app.updateHeader({ agencyLine2: e.target.value })} />
            </Field>
            <Field label="Logo instansi">
              {app.print.header.logo ? (
                <div className="flex items-center gap-3">
                  <img src={app.print.header.logo} alt="Logo" className="h-12 w-12 rounded-lg border border-slate-200 bg-white object-contain" />
                  <Button variant="ghost" size="sm" onClick={() => app.updateHeader({ logo: null })}>
                    <Trash2 size={13} /> Hapus
                  </Button>
                </div>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-xs text-slate-500 transition hover:border-brand-400 hover:text-brand-600">
                  <Upload size={14} /> Unggah logo (PNG/JPG)
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2.2 * 1024 * 1024) {
                        app.toast({ type: 'error', title: 'Logo terlalu besar', description: 'Maksimum ~2 MB.' });
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => app.updateHeader({ logo: String(reader.result) });
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              )}
            </Field>
          </div>
        </Card>

        {/* --------------------------------------------------- Penandatangan */}
        <Card title="Penandatangan (Blok TTD)">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nama jabatan">
              <TextInput value={app.print.signer.jabatan} onChange={(e) => app.updateSigner({ jabatan: e.target.value })} />
            </Field>
            <Field label="Nama pejabat">
              <TextInput value={app.print.signer.nama} onChange={(e) => app.updateSigner({ nama: e.target.value })} />
            </Field>
            <Field label="NIP">
              <TextInput value={app.print.signer.nip} onChange={(e) => app.updateSigner({ nip: e.target.value })} />
            </Field>
            <Field label="Tempat ditetapkan">
              <TextInput value={app.print.signer.tempat} onChange={(e) => app.updateSigner({ tempat: e.target.value })} />
            </Field>
          </div>
        </Card>

        <Card title="Elemen Cetak">
          <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
            <Switch label="Kop surat" checked={app.print.showHeader} onChange={(showHeader) => app.updatePrint({ showHeader })} />
            <Switch label="Legenda peta" checked={app.print.showLegend} onChange={(showLegend) => app.updatePrint({ showLegend })} />
            <Switch label="Batang skala" checked={app.print.showScaleBar} onChange={(showScaleBar) => app.updatePrint({ showScaleBar })} />
            <Switch label="Panah utara" checked={app.print.showNorthArrow} onChange={(showNorthArrow) => app.updatePrint({ showNorthArrow })} />
            <Switch label="Tanggal cetak" checked={app.print.showTimestamp} onChange={(showTimestamp) => app.updatePrint({ showTimestamp })} />
            <Switch label="Blok tanda tangan" checked={app.print.showSignature} onChange={(showSignature) => app.updatePrint({ showSignature })} />
            <Switch label="Catatan kaki" checked={app.print.showFooterNote} onChange={(showFooterNote) => app.updatePrint({ showFooterNote })} />
            <Switch label="Label wilayah" checked={app.print.showLabels} onChange={(showLabels) => app.updatePrint({ showLabels })} />
          </div>
        </Card>
        </div>

        {/* --------------------------------------------------------- Data offline */}
        <div
          id="settings-panel-data"
          role="tabpanel"
          aria-labelledby="settings-tab-data"
          tabIndex={0}
          hidden={activeTab !== 'data'}
          className={activeTab === 'data' ? 'flex flex-col gap-3 outline-none' : 'hidden'}
        >
        <Card title="Data & Backup (IndexedDB)">
          <div className="flex flex-col gap-2.5">
            <Switch label="Sertakan geometri wilayah dalam file backup" checked={includeGeo} onChange={setIncludeGeo} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={exportBackup}>
                <FolderDown size={14} /> Unduh backup
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> Pulihkan backup…
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importBackup(file);
                  e.target.value = '';
                }}
              />
              <Button size="sm" variant="ghost" onClick={() => void app.reloadGeo(false)}>
                <RefreshCw size={14} /> Muat ulang data wilayah
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void app.clearGeoCache()}>
                <Trash2 size={14} /> Bersihkan cache geometri
              </Button>
            </div>
            {quota ? <p className="text-[11px] text-slate-400">{quota}</p> : null}
            <div className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2">
              {confirmReset ? (
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-xs text-red-700">
                    Semua kategori, skor, dan pengaturan di perangkat ini akan dihapus permanen.
                  </p>
                  <Button variant="danger" size="sm" onClick={() => void app.resetAll()}>
                    Hapus semua
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmReset(false)}>
                    Batal
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmReset(true)}
                  className="flex items-center gap-2 text-xs font-medium text-red-600"
                >
                  <Trash2 size={13} /> Reset seluruh data lokal…
                </button>
              )}
            </div>
          </div>
        </Card>
        </div>
      </div>
    </Modal>
  );
}
