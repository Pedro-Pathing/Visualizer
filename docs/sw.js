const VERSION = "v3";
const CACHE_NAME = `pedro-visualizer-${VERSION}`;

const BASE = '/Pedro-Visualzier-18127';
const APP_STATIC_RESOURCES = [
  `${BASE}/`,
  `${BASE}/favicon.ico`,
  `${BASE}/fields/centerstage.webp`,
  `${BASE}/fields/intothedeep.webp`,
  `${BASE}/fields/decode.webp`,
  `${BASE}/robot.png`,
  `${BASE}/assets/index.js`,
  `${BASE}/assets/index.css`,
  `${BASE}/fonts/Poppins-Regular.ttf`,
  `${BASE}/fonts/Poppins-SemiBold.ttf`,
  `${BASE}/fonts/Poppins-Light.ttf`,
  `${BASE}/fonts/Poppins-ExtraLight.ttf`,
];

// On install, cache the static resources
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      cache.addAll(APP_STATIC_RESOURCES);
    })(),
  );
});

// delete old caches on activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
          return undefined;
        }),
      );
      await clients.claim();
    })(),
  );
});

// On fetch, intercept server requests
// and respond with cached responses instead of going to network
self.addEventListener("fetch", (event) => {
  // As a single page app, direct app to always go to cached home page.
  if (event.request.mode === "navigate") {
    event.respondWith(caches.match("/"));
    return;
  }

  // Allow FPA API requests to go through to the network
  if (event.request.url.includes('fpa.pedropathing.com')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // If network fails, return a custom offline response
        return new Response(
          JSON.stringify({ 
            error: 'offline', 
            message: 'You are offline. Please check your internet connection and try again.' 
          }), 
          { 
            status: 503, 
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json' }
          }
        );
      })
    );
    return;
  }

  // For all other requests, go to the cache first, and then the network.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(event.request.url);
      if (cachedResponse) {
        // Return the cached response if it's available.
        return cachedResponse;
      }
      // Try network if not in cache
      try {
        const networkResponse = await fetch(event.request);
        // Cache successful responses for future use
        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        // If both cache and network fail, return a 404.
        return new Response(null, { status: 404 });
      }
    })(),
  );
});
