/* Service Worker — داشبورد ملک تبریز
   استراتژی: Static cache-first | API network-first (هیچ‌گاه داده حساس کش نمی‌شود) */

const VERSION = "melk-dash-v1";
const STATIC_CACHE = `${VERSION}-static`;

const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/favicon.png",
  "/fonts/Vazirmatn-arabic-400.woff2",
  "/fonts/Vazirmatn-arabic-500.woff2",
  "/fonts/Vazirmatn-arabic-700.woff2",
  "/fonts/Vazirmatn-arabic-800.woff2",
  "/fonts/Vazirmatn-latin-400.woff2",
  "/fonts/Vazirmatn-latin-500.woff2",
  "/fonts/Vazirmatn-latin-700.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API: همیشه شبکه (داده تازه + عدم کش داده حساس)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({ ok: false, code: "OFFLINE", message: "آفلاین هستید." }), { status: 503, headers: { "Content-Type": "application/json" } })));
    return;
  }

  // استاتیک: cache-first
  if (event.request.method === "GET") {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          if (res.ok && (url.origin === self.location.origin)) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return res;
        });
      })
    );
  }
});

// پیام ریست کش از دکمه «ریست اتصال»
self.addEventListener("message", (event) => {
  if (event.data === "RESET_CACHES") {
    caches.keys().then((keys) => keys.map((k) => caches.delete(k)));
  }
});
