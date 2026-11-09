import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, LogOut, Settings, ShieldCheck, User, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import type { SessionUser } from '@/types';

function initials(name: string) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('') || '?';
}

export function AccountDropdown({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const nav = useNavigate();
  const isSA = user.role === 'superadmin';
  const name = (user as any).displayName || user.username || 'Pengguna';

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = 272; const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
      setPos({ top: r.bottom + 8, left });
    };
    place();
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        className={cn('flex items-center justify-center rounded-full border bg-white dark:bg-slate-800/60 shadow-sm transition-all h-9 w-9 p-0 sm:h-9 sm:w-auto sm:pl-0 sm:pr-2.5 sm:gap-2 sm:max-w-[180px] sm:justify-start',
          open ? 'border-blue-400 ring-2 ring-blue-500/20' : 'border-slate-200/80 dark:border-slate-700/70 hover:border-slate-300 dark:hover:border-slate-600')}>
        <span className={cn('h-9 w-9 sm:h-[34px] sm:w-[34px] rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold text-white sm:ring-1 sm:ring-inset',
          isSA ? 'bg-gradient-to-br from-violet-500 to-indigo-600 sm:ring-violet-400/30' : 'bg-gradient-to-br from-blue-500 to-blue-700 sm:ring-blue-400/30')}>
          {initials(name)}
        </span>
        <span className="hidden sm:block min-w-0 text-left">
          <span className="block text-[12px] font-semibold text-slate-700 dark:text-slate-100 truncate leading-tight max-w-[110px]">{name.split(/\s+/)[0]}</span>
          <span className="block text-[10px] text-slate-400 leading-tight truncate">{isSA ? 'Superadmin' : 'Admin'}</span>
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform hidden sm:block', open && 'rotate-180')} />
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div ref={panelRef} role="menu" style={{ top: pos.top, left: pos.left, width: 272 }}
          className="fixed z-[10050] rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-[#0F172A] shadow-xl shadow-slate-900/10 dark:shadow-black/30 overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50/70 dark:bg-slate-900/30">
            <span className={cn('h-11 w-11 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white', isSA ? 'bg-gradient-to-br from-violet-500 to-indigo-600' : 'bg-gradient-to-br from-blue-500 to-blue-700')}>{initials(name)}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{name}</div>
              <div className="text-[11px] text-slate-500 truncate">@{user.username}</div>
              <span className={cn('inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider', isSA ? 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300' : 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300')}>
                {isSA ? <ShieldCheck className="w-2.5 h-2.5" /> : <Users className="w-2.5 h-2.5" />}{isSA ? 'Superadmin · Akses Penuh' : 'Admin · Scope Kategori'}
              </span>
            </div>
          </div>
          <div className="p-1.5">
            <button onClick={() => { setOpen(false); nav('/pengaturan'); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors">
              <Settings className="w-4 h-4 text-slate-400" /> Pengaturan Akun
            </button>
            <button onClick={() => { setOpen(false); nav('/rekap'); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors">
              <User className="w-4 h-4 text-slate-400" /> Rekap Laporan
            </button>
          </div>
          <div className="p-1.5 border-t border-slate-100 dark:border-slate-800">
            <button onClick={() => { setOpen(false); onLogout(); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors">
              <LogOut className="w-4 h-4" /> Keluar
            </button>
          </div>
        </div>, document.body
      )}
    </>
  );
}
