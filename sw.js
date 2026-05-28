const CACHE_NAME = 'excelkospi-static-20260528-625';
const API_CACHE_NAME = 'excelkospi-api-20260528-625';
const API_ORIGINS = new Set([
  location.origin,
  'https://excelkospi-api.alaala3.workers.dev',
]);
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest?v=20260526-522',
  '/favicon.ico?v=20260526-522',
  '/apple-touch-icon.png?v=20260526-522',
  '/icon-192.png?v=20260526-522',
  '/icon-512.png?v=20260526-522',
  '/assets/app.css?v=20260528-623',
  '/assets/app-config.js?v=20260528-617',
  '/assets/app-utils.js?v=20260526-564',
  '/assets/app-mentions.js?v=20260526-565',
  '/assets/app-community-read.js?v=20260526-570',
  '/assets/community-ui.js?v=20260528-622',
  '/assets/app-personal-feed.js?v=20260525-492',
  '/assets/app-outlook.js?v=20260527-591',
  '/assets/app-outlook-preview.js?v=20260528-621',
  '/assets/app-watchlist-share.js?v=20260528-617',
  '/assets/app-cell-selection.js?v=20260526-575',
  '/assets/app-quote-table.js?v=20260528-619',
  '/assets/app-quote-drag.js?v=20260525-496',
  '/assets/app-quote-controls.js?v=20260528-619',
  '/assets/app-mini-chart.js?v=20260528-621',
  '/assets/app-tradingview.js?v=20260527-609',
  '/assets/app-chat-ui.js?v=20260528-621',
  '/assets/app.js?v=20260528-625',
  '/assets/favicon.svg?v=20260526-522',
  '/assets/favicon-32.png?v=20260526-522',
  '/assets/icon-192.png?v=20260526-522',
  '/assets/icon-512.png?v=20260526-522',
  '/assets/maskable-192.png?v=20260526-522',
  '/assets/maskable-512.png?v=20260526-522',
];

const API_SWR_TTL_MS = {
  '/api/snapshot': 90 * 1000,
  '/api/timeline': 10 * 60 * 1000,
};

function apiTtl(pathname){
  return API_SWR_TTL_MS[pathname] || 0;
}

function cachedAt(response){
  return Number(response?.headers?.get?.('x-sw-cached-at') || 0) || 0;
}

function withCachedAt(response){
  const headers = new Headers(response.headers);
  headers.set('x-sw-cached-at', String(Date.now()));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function staleWhileRevalidate(event, request, ttlMs){
  const cache = await caches.open(API_CACHE_NAME);
  const cached = await cache.match(request);
  const age = cached ? Date.now() - cachedAt(cached) : Infinity;
  const headers = new Headers(request.headers);
  const etag = cached?.headers?.get?.('etag');
  if(etag && !headers.has('if-none-match')) headers.set('if-none-match', etag);
  const revalidateRequest = new Request(request, { headers });
  const network = fetch(revalidateRequest, { cache:'no-cache' })
    .then(async (response) => {
      if(response.status === 304 && cached) return cached;
      if(response && response.ok){
        await cache.put(request, withCachedAt(response.clone()));
      }
      return response;
    });
  if(cached && age >= 0 && age < ttlMs){
    event.waitUntil(network.catch(() => null));
    return cached;
  }
  return network.catch(() => cached || Promise.reject(new Error('api_fetch_failed')));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if(request.method !== 'GET') return;

  const url = new URL(request.url);

  if(API_ORIGINS.has(url.origin)){
    const ttlMs = apiTtl(url.pathname);
    if(ttlMs){
      if(request.cache === 'reload' || request.cache === 'no-store') return;
      event.respondWith(staleWhileRevalidate(event, request, ttlMs));
      return;
    }

    if(url.pathname.startsWith('/api/')) return;
  }

  if(url.origin !== location.origin) return;

  if(url.pathname === '/patch-notes.md'){
    event.respondWith(fetch(request, {cache:'no-store'}).catch(() => caches.match(request)));
    return;
  }

  if(request.mode === 'navigate'){
    const cacheKey = url.pathname === '/' ? '/index.html' : url.pathname;
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy));
          return response;
        })
        .catch(() => caches.match(cacheKey).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cached) => cached || fetch(request).then((response) => {
        if(response && response.ok){
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }))
  );
});
