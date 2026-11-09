import type { MetadataRoute } from 'next';
import { APP_NAME, APP_TAGLINE } from '@/lib/constants';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: `${APP_NAME} — ${APP_TAGLINE}`,
    short_name: APP_NAME,
    description: APP_TAGLINE,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#080d18',
    theme_color: '#080d18',
    lang: 'id',
    dir: 'ltr',
    categories: ['productivity', 'utilities', 'government'],
    icons: [
      { src: '/assets/sadewa-white.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'Laporan Kebakaran', url: '/kebakaran' },
      { name: 'Laporan ODNK', url: '/odnk' },
    ],
  };
}
