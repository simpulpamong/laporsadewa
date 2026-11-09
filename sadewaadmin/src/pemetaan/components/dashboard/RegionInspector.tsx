'use client';

/**
 * Inspector wilayah — muncul mengambang saat pengguna mengeklik poligon.
 * Memungkinkan penilaian cepat (skor 1–5) + catatan untuk kategori aktif.
 */

import { Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button, TextArea } from '@/pemetaan/components/ui';
import { useApp } from '@/pemetaan/lib/store';
import { RISK_SCORES } from '@/pemetaan/lib/types';

export function RegionInspector() {
  const app = useApp();
  const activeCategory = app.activeCategory;
  const selectedId = app.selectedRegionId;

  const feature = useMemoFeature(selectedId);
  const props = feature?.properties;
  const record = activeCategory && props ? app.scores[`${activeCategory.id}::${props.id}`] : undefined;

  const [noteDraft, setNoteDraft] = useState(record?.note ?? '');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regionKey = `${activeCategory?.id ?? ''}::${props?.id ?? ''}`;

  useEffect(() => {
    setNoteDraft(record?.note ?? '');
  }, [regionKey, record?.note]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  if (!selectedId || !feature || !props) return null;

  const commitNote = (value: string) => {
    if (activeCategory && value !== (record?.note ?? '')) {
      app.setScore(activeCategory.id, props.id, record?.score ?? null, value);
    }
  };

  const handleNoteChange = (value: string) => {
    setNoteDraft(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      commitNote(value);
    }, 350);
  };

  return (
    <div className="animate-fade-rise absolute right-3 top-3 z-[600] w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{props.name}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {props.type === 'kelurahan'
              ? `Desa/Kelurahan · Kecamatan ${props.districtName ?? '-'}`
              : props.type === 'kecamatan'
                ? 'Kecamatan'
                : 'Kabupaten'}{' '}
            · Kode {props.code}
          </p>
        </div>
        <button
          onClick={() => app.selectRegion(null)}
          className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Tutup inspector"
        >
          <X size={15} />
        </button>
      </div>

      <div className="px-4 py-3">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Skor {activeCategory?.name ?? ''}
        </p>
        <div className="flex gap-1.5">
          {RISK_SCORES.map((score) => {
            const active = record?.score === score;
            const color = activeCategory?.palette[score - 1] ?? '#94a3b8';
            return (
              <button
                key={score}
                onClick={() =>
                  activeCategory &&
                  app.setScore(activeCategory.id, props.id, active ? null : score)
                }
                className="flex h-9 flex-1 flex-col items-center justify-center rounded-lg border-2 text-[11px] font-bold transition"
                style={{
                  background: active ? color : '#ffffff',
                  borderColor: active ? color : '#e2e8f0',
                  color: active ? '#ffffff' : '#64748b',
                }}
                title={`${activeCategory?.bands[score - 1] ?? ''}`}
              >
                {score}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          {record ? `${activeCategory?.bands[record.score - 1]}` : 'Belum ada data'}
        </p>

        <TextArea
          className="mt-2.5 min-h-[64px] text-xs"
          placeholder="Catatan (mis. sumber data, hipotesis, keterangan lapangan)…"
          value={noteDraft}
          onChange={(e) => handleNoteChange(e.target.value)}
          onBlur={() => commitNote(noteDraft)}
        />

        <div className="mt-2.5 flex items-center justify-between">
          {record?.updatedAt ? (
            <span className="text-[10px] text-slate-400">
              Diperbarui {new Date(record.updatedAt).toLocaleString('id-ID')}
            </span>
          ) : (
            <span />
          )}
          {record ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                activeCategory && app.setScore(activeCategory.id, props.id, null, record.note)
              }
            >
              <Trash2 size={13} /> Hapus skor
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function useMemoFeature(regionId: string | null) {
  const app = useApp();
  return useMemo(() => {
    if (!regionId) return null;
    for (const collection of [app.geo.kelurahan, app.geo.kecamatan, app.geo.kabupaten]) {
      const found = collection?.features.find(
        (f) => f.properties.id === regionId,
      );
      if (found) return found;
    }
    return null;
  }, [regionId, app.geo]);
}
