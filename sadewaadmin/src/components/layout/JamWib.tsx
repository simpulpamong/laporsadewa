import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

export function JamWib({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const date = now.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: '2-digit', month: 'short' });
  return (
    <div className={cn('hidden sm:flex items-center gap-2.5 h-9 bg-white dark:bg-slate-800/70 backdrop-blur-md px-3.5 rounded-full border border-slate-200/80 dark:border-slate-700/60 shadow-sm', className)} title="Waktu Indonesia Barat">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <span className="text-xs font-mono font-semibold tracking-tight text-slate-700 dark:text-slate-100 tabular-nums">{time}</span>
      <span className="text-[10px] font-bold text-slate-400 uppercase">WIB</span>
      <span className="hidden md:inline text-[10px] text-slate-500 border-l border-slate-200 dark:border-slate-700 pl-2.5">{date}</span>
    </div>
  );
}
