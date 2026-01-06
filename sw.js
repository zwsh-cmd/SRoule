// sw.js - 強制介面更新版 (v3)
const CACHE_NAME = 'script-roule-v4'; // 改成 v4 (強制更新)
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './api.js',
  './data.js'
];

// 1. 強制安裝：這行指令會逼瀏覽器立刻丟掉舊的介面
self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// 2. 強制接管：讓新介面立刻生效
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName); // 刪掉那個輸入框位置錯誤的舊版本
            }
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
