/* Trip app service worker (B5): keeps the app and trip data on the phone so it opens offline.
   - App page + trip.json: network first (so updates arrive), fall back to the saved copy.
   - Fonts, Leaflet, icons: cache first.
   - Map tiles: saved as you view them (up to 600 tiles).
   - Backend (script.google.com) and weather API: never cached here (the app handles those). */
var V = "trip-v5";
var SHELL = ["./", "index.html", "data/trip.json", "manifest.webmanifest", "icons/icon-192.png", "icons/apple-touch-icon.png"];
var TILE_CACHE = "trip-tiles-v1", TILE_MAX = 600;

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== V && k !== TILE_CACHE && k !== "trip-runtime-v1"; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function networkFirst(req) {
  return fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(V).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match("index.html"); });
  });
}

function cacheFirst(req, name) {
  return caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      if (res && (res.ok || res.type === "opaque")) { var copy = res.clone(); caches.open(name).then(function (c) { c.put(req, copy); }); }
      return res;
    });
  });
}

function tile(req) {
  return caches.open(TILE_CACHE).then(function (c) {
    return c.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && (res.ok || res.type === "opaque")) {
          c.put(req, res.clone());
          c.keys().then(function (keys) { if (keys.length > TILE_MAX) keys.slice(0, keys.length - TILE_MAX).forEach(function (k) { c.delete(k); }); });
        }
        return res;
      });
    });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (/script\.google\.com|googleusercontent\.com|open-meteo\.com/.test(url.host)) return;
  if (/tile\.openstreetmap\.org$/.test(url.host)) return e.respondWith(tile(req));
  if (url.origin === self.location.origin) {
    if (req.mode === "navigate" || /\/data\/trip\.json$|\/index\.html$|\/$/.test(url.pathname)) return e.respondWith(networkFirst(req));
    return e.respondWith(cacheFirst(req, V));
  }
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com/.test(url.host)) return e.respondWith(cacheFirst(req, "trip-runtime-v1"));
});
