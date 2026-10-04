// ==========================================
// MediFinder Production Service Worker v8.0
// Vercel-ready: skips all cross-origin, no CSP violations
// ==========================================

const CACHE_VERSION = 'medi-finder-v12';
const STATIC_CACHE = 'medi-static-v12';
const DYNAMIC_CACHE = 'medi-dynamic-v12';
const IMAGE_CACHE = 'medi-images-v12';

// ✅ FIX: rewritten to match the CURRENT consolidated-SPA file set.
// The old list below referenced ~40 pre-SPA-consolidation files
// (userhome.html, marchentorders.html, adminuser.html, delyvary*.html,
// admindboy.html, etc.) that no longer exist. caches.open().addAll()
// rejects the WHOLE install if even one URL 404s, so every one of those
// stale entries was silently failing the entire precache step on every
// visit (the .catch(err=>{}) below hid it) — meaning offline support has
// not actually been working at all. If any path below isn't the real one
// on your server (e.g. marchent.css/admin.css live elsewhere, or
// manifest.json/favicon.png aren't deployed), adjust it — a single wrong
// path here will again silently break the whole precache.
const PRECACHE_URLS = [
    '/',
    '/home.html',
    '/user.html',
    '/marchent.html',
    '/marchent.css',
    '/rider.html',
    '/admin.html',
    '/admin.css',
    '/ambulance-partner.html',
    '/nurse-patner.html',
    '/blood-patner.html',
    '/order-receipt.html',
    '/supabase-constants.js',
    '/supabase-config.js',
    '/prod-utils.js',
    '/permission-every.js',
    '/push-notifications.js',
    '/user.js',
    '/marchent.js',
    '/rider.js',
    '/admin.js',
    '/user.css',
    '/rider.css',
    '/merchant-shared.css',
    '/manifest.json',
    '/favicon.png',
    '/favicon-48.png',
    '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      // one missing file must not abort the whole precache -> add each URL on its own
      .then(cache => Promise.allSettled(PRECACHE_URLS.map(u => cache.add(u))))
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

  // ✅ FIX: OAuth / Supabase auth callback URLs — Service Worker কখনো intercept করবে না
  // Google login, error redirect, token exchange — সব browser নিজে handle করবে
  const isAuthCallback =
      url.searchParams.has('code') ||
      url.searchParams.has('error_description') ||
      url.searchParams.has('access_token') ||
      url.searchParams.has('refresh_token') ||
      url.hash.includes('access_token') ||
      url.hash.includes('refresh_token') ||
      url.hash.includes('error_description') ||
      url.pathname.includes('auth/v1/callback');
  if (isAuthCallback) return; // browser directly handle করবে, SW bypass

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
      // ✅ FIX: query parameter সহ URL cache করবে না (auth error URLs cache হয় না)
      const urlObj = new URL(request.url);
      if (!urlObj.search) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
      }
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match('/home.html');
  }
}

self.addEventListener('push', (event) => {
  let payload = { title: 'MediFinder India', body: 'You have a new update.' };
  try {
    if (event.data) payload = Object.assign(payload, event.data.json());
  } catch (e) {
    if (event.data) payload.body = event.data.text();
  }

  const url = payload.url || '/';
  const orderId = payload.order_id || null;

  event.waitUntil(self.registration.showNotification(payload.title || 'MediFinder India', {
    body: payload.body || payload.message || '',
    icon: payload.icon || '/favicon.png',
    badge: payload.badge || '/favicon.png',
    // same order er notification replace hobe, alada order alada dekhabe
    tag: orderId ? ('medifinder-order-' + orderId) : 'medifinder-notification',
    renotify: true,
    requireInteraction: true,
    vibrate: [250, 100, 250],
    data: { url: url, order_id: orderId },
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const d = event.notification.data;
  const rel = (d && typeof d === 'object') ? d.url : d; // purano string data-o chalbe
  const targetUrl = new URL(rel || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          try { if ('navigate' in client) await client.navigate(targetUrl); } catch (e) {}
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

// Browser nije subscription renew korle: open page gulo ke janiye dey, push-notifications.js abar save korbe
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      clients.forEach(c => c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }));
    })
  );
});
