"use client";

import { useEffect } from "react";

/** ثبت Service Worker — PWA (نصب روی اندروید/دسکتاپ) */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // ثبت ناموفق — اپ بدون SW هم کار می‌کند
      });
    }
  }, []);
  return null;
}
