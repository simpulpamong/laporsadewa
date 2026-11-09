import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

let lockCount = 0; let prevOverflow = '';
function lock() { if (lockCount++ === 0) { prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; } }
function unlock() { lockCount = Math.max(0, lockCount - 1); if (lockCount === 0) document.body.style.overflow = prevOverflow; }

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' } as const;

export function Modal({ open, onClose, title, icon, size='md', children, footer, hideClose, hideFooter, className }:
  { open:boolean; onClose:()=>void; title?:React.ReactNode; icon?:React.ReactNode; size?:keyof typeof SIZES; children:React.ReactNode; footer?:React.ReactNode; hideClose?:boolean; hideFooter?:boolean; className?:string }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(()=>{ closeRef.current = onClose; }, [onClose]);
  useEffect(()=>{ if(!open) return; const onKey=(e:KeyboardEvent)=>{ if(e.key==='Escape'){ e.stopPropagation(); closeRef.current(); } }; document.addEventListener('keydown', onKey); lock(); ref.current?.focus({preventScroll:true}); return ()=>{ document.removeEventListener('keydown', onKey); unlock(); }; }, [open]);
  if(!open) return null;
  const node = (
    <div className="modal-overlay-enter fixed inset-0 z-[11000] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/70" onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" className={cn('modal-panel-enter w-full rounded-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-3rem)] flex flex-col bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/50 shadow-2xl overflow-hidden outline-none', SIZES[size], className)}>
        {title && <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200/60 dark:border-slate-700/50 shrink-0"><h3 className="text-sm sm:text-base font-bold flex items-center gap-2 min-w-0 text-slate-800 dark:text-slate-100">{icon}<span className="truncate">{title}</span></h3>{!hideClose && <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-4 h-4"/></button>}</div>}
        <div className="px-5 py-3 min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">{children}</div>
        {!hideFooter && <div className="shrink-0 px-5 py-2.5 border-t border-slate-200/60 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-900/30 flex items-center justify-end gap-3 flex-wrap">{footer ?? <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Tutup</button>}</div>}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}
