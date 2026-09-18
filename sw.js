// Rumbu Industries Group — Service Worker
// Deliberately conservative: this app is under active daily development
// (new modules, schema changes, bug fixes), so almost everything uses
// NETWORK-FIRST — always try the live server first, only fall back to
// whatever's cached if the network genuinely fails (offline). This means
// installing the PWA never risks showing a stale version while online;
// the cache only helps when there's no connection at all.
//
// Bump CACHE_NAME whenever this file changes, so old caches get cleared.
const CACHE_NAME = "rumbu-shell-v2";

// Only truly static, rarely-changing assets get cache-first treatment.
// styles.css was removed from this list — in practice it changes just as
// often as the HTML pages do, so cache-first on it meant CSS updates could
// silently never reach an already-installed PWA even after a real deploy.
// It now falls through to the same network-first handling as everything
// else below.
const STATIC_ASSETS = [
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "favicon-32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isStaticAsset(url) {
  return STATIC_ASSETS.some((asset) => url.pathname.endsWith("/" + asset) || url.pathname === "/" + asset);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests — never intercept Supabase API
  // calls, CDN scripts, or cross-origin requests. Those must always hit
  // the network directly.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (isStaticAsset(url)) {
    // Cache-first: these rarely change, and only change via a deploy.
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        });
      })
    );
    return;
  }

  // Network-first for everything else (all HTML pages/modules): always
  // prefer the live version; only serve a cached copy if the network
  // request fails outright (offline).
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
