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
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
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
    caches.match(event.request).then(resp => resp || fetch(event.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return r;
    }).catch(() => caches.match('./index.html')))
  );
});
