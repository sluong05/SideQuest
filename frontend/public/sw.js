const CACHE = 'sidequest-v2';
const OFFLINE_URL = '/offline';

const PRECACHE = [
  '/',
  '/offline',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('push', (e) => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'SideQuest', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(e.notification.data.url);
          return client.focus();
        }
      }
      return clients.openWindow(e.notification.data.url);
    })
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;

  // Never intercept API calls, non-GET requests, or Next.js build assets
  // (build assets are content-hashed in prod; caching them risks serving stale code)
  if (request.method !== 'GET') return;
  if (request.url.includes('/api/')) return;
  if (new URL(request.url).pathname.startsWith('/_next/')) return;

  // For navigation requests: network-first, fall back to offline page
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r || caches.match('/'))
      )
    );
    return;
  }

  // Only cache same-origin static assets (CDN scripts/models are left to the browser cache)
  if (new URL(request.url).origin !== self.location.origin) return;

  // Static assets: stale-while-revalidate — answer from cache immediately,
  // refresh the cached copy in the background for next time.
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(request, res.clone());
            }
            return res;
          })
          .catch(() => cached);
        if (cached) {
          e.waitUntil(network.then(() => undefined, () => undefined));
          return cached;
        }
        return network;
      })
    )
  );
});
