import React, { Suspense, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '@/context/AuthContext';
import { useDialog } from '@/components/ui';
import { Sidebar, getNavItems } from './layout/Sidebar';
import { Topbar } from './layout/Topbar';

function useDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark') || localStorage.getItem('sa_theme') !== 'light');
  React.useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('sa_theme', dark ? 'dark' : 'light'); }, [dark]);
  return { dark, toggle: () => setDark(d => !d) };
}

export default function Layout() {
  const { user, logout, isSuper } = useAuth();
  const dialog = useDialog();
  const nav = useNavigate(); const loc = useLocation();
  const [expanded, setExpanded] = useState(true);
  const [mobile, setMobile] = useState(false);
  const { dark, toggle } = useDark();
  const links = getNavItems(isSuper);
  const path = loc.pathname === '/' ? '/beranda' : loc.pathname;
  const navHit = links.find(l => path === l.to || (l.to !== '/beranda' && path.startsWith(l.to + '/')));
  const extraTitle: Record<string, string> = { '/pemetaan': 'Pemetaan', '/rekap/cetak': 'Cetak Rekap', '/rekap/cetak-ba': 'Berita Acara' };
  const title = navHit?.label || extraTitle[path] || extraTitle[Object.keys(extraTitle).find(k => path.startsWith(k)) || ''] || 'SADEWA Admin';
  const doLogout = async () => {
    const ok = await dialog.confirm({ title: 'Keluar', message: 'Keluar dari SADEWA Admin?', confirmLabel: 'Keluar', cancelLabel: 'Batal', tone: 'warning' });
    if (!ok) return;
    await logout(); nav('/login');
  };

  return (
    <div className="bg-slate-50 dark:bg-[#0B1120] text-slate-800 dark:text-slate-200 h-[100dvh] w-full flex overflow-hidden">
      <Sidebar user={user} expanded={expanded} mobile={mobile} onCloseMobile={()=>setMobile(false)} onToggleExpand={()=>setExpanded(e=>!e)} onLogout={doLogout} />
      <AnimatePresence>{mobile && <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-900/55 backdrop-blur-[2px] z-[490] lg:hidden" onClick={()=>setMobile(false)} />}</AnimatePresence>
      <div className="flex-1 flex flex-col min-w-0 h-[100dvh] overflow-hidden">
        <Topbar title={title} dark={dark} onToggleTheme={toggle} onOpenMobile={()=>setMobile(true)} user={user} onLogout={doLogout} />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar p-3 sm:p-6 lg:p-8"><div className="mx-auto max-w-[1500px] w-full min-w-0"><Suspense fallback={<div className="flex items-center justify-center py-24 text-slate-400 text-sm">Memuat…</div>}><Outlet /></Suspense></div></main>
      </div>
    </div>
  );
}
