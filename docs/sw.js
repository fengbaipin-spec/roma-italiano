// Service worker: keeps a copy of the whole app so it opens without a network.
// tools/build.js fills in VERSION and ASSETS and writes the result to docs/sw.js.
const VERSION = "0a778f3c6c";
const ASSETS = [
  "./",
  "app.css",
  "data/dialogues.json",
  "data/essays.json",
  "data/pairs.json",
  "data/vocab.json",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "index.html",
  "js/dict.js",
  "js/dictation.js",
  "js/diff.js",
  "js/essays.js",
  "js/gloss.js",
  "js/learn.js",
  "js/listen.js",
  "js/lookup.js",
  "js/main.js",
  "js/pairs.js",
  "js/pwa.js",
  "js/recorder.js",
  "js/settings.js",
  "js/speech.js",
  "js/srs.js",
  "js/store.js",
  "js/talks.js",
  "js/util.js",
  "js/wordinfo.js",
  "manifest.webmanifest",
  "js/version.js"
];
const CACHE = "rmi-" + VERSION;
const FONT_CACHE = "rmi-fonts";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: "reload" })))));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("rmi-") && key !== CACHE && key !== FONT_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// the page asks for this when the user taps "更新"
self.addEventListener("message", event => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") {
    event.respondWith(fromFontCache(req));
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") {
      const shell = await cache.match("./");
      if (shell) return shell;
    }
    return fetch(req);
  })());
});

// fonts come from Google the first time and from this cache afterwards
async function fromFontCache(req) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === "opaque") cache.put(req, res.clone());
    return res;
  } catch (err) {
    return new Response("", { status: 503, statusText: "offline" });
  }
}
