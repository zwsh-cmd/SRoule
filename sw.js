const CACHE_NAME = 'script-roule-v2';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './api.js',
  './data.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
