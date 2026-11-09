/* SADEWA Admin Service Worker (SPA)
 * Navigasi: network-first (SPA segar), fallback cache.
 * /api/**: tidak di-cache. Aset statis: stale-while-revalidate ringan.
 */
const CACHE = 'sadewa-admin-v1.0.0';
const PRECACHE = ['/assets/sadewa-favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => null)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'sadewa-admin:skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigasi SPA: network-first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => null);
        return res;
      }).catch(() => caches.match(req).then((m) => m || caches.match('/'))),
    );
    return;
  }

  // Aset: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    }),
  );
});
