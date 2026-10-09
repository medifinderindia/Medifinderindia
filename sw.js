// ==========================================
// MediFinder Production Service Worker v9.0
// Vercel-ready: skips all cross-origin, no CSP violations
// ==========================================

const STATIC_CACHE = 'medi-static-v17';
const DYNAMIC_CACHE = 'medi-dynamic-v17';
const IMAGE_CACHE = 'medi-images-v17';

// Each URL is cached on its own (allSettled below), so one missing file never
// breaks the whole precache. Adjust paths here if a file lives elsewhere.
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
    '/offer.js',
    '/offer.css',
    '/user.min.js',
    '/marchent.js',
    '/rider.js',
    '/admin.js',
    '/user.min.css',
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

  // OAuth / Supabase auth callback URLs are never intercepted by the Service Worker
  const isAuthCallback =
      url.searchParams.has('code') ||
      url.searchParams.has('error_description') ||
      url.searchParams.has('access_token') ||
      url.searchParams.has('refresh_token') ||
      url.hash.includes('access_token') ||
      url.hash.includes('refresh_token') ||
      url.hash.includes('error_description') ||
      url.pathname.includes('auth/v1/callback');
  if (isAuthCallback) return;

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
      // URLs with a query string are not cached (keeps auth/error URLs out of the cache)
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
  const offerId = payload.offer_id || null;
  const isOffer = !!offerId || payload.kind === 'offer' || payload.kind === 'ending';
  const endsAt = payload.ends_at ? new Date(payload.ends_at).getTime() : null;

  // Offer already over by the time the push arrived (phone was offline) -> do not show a dead offer
  if (isOffer && endsAt && endsAt <= Date.now()) return;

  // tag: same order / same offer replaces itself; different offers stay as separate notifications
  const tag = offerId ? ('medifinder-offer-' + offerId + (payload.kind === 'ending' ? '-ending' : ''))
            : orderId ? ('medifinder-order-' + orderId)
            : 'medifinder-notification';

  const options = {
    body: payload.body || payload.message || '',
    icon: payload.icon || '/favicon.png',
    badge: payload.badge || '/favicon.png',
    tag: tag,
    renotify: true,
    requireInteraction: true,
    vibrate: [250, 100, 250],
    timestamp: Date.now(),
    data: { url: url, order_id: orderId, offer_id: offerId, ends_at: payload.ends_at || null, kind: payload.kind || null },
    actions: isOffer
      ? [ { action: 'shop', title: '🛒 Shop Now' }, { action: 'view', title: 'View Offer' } ]
      : [ { action: 'open', title: 'Open App' }, { action: 'dismiss', title: 'Dismiss' } ]
  };
  if (payload.image) options.image = payload.image; // big banner (Android Chrome / desktop)

  event.waitUntil(self.registration.showNotification(payload.title || 'MediFinder India', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const d = event.notification.data;
  const data = (d && typeof d === 'object') ? d : { url: d };
  let rel = data.url || '/';

  // Offer notification: if the offer expired while the notification sat there, tell the page
  if (data.offer_id) {
    const expired = data.ends_at && new Date(data.ends_at).getTime() <= Date.now();
    const u = new URL(rel, self.location.origin);
    if (expired) u.searchParams.set('offer_ended', '1');
    else u.searchParams.set('offer', data.offer_id);
    if (event.action === 'view' && !expired) u.hash = 'mf-offers'; // "View Offer" lands on the offers section
    rel = u.pathname + u.search + u.hash;
  }
  const targetUrl = new URL(rel, self.location.origin).href;

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

// When the browser renews the push subscription, tell open pages so push-notifications.js saves it again
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      clients.forEach(c => c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }));
    })
  );
});
