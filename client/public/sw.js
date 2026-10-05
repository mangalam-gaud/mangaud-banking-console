/* eslint-disable no-restricted-globals */
/**
 * MANGAUD service worker.
 *
 * Strategy
 *   - App shell + static assets: cache-first, refreshed in the background.
 *   - Navigations: network-first with a cached index.html fallback, so a cold
 *     or flaky connection still opens the app (SPA deep links work offline).
 *   - API calls: network-only. Caching balance/transaction responses would
 *     show stale money figures, which is unacceptable in a banking app.
 *   - Auth responses are never cached.
 */

const VERSION = 'v3';
const SHELL_CACHE = `mangaud-shell-${VERSION}`;
const ASSET_CACHE = `mangaud-assets-${VERSION}`;
const OFFLINE_URL = '/offline.html';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/logo.svg',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll is atomic: one 404 rejects the whole install, so add
      // individually and tolerate misses.
      .then((cache) => Promise.all(SHELL_ASSETS.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

const isStaticAsset = (url) =>
  url.pathname.startsWith('/static/') ||
  url.pathname.startsWith('/icons/') ||
  /\.(?:css|js|woff2?|ttf|otf|png|jpe?g|svg|webp|ico|json)$/i.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache the API or cross-origin traffic.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // SPA navigations -> network first, fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy)).catch(() => {});
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('/index.html');
          return cached || (await caches.match(OFFLINE_URL)) || Response.error();
        })
    );
    return;
  }

  if (!isStaticAsset(url)) return;

  // Hashed build assets are immutable: cache-first.
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            return response;
          })
      )
    );
    return;
  }

  // Everything else: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
