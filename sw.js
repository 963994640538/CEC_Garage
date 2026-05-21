// sw.js — Service Worker for CEC Garage PWA
const CACHE_NAME = 'cec-garage-v2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/cloud.js',
  './js/state.js',
  './js/app.js',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&family=Tajawal:wght@300;400;500;700;800;900&display=swap',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// Install — cache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.map(n => n !== CACHE_NAME ? caches.delete(n) : null))
    )
  );
  self.clients.claim();
});

// Fetch — cache-first for static, network-first for Google Sheets API
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Always go to network for Google Sheets API (sync calls)
  if (url.includes('script.google.com')) {
    event.respondWith(fetch(event.request).catch(() => new Response('{"success":false,"offline":true}', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // Cache-first strategy for everything else
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      // Cache successful GET responses
      if (event.request.method === 'GET' && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }))
  );
});
