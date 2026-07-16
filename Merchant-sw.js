// ==========================================
// MediFinder Merchant - Background Service Worker
// Enables order notifications to be shown even when the
// merchant's browser tab is minimized / not in focus.
// ==========================================

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Generic listener in case a push payload is ever sent from a backend later.
self.addEventListener('push', (event) => {
    let payload = { title: '🛒 MediFinder Merchant Alert', body: 'You have a new update.' };
    try {
        if (event.data) payload = event.data.json();
    } catch (e) {
        if (event.data) payload.body = event.data.text();
    }

    event.waitUntil(
        self.registration.showNotification(payload.title || '🛒 MediFinder Merchant Alert', {
            body: payload.body || 'You have a new update.',
            icon: '1779304435608.png',
            badge: '1779304435608.png',
            tag: 'medifinder-merchant-order',
            requireInteraction: true,
            vibrate: [250, 100, 250]
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('marchent') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow('marchentorders.html');
            }
        })
    );
});