/* Atlas of Me — offline shell and vendored data are cache-first; Open-Meteo is network-first. */
const CACHE = "atlas-of-me-v2";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/app.js",
  "./assets/style.css",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./vendor/d3.min.js",
  "./vendor/d3-geo-projection.min.js",
  "./vendor/topojson-client.min.js",
  "./vendor/lz-string.min.js",
  "./vendor/countries.js",
  "./vendor/countries-50m.json",
  "./vendor/capitals.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

function isWeather(url) {
  return url.hostname === "api.open-meteo.com" || url.hostname.endsWith(".open-meteo.com");
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    return new Response(JSON.stringify({ error: true, reason: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  }
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (isWeather(url)) {
    event.respondWith(networkFirst(req));
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith(cacheFirst(req).catch(() => {
    if (req.mode === "navigate") return caches.match("./index.html");
    return Promise.reject();
  }));
});
