import React from 'react';
import { Check, ImageOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { KATEGORI_IMAGE_OPTIONS, resolveKategoriImage } from '@/lib/image';

export function ImagePicker({ value, onChange, label = 'Foto' }: { value?: string; onChange: (v: string) => void; label?: string }) {
  const selected = value ? String(value) : '';
  return (
    <div className="block">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500 uppercase">{label}</span>
        {selected && <button type="button" onClick={() => onChange('')} className="text-[11px] text-slate-400 hover:text-rose-400 inline-flex items-center gap-1"><ImageOff className="w-3 h-3"/>Tanpa foto</button>}
      </div>
      <div className="mt-2 grid grid-cols-5 sm:grid-cols-10 gap-2">
        {KATEGORI_IMAGE_OPTIONS.map(n => {
          const src = resolveKategoriImage(n);
          const on = selected === n || selected === `${n}.webp` || selected === `${n}.svg`;
          return (
            <button key={n} type="button" onClick={() => onChange(n)} title={`Foto ${n}`}
              className={cn('relative aspect-square rounded-xl border overflow-hidden bg-slate-100 dark:bg-slate-800 transition-all focus:outline-none', on ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600')}>
              {src && <img src={src} alt={n} className="w-full h-full object-cover" loading="lazy" />}
              <span className="absolute bottom-0 inset-x-0 text-[9px] font-bold text-white/90 bg-black/35 py-0.5 text-center">{n}</span>
              {on && <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center"><Check className="w-2.5 h-2.5"/></span>}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">Pilih foto 1–10 (placeholder bernomor, bisa Anda ganti filenya di <code>/public/assets/kategori/</code>). Dipakai di SADEWA &amp; Admin.</p>
    </div>
  );
}
