import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface Option { value: string; label: string; icon?: React.ReactNode }
export interface OptionGroup { label: string; options: Option[] }

export function Dropdown({ value, onChange, options, groups, placeholder='Pilih…', className, disabled }:
  { value:string; onChange:(v:string)=>void; options?:Option[]; groups?:OptionGroup[]; placeholder?:string; className?:string; disabled?:boolean }) {
  const flat = options ?? (groups || []).flatMap(g => g.options);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{top:number;left:number;width:number;up:boolean}|null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    const el = btnRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < 220 && r.top > spaceBelow;
    setPos({ top: up ? r.top : r.bottom, left: r.left, width: r.width, up });
  }, []);

  useLayoutEffect(() => { if (open) updatePos(); }, [open, updatePos]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onMove = () => updatePos();
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); };
  }, [open, updatePos]);

  const sel = flat.find(o => o.value === value);
  const renderOpt = (o: Option) => (
    <button key={o.value} type="button" onClick={()=>{ onChange(o.value); setOpen(false); }} className={cn('w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700/70 transition-colors', o.value===value && 'text-blue-500 dark:text-blue-400 bg-blue-500/5')}>
      <span className="inline-flex items-center gap-2 min-w-0 truncate">{o.icon}<span className="truncate">{o.label}</span></span>{o.value===value && <Check className="w-4 h-4 shrink-0" />}
    </button>
  );

  const menu = open && pos && typeof document !== 'undefined' ? createPortal(
    <div ref={menuRef} role="listbox" className="fixed z-[11500] max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl shadow-slate-900/10 dark:shadow-black/30 py-1 custom-scrollbar"
      style={{ left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top + 4 } : { top: pos.top + 4 }) }}>
      {groups ? groups.map(g => (
        <div key={g.label}>
          <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{g.label}</div>
          {g.options.map(renderOpt)}
        </div>
      )) : (options || []).map(renderOpt)}
      {!flat.length && <div className="px-3 py-2 text-sm text-slate-500">Tidak ada opsi.</div>}
    </div>, document.body
  ) : null;

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button ref={btnRef} type="button" disabled={disabled} onClick={()=>!disabled && setOpen(o=>!o)} aria-haspopup="listbox" aria-expanded={open}
        className={cn('w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] px-3 py-2.5 text-sm text-left transition disabled:opacity-50', open && 'border-blue-500 ring-1 ring-blue-500/30')}>
        <span className={cn('inline-flex items-center gap-2 min-w-0 truncate', !sel && 'text-slate-400')}>{sel?.icon}<span className="truncate">{sel?.label || placeholder}</span></span>
        <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform shrink-0', open && 'rotate-180')} />
      </button>
      {menu}
    </div>
  );
}
