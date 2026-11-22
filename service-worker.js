const CACHE_NAME = 'game-of-gifts-v10-nav-cache-guard';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=tutorial-ring-fix1',
  './game.js?v=approved-medallions-1',
  './manifest.json',
  './tutorial.js?v=approved-medallions-1',
  './assets/ui/splash-poster-v2.webp',
  './assets/ui/menu-game-v2.webp?v=approved-medallions-1',
  './assets/ui/menu-tutorial-v2.webp?v=approved-medallions-1',
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
    const scopePath = new URL(self.registration.scope).pathname;
    const isEntry = url.pathname === scopePath || url.pathname === scopePath + 'index.html';
    const isHtml = response => response.ok && response.headers.get('content-type')?.toLowerCase().includes('text/html');
    // A 200 HTML response may still be a captive portal or a branded error page.
    // Validate the small application entry against its actual, stable markup.
    const isAppShell = async response => {
      if (!isHtml(response)) return false;
      try {
        const html = await response.clone().text();
        return html.includes('id="app"') && html.includes('tutorial.js') && html.includes('game.js');
      } catch { return false; }
    };
    const cachedEntry = async () => {
      const cached = await caches.match('./index.html', { cacheName: CACHE_NAME });
      return cached && await isAppShell(cached) ? cached : null;
    };
    event.respondWith(fetch(request).then(async response => {
      // Only the validated application entry point may replace the offline shell.
      if (isEntry && await isAppShell(response)) {
        // Clone before handing the original response to the browser.
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME)
          .then(cache => cache.put('./index.html', copy))
          .catch(() => {}));
      }
      if (response.ok || !isEntry) return response;
      return cachedEntry().then(cached => cached || response);
    }).catch(async () => {
      if (isEntry) {
        const cached = await cachedEntry().catch(() => null);
        if (cached) return cached;
      }
      // A rejected fetch without an offline shell is an ordinary network failure.
      return Response.error();
    }));
    return;
  }

  // UI medallions are network-first so a stale PWA cache cannot hide both main actions.
  if (url.pathname.includes('/assets/ui/menu-')) {
    event.respondWith(fetch(request,{cache:'reload'}).then(response => {if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));return response;}return caches.match(request).then(cached=>cached||response);}).catch(()=>caches.match(request)));
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

