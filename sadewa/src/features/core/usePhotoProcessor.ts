'use client';

import { useCallback } from 'react';
import { useApp } from './AppContext';
import { readExif } from './exif';
import { reverseGeocode } from './geocoding';
import { processPhoto, autoWatermarkLogo, type WatermarkContext } from './watermark';
import { savePhoto } from './storage';
import { esc } from '@/lib/html';
import { stampHuman } from '@/lib/format';
import { MAX_PHOTOS, MAX_PHOTO_KB } from '@/lib/constants';
import type { ExifData, GeoAddress, PhotoData } from './types';

/**
 * Alur pemrosesan berkas foto:
 *   baca EXIF → reverse geocoding → watermark → kompresi → simpan lokal.
 *
 * Foto diproses satu per satu (dengan jeda animasi) supaya label progres
 * selalu akurat dan antrean tidak membekukan antarmuka.
 */

export interface ProcessContextInput {
  exif: ExifData | null;
  address: GeoAddress | null;
  capturedAt: string;
  source: 'camera' | 'gallery';
}

export type BuildContext = (input: ProcessContextInput) => WatermarkContext;

const yieldToUi = () => new Promise<void>(resolve => setTimeout(resolve, 16));

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `p${Date.now().toString(36)}-${sequence.toString(36)}`;
}

export function usePhotoProcessor() {
  const { scope, settings, photos, addPhotos, patchPhoto, removePhoto, showAlert, category } = useApp();

  const processOne = useCallback(
    async (
      file: File,
      source: 'camera' | 'gallery',
      buildContext: BuildContext,
    ): Promise<PhotoData | null> => {
      const id = nextId();
      const placeholder: PhotoData = {
        id,
        data: null,
        mime: file.type || 'image/jpeg',
        sizeKB: 0,
        compressed: false,
        processing: true,
        procLabel: 'Menyiapkan foto...',
        source,
        exif: null,
        exifAddr: null,
        ts: stampHuman(),
        order: 0,
        watermarked: false,
      };
      addPhotos([placeholder]);

      try {
        patchPhoto(id, { procLabel: 'Membaca EXIF...' });
        const exif = await readExif(file);

        let address: GeoAddress | null = null;
        let effectiveExif: ExifData | null = exif;

        if (exif?.gps) {
          patchPhoto(id, { procLabel: 'Mencari nama jalan...' });
          address = await reverseGeocode(exif.gps.lat, exif.gps.lng);
        } else if (source === 'gallery' && settings.ocrGal) {
          patchPhoto(id, { procLabel: 'Mendeteksi lokasi (OCR)...' });
          const detected = await detectGalleryGps(file);
          if (detected) {
            address = await reverseGeocode(detected.lat, detected.lng);
            effectiveExif = { gps: detected };
          }
        }

        patchPhoto(id, { procLabel: 'Menerapkan watermark...' });
        const watermark = source === 'camera' ? settings.wmCam : settings.wmGal;

        // Berkas dikirim langsung sebagai Blob — tanpa perantara data URL
        // supaya tidak ada salinan base64 di memori.
        const result = await processPhoto({
          source: file,
          sourceKind: source,
          watermark,
          watermarkLogo: autoWatermarkLogo(category),
          context: buildContext({
            exif: effectiveExif,
            address,
            capturedAt: exif?.dto || exif?.dtd || exif?.dateTime || '',
            source,
          }),
          maxBytes: MAX_PHOTO_KB * 1024,
        });

        if (!result) throw new Error('Foto tidak dapat diproses.');

        const photo: PhotoData = {
          ...placeholder,
          data: result.data,
          mime: result.mime,
          sizeKB: result.sizeKB,
          compressed: result.compressed,
          processing: false,
          procLabel: '',
          watermarked: result.watermarked,
          exif: effectiveExif,
          exifAddr: address,
          ts: exif?.dto ? formatExifTimestamp(exif.dto) : placeholder.ts,
        };

        patchPhoto(id, photo);
        void savePhoto(scope, photo);
        return photo;
      } catch (error) {
        removePhoto(id);
        console.error('[photo]', error);
        showAlert(
          'error',
          'Foto Gagal Diproses',
          `Berkas <b>${esc(file.name || 'foto')}</b> tidak dapat diproses. Coba foto lain.`,
        );
        return null;
      }
    },
    [scope, settings.ocrGal, settings.wmCam, settings.wmGal, addPhotos, patchPhoto, removePhoto, showAlert],
  );

  const handleFiles = useCallback(
    async (
      input: FileList | File[] | null,
      source: 'camera' | 'gallery',
      buildContext: BuildContext,
    ) => {
      const files = input ? Array.from(input) : [];
      if (!files.length) return;

      const images = files.filter(file => file.type.startsWith('image/'));
      if (!images.length) {
        showAlert('warn', 'Format Tidak Didukung', 'Pilih berkas foto (JPG, PNG, atau WEBP).');
        return;
      }

      const room = MAX_PHOTOS - photos.length;
      if (room <= 0) {
        showAlert('warn', 'Batas Foto Tercapai', `Maksimal ${MAX_PHOTOS} foto per laporan.`);
        return;
      }

      const selected = images.slice(0, room);
      if (selected.length < images.length) {
        showAlert(
          'warn',
          'Batas Terlampaui',
          `${images.length} foto dipilih, hanya <b>${room}</b> slot yang tersisa.`,
        );
      }

      await yieldToUi();
      const concurrency = source === 'camera' ? 1 : 2;
      let i = 0;
      const workers = Array.from({ length: Math.min(concurrency, selected.length) }, async () => {
        while (i < selected.length) {
          const idx = i++;
          await processOne(selected[idx], source, buildContext);
          await yieldToUi();
        }
      });
      await Promise.all(workers);
    },
    [processOne, photos.length, showAlert],
  );

  return { handleFiles, processOne };
}

function formatExifTimestamp(raw: string): string {
  const match = /(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!match) return stampHuman();
  return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}:${match[6]}`;
}

/** Deteksi koordinat dari teks pada foto galeri (butuh OCR — dimuat saat dipakai). */
async function detectGalleryGps(file: File): Promise<{ lat: number; lng: number } | null> {
  try {
    const { extractOcrCoordinates, releaseOcrWorker } = await import('../sadewa/ocr');
    try {
      return await extractOcrCoordinates(file);
    } finally {
      // Worker OCR menahan +-10 MB RAM. Dilepas tiap foto selesai supaya HP
      // tidak berat (lag) saat memproses banyak foto beruntun.
      void releaseOcrWorker();
    }
  } catch (error) {
    console.warn('[ocr] tidak dapat memuat mesin OCR', error);
    return null;
  }
}
