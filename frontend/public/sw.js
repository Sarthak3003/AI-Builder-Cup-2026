// Caches the app shell only. Never cache profiles, API responses or confirmations.
const CACHE = 'saathi-shell-v4';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const page = await fetch('/', { cache: 'reload' });
    const html = await page.clone().text();
    // Precache the files the page names (hashed script and stylesheet) so a first offline reload works.
    const assets = [...html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)].map((match) => match[1]);
    await cache.put('/', page);
    await Promise.all([...new Set(assets)].map((path) => cache.add(path).catch(() => undefined)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('saathi-shell-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
      }
      return response;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') return (await caches.match('/')) ?? Response.error();
      return Response.error();
    }
  })());
});
