/* Service Worker — ملکا (نسخه ۵ — قانون ظاهر فاخر ۰۳۵-B: بنر آپدیت به‌جای reload خاموش)
   راهبرد نسخهٔ ۴ حفظ شده (پایدار)؛ دو تغییر:
   ۱. skipWaiting «پیام‌محور» شد: SW نو منتظر پیام SKIP_WAITING از بنر آپدیت می‌ماند
      (بند ۵ قانون ۰۳۵-B) — کاربر با دکمهٔ «همین حالا تازه کن» فعال‌سازی را تأیید می‌کند.
   ۲. پس از activate، پنجره‌ها خودکار navigate نمی‌شوند؛ SwRegister با controllerchange
      یک‌بار تازه‌سازی می‌کند (حفظ گارانتی «هرگز قفل روی نسخهٔ کهنه»).
   مسیر جدید sw-v5.js چون لایهٔ CDN فایل‌های هم‌مسیر را کش می‌کند (درس v3/v4). */

const VERSION = "melk-dash-v11";
const STATIC_CACHE = `${VERSION}-static`;

/* فقط دارایی‌های واقعاً تغییرناپذیر — بدون HTML و بدون چانک‌های Next */
const IMMUTABLE_ASSETS = [
  "/manifest.json",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
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
    caches
      .open(STATIC_CACHE)
      .then((cache) => Promise.allSettled(IMMUTABLE_ASSETS.map((asset) => cache.add(asset))))
    /* نکتهٔ ۰۳۵-B: بدون skipWaiting خودکار — بنر آپدیت تصمیم می‌گیرد */
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            JSON.stringify({ ok: false, code: "OFFLINE", message: "آفلاین هستید." }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          )
      )
    );
    return;
  }

  if (
    IMMUTABLE_ASSETS.includes(url.pathname) ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => res)
      .catch(() =>
        caches.match(request).then(
          (cached) =>
            cached ||
            caches.match("/").then((root) => root || new Response("", { status: 503 }))
        )
      )
  );
});

/* پیام‌ها: ریست کش (دکمهٔ ریست اتصال) + فعال‌سازی آپدیت (بنر ۰۳۵-B) */
self.addEventListener("message", (event) => {
  if (event.data === "RESET_CACHES") {
    caches.keys().then((keys) => keys.map((k) => caches.delete(k)));
  }
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
