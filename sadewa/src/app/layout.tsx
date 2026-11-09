import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, Great_Vibes, Inter } from 'next/font/google';
import '@/styles/globals.css';
import { APP_NAME, APP_TAGLINE } from '@/lib/constants';
import ThemeFrameSync from '@/components/ThemeFrameSync';
import PwaInstall from '@/components/pwa/PwaInstall';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  weight: '400',
});

const greatVibes = Great_Vibes({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-script',
  weight: '400',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Keep pinch-to-zoom available for users who need larger text.
  viewportFit: 'cover',
  themeColor: '#080d18',
};

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_TAGLINE,
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/assets/sadewa-white.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/assets/sadewa-white.svg', type: 'image/svg+xml' }],
    shortcut: '/assets/sadewa-white.svg',
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: 'black-translucent',
  },
  other: { 'mobile-web-app-capable': 'yes' },
};

/**
 * Skrip kecil yang dipakai sebelum hydration agar tema tidak berkedip.
 *
 * Urutan prioritas:
 *  1. `?theme=` — dikirim halaman induk (dashboard SADEWA) ketika aplikasi ini
 *     ditampilkan di dalam iframe, supaya tema sudah benar sejak byte pertama.
 *  2. Pilihan pengguna yang tersimpan di localStorage.
 *  3. Preferensi sistem (`prefers-color-scheme`).
 *  4. Bawaan aplikasi: gelap.
 *
 * `light-mode` hanya dipasang pada <html>; <body> belum ada saat skrip ini
 * jalan, sehingga menempel class di body akan membuat tema terlihat berkedip.
 */
const themeBootstrap = `(function(){try{
  var q=new URLSearchParams(location.search).get('theme');
  var r=localStorage.getItem('sadewa:v5:settings');
  var s=r?JSON.parse(r).theme:null;
  var sys=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
  var t=(q==='dark'||q==='light')?q:((s==='light'||s==='dark')?s:sys);
  var light=t==='light';
  var d=document.documentElement;
  d.classList.toggle('light-mode',light);
  d.style.colorScheme=light?'light':'dark';
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if ('serviceWorker' in navigator) {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js').catch(function(err) {
                      console.warn('[sw] pendaftaran service worker gagal', err);
                    });
                  });
                }
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} ${bebasNeue.variable} ${greatVibes.variable}`}>
        <ThemeFrameSync />
        {children}
        <PwaInstall />
      </body>
    </html>
  );
}
