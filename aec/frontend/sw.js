const CACHE_NAME = 'aec-offline-v8';
const PRECACHE_URLS = [
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/config.js',
  './js/lib/dom.js',
  './js/lib/i18n.js',
  './js/lib/icons.js',
  './js/lib/ui.js',
  './js/lib/api.js',
  './js/lib/offline.js',
  './js/lib/localAssistant.js',
  './js/data/missingPersons.js',
  './js/components/header.js',
  './js/components/footer.js',
  './js/components/toast.js',
  './js/components/assistant.js',
  './js/components/map.js',
  './js/components/payment.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './js/pages/home.js',
  './js/pages/emergency.js',
  './js/pages/map-page.js',
  './js/pages/report.js',
  './js/pages/missing.js',
  './js/pages/news.js',
  './js/pages/help.js',
  './js/pages/admin.js',
  './assets/favicon.svg',
  './assets/img/aurastay-response.jpg',
  './assets/img/bg-emergency.jpg',
  './assets/img/bg-infrastructure.jpg',
  './assets/img/bg-community.jpg',
  './assets/img/bg-help.jpg',
  './assets/img/hero-team.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: { message: 'Offline mode: request sent by SMS or use the emergency number.' } }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
          },
        ),
      ),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy).catch(() => {}));
          return response;
        })
        .catch(() => caches.match('./index.html').then((cached) => cached || new Response('Offline', { status: 503 }))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy).catch(() => {}));
          }
          return response;
        })
        .catch(() => cached || new Response('Offline', { status: 503 }));
    }),
  );
});
