// Service worker with bumped cache key (v3) to avoid stale assets.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open('ssr-v3').then(cache => cache.addAll([
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png'
  ])));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then(resp => resp || fetch(e.request)));
});
