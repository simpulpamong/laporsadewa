'use client';

/**
 * Panel kontrol Pemetaan — ditampilkan DI BAWAH peta (bukan sidebar),
 * menyatu dengan SADEWA. Berisi: kategori, tampilan peta, penilaian wilayah,
 * statistik, dan aksi (cetak/pengaturan/kategori). Tanpa toggle tema sendiri.
 */

import {
  Flame, CloudRain, Mountain, Droplets, Car, Zap, TriangleAlert, Factory,
  Building2, Landmark, Map as MapIcon, ShieldAlert, Cog, Plus, Printer,
  Eraser, Sparkles, type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button, Card, Dropdown, Segmented, Switch } from '@/pemetaan/components/ui';
import { useDialog } from '@/components/ui';
import { BASE_LAYERS } from '@/pemetaan/lib/defaults';
import { useApp } from '@/pemetaan/lib/store';
import { RISK_SCORES, type RiskCategory } from '@/pemetaan/lib/types';

const ICONS: Record<string, LucideIcon> = {
  Flame, CloudRain, Mountain, Droplets, Car, Zap, TriangleAlert, Factory,
  Building2, Landmark, Map: MapIcon, ShieldAlert,
};

export function Sidebar({
  collapsed: _collapsed,
  onToggleCollapsed: _onToggleCollapsed,
  onOpenPrint,
  onOpenSettings,
  onOpenCategoryEditor,
}: {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onOpenPrint: () => void;
  onOpenSettings: () => void;
  onOpenCategoryEditor: (categoryId: string | null) => void;
}) {
  const app = useApp();
  const dialog = useDialog();
  const activeCategory = app.activeCategory;
  const [assessmentMode, setAssessmentMode] = useState<'kecamatan' | 'desa'>('kecamatan');
  const [assessmentDistrictCode, setAssessmentDistrictCode] = useState(app.view.selectedKecamatanCode ?? '');

  useEffect(() => {
    if (!assessmentDistrictCode && app.kecamatanList.length) {
      setAssessmentDistrictCode(app.kecamatanList[0].properties.code);
    }
  }, [assessmentDistrictCode, app.kecamatanList]);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] shadow-sm">
      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {/* Kategori Peta */}
          <Card
            id="sidebar-categories"
            title="Kategori Peta"
            action={
              <button
                onClick={() => onOpenCategoryEditor(null)}
                className="flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-500/10 px-2 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300 transition hover:bg-blue-100 dark:hover:bg-blue-500/20"
              >
                <Plus size={12} /> Baru
              </button>
            }
          >
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
              {app.categories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  active={category.id === app.activeCategoryId}
                  onClick={() => app.setActiveCategory(category.id)}
                  onEdit={() => onOpenCategoryEditor(category.id)}
                />
              ))}
              {!app.categories.length ? (
                <p className="py-3 text-center text-xs text-slate-400">Belum ada kategori. Tambahkan kategori peta pertama.</p>
              ) : null}
            </div>
          </Card>

          {/* Tampilan Peta */}
          <div id="sidebar-map"><MapSettings /></div>

          {/* Statistik */}
          <Card id="sidebar-statistics" title={`Statistik · ${activeCategory?.name ?? '—'}`}>
            <StatRows />
          </Card>

          {/* Penilaian Wilayah (span penuh di xl kecil agar muat) */}
          <div id="sidebar-assessment" className="md:col-span-2 xl:col-span-2">
            <AssessmentPanel
              mode={assessmentMode}
              onModeChange={setAssessmentMode}
              districtCode={assessmentDistrictCode}
              onDistrictChange={setAssessmentDistrictCode}
            />
          </div>

          {/* Aksi */}
          <Card title="Aksi" className="p-2.5">
            <div className="flex flex-col gap-2">
              <Button size="sm" className="h-9 w-full" onClick={onOpenPrint}>
                <Printer size={14} /> Cetak Peta HD
              </Button>
              <div className="grid grid-cols-3 gap-1.5">
                <Button variant="outline" size="sm" className="h-11 w-full flex-col gap-0.5 border-slate-200 dark:border-slate-700 px-1 text-[10px] leading-tight" onClick={() => onOpenCategoryEditor(null)}>
                  <Plus size={14} /> Kategori
                </Button>
                <Button variant="soft" size="sm" className="h-11 w-full flex-col gap-0.5 px-1 text-[10px] leading-tight" disabled={!activeCategory}
                  onClick={async () => { if (!activeCategory) return; const ok = await dialog.confirm({ title: 'Isi Contoh', message: 'Isi data contoh untuk kategori ini?', confirmLabel: 'Isi Contoh', cancelLabel: 'Batal', tone: 'warning' }); if (ok) app.seedDemoScores(activeCategory.id); }}>
                  <Sparkles size={14} /> <span className="text-center">Isi Contoh</span>
                </Button>
                <Button variant="outline" size="sm" className="h-11 w-full flex-col gap-0.5 border-slate-200 dark:border-slate-700 px-1 text-[10px] leading-tight hover:border-red-200 hover:bg-red-50 hover:text-red-700" disabled={!activeCategory}
                  onClick={async () => { if (!activeCategory) return; const ok = await dialog.confirm({ title: 'Bersihkan', message: 'Hapus penilaian kategori ini?', confirmLabel: 'Bersihkan', cancelLabel: 'Batal', tone: 'danger' }); if (ok) app.clearScoresForCategory(activeCategory.id); }}>
                  <Eraser size={14} /> <span className="text-center">Bersihkan</span>
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={onOpenSettings} className="h-8 w-full justify-center text-[11px]">
                <Cog size={13} /> Pengaturan & Backup
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MapSettings() {
  const app = useApp();
  return (
    <Card title="Tampilan Peta">
      <div className="flex flex-col gap-2">
        <Segmented
          value={app.view.mode}
          onChange={(mode) => app.updateView({ mode })}
          options={[
            { value: 'kecamatan', label: 'Kecamatan' },
            { value: 'desa', label: 'Desa / Kelurahan' },
          ]}
        />
        {app.view.mode === 'desa' ? (
          <Dropdown
            value={app.view.selectedKecamatanCode ?? ''}
            ariaLabel="Fokus wilayah kecamatan"
            onChange={(value) => app.updateView({ selectedKecamatanCode: value || null })}
            options={[
              { value: '', label: 'Seluruh kabupaten' },
              ...app.kecamatanList.map((kec) => ({ value: kec.properties.code, label: `Kec. ${kec.properties.name}` })),
            ]}
          />
        ) : null}
        <Dropdown
          value={app.view.baseLayer}
          ariaLabel="Basemap"
          onChange={(value) => app.updateView({ baseLayer: value as never })}
          options={BASE_LAYERS.map((layer) => ({ value: layer.id, label: layer.label }))}
        />
        <Switch label="Tampilkan nama kecamatan" checked={app.view.labels} onChange={(labels) => app.updateView({ labels })} />
      </div>
    </Card>
  );
}

function CategoryRow({ category, active, onClick, onEdit }: { category: RiskCategory; active: boolean; onClick: () => void; onEdit: () => void }) {
  const Icon = ICONS[category.icon] ?? MapIcon;
  return (
    <div
      className={[
        'flex cursor-pointer items-start gap-2.5 rounded-xl border px-2.5 py-2 transition',
        active ? 'border-blue-300 dark:border-blue-500/50 bg-blue-50/70 dark:bg-blue-500/10 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)]'
               : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50',
      ].join(' ')}
      onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${category.palette[3]}, ${category.palette[4]})` }}>
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">{category.name}</p>
        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{category.description || '—'}</p>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="rounded-md p-1 text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200" title="Edit kategori">
        <Cog size={13} />
      </button>
    </div>
  );
}

function AssessmentPanel({ mode, onModeChange, districtCode, onDistrictChange }: { mode: 'kecamatan' | 'desa'; onModeChange: (mode: 'kecamatan' | 'desa') => void; districtCode: string; onDistrictChange: (code: string) => void }) {
  const app = useApp();
  const districts = app.kecamatanList;
  const villages = app.geo.kelurahan?.features.filter((feature) => feature.properties.districtCode === districtCode) ?? [];
  const features = mode === 'kecamatan' ? districts : villages;
  return (
    <Card title="Penilaian Wilayah">
      <div className="flex flex-col gap-2.5">
        <Segmented value={mode} onChange={onModeChange} options={[{ value: 'kecamatan', label: `Kecamatan (${districts.length || 21})` }, { value: 'desa', label: 'Desa/Kelurahan' }]} size="sm" />
        {mode === 'desa' ? (
          <Dropdown value={districtCode} ariaLabel="Pilih kecamatan untuk penilaian desa" onChange={onDistrictChange}
            options={[{ value: '', label: 'Pilih kecamatan' }, ...districts.map((district) => ({ value: district.properties.code, label: `Kec. ${district.properties.name}` }))]} />
        ) : null}
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1 custom-scrollbar">
          {features.map((feature) => <VillageScoreRow key={feature.properties.id} feature={feature} />)}
          {!features.length ? <p className="py-3 text-center text-xs text-slate-400">{mode === 'desa' ? 'Pilih kecamatan untuk menilai desa/kelurahan.' : 'Data kecamatan sedang dimuat.'}</p> : null}
        </div>
      </div>
    </Card>
  );
}

function StatRows() {
  const app = useApp();
  const activeCategory = app.activeCategory;
  const max = Math.max(1, ...RISK_SCORES.map((score) => app.stats.counts[score]));
  if (!activeCategory) return <p className="text-xs text-slate-400">Pilih kategori.</p>;
  return (
    <div className="flex flex-col gap-2">
      {RISK_SCORES.map((score) => {
        const count = app.stats.counts[score];
        return (
          <div key={score} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-[4px] border border-slate-300 dark:border-slate-600" style={{ background: activeCategory.palette[score - 1] }} />
            <span className="w-20 shrink-0 text-[11px] text-slate-600 dark:text-slate-300">{activeCategory.bands[score - 1]}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full transition-all" style={{ width: `${(count / max) * 100}%`, background: activeCategory.palette[score - 1] }} />
            </div>
            <span className="w-6 text-right text-[11px] font-semibold text-slate-700 dark:text-slate-200">{count}</span>
          </div>
        );
      })}
      <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 px-2 py-1.5 text-[11px]">
        <span className="h-3 w-3 rounded-[4px] border border-slate-300 dark:border-slate-600" style={{ background: activeCategory.noDataColor }} />
        <span className="text-slate-500 dark:text-slate-400">Belum data: <b className="text-slate-700 dark:text-slate-200">{app.stats.noData}</b></span>
        <span className="mx-1 h-3 w-px bg-slate-300 dark:bg-slate-700" />
        <span className="text-slate-500 dark:text-slate-400">Rata-rata: <b className="text-slate-700 dark:text-slate-200">{app.stats.average ?? '—'}</b></span>
      </div>
      <div className="text-[11px] text-slate-400">Wilayah dinilai: <span className="font-semibold text-slate-600 dark:text-slate-300">{app.stats.scored}/{app.stats.total}</span></div>
    </div>
  );
}

function VillageScoreRow({ feature }: { feature: import('@/pemetaan/lib/types').RegionFeature }) {
  const app = useApp();
  const activeCategory = app.activeCategory;
  const rec = activeCategory ? app.scores[`${activeCategory.id}::${feature.properties.id}`] : undefined;
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 px-2 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-slate-700 dark:text-slate-200">{feature.properties.name}</span>
      <div className="flex gap-1">
        {RISK_SCORES.map((score) => {
          const active = rec?.score === score;
          return (
            <button key={score} title={`Skor ${score}`}
              onClick={() => app.setScore(activeCategory?.id ?? '', feature.properties.id, active ? null : score)}
              className={active ? 'h-5 w-5 rounded-full border-2 border-white ring-2 ring-slate-900/20' : 'h-5 w-5 rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 transition hover:scale-110'}
              style={{ background: active ? activeCategory?.palette[score - 1] : undefined }}
            />
          );
        })}
      </div>
    </div>
  );
}
