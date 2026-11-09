import dns from 'node:dns';
import type { NextConfig } from 'next';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,

  typescript: {
    // `npm run typecheck` menjadi gerbang wajib sebelum deploy.
    ignoreBuildErrors: true,
  },

  experimental: {
    optimizePackageImports: ['lucide-react'],
  },

  images: {
    // next/image hanya boleh membuat varian untuk lebar yang terdaftar di sini.
    // Default Next tidak punya 144/192, padahal logo landing dirender 72px —
    // tanpa daftar ini, browser dipaksa ambil 256px (21KB) untuk logo 72px.
    imageSizes: [16, 32, 48, 64, 96, 128, 144, 192, 256, 384],
  },

  async headers() {
    return [
      {
        // Halaman ini sengaja BOLEH ditampilkan di dalam iframe: dipakai
        // menu "Input Laporan" pada dashboard SADEWA dan halaman pembungkus
        // index.html. `SAMEORIGIN` membuat Chrome menampilkan
        // "… refused to connect" sehingga aplikasinya tidak pernah termuat.
        //
        // PENTING: `X-Frame-Options` TIDAK boleh dipasang di sini. Nilai
        // `ALLOWALL` bukan nilai valid — hanya SAMEORIGIN / DENY / ALLOW-FROM
        // yang dipahami browser — dan Chrome menolaknya, sehingga iframe tetap
        // diblokir. Izin mengembed diberikan lewat CSP `frame-ancestors *`,
        // yang berlaku di semua browser modern.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // frame-ancestors * sengaja: Sadewa di-embed oleh dashboard/pembungkus. Jangan tambah X-Frame-Options.
          { key: 'Content-Security-Policy', value: "frame-ancestors *; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=(), usb=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
        ],
      },
      {
        // Semua aset di /public/ memakai nama berkas tetap (tanpa hash):
        // icon-512.png, batik-ornament.svg, ilusrasi kategori, dll. Kalau
        // diberi `immutable`, aset yang diganti tidak akan pernah ter-refresh
        // selama setahun — penyebab halaman kusam setelah pembaruan aplikasi.
        // `must-revalidate` membuat browser selalu menanyakan ke server;
        // respons 304 hanya berbiaya beberapa byte.
        source: '/assets/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
    ];
  },

  async redirects() {
    return [
      // Rute lama masih dipakai oleh tautan yang tersebar di WhatsApp.
      { source: '/proxy', destination: '/laporan', permanent: true },
      { source: '/kategori/:slug', destination: '/:slug', permanent: true },
      // Redirect /laporan?sub=... ke /lapor?sub=... agar tetap ditangani
      { source: '/laporan', destination: '/', permanent: false },
    ];
  },
};

export default nextConfig;
