const CACHE_PREFIX = 'mirepo-';
const CACHE_NAME = 'mirepo-shell-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        const response = await fetch('/index.html');
        if (!response.ok) throw new Error('No se pudo descargar index.html');
        const html = await response.clone().text();
        await cache.put('/index.html', response.clone());
        await cache.put('/', response.clone());

        // Precargar los bundles JS/CSS que Vite referencia desde index.html.
        const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
          .map((match) => match[1])
          .filter((path) => path.startsWith('/') && /\.(js|css|woff2?|svg)$/i.test(path));
        await Promise.allSettled(assetPaths.map((path) => cache.add(path)));
      })
      .catch((error) => console.warn('[Mirepo SW] No se pudo precargar la app:', error))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API, audio y carátulas no se guardan indiscriminadamente en Cache Storage.
  // La música descargada se conserva en IndexedDB y se puede reproducir offline.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/audio/') ||
    url.pathname.startsWith('/cover/') ||
    url.pathname.startsWith('/artist-cover/') ||
    url.pathname.startsWith('/songs/') ||
    url.pathname.startsWith('/podcast-audio/')
  ) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match('/index.html');
        return cached || new Response('La aplicación no está disponible offline todavía.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
    );
    return;
  }

  const isAppAsset =
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.destination === 'worker' ||
    url.pathname.startsWith('/assets/');

  if (!isAppAsset) return;

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      } catch {
        return new Response('', { status: 503, statusText: 'Offline' });
      }
    })
  );
});
