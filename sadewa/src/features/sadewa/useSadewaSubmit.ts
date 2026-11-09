'use client';

import { useCallback, useRef, useState } from 'react';
import { useApp } from '../core/AppContext';
import { adaptiveConcurrency, adaptiveTimeout, apiFetch, parallelLimit, withRetry } from '../core/apiClient';
import { formatExifTime } from '../core/exif';
import { esc } from '@/lib/html';
import { MAX_PHOTOS } from '@/lib/constants';
import { FIELD_LABELS, parseReport } from '@/lib/parser/whatsapp/parser';
import { parseDynamic, type DynamicFormatConfig } from '@/lib/parser/dynamic/parse';
import type { PhotoData } from '../core/types';
import { buildWhatsAppMessage, buildWhatsAppShareUrl } from './whatsapp';
import { formatWhatsAppHtml } from '@/lib/whatsappFormat';

/**
 * Alur kirim laporan sadewa:
 *   1. validasi teks + foto,
 *   2. unggah foto ke Google Drive (paralel per foto),
 *   3. tulis baris laporan + detail foto ke Spreadsheet,
 *   4. hapus draft bila ada, lalu bersihkan perangkat.
 */

const STEPS = [
  { icon: 'file', label: 'Baca teks laporan' },
  { icon: 'cloudUpload', label: 'Unggah foto ke Drive' },
  { icon: 'table', label: 'Tulis ke Spreadsheet' },
  { icon: 'circleCheck', label: 'Selesai' },
];

function photoId(reportId: string, index: number, photo: PhotoData): string {
  return `${reportId}-${index + 1}-${photo.data?.slice(-32) || photo.sizeKB}`;
}

interface PhotoMetaPayload {
  hasGps: boolean;
  lat: number | null;
  lng: number | null;
  datetime: string | null;
  address: string | null;
}

export interface DrivePhotoLink {
  link: string;
  namaFile: string;
  source: 'camera' | 'gallery';
  meta: PhotoMetaPayload;
  folderUrl: string;
  fileId: string;
  folderId: string;
}

export function useSadewaSubmit() {
  const {
    reportText,
    photos,
    scope,
    activeDraftId,
    setActiveDraftId,
    setReportText,
    showAlert,
    startLoading,
    setProgress,
    stopLoading,
    resetReport,
  } = useApp();
  const [busy, setBusy] = useState(false);

  const formatCache = useRef<{ scope: string; format: DynamicFormatConfig | null; checked: boolean } | null>(null);
  const resolveFormat = useCallback(async (): Promise<DynamicFormatConfig | null> => {
    if (formatCache.current?.scope === scope && formatCache.current.checked) return formatCache.current.format;
    try {
      const { fetchConfigSWR } = await import('@/lib/configCache');
      const r = await fetchConfigSWR();
      const sub = ((r as any)?.subcategories || []).find((s: any) => s.slug === scope || s.id === scope);
      const format = sub?.format && Array.isArray(sub.format.fields) && sub.format.fields.length ? (sub.format as DynamicFormatConfig) : null;
      formatCache.current = { scope, format, checked: true };
      return format;
    } catch { formatCache.current = { scope, format: null, checked: true }; return null; }
  }, [scope]);

  const validateAsync = useCallback(async (): Promise<string | null> => {
    if (!reportText.trim()) return 'Tempel teks laporan sebelum mengirim.';
    const format = await resolveFormat();
    if (format) {
      const dyn = parseDynamic(reportText, format);
      if (dyn.missing.length) return `Lengkapi bagian laporan: ${dyn.missing.map(m => m.label).join(', ')}.`;
    } else if (scope === 'kebakaran' || scope === 'odnk') {
      const parsed = parseReport(reportText);
      if (parsed.missing.length) return `Lengkapi bagian laporan: ${parsed.missing.map(field => FIELD_LABELS[field]).join(', ')}.`;
    }
    // untuk subkategori dinamis tanpa format wajib: validasi final di server
    if (!photos.length) return 'Pilih foto sebelum mengirim.';
    if (photos.length > MAX_PHOTOS) return `Maksimal ${MAX_PHOTOS} foto per laporan.`;
    if (photos.some(photo => photo.processing)) return 'Sebagian foto masih diproses.';
    if (photos.some(photo => !photo.data)) return 'Sebagian foto belum selesai disiapkan.';
    return null;
  }, [photos, reportText, resolveFormat, scope]);

  const submit = useCallback(async () => {
    if (busy) return;
    const problem = await validateAsync();
    if (problem) {
      showAlert('warn', 'Laporan Belum Lengkap', esc(problem));
      return;
    }

    setBusy(true);
    startLoading('submit', 'Mengirim Laporan…', 'Menyiapkan data…', STEPS);
    let displayedProgress = 0;
    const advanceProgress = async (target: number, step: number, sub: string) => {
      const next = Math.max(displayedProgress, Math.min(100, target));
      while (displayedProgress < next) {
        displayedProgress = Math.min(next, displayedProgress + 1);
        setProgress(step, displayedProgress, sub);
        await new Promise(resolve => setTimeout(resolve, 8));
      }
    };

    await advanceProgress(5, 0, 'Memeriksa koneksi layanan…');

    try {
      const idResponse = await apiFetch<{ reportId: string }>('/api/sadewa', {
        method: 'POST',
        timeout: adaptiveTimeout(30_000),
        body: { action: 'generateReportId', data: { kategori: scope } },
      });
      const reportId = idResponse.reportId;
      // Kesiapan layanan divalidasi oleh endpoint submit/upload yang aktif.
      // Endpoint /api/sign adalah pipeline lama dan tidak digunakan SADEWA.
      await advanceProgress(10, 0, 'Menyiapkan layanan penyimpanan…');

      await advanceProgress(15, 0, 'Mengecek teks laporan…');
      let done = 0;
      const results = await parallelLimit(
        photos,
        async (index, photo) => {
          const response = await withRetry(
            () =>
              apiFetch<{ linkFile: string; fileId: string; folderId: string; namaFile: string; folderUrl: string }>('/api/sadewa', {
                method: 'POST',
                timeout: adaptiveTimeout(80_000),
                body: {
                  action: 'uploadFoto',
                  data: {
                    foto: { data: photo.data, mime: photo.mime, source: photo.source },
                    meta: metaOf(photo),
                    laporan: reportText,
                    kategori: scope,
                    reportId,
                    idempotencyKey: photoId(reportId, index, photo),
                    noFoto: index + 1,
                    jumlahTotal: photos.length,
                  },
                },
              }),
            3,
            1200,
          );
          done += 1;
          await advanceProgress(
            15 + Math.round((done / photos.length) * 65),
            1,
            `Mengunggah foto ${done} dari ${photos.length}…`,
          );
          return {
            link: response.linkFile,
            namaFile: response.namaFile,
            source: photo.source,
            meta: metaOf(photo),
            folderUrl: response.folderUrl,
            fileId: response.fileId,
            folderId: response.folderId,
          } satisfies DrivePhotoLink;
        },
        Math.min(adaptiveConcurrency(3), 3),
      );

      const failed = results.filter((item): item is Error => item instanceof Error);
      if (failed.length) throw failed[0];

      const uploaded = results.filter((item): item is DrivePhotoLink => !(item instanceof Error));
      const folderUrl = uploaded.find(item => item.folderUrl)?.folderUrl || '';

      await advanceProgress(82, 1, `${uploaded.length} foto terunggah ke Drive`);
      await advanceProgress(94, 2, 'Menulis ke Spreadsheet…');

      const response = await withRetry(
        () =>
          apiFetch<{ draftRemoved: boolean; whatsapp?: { message?: string; folderUrl?: string } }>('/api/sadewa', {
            method: 'POST',
            timeout: 40_000,
            body: {
              action: 'submitLaporan',
              data: {
                laporan: reportText,
                kategori: scope,
                reportId,
                linkFoto: uploaded.map(({ link, namaFile, source, meta, fileId, folderId, folderUrl }) => ({
                  link,
                  namaFile,
                  source,
                  meta,
                  fileId,
                  folderId,
                  folderUrl,
                })),
                folderUrl,
                draftId: activeDraftId,
              },
            },
          }),
        2,
        800,
      );

      if (!response.success) throw new Error(response.message || 'Penulisan spreadsheet gagal.');

      const whatsappText = response.whatsapp?.message || buildWhatsAppMessage(reportText, folderUrl, uploaded.length);
      const whatsappUrl = buildWhatsAppShareUrl(whatsappText);

      await advanceProgress(100, 3, 'Laporan tersimpan — siap diteruskan ke WhatsApp');
      await new Promise(done => setTimeout(done, 450));
      stopLoading();

      setReportText('');
      setActiveDraftId(null);
      await resetReport({ silent: true });

      const whatsappMessageHtml = [
        `<b>${uploaded.length}</b> foto tersimpan di Drive dan Spreadsheet.`,
        response.draftRemoved ? '<br><small style="color:var(--muted)">Draft di server ikut dihapus.</small>' : '',
        '<br><br><div class="whatsapp-preview">' + formatWhatsAppHtml(whatsappText) + '</div>',
      ].join('');

      showAlert(
        'success',
        'Laporan Terkirim',
        whatsappMessageHtml + `<br><br><a class="btn btn-primary" href="${esc(whatsappUrl)}" target="_blank" rel="noopener noreferrer">Bagikan ke WhatsApp</a>`,
      );
    } catch (error) {
      stopLoading();
      const message = (error as Error).message || 'Terjadi kesalahan saat mengirim.';
      showAlert(
        'error',
        'Gagal Mengirim Laporan',
        `${esc(message)}<br><small style="color:var(--muted)">Data tetap tersimpan di perangkat. Simpan sebagai <b>Draft</b> untuk melanjutkan dari menu <b>Draft</b> tanpa mengulang pengisian.</small>`,
      );
    } finally {
      setBusy(false);
    }
  }, [
    busy, validateAsync, photos, reportText, scope, activeDraftId, setActiveDraftId, setReportText,
    showAlert, startLoading, setProgress, stopLoading, resetReport,
  ]);

  return { submit, busy };
}

function metaOf(photo: PhotoData): DrivePhotoLink['meta'] {
  return {
    hasGps: Boolean(photo.exif?.gps),
    lat: photo.exif?.gps?.lat ?? null,
    lng: photo.exif?.gps?.lng ?? null,
    datetime: photo.exif ? formatExifTime(photo.exif) : null,
    address: photo.exifAddr?.full || null,
  };
}
