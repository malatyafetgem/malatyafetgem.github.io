const CACHE = 'sinav-v3';
const FILES = [
  './index.html',
  './style.css',
  './app-core.js',
  './app-ui.js',
  './app-analysis.js',
  './app-settings.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Eski cache'leri sil ki kullanıcılar bayatlamış tek-dosya sürümünü görmesin
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
