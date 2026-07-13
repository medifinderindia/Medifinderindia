// ==========================================
// MediFinder Production Service Worker v7.0
// Vercel-ready: skips all cross-origin, no CSP violations
// ==========================================

const CACHE_VERSION = 'medi-finder-v7';
const STATIC_CACHE = 'medi-static-v7';
const DYNAMIC_CACHE = 'medi-dynamic-v7';
const IMAGE_CACHE = 'medi-images-v7';

const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/signup.html',
    '/userhome.html',
    '/usercart.html',
    '/userorder.html',
    '/usermap.html',
    '/product-detail.html',
    '/order-receipt.html',
    '/userprofile.html',
    '/marchenthome.html',
    '/marchentorders.html',
    '/marchentadd.html',
    '/marchentinventory.html',
    '/marchentprofile.html',
    '/marchentpayment.html',
    '/marchentanalytics.html',
    '/marchentcustomers.html',
    '/marchentreturns.html',
    '/marchentpromotions.html',
    '/marchentdboyrequest.html',
    '/delyvaryhome.html',
    '/delyvaryorder.html',
    '/delyvaryearning.html',
    '/delyvaryprofile.html',
    '/adminuser.html',
    '/admin-dashboard.html',
    '/admindboy.html',
    '/adminmarchent.html',
    '/adminsponsored.html',
    '/supabase-constants.js',
    '/supabase-config.js',
    '/prod-utils.js',
    '/userscript.js',
    '/marchentscript.js',
    '/delyvaryscript.js',
    '/adminuser.js',
    '/adminmarchent.js',
    '/admindboy.js',
    '/marchentprofile.css',
    '/marchentadd.css',
    '/marchentinventory.css',
    '/marchentorders.css',
    '/marchentreturns.css',
    '/marchentpromotions.css',
    '/marchentanalytics.css',
    '/marchentcustomers.css',
    '/marchentpayment.css',
    '/marchentdboyrequest.css',
    '/marchenthome.css',
    '/delyvaryhome.css',
    '/delyvaryorder.css',
    '/delyvaryearning.css',
    '/delyvaryprofile.css',
    '/userprofile.css',
    '/userorder.css',
    '/usermap.css',
    '/userhome.css',
    '/usercart.css',
    '/adminuser.css',
    '/adminmarchent.css',
    '/admindboy.css',
    '/style.css',
    '/user-policy.html',
    '/merchant-policy.html',
    '/delivery-policy.html',
    '/manifest.json',
    '/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(err => {})
  );
});

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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip ALL cross-origin requests entirely
  if (url.origin !== self.location.origin) return;

  // Skip non-HTTP
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Images: cache-first
  if (request.destination === 'image' || /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // HTML navigation: network-first
  if (request.mode === 'navigate' || request.destination === 'document' || /\.html$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // CSS/JS: network-first
  if (/\.(css|js)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  // Default: network-first
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

self.addEventListener('push', (event) => {
  let payload = { title: 'MediFinder', body: 'You have a new update.' };
  try {
    if (event.data) payload = event.data.json();
  } catch (e) {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(self.registration.showNotification(payload.title, {
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
  }));
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
