// TUXI Platform Service Worker
// Version: 1.2.0 - Critical UI Asset Caching & Offline Inquiry Background Sync

const CACHE_NAME = 'tuxi-ui-cache-v1';
const DATA_CACHE_NAME = 'tuxi-data-cache-v1';

// Critical UI Assets to Precache during install
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/src/main.tsx',
  '/src/App.tsx'
];

// Offline Queue in memory for service worker scope
let swOfflineInquiryQueue = [];

// Install Event: Precache Critical UI Shell Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaching Critical UI Assets for TUXI');
      // Use addAll with error resilience for dynamically hashed assets
      return Promise.allSettled(
        CRITICAL_ASSETS.map((url) => 
          fetch(url)
            .then((response) => {
              if (response.ok) {
                return cache.put(url, response);
              }
            })
            .catch((err) => {
              console.warn('[SW] Precache skipped for:', url, err);
            })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up stale caches & take immediate control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== DATA_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache-First for static assets, Network-First with Cache Fallback for UI
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests (e.g. POST, PUT)
  if (request.method !== 'GET') {
    return;
  }

  // 1. Navigation (HTML pages / App Shell)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          // Fallback to cached index.html or root
          const cachedResponse = await caches.match('/index.html') || await caches.match('/');
          if (cachedResponse) {
            return cachedResponse;
          }
          return new Response(
            '<html><body><h2>TUXI Offline</h2><p>You are currently offline. Critical UI is cached and will reconnect automatically.</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // 2. Static Assets (Scripts, Styles, Images, Fonts, Icons)
  if (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.includes('/assets/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Stale-While-Revalidate: Return cache immediately, fetch fresh in background
          fetch(request).then((networkRes) => {
            if (networkRes && networkRes.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkRes));
            }
          }).catch(() => {});
          return cached;
        }

        // Fetch from network and cache
        return fetch(request).then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkRes;
        }).catch(() => {
          // Return empty or fallback
          return new Response('', { status: 408, statusText: 'Offline' });
        });
      })
    );
    return;
  }

  // 3. Default Network First with Cache Fallback
  event.respondWith(
    fetch(request)
      .then((networkRes) => {
        if (networkRes && networkRes.ok) {
          const clone = networkRes.clone();
          caches.open(DATA_CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkRes;
      })
      .catch(() => caches.match(request))
  );
});

// Background Sync Event: Replay queued order status inquiries when network is restored
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-order-inquiries') {
    event.waitUntil(
      broadcastToClients({
        type: 'BACKGROUND_SYNC_TRIGGERED',
        tag: event.tag,
        timestamp: new Date().toISOString()
      })
    );
  }
});

// Message Event: Client-to-Worker Communication
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;

  switch (data.type) {
    case 'QUEUE_ORDER_INQUIRY':
      if (data.inquiry) {
        swOfflineInquiryQueue.push(data.inquiry);
        // Request Background Sync registration if available
        if (self.registration && 'sync' in self.registration) {
          self.registration.sync.register('sync-order-inquiries').catch(() => {});
        }
        event.ports?.[0]?.postMessage({
          success: true,
          queuedCount: swOfflineInquiryQueue.length
        });
      }
      break;

    case 'TRIGGER_SYNC_NOW':
      broadcastToClients({
        type: 'BACKGROUND_SYNC_TRIGGERED',
        timestamp: new Date().toISOString()
      });
      event.ports?.[0]?.postMessage({ success: true });
      break;

    case 'CLEAR_SW_QUEUE':
      swOfflineInquiryQueue = [];
      event.ports?.[0]?.postMessage({ success: true });
      break;

    default:
      break;
  }
});

// Helper to broadcast messages to all connected window clients
async function broadcastToClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(message);
  }
}
