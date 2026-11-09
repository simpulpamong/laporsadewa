'use client';

import { useEffect } from 'react';
import { setFrameThemeOverride, type ThemeMode } from '@/lib/theme';

/**
 * Jembatan tema & sinyal "sudah hidup" untuk halaman yang ditampilkan di
 * dalam iframe.
 *
 * Dua fungsi:
 *  1. Mengikuti tema halaman induk. Dashboard SADEWA mengirim
 *     `postMessage({ type: 'SADEWA_THEME_CHANGE', theme })` (dan `?theme=`
 *     untuk frame pertama). Tema disimpan sebagai *override* di modul theme —
 *     bukan ke localStorage — sehingga saat aplikasi dibuka langsung, pilihan
 *     tema milik pengguna tetap berlaku; tetapi selama berada di dalam iframe,
 *     seluruh komponen membaca tema yang sama seperti induknya.
 *  2. Mengirim `SADEWA_VIEWER_READY` + `sadewa:frame-ready` supaya induk
 *     tahu frame ini benar-benar dieksekusi (bukan frame yang diblokir
 *     browser karena X-Frame-Options).
 */
export default function ThemeFrameSync(): null {
  useEffect(() => {
    const framed = window.parent !== window;

    const apply = (theme: ThemeMode) => {
      // Satu sumber kebenaran: set override modul (dipakai getStoredTheme()
      // semua komponen) + terapkan langsung ke DOM.
      setFrameThemeOverride(theme);

      // Beri tahu komponen lain (mis. useTheme) agar state React ikut sinkron.
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
    };

    const fromQuery = (() => {
      try {
        const t = new URLSearchParams(window.location.search).get('theme');
        return t === 'dark' || t === 'light' ? t : null;
      } catch {
        return null;
      }
    })();
    if (fromQuery) apply(fromQuery);

    const onMessage = (ev: MessageEvent) => {
      const data = ev?.data;
      if (!data || typeof data !== 'object') return;
      if ((data as { type?: string }).type !== 'SADEWA_THEME_CHANGE') return;
      const theme = (data as { theme?: unknown }).theme;
      if (theme === 'dark' || theme === 'light') apply(theme);
    };
    window.addEventListener('message', onMessage);

    const announce = () => {
      try {
        window.parent.postMessage({ type: 'SADEWA_VIEWER_READY' }, '*');
        window.parent.postMessage({ type: 'sadewa:frame-ready' }, '*');
      } catch {
        /* induk sudah ditutup — abaikan */
      }
    };

    const timers: Array<ReturnType<typeof setTimeout>> = framed
      ? [400, 1200, 2500, 4000].map((ms) => setTimeout(announce, ms))
      : [];
    if (framed) announce();

    return () => {
      window.removeEventListener('message', onMessage);
      timers.forEach(clearTimeout);
    };
  }, []);

  return null;
}