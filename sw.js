/* Law Trace 法痕律迹 · app shell cache */
const CACHE = 'lawtrace-v4.2.3';
const SHARE = new URL(self.location.href).search || '';
const INDEX = './index.html' + SHARE;
const SHELL = [
  INDEX,
  './assets/styles.css',
  './assets/data.js',
  './assets/legal-citations.js',
  './assets/app.js',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/icon-180.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then((res) => {
      if (!res.ok) return caches.match(INDEX).then((hit) => hit || res);
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(INDEX, copy));
      return res;
    }).catch(() => caches.match(INDEX)));
    return;
  }
  event.respondWith(caches.match(req).then((hit) => {
    if (hit) return hit;
    return fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    });
  }));
});
