#!/usr/bin/env bun
/**
 * recon-post-diag.ts — تشخیص Hang در POST لاگین از Bun (بازتولید مینیمال)
 * پیام‌های همهٔ تست‌ها: اعتبارنامهٔ ساختگی (کد پرسنلی ناموجود) → صفر پیامک/نشست
 * هر تست: timeout ۱۵s؛ خروجی: status/latency یا hang
 */
const URL_LOGIN = "https://arus-api.melketabriz.ir/api/apm/authentication/otp/login";
const DUMMY = JSON.stringify({ code: "000000000", otpCode: "000000" });
export {}; // ماژول‌سازی برای await سطح بالا

async function timedFetch(label: string, url: string, init: RequestInit, timeoutMs = 15_000): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const ms = Date.now() - t0;
    const text = await res.text().catch(() => "");
    console.log(`${label}: HTTP ${res.status} · ${ms}ms · ${text.slice(0, 120)}`);
  } catch (e) {
    const ms = Date.now() - t0;
    console.log(`${label}: ERROR after ${ms}ms · ${String(e).slice(0, 120)}`);
  } finally {
    clearTimeout(timer);
  }
}

// تست ۱ — عین armCall2: POST با signal + cache no-store
await timedFetch("T1-POST-replica(signal+no-store)", URL_LOGIN, {
  method: "POST",
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  body: DUMMY,
  cache: "no-store",
});

// تست ۲ — POST بدون signal و بدون cache
await timedFetch("T2-POST-plain", URL_LOGIN, {
  method: "POST",
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  body: DUMMY,
});

// تست ۳ — GET همان پایه (کنترل)
await timedFetch("T3-GET-control", "https://arus-api.melketabriz.ir/api/apm/global-settings", {
  method: "GET",
  headers: { Accept: "application/json" },
  cache: "no-store",
});
