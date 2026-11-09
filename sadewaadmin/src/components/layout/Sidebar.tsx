import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, LogOut, LayoutDashboard, FolderTree, FileText, HardDrive, MapPinned, Trash2, FolderOpen, TableProperties, Settings, FilePlus2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { SessionUser } from '@/types';

export interface NavItem { to: string; label: string; icon: React.ComponentType<{className?:string}>; show: boolean }

export function getNavItems(isSuper: boolean): NavItem[] {
  return [
    { to: '/beranda', label: 'Beranda', icon: LayoutDashboard, show: true },
    { to: '/input', label: 'Input Laporan', icon: FilePlus2, show: true },
    { to: '/rekap', label: 'Rekap Laporan', icon: TableProperties, show: true },
    { to: '/peta', label: 'Peta', icon: MapPinned, show: true },
    { to: '/kategori', label: 'Kategori & Sub', icon: FolderTree, show: true },
    { to: '/format', label: 'Format & Parser', icon: FileText, show: isSuper },
    { to: '/storage', label: 'Sheet & Drive', icon: HardDrive, show: isSuper },
    { to: '/drive', label: 'Drive', icon: FolderOpen, show: true },
    { to: '/sampah', label: 'Sampah', icon: Trash2, show: true },
    { to: '/pengaturan', label: 'Pengaturan', icon: Settings, show: true },
  ].filter(l => l.show);
}

export function Sidebar({ user, expanded, mobile, onCloseMobile, onToggleExpand, onLogout }: { user: SessionUser|null; expanded:boolean; mobile:boolean; onCloseMobile:()=>void; onToggleExpand:()=>void; onLogout:()=>void }) {
  const isWide = expanded || mobile;
  const links = getNavItems(user?.role === 'superadmin');
  const { pathname } = useLocation();
  return (
    <aside className={cn('bg-[#0F172A] dark:bg-[#070B14] border-r border-slate-800/50 flex flex-col h-full fixed inset-y-0 left-0 lg:relative z-40 transition-transform duration-300 ease-out lg:transition-all', expanded ? 'w-64' : 'w-[84px]', mobile ? 'translate-x-0 w-64 z-[500] shadow-2xl shadow-black/30' : '-translate-x-full lg:translate-x-0')}>
      <div className="h-[60px] sm:h-[64px] flex items-center px-5 border-b border-slate-800/60 justify-between shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0 overflow-hidden"><img src="/assets/sadewa-favicon.svg" alt="SADEWA" draggable={false} className="w-7 h-7 object-contain select-none" /></div>
          <span className={cn('font-bold text-white tracking-tight transition-all duration-300 whitespace-nowrap', isWide ? 'opacity-100 max-w-[140px]' : 'opacity-0 max-w-0')}>SADEWA</span>
        </div>
        <button onClick={onCloseMobile} className="lg:hidden text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800"><X className="w-5 h-5"/></button>
      </div>
      <button onClick={onToggleExpand} className="hidden lg:flex absolute top-[84px] -right-3.5 w-7 h-7 bg-[#1E293B] border border-slate-700/80 rounded-full items-center justify-center text-slate-400 hover:text-white shadow-lg z-50">{expanded?<ChevronLeft className="w-4 h-4"/>:<ChevronRight className="w-4 h-4"/>}</button>
      <nav className="flex-1 overflow-y-auto py-5 px-3.5 space-y-1.5 custom-scrollbar">
        {links.map(l => { const Icon = l.icon; const active = (l.to==='/peta' && pathname==='/pemetaan'); return (
          <NavLink key={l.to} to={l.to} end={l.to==='/beranda'} onClick={onCloseMobile} className={({isActive})=>cn('w-full h-11 relative flex items-center rounded-xl px-3.5 font-medium transition-all group', (isActive||active)?'bg-blue-600/10 text-blue-400':'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200')} title={!isWide?l.label:undefined}>
            {({isActive}) => { const on = isActive||active; return (<><Icon className={cn('w-5 h-5 shrink-0', on?'text-blue-400':'text-slate-500 group-hover:text-slate-300')}/><span className={cn('truncate text-sm transition-all duration-300', isWide?'ml-3.5 opacity-100 max-w-[160px]':'ml-0 opacity-0 max-w-0')}>{l.label}</span></>); }}
          </NavLink>
        );})}
      </nav>
      <div className="mt-auto p-3.5 border-t border-slate-800/60 shrink-0">
        <button onClick={onLogout} className="w-full h-11 flex items-center rounded-xl px-3.5 text-rose-400 hover:bg-rose-500/10 font-medium"><LogOut className="w-5 h-5 shrink-0"/><span className={cn('text-sm transition-all duration-300', isWide?'ml-3.5 opacity-100':'ml-0 opacity-0 max-w-0 overflow-hidden')}>Keluar</span></button>
      </div>
    </aside>
  );
}
