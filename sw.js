const STATIC_CACHE = 'medi-static-v19';
const DYNAMIC_CACHE = 'medi-dynamic-v19';
const IMAGE_CACHE = 'medi-images-v19';

// Each URL is cached on its own (allSettled below), so one missing file never
// breaks the whole precache. Adjust paths here if a file lives elsewhere.
const PRECACHE_URLS = [
    '/home.html',
    '/user.html',
    '/favicon.png',
    '/manifest.json',
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

  // CSS / JS
  if (/\.(css|js)$/i.test(url.pathname)) {
    // versioned file (…?v=abc123): that exact URL never changes -> serve from cache instantly
    if (url.searchParams.has('v')) { event.respondWith(cacheFirstVersioned(request, STATIC_CACHE)); return; }
    // unversioned file: fresh from network, but never make the user wait more than 3 s
    event.respondWith(networkFirstTimeout(request, STATIC_CACHE, 3000, false)); return;
  }

  // HTML pages: fresh from network, but never wait more than 2.5 s when a saved copy exists
  if (request.mode === 'navigate' || request.destination === 'document' || /\.html$/i.test(url.pathname)) {
    event.respondWith(networkFirstTimeout(request, DYNAMIC_CACHE, 2500, true));
    return;
  }

  // Default
  event.respondWith(networkFirstTimeout(request, DYNAMIC_CACHE, 4000, false));
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

// Versioned static file: cache-first. Old versions of the same file are removed.
async function cacheFirstVersioned(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
    const u = new URL(request.url);
    cache.keys().then(keys => keys.forEach(k => {
      const ku = new URL(k.url);
      if (ku.pathname === u.pathname && ku.search !== u.search) cache.delete(k);
    })).catch(() => {});
  }
  return response;
}

// Network first, but if a saved copy exists and the network is slow (> ms), show the saved copy
// at once while the network request keeps running and refreshes the cache for next time.
// ignoreQuery = true for HTML: /user.html?ref=x and /user.html share one saved copy.
async function networkFirstTimeout(request, cacheName, ms, ignoreQuery) {
  const cache = await caches.open(cacheName);
  const u = new URL(request.url);
  const key = ignoreQuery ? (u.origin + u.pathname) : request;
  const cached = await cache.match(key, ignoreQuery ? { ignoreSearch: true } : undefined);

  const net = fetch(request).then(res => {
    if (res.ok && (ignoreQuery || !u.search)) cache.put(key, res.clone());
    return res;
  });

  if (!cached) {
    try { return await net; }
    catch (e) { return (await caches.match('/home.html')) || Response.error(); }
  }
  return Promise.race([
    net.catch(() => cached),
    new Promise(resolve => setTimeout(() => resolve(cached), ms))
  ]);
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
