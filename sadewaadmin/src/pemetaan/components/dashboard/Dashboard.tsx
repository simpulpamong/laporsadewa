'use client';

/**
 * Dashboard Pemetaan — peta di ATAS, panel kontrol di BAWAH (tanpa sidebar sendiri),
 * menyatu penuh dengan SADEWA (tanpa toggle tema terpisah).
 */

import { useState } from 'react';

import { CategoryDialog } from './CategoryDialog';
import { PrintDialog } from './PrintDialog';
import { RegionInspector } from './RegionInspector';
import { SettingsDialog } from './SettingsDialog';
import { Sidebar } from './Sidebar';
import { MapClient } from '@/pemetaan/components/map/MapClient';
import { useApp } from '@/pemetaan/lib/store';
import type { ReportPoint } from '@/pemetaan/components/map/MapCanvas';

export function Dashboard({ reportPoints = [], loading = false }: { reportPoints?: ReportPoint[]; loading?: boolean }) {
  const app = useApp();
  const [printOpen, setPrintOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categoryEditingId, setCategoryEditingId] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);

  if (!app.ready) return <SplashScreen />;

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Card peta — sama persis gaya dengan menu Peta */}
      <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 shadow-sm h-[72vh] min-h-[440px]">
        <MapClient reportPoints={reportPoints} />
        <RegionInspector />
        {loading && (
          <div className="pointer-events-none absolute left-3 top-3 z-[600] rounded-md border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-200 shadow-md backdrop-blur-sm">Memuat titik laporan…</div>
        )}
      </div>

      {/* Card kontrol (terpisah, di bawah peta) */}
      <Sidebar
        onOpenPrint={() => setPrintOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenCategoryEditor={(id) => {
          setCategoryEditingId(id);
          setCategoryOpen(true);
        }}
      />

      <PrintDialog open={printOpen} onClose={() => setPrintOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CategoryDialog open={categoryOpen} onClose={() => setCategoryOpen(false)} editingId={categoryEditingId} />
    </div>
  );
}

function SplashScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-[360px] w-full flex-col items-center justify-center bg-slate-50 dark:bg-[#0B1120]"
    >
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div aria-hidden="true" className="absolute inset-0 animate-spin rounded-full border-[3px] border-slate-200 dark:border-slate-700 border-t-blue-600" />
        <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-sm"><img src="/assets/sadewa-white.svg" alt="SADEWA" className="h-6 w-6 object-contain" /></span>
      </div>
      <div className="mt-4 text-center">
        <p className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100">Memuat Pemetaan…</p>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">SADEWA · Pemetaan Wilayah</p>
      </div>
    </div>
  );
}
