// sw.js — Service Worker básico y seguro con manejo por mensajes
const CACHE_VERSION = 'v1';
const CACHE_NAME = `myapp-shell-${CACHE_VERSION}`;
const FALLBACK_HTML = '/index.html';

self.addEventListener('install', (evt) => {
  self.skipWaiting(); // activar inmediatamente
  // opcional: precache básico (añade rutas si quieres)
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([FALLBACK_HTML]);
    })
  );
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  const req = evt.request;
  // strategy: try network then fallback to cache for non-navigation;
  // for navigation, return cached fallback (offline page)
  if (req.mode === 'navigate') {
    evt.respondWith(
      fetch(req).catch(() => caches.match(FALLBACK_HTML))
    );
    return;
  }

  // For other requests: cache-first then network
  evt.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      // cache GET basic responses (same-origin)
      if (req.method === 'GET' && res && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
      }
      return res;
    })).catch(() => {
      // fallback nothing
    })
  );
});

/* Mensajería desde la página hacia el SW.
   - type: 'CACHE_URLS' -> payload: array of URLs to cache
   - type: 'CLEAR_CACHES' -> borra caches (except la actual)
   - type: 'SKIP_WAITING'  -> self.skipWaiting()
*/
self.addEventListener('message', async (ev) => {
  const data = ev.data || {};
  const port = ev.ports && ev.ports[0];
  try {
    if (data.type === 'CACHE_URLS' && Array.isArray(data.payload)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(data.payload);
      port && port.postMessage({ok:true});
    } else if (data.type === 'CLEAR_CACHES') {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()));
      port && port.postMessage({ok:true});
    } else if (data.type === 'SKIP_WAITING') {
      await self.skipWaiting();
      port && port.postMessage({ok:true});
    } else {
      port && port.postMessage({ok:false, msg:'unknown'});
    }
  } catch (err) {
    port && port.postMessage({ok:false, msg: String(err)});
  }
});
