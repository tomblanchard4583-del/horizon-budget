/* Service worker Horizon Budget — cache hors-ligne + mises à jour automatiques.
 * e88308deead1 est remplacé à chaque build : nouveau hash = nouveau cache = nouvelle version. */
const CACHE = "horizon-e88308deead1";
const SHELL = ["./", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // Supabase & co : jamais interceptés
  if (e.request.mode === "navigate") {
    // page : réseau d'abord (toujours à jour en ligne), cache en secours (hors-ligne)
    e.respondWith(
      fetch(e.request)
        .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put("./", copy)); return r; })
        .catch(() => caches.match("./"))
    );
  } else {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
  }
});
