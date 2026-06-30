// ==========================================
// MediFinder Production Service Worker v2.0
// Network-first with cache fallback strategy
// ==========================================

const CACHE_VERSION = 'medi-finder-v2';
const STATIC_CACHE = 'medi-static-v2';
const DYNAMIC_CACHE = 'medi-dynamic-v2';
const IMAGE_CACHE = 'medi-images-v2';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/userhome.html',
  '/userorder.html',
  '/usercart.html',
  '/usermap.html',
  '/userprofile.html',
  '/marchenthome.html',
  '/delyvaryhome.html',
  '/style.css',
  '/userhome.css',
  '/userorder.css',
  '/usercart.css',
  '/usermap.css',
  '/userprofile.css',
  '/marchenthome.css',
  '/delyvaryhome.css',
  '/delyvaryorder.css',
  '/delyvaryearning.css',
  '/delyvaryprofile.css',
  '/supabase-config.js',
  '/userscript.js',
  '/marchentscript.js',
  '/delyvaryscript.js',
  '/favicon.png',
  '/manifest.json'
];

// Install: Cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.error('Install failed:', err))
  );
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  const ALLOWED_CACHES = [STATIC_CACHE, DYNAMIC_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !ALLOWED_CACHES.includes(k))
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: Smart routing strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, cross-origin CDN resources (let browser handle)
  if (request.method !== 'GET') return;
  if (url.hostname.includes('cdnjs.cloudflare.com') ||
      url.hostname.includes('cdn.jsdelivr.net') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com') ||
      url.hostname.includes('unpkg.com') ||
      url.hostname.includes('checkout.razorpay.com') ||
      url.hostname.includes('rnpbglinkpsikeszcjcl.supabase.co')) {
    return;
  }

  // Images: Cache-first
  if (request.destination === 'image' || /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // Navigation & HTML: Network-first
  if (request.mode === 'navigate' || request.destination === 'document' || /\.html$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // CSS/JS: Stale-while-revalidate
  if (/\.(css|js)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // Default: Network-first
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match('/index.html');
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return fetch(request).catch(() => caches.match('/index.html'));
  }
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

// Push notifications
self.addEventListener('push', (event) => {
  let payload = { title: 'MediFinder', body: 'You have a new update.' };
  try {
    if (event.data) payload = event.data.json();
  } catch (e) {
    if (event.data) payload.body = event.data.text();
  }

  const options = {
    body: payload.body,
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: 'medifinder-notification',
    requireInteraction: true,
    vibrate: [250, 100, 250],
    data: payload.url || '/userhome.html',
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data || '/userhome.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
