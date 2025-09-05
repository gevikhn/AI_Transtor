const CACHE_NAME = 'ai-transtor-cache-v1';
const CORE_ASSETS = [
  './index.html',
  './css/base.css',
  './js/ui-translate.js',
  './js/ui-settings-modal.js',
  './js/pwa.js',
  './manifest.webmanifest',
  './favicon.ico'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    try {
      const res = await fetch('./js/chunk-manifest.json');
      const files = await res.json();
      await cache.addAll(files);
      cache.put('./js/chunk-manifest.json', res);
    } catch (e) {
      // chunk manifest not found – likely dev mode
    }
  })());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    caches.match(event.request).then(resp => {
      if (resp) return resp;
      return fetch(event.request).then(r => {
        const copy = r.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return r;
      });
    }).catch(() => {
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});
