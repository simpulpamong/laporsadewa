'use client';

import { useCallback, useState } from 'react';
import { useApp } from '../core/AppContext';
import { apiFetch, parallelLimit, withRetry } from '../core/apiClient';
import { formatExifTime } from '../core/exif';
import { adaptiveConcurrency } from '../core/apiClient';
import { esc } from '@/lib/html';
import { MAX_PHOTOS } from '@/lib/constants';
import type { PhotoData } from '../core/types';

/**
 * Manajemen draft sadewa.
 *
 * Draft adalah salinan sementara di server (Firestore + Cloudinary) agar
 * laporan bisa dilanjutkan dari perangkat lain. Memuat draft akan
 * menghapusnya dari server, sehingga tidak ada duplikat.
 */

const SCOPE = 'sadewa';
const DRAFT_STEPS = [
  { icon: 'file', label: 'Menyiapkan data' },
  { icon: 'cloudUpload', label: 'Transfer foto' },
  { icon: 'database', label: 'Menyimpan draft' },
  { icon: 'circleCheck', label: 'Selesai' },
];

export interface DraftItem {
  draftId: string;
  timestamp: string;
  jumlahFoto: number;
  teksPreview: string;
}

export interface LoadedDraftPhoto {
  data: string;
  mime: string;
  source: string;
  sizeKB: number;
  exifMeta: {
    hasGps: boolean;
    lat: number | null;
    lng: number | null;
    datetime: string | null;
    address: string | null;
  };
}

let counter = 0;
function nextId() {
  counter += 1;
  return `p${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function useDraftManager() {
  const {
    scope,
    photos,
    reportText,
    activeDraftId,
    setActiveDraftId,
    addPhotos,
    setReportText,
    showAlert,
    startLoading,
    setProgress,
    stopLoading,
  } = useApp();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const saveDraft = useCallback(async () => {
    if (photos.some(photo => photo.processing)) {
      showAlert('warn', 'Foto Masih Diproses', 'Tunggu hingga semua foto selesai diproses.');
      return;
    }
    const ready = photos.filter(photo => photo.data);
    if (!ready.length) {
      showAlert('warn', 'Belum Ada Foto', 'Draft minimal harus memuat satu foto.');
      return;
    }

    setSaving(true);
    startLoading('draft', 'Menyimpan Draft…', 'Mempersiapkan data…', DRAFT_STEPS);

    try {
      const created = await withRetry(() =>
        apiFetch<{ draftId: string }>('/api/drafts', {
          method: 'POST',
          timeout: 30_000,
          body: { action: 'create', scope: SCOPE, teks: reportText, label: categoryLabel(scope) },
        }),
      );
      setActiveDraftId(created.draftId);
      setProgress(1, 12, 'Draft dibuat di server…');

      let done = 0;
      const results = await parallelLimit(
        ready,
        async (_index, photo) => {
          await withRetry(() =>
            apiFetch('/api/drafts', {
              method: 'POST',
              timeout: 60_000,
              body: {
                action: 'append',
                draftId: created.draftId,
                photoKey: `${created.draftId}-${photo.sizeKB}-${photo.data?.slice(-24) || _index}`,
                scope: SCOPE,
                foto: { data: photo.data, mime: photo.mime, source: photo.source },
                sizeKB: photo.sizeKB,
                exifMeta: {
                  hasGps: Boolean(photo.exif?.gps),
                  lat: photo.exif?.gps?.lat ?? null,
                  lng: photo.exif?.gps?.lng ?? null,
                  datetime: photo.exif ? formatExifTime(photo.exif) : null,
                  address: photo.exifAddr?.full ?? null,
                  source: photo.source,
                },
              },
            }),
          );
          done += 1;
          setProgress(
            1,
            Math.round((done / ready.length) * 78) + 14,
            `Transfer foto ${done} dari ${ready.length}…`,
          );
          return photo;
        },
        Math.min(adaptiveConcurrency(3), 3),
      );

      const failures = results.filter((item): item is Error => item instanceof Error);
      if (failures.length) throw failures[0];

      setProgress(2, 92, 'Finalisasi…');
      setProgress(3, 100, 'Draft tersimpan');
      await new Promise(resolve => setTimeout(resolve, 500));
      stopLoading();

      showAlert(
        'success',
        'Draft Tersimpan',
        `<b>${ready.length}</b> foto dan teks laporan tersimpan di server.<br><small style="color:var(--muted)">ID: ${esc(created.draftId)} — gunakan tombol <b>Draft</b> untuk memuatnya kembali.</small>`,
      );
    } catch (error) {
      stopLoading();
      showAlert(
        'error',
        'Gagal Menyimpan Draft',
        `${esc((error as Error).message)}<br><small style="color:var(--muted)">Draft yang sudah berhasil tersimpan tetap tersedia. Buka menu <b>Draft</b> untuk melanjutkan tanpa mengulang dari awal.</small>`,
      );
    } finally {
      setSaving(false);
    }
  }, [photos, reportText, scope, setActiveDraftId, showAlert, startLoading, setProgress, stopLoading]);

  const openSheet = useCallback(async () => {
    setSheetOpen(true);
    setListing(true);
    setListError(null);
    try {
      const result = await apiFetch<{ drafts: DraftItem[] }>(
        `/api/drafts?scope=${encodeURIComponent(SCOPE)}`,
        { timeout: 20_000 },
      );
      setDrafts(Array.isArray(result.drafts) ? result.drafts : []);
    } catch (error) {
      setListError((error as Error).message);
    } finally {
      setListing(false);
    }
  }, []);

  const loadDraft = useCallback(
    async (draftId: string) => {
      setSheetOpen(false);
      startLoading('draft', 'Memuat Draft…', 'Mengunduh foto dari server…', [
        { icon: 'search', label: 'Mencari draft' },
        { icon: 'cloudDownload', label: 'Mengunduh foto' },
        { icon: 'file', label: 'Memuat teks' },
        { icon: 'circleCheck', label: 'Selesai' },
      ]);
      setProgress(0, 20, 'Menghubungi server…');

      try {
        const result = await withRetry(() =>
          apiFetch<{ teks: string; photos: LoadedDraftPhoto[]; jumlahFoto: number }>('/api/drafts', {
            method: 'POST',
            timeout: 90_000,
            body: { action: 'load', draftId },
          }),
        );

        setProgress(1, 70, `Mengunduh ${result.photos.length} foto…`);

        const room = MAX_PHOTOS - photos.length;
        if (room <= 0) {
          throw new Error('Kapasitas foto sudah penuh. Hapus foto lama sebelum memuat draft.');
        }

        const loaded: PhotoData[] = result.photos.slice(0, room).map((photo, index) => {
          const meta = photo.exifMeta;
          return {
            id: nextId(),
            data: photo.data,
            mime: photo.mime,
            sizeKB: photo.sizeKB,
            compressed: photo.source !== 'camera',
            processing: false,
            procLabel: '',
            source: photo.source === 'camera' ? 'camera' : 'gallery',
            exif:
              meta?.hasGps && meta.lat !== null && meta.lng !== null
                ? { gps: { lat: meta.lat, lng: meta.lng } }
                : null,
            exifAddr: meta?.address ? { full: meta.address, road: '', parts: [] } : null,
            ts: meta?.datetime || '',
            order: photos.length + index,
            fromDraft: true,
            watermarked: false,
          };
        });

        addPhotos(loaded);
        if (result.teks) setReportText(result.teks);
        setActiveDraftId(null);
        setDrafts(current => current.filter(item => item.draftId !== draftId));

        setProgress(3, 100, 'Selesai');
        await new Promise(done => setTimeout(done, 450));
        stopLoading();

        showAlert(
          'success',
          'Draft Dimuat',
          `<b>${loaded.length}</b> foto dan teks laporan berhasil dipulihkan.<br><small style="color:var(--muted)">Draft dihapus permanen dari server setelah dimuat.</small>`,
        );
      } catch (error) {
        stopLoading();
        showAlert('error', 'Gagal Memuat Draft', (error as Error).message);
      }
    },
    [photos.length, addPhotos, setReportText, setActiveDraftId, showAlert, startLoading, setProgress, stopLoading],
  );

  const removeDraft = useCallback(
    async (draftId: string) => {
      setRemoving(draftId);
      try {
        await apiFetch('/api/drafts', {
          method: 'POST',
          timeout: 30_000,
          body: { action: 'delete', draftId },
        });
        setDrafts(current => current.filter(item => item.draftId !== draftId));
        if (activeDraftId === draftId) setActiveDraftId(null);
      } catch (error) {
        showAlert('error', 'Gagal Menghapus Draft', (error as Error).message);
      } finally {
        setRemoving(null);
      }
    },
    [activeDraftId, setActiveDraftId, showAlert],
  );

  return {
    sheetOpen,
    openSheet,
    closeSheet: () => setSheetOpen(false),
    listing,
    listError,
    drafts,
    saving,
    removing,
    saveDraft,
    loadDraft,
    removeDraft,
  };
}

function categoryLabel(scope: string): string {
  return scope === 'sadewa' ? 'Sadewa' : scope;
}
