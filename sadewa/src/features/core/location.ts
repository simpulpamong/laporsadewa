'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GPS_MAX_ACCURACY_M } from '@/lib/constants';
import type { GpsPoint } from './types';

/**
 * Pengambilan koordinat GPS akurat dari perangkat.
 *
 * - `enableHighAccuracy` dipakai supaya koordinat seakurat mungkin (dipakai
 *   untuk cap lokasi pada foto dan disimpan ke Firebase).
 * - `maximumAge: 0` memaksa pembacaan sensor baru, bukan posisi cached.
 * - Lokasi yang terlalu kasar (akurasi > `GPS_MAX_ACCURACY_M`) tetap dikembalikan
 *   tetapi ditandai lewat `accuracy` supaya UI bisa memperingatkan.
 */

export interface LocatedPoint extends GpsPoint {
  accuracy: number;
}

const TIMEOUT_MS = 25_000;

export class GeoError extends Error {}

function readError(code: number): string {
  switch (code) {
    case 1:
      return 'Izin lokasi ditolak. Aktifkan izin lokasi lalu coba lagi.';
    case 2:
      return 'Sinyal lokasi tidak tersedia. Coba di tempat terbuka.';
    case 3:
      return 'Pencarian koordinat terlalu lama. Silakan coba lagi.';
    default:
      return 'Gagal mengambil koordinat dari perangkat.';
  }
}

export function useAccurateLocation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const locate = useCallback(async (): Promise<LocatedPoint> => {
    setError(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const message = 'Perangkat ini tidak mendukung pengambilan lokasi GPS.';
      setError(message);
      throw new GeoError(message);
    }

    setBusy(true);
    try {
      return await new Promise<LocatedPoint>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          position => {
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
            });
          },
          positionError => reject(new GeoError(readError(positionError.code))),
          { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 0 },
        );
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Gagal mengambil koordinat.';
      if (mounted.current) setError(message);
      throw cause;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  return { busy, error, locate, isWeak: (accuracy: number) => accuracy > GPS_MAX_ACCURACY_M };
}
