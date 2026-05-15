importScripts('./version.js');

const CACHE_NAME = 'ogretmen-bilgi-' + APP_VERSION;
const ASSETS = [
  './',
  './index.html',
  './version.js',
  './teacher-style.css',
  './teacher-core.js',
  './teacher-seed.js',
  './teacher-schedule-seed.js',
  './teacher-task-seed.js',
  './teacher-firebase-config.js',
  './teacher-ui.js',
  './teacher-teachers.js',
  './teacher-classes.js',
  './teacher-schedule.js',
  './teacher-duty.js',
  './teacher-settings.js',
  './manifest.json',
  './icon.png'
];

function isAppAsset(url) {
  const name = url.pathname.split('/').pop();
  return [
    'index.html',
    'version.js',
    'teacher-style.css',
    'teacher-core.js',
    'teacher-seed.js',
    'teacher-schedule-seed.js',
    'teacher-task-seed.js',
    'teacher-firebase-config.js',
    'teacher-ui.js',
    'teacher-teachers.js',
    'teacher-classes.js',
    'teacher-schedule.js',
    'teacher-duty.js',
    'teacher-settings.js',
    'manifest.json',
    'icon.png',
    'sw.js'
  ].includes(name);
}

function safeCachePut(cache, request, response) {
  const url = new URL(typeof request === 'string' ? request : request.url, self.location.href);
  if (url.origin !== self.location.origin || !response || !response.ok || response.type === 'opaque') return Promise.resolve();
  return cache.put(request, response).catch(() => {});
}

function precache(cache) {
  return cache.addAll(ASSETS.map(asset => new Request(asset, { cache: 'reload' })));
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(precache).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('ogretmen-bilgi-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => safeCachePut(cache, './index.html', copy));
        return response;
      }).catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  if (isAppAsset(url)) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => safeCachePut(cache, event.request, copy));
        return response;
      }).catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(response => response || fetch(event.request)));
});
