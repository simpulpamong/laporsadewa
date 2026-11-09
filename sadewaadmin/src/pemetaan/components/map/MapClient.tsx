'use client';

/**
 * Loader peta (adaptasi Vite) — Leaflet butuh `window`, jadi dimuat client-side.
 */

import { Suspense, lazy } from 'react';
import type { ReportPoint } from './MapCanvas';

const MapCanvas = lazy(() => import('./MapCanvas'));

export function MapClient({ reportPoints = [] }: { reportPoints?: ReportPoint[] }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-slate-100">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <div className="h-6 w-6 rounded-full border-2 border-slate-200 border-t-slate-500 animate-spin" />
            <p className="text-xs font-medium">Memuat peta…</p>
          </div>
        </div>
      }
    >
      <MapCanvas reportPoints={reportPoints} />
    </Suspense>
  );
}
