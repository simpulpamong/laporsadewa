/* SADEWA Service Worker
 *
 * Prinsip: JANGAN pernah menyentuh bundel Next.js.
 *
 * 1. Navigasi (HTML)  : network-first — halaman selalu segar, cache jadi
 *                       fallback saat offline.
 * 2. /_next/**         : sama sekali tidak di-intercept. Di development nama
 *                       berkas chunk tidak berubah walau isinya di-rebuild,
 *                       sehingga cache SW menyajikan bundle lama dan hydration
 *                       gagal (halaman blank). Di production Next.js sudah
 *                       mengirim header immutable untuk aset ber-hash, jadi
 *                       cache browser yang sudah cukup.
 * 3. /assets/**        : cache-first + refresh di latar (nama berkas stabil,
 *                       aset ringan).
 * 4. /api/**           : tidak pernah di-cache.
 */
/* WAJIB sinkron dengan APP_VERSION di src/lib/constants.ts.
   Mengubah nama ini membuat browser membuang cache lama saat SW diaktifkan. */
const CACHE_NAME = 'sadewa-v1.0.0';
const OFFLINE_URL = '/';
const PRECACHE = [
  '/assets/sadewa-white.svg',
  '/assets/satpol.webp',
  '/assets/damkar.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
      )
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = (await caches.match(request)) || (await caches.match(OFFLINE_URL));
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Aset stabil hanya berubah saat CACHE_NAME dinaikkan. Jangan lakukan
    // request jaringan tambahan pada setiap ikon/ornamen yang sudah tersimpan.
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // JANGAN pernah cache bundel / HMR Next.js — penyebab halaman blank.
  if (url.pathname.startsWith('/_next/')) return;

  // Data laporan tidak boleh basi.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Hanya aset statis yang aman di-cache.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
  }
});
