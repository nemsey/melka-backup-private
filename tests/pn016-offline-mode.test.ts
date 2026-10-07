/**
 * PN-016 — تست Offline Mode واقعی (پوستهٔ آفلاین + قانون کش)
 * ---------------------------------------------------------------------------
 * ۱) پوستهٔ آفلاین استاتیک است — بدون چانک Next، بدون داده حساس (قانون P6519 برقرار)
 * ۲) اسکریپت سرویس‌ورکر: /offline.html در فهرست تغییرناپذیران + جانشین ناوبری آفلاین
 * ۳) پاسخ 503 ساختگی API آفلاین (کد OFFLINE) — قرارداد JSON
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const SW = readFileSync("public/sw.js", "utf8");
const SHELL = readFileSync("public/offline.html", "utf8");

describe("PN-016 · Offline Mode واقعی", () => {
  test("پوستهٔ آفلاین: سند فارسی RTL با برند ملکا و دکمهٔ تلاش دوباره", () => {
    expect(SHELL).toContain('lang="fa"');
    expect(SHELL).toContain('dir="rtl"');
    expect(SHELL).toContain("تلاش دوباره");
    expect(SHELL).toContain("ملکا");
  });

  test("پوستهٔ آفلاین: استایل درون‌خطی — بدون وابستگی به چانک/فایل بیرونی (زیر شبکهٔ قطع بار می‌شود)", () => {
    expect(SHELL).toContain("<style>");
    expect(SHELL).not.toMatch(/<link[^>]+stylesheet/);
    expect(SHELL).not.toMatch(/src="\/_next\//);
  });

  test("پوستهٔ آفلاین: بازگشت خودکار هنگام آنلاین شدن + پرس‌وجوی دوره‌ای سلامت", () => {
    expect(SHELL).toContain('"online"');
    expect(SHELL).toContain("/api/health");
  });

  test("قانون P6519 برقرار: HTML اپ هرگز کش نمی‌شود — پوستهٔ آفلاین تنها HTML کش‌شونده است", () => {
    expect(SW).toContain("HTML هرگز کش نمی‌شود");
    // فقط offline.html به‌عنوان HTML در فهرست تغییرناپذیران است
    const immutable = SW.split("IMMUTABLE_ASSETS = [")[1].split("];")[0];
    const htmls = immutable.match(/"[^"]*\.html"/g) ?? [];
    expect(htmls).toEqual(['"/offline.html"']);
  });

  test("سرویس‌ورکر: /offline.html در فهرست پیش‌کش است", () => {
    expect(SW).toContain('"/offline.html"');
  });

  test("سرویس‌ورکر: جانشین ناوبری آفلاین → پوستهٔ آفلاین (نه 503 خالی)", () => {
    expect(SW).toContain('request.mode === "navigate"');
    expect(SW).toContain('caches.match("/offline.html")');
  });

  test("قرارداد API آفلاین: پاسخ 503 با کد OFFLINE (سرویس‌ورکر JSON برمی‌گرداند)", () => {
    expect(SW).toContain('"OFFLINE"');
    expect(SW).toContain("503");
  });

  test("دادهٔ حساس هرگز کش نمی‌شود — API همیشه شبکه (قانون امنیتی P6519 دست‌نخورده)", () => {
    expect(SW).toContain("رابط‌های برنامه‌نویسی: همیشه شبکه");
    expect(SW).toContain("داده حساس هرگز کش نمی‌شود");
  });
});
