import React from 'react';
import { Menu, Moon, Sun, Shield } from 'lucide-react';
import { JamWib } from './JamWib';
import { AccountDropdown } from './AccountDropdown';
import type { SessionUser } from '@/types';

export function Topbar({ title, dark, onToggleTheme, onOpenMobile, user, onLogout }: {
  title: string;
  dark: boolean;
  onToggleTheme: () => void;
  onOpenMobile: () => void;
  user: SessionUser | null;
  onLogout: () => void;
}) {
  return (
    <header className="relative h-[60px] sm:h-[64px] bg-white/90 dark:bg-[#0B1120]/85 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/70 flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-6 lg:px-8 shrink-0 z-30">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <button onClick={onOpenMobile} className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 text-slate-600 dark:text-slate-300" aria-label="Buka menu"><Menu className="w-5 h-5"/></button>
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-bold tracking-tight text-slate-800 dark:text-slate-100 truncate leading-tight">{title}</h2>
          <p className="hidden md:block text-[11px] text-slate-500 truncate">SADEWA — Satpol PP Kabupaten Ponorogo</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <JamWib />

        <button onClick={onToggleTheme} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-800/50 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors shadow-sm" aria-label="Tema">
          {dark ? <Sun className="w-4 h-4"/> : <Moon className="w-4 h-4"/>}
        </button>

        {user && <AccountDropdown user={user} onLogout={onLogout} />}
        {!user && <span className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center"><Shield className="w-4 h-4 text-slate-400"/></span>}
      </div>
    </header>
  );
}
