const CACHE_NAME = 'sinav-analizi-adminlte4-r47';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app-core.js',
  './app-ui.js',
  './app-analysis.js',
  './app-settings.js',
  './manifest.json'
];

function isFirebaseRequest(url) {
  return url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebasedatabase.app') ||
    url.hostname === 'identitytoolkit.googleapis.com' ||
    url.hostname === 'securetoken.googleapis.com' ||
    url.hostname === 'firebaseinstallations.googleapis.com' ||
    url.hostname === 'www.googleapis.com';
}

function isNavigationRequest(request, url) {
  return request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html');
}

function requestUrl(request) {
  return new URL(typeof request === 'string' ? request : request.url, self.location.href);
}

function safeCachePut(cache, request, response) {
  const url = requestUrl(request);
  if (url.origin !== self.location.origin || !response || !response.ok || response.type === 'opaque') {
    return Promise.resolve();
  }
  return cache.put(request, response).catch(err => {
    console.warn('cache put hatası:', err);
  });
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('sinav-analizi-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (isFirebaseRequest(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (isNavigationRequest(event.request, url)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => safeCachePut(cache, './index.html', copy));
          return response;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true })
          .then(response => response || caches.match('./index.html', { ignoreSearch: true })))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then(response => response || fetch(event.request).then(networkResponse => {
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => safeCachePut(cache, event.request, copy));
        return networkResponse;
      }))
  );
});


