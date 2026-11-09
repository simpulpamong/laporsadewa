'use client';

/**
 * Dialog kelola kategori peta — nama, deskripsi, ikon, palet 5 warna, label
 * rentang (band), dan warna "belum ada data".
 */

import { useEffect, useState } from 'react';
import {
  Building2,
  Car,
  CloudRain,
  Droplets,
  Factory,
  Flame,
  Landmark,
  Map as MapIcon,
  Mountain,
  ShieldAlert,
  TriangleAlert,
  Trash2,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { Button, Field, Modal, TextInput } from '@/pemetaan/components/ui';
import { CATEGORY_ICONS, makeCategoryDefaults } from '@/pemetaan/lib/defaults';
import { useApp } from '@/pemetaan/lib/store';
import type { RiskCategory } from '@/pemetaan/lib/types';

const CATEGORY_ICON_COMPONENTS: Record<string, LucideIcon> = {
  Flame,
  CloudRain,
  Mountain,
  Droplets,
  Car,
  Zap,
  TriangleAlert,
  Factory,
  Building2,
  Landmark,
  Map: MapIcon,
  ShieldAlert,
};

export function CategoryDialog({
  open,
  onClose,
  editingId,
}: {
  open: boolean;
  onClose: () => void;
  editingId: string | null;
}) {
  const app = useApp();
  const [draft, setDraft] = useState<RiskCategory>(() => makeCategoryDefaults());
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    const existing = app.categories.find((c) => c.id === editingId);
    setDraft(existing ? JSON.parse(JSON.stringify(existing)) : makeCategoryDefaults());
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId]);

  const save = () => {
    if (!draft.name.trim()) {
      app.toast({ type: 'error', title: 'Nama kategori wajib diisi.' });
      return;
    }
    app.upsertCategory({ ...draft, updatedAt: new Date().toISOString() });
    app.toast({
      type: 'success',
      title: app.categories.some((c) => c.id === draft.id) ? 'Kategori diperbarui.' : 'Kategori baru dibuat.',
    });
    onClose();
  };

  const remove = () => {
    app.deleteCategory(draft.id);
    app.toast({ type: 'info', title: 'Kategori dihapus.' });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingId ? 'Edit Kategori Peta' : 'Kategori Peta Baru'}
      description="Satu kategori = satu tema peta dengan skala warna dan label_rentang tersendiri."
      width="max-w-2xl"
      footer={
        <>
          {editingId ? (
            confirmDelete ? (
              <Button variant="danger" size="sm" onClick={remove}>
                <Trash2 size={13} /> Yakin, hapus permanen?
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={13} /> Hapus kategori
              </Button>
            )
          ) : null}
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={save}>Simpan kategori</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nama kategori" className="sm:col-span-2">
          <TextInput
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="mis. Kerawanan Kebakaran Hutan dan Lahan"
          />
        </Field>
        <Field label="Deskripsi singkat" className="sm:col-span-2">
          <TextInput
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Penjelasan tema peta untuk legenda cetak…"
          />
        </Field>
        <Field label="Ikon">
          <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Pilih ikon kategori">
            {CATEGORY_ICONS.map((icon) => {
              const Icon = CATEGORY_ICON_COMPONENTS[icon] ?? MapIcon;
              const active = draft.icon === icon;
              return (
                <button
                  key={icon}
                  type="button"
                  title={icon}
                  aria-label={icon}
                  aria-pressed={active}
                  onClick={() => setDraft({ ...draft, icon })}
                  className={`flex h-10 items-center justify-center rounded-lg border transition ${
                    active
                      ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/20'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={18} strokeWidth={2} />
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Warna 'belum ada data'">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={draft.noDataColor}
              onChange={(e) => setDraft({ ...draft, noDataColor: e.target.value })}
              className="h-9 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white"
            />
            <TextInput
              value={draft.noDataColor}
              onChange={(e) => setDraft({ ...draft, noDataColor: e.target.value })}
              className="font-mono text-xs"
            />
          </div>
        </Field>

        <div className="sm:col-span-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Skala skor (skor 1 → 5) — warna & label
          </p>
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4, 5].map((score) => (
              <div key={score} className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft.palette[score - 1]}
                  onChange={(e) => {
                    const palette = [...draft.palette] as RiskCategory['palette'];
                    palette[score - 1] = e.target.value;
                    setDraft({ ...draft, palette });
                  }}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white"
                />
                <span className="w-14 shrink-0 text-[11px] font-bold text-slate-500">Skor {score}</span>
                <TextInput
                  value={draft.bands[score - 1]}
                  onChange={(e) => {
                    const bands = [...draft.bands] as RiskCategory['bands'];
                    bands[score - 1] = e.target.value;
                    setDraft({ ...draft, bands });
                  }}
                  placeholder={`Rentang ${score}`}
                  className="text-xs"
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            Label rentang menentukan dekorasi legenda kop pada lembar cetak (contoh bawaan:
            “Tidak rawan, Rendah, Sedang, Tinggi, sangat rawan” untuk tema kartografis pemerintahan).
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500 sm:col-span-2">
          <span className="font-semibold text-slate-600">Pratayang skala:</span>
          <div className="mt-1.5 flex gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <span
                key={s}
                className="flex h-7 flex-1 items-center justify-center rounded-md text-[10px] font-bold text-white shadow-inner"
                style={{ background: draft.palette[s - 1] }}
              >
                {draft.bands[s - 1] || s}
              </span>
            ))}
            <span
              className="flex h-7 flex-1 items-center justify-center rounded-md border border-dashed border-slate-300 text-[10px] font-bold text-slate-500"
              style={{ background: draft.noDataColor + '55' }}
            >
              NODATA
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
