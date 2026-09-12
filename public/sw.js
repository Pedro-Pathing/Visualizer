// IMPORTANT: bump this whenever you ship a new build. The service worker uses
// cache-first for the JS/CSS bundle, so a stale cache (same VERSION) will keep
// serving the previous build forever. Bumping forces old caches to be purged.
const VERSION = "v5";
const CACHE_NAME = `pedro-visualizer-${VERSION}`;

const APP_STATIC_RESOURCES = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/fields/centerstage.webp",
  "/fields/intothedeep.webp",
  "/fields/decode.webp",
  "/fields/biobuzz.webp",
  "/robot.png",
  "/assets/index.js",
  "/assets/index.css",
  "/fonts/Poppins-Regular.ttf",
  "/fonts/Poppins-SemiBold.ttf",
  "/fonts/Poppins-Light.ttf",
  "/fonts/Poppins-ExtraLight.ttf",
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
  // As a single page app, direct app navigation to cached home page when offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(event.request);
        } catch (error) {
          const cache = await caches.open(CACHE_NAME);
          const fallback = await cache.match("/");
          return fallback || new Response("Offline", { status: 503 });
        }
      })(),
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
