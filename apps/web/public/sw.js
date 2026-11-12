/* BorrowBuddy service worker — offline shell + static asset cache.
   Supabase API and storage requests are never cached. */

// v4: "Parcel's Signal Hunt" offline page. Older borrowbuddy-* caches are retired on activate.
const VERSION = "borrowbuddy-v4";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/offline-assets/title.woff2",
  "/offline-assets/body.woff2",
  "/offline-assets/label.woff2",
];

function cacheable(response) {
  return response.ok && !response.redirected &&
    !/\b(?:private|no-store)\b/i.test(response.headers.get("Cache-Control") || "");
}

async function cachedResponse(request) {
  try {
    return await (await caches.open(VERSION)).match(request);
  } catch {
    return undefined;
  }
}

async function storePublicResponse(request, response) {
  if (!cacheable(response)) return;
  try {
    await (await caches.open(VERSION)).put(request, response.clone());
  } catch {
    // Storage denial/quota must not hide a usable live network response.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // Bypass the HTTP cache so a new offline page is never precached stale.
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("borrowbuddy-") && key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    const publicPage = url.pathname === "/" || url.pathname === OFFLINE_URL;
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (publicPage) await storePublicResponse(request, response);
          return response;
        })
        .catch(async () => {
          const cached = publicPage ? await cachedResponse(request) : undefined;
          return cached || await cachedResponse(OFFLINE_URL) || Response.error();
        }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons") || url.pathname.startsWith("/offline-assets/")) {
    const network = fetch(request)
      .then(async (response) => {
        await storePublicResponse(request, response);
        return response;
      })
      .catch(() => undefined);
    // Finish revalidation even when the cached asset is returned immediately.
    event.waitUntil(network.then(() => undefined));
    event.respondWith(
      cachedResponse(request).then(async (cached) => cached || await network || Response.error()),
    );
  }
});
