'use client';

import type { GpsPoint } from '../core/types';

/**
 * OCR koordinat untuk foto galeri.
 *
 * Modul ini hanya dimuat saat pengaturannya diaktifkan sehingga bobot
 * `tesseract.js` tidak masuk ke bundel awal halaman.
 */

type TesseractWorker = {
  recognize: (image: File | Blob | string) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<unknown>;
};

let workerPromise: Promise<TesseractWorker | null> | null = null;

async function getWorker(): Promise<TesseractWorker | null> {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = (await createWorker('eng', 1)) as unknown as TesseractWorker;
      return worker;
    } catch (error) {
      console.warn('[ocr] mesin OCR gagal dimuat', error);
      return null;
    }
  })();
  return workerPromise;
}

/** Lepaskan worker bila tidak dipakai lagi (hemat memori HP). */
export async function releaseOcrWorker() {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  const worker = await pending;
  try {
    await worker?.terminate();
  } catch {
    /* abaikan */
  }
}

const LAT_PATTERN = /lat(?:itude)?\s*[:=]?\s*(-?\d{1,3}(?:\.\d+)?)/;
const LNG_PATTERN = /lo(?:ng|n)?(?:gitude)?\s*[:=]?\s*(-?\d{1,3}(?:\.\d+)?)/;

export async function extractOcrCoordinates(image: File | Blob | string): Promise<GpsPoint | null> {
  const worker = await getWorker();
  if (!worker) return null;

  try {
    const { data } = await worker.recognize(image);
    const text = data?.text || '';
    if (!text) return null;

    const lower = text.toLowerCase();
    const latMatch = LAT_PATTERN.exec(lower);
    const lngMatch = LNG_PATTERN.exec(lower);

    let lat = NaN;
    let lng = NaN;

    if (latMatch && lngMatch) {
      lat = Number(latMatch[1]);
      lng = Number(lngMatch[1]);
    } else {
      const pair = /(-?\d{1,3}\.\d+)\s*[,\s]\s*(\d{1,3}\.\d+)/.exec(text);
      if (pair) {
        lat = Number(pair[1]);
        lng = Number(pair[2]);
      } else {
        const numbers = text.match(/-?\d{1,3}\.\d+/g);
        if (numbers && numbers.length >= 2) {
          const first = Number(numbers[0]);
          const second = Number(numbers[1]);
          if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
            lat = first;
            lng = second;
          }
        }
      }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

    return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
  } catch (error) {
    console.warn('[ocr] pembacaan teks gagal', error);
    return null;
  }
}
