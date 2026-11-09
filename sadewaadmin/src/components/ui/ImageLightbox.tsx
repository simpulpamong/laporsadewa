import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, ExternalLink, Download } from 'lucide-react';
import { cn } from '@/lib/cn';

export type LightboxImage = { src: string; name?: string; fileId?: string; link?: string };

export function ImageLightbox({ open, images, index, onClose, onIndex }: { open: boolean; images: LightboxImage[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex(Math.min(images.length - 1, index + 1));
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1));
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, index, images.length, onClose, onIndex]);
  if (!open || !images.length) return null;
  const cur = images[Math.max(0, Math.min(index, images.length - 1))];
  const src = cur?.src || (cur?.fileId ? `https://drive.google.com/uc?export=view&id=${cur.fileId}` : cur?.link || '');
  const node = (
    <div className="fixed inset-0 z-[12000] bg-black/92 flex flex-col" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white shrink-0">
        <div className="min-w-0"><div className="text-sm font-semibold truncate">{cur?.name || `Foto ${index + 1}`}</div><div className="text-xs text-white/60">{index + 1} / {images.length}</div></div>
        <div className="flex items-center gap-1">
          {(cur?.link || src) && <a href={cur?.link || src} target="_blank" rel="noreferrer" className="p-2 rounded-lg hover:bg-white/10" title="Buka"><ExternalLink className="w-4 h-4" /></a>}
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" title="Tutup"><X className="w-5 h-5" /></button>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative flex items-center justify-center px-3 sm:px-12">
        {images.length > 1 && <button type="button" onClick={() => onIndex(Math.max(0, index - 1))} disabled={index === 0} className="absolute left-2 sm:left-3 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white"><ChevronLeft className="w-6 h-6" /></button>}
        <img src={src} alt={cur?.name || 'Foto'} className="max-h-full max-w-full object-contain rounded-lg shadow-2xl select-none" />
        {images.length > 1 && <button type="button" onClick={() => onIndex(Math.min(images.length - 1, index + 1))} disabled={index >= images.length - 1} className="absolute right-2 sm:right-3 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white"><ChevronRight className="w-6 h-6" /></button>}
      </div>
      {images.length > 1 && (
        <div className="shrink-0 px-4 py-3 flex gap-2 overflow-x-auto justify-center custom-scrollbar">
          {images.map((im, i) => {
            const thumb = im.src || (im.fileId ? `https://drive.google.com/thumbnail?id=${im.fileId}&sz=w200` : im.link || '');
            return <button key={i} type="button" onClick={() => onIndex(i)} className={cn('h-12 w-16 rounded-md overflow-hidden border-2 shrink-0', i === index ? 'border-blue-500' : 'border-transparent opacity-70 hover:opacity-100')}><img src={thumb} alt="" className="h-full w-full object-cover" /></button>;
          })}
        </div>
      )}
    </div>
  );
  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}
