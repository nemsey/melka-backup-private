/* Service Worker — داشبورد ملک تبریز (نسخه ۴ — گیت تحویل PHASE 2)
   راهبرد نسخه ۳ حفظ شده (پایدار)؛ فقط نسخه و مسیر جدید:
   - HTML و صفحات و اسکریپت‌های Next: همیشه شبکه (network-first) → هرگز HTML کهنه Serve نمی‌شود
   - کش فقط برای فایل‌های تغییرناپذیر (فونت/آیکن/مانیفست)
   - به‌روزرسانی خودکار SW با skipWaiting + clients.claim
   - پاک‌سازی کامل کش‌های همه نسخه‌های قدیمی (v1/v2/v3/v6) هنگام فعال‌سازی
   - مسیر جدید sw-v4.js چون لایه CDN فایل‌های هم‌مسیر را کش می‌کند (درس v3) */

const VERSION = "melk-dash-v7";
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
      .then((cache) =>
        Promise.allSettled(IMMUTABLE_ASSETS.map((asset) => cache.add(asset)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  /* حذف هر کشی که متعلق به نسخه جاری نیست — شامل melk-dash-v1 که عامل صفحه سفید بود */
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: "window" }).then((clients) => {
          clients.forEach((client) => client.navigate(client.url).catch(() => {}));
        })
      )
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  /* فقط GET همسان‌مبدأ */
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  /* رابط‌های برنامه‌نویسی: همیشه شبکه؛ داده حساس هرگز کش نمی‌شود */
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            JSON.stringify({
              ok: false,
              code: "OFFLINE",
              message: "آفلاین هستید.",
            }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          )
      )
    );
    return;
  }

  /* فایل‌های تغییرناپذیر (فونت/آیکن): cache-first مجاز */
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

  /* هر چیز دیگر — به‌ویژه HTML و /_next/... : شبکه مقدم؛ کش تنها جانشین آفلاین است */
  event.respondWith(
    fetch(request)
      .then((res) => {
        /* HTML هرگز کش نمی‌شود تا چانک‌های کهنه Serve نشوند */
        return res;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) =>
            cached ||
            caches.match("/").then((root) => root || new Response("", { status: 503 }))
        )
      )
  );
});

/* پیام ریست کش از دکمه «ریست اتصال» */
self.addEventListener("message", (event) => {
  if (event.data === "RESET_CACHES") {
    caches.keys().then((keys) => keys.map((k) => caches.delete(k)));
  }
});
