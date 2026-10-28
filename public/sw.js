// Offline support for the app shell. Projects and settings live in browser
// storage, not here.
//
// Build output in /assets/ has a content hash in its name, so a cached copy is
// never stale and is served cache-first. Everything else (the page, field
// images, the GIF worker) keeps its name across builds, so it is served from
// cache while a fresh copy is fetched for the next load. A new build therefore
// needs no VERSION bump; bump it only to drop the cache entirely.
const VERSION = "v8";
const CACHE_NAME = `pedro-visualizer-${VERSION}`;

const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/fields/centerstage.webp",
  "/fields/intothedeep.webp",
  "/fields/decode.webp",
  "/fields/biobuzz-dark.webp",
  "/fields/biobuzz-light.webp",
  "/robot.png",
  "/logo-duck.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // One missing file shouldn't stop the others from being cached.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Cache a response for later, if it is a good one from this origin. */
async function store(cache, request, response) {
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // The page: the network first, so a new build is picked up on the next
  // load. Offline, fall back to the last page that loaded.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          return await store(cache, "/", await fetch(request));
        } catch {
          return (
            (await cache.match("/")) ??
            new Response("Offline", { status: 503 })
          );
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      if (url.pathname.includes("/assets/")) {
        if (cached) return cached;
        try {
          return await store(cache, request, await fetch(request));
        } catch {
          return new Response(null, { status: 404 });
        }
      }

      const refresh = fetch(request)
        .then((response) => store(cache, request, response))
        .catch(() => null);
      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }
      return (await refresh) ?? new Response(null, { status: 404 });
    })(),
  );
});
