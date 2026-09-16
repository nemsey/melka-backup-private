"use client";

import { useEffect } from "react";

/** ثبت Service Worker — PWA (نصب روی اندروید/دسکتاپ)
 *  در هر بارگذاری، به‌روزرسانی SW به‌صورت اجباری بررسی می‌شود تا کاربران هرگز
 *  روی نسخه کهنه (صفحه سفید) قفل نشوند.
 *  نکته زیرساختی: مسیر ثبت نسخه‌ای است (sw-v4.js و بعدی) چون لایه CDN جلوی دامنه
 *  عمومی، فایل‌های هم‌مسیر (مثل sw.js) را با کلید مسیر کش کرده و نسخه کهنه تحویل می‌دهد؛
 *  برای هر نسخه major از SW باید مسیر جدید (sw-v5 و بعدی) به کار رود.
 *  گیت تحویل PHASE 3 (D2): نسخه داخلی v7 → v8 در همان مسیر sw-v4.js —
 *  گیت تحویل PHASE 5 (D2): نسخه داخلی v8 → v9 در همان مسیر sw-v4.js —
 *  فعال‌سازی، همه کش‌های قدیمی را پاک و صفحه را یک‌بار تازه بارگذاری می‌کند. */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      const register = async () => {
        try {
          const registration = await navigator.serviceWorker.register("/sw-v4.js");
          /* بررسی اجباری نسخه جدید در هر بارگذاری (عبور از کش HTTP) */
          await registration.update().catch(() => {});
          /* وقتی SW جدید کنترل را می‌گیرد، صفحه تازه بارگذاری می‌شود */
          let refreshing = false;
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
          });
        } catch {
          /* ثبت ناموفق — اپ بدون SW هم کار می‌کند */
        }
      };
      register();
    }
  }, []);
  return null;
}
