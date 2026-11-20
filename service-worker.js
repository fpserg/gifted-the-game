const CACHE_NAME = 'game-of-gifts-v2';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=pwa-safearea1',
  './game.js?v=pwa-safearea1',
  './manifest.json',
  './assets/ui/splash-poster-v2.webp',
  './assets/ui/play-medallion.webp',
  './assets/ui/card-back.webp',
  './assets/ui/table.webp',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32.png',
  ...Array.from({ length: 12 }, (_, i) => `./assets/cards/e${i + 1}.webp`),
  ...Array.from({ length: 12 }, (_, i) => `./assets/cards/a${i + 1}.webp`),
  ...Array.from({ length: 12 }, (_, i) => `./assets/cards/k${i + 1}.webp`),
  ...['arena','fog','forge','library','observatory','tower','treasury','waste','well'].map(name => `./assets/locations/loc_${name}.webp`)
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});
