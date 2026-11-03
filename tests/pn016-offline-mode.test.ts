/**
 * PN-016 → PN-031-E — تست «حذف حالت آفلاین» (دستور مالک ۱۴۰۵/۰۷/۲۳ · «حالت آفلینی را در اپلیکیشن حذف کن»)
 * ---------------------------------------------------------------------------
 * قرارداد تازه (جایگزین قرارداد آفلاین PN-016):
 *   ۱) پوستهٔ آفلاین استاتیک حذف شده — offline.html دیگر وجود ندارد
 *   ۲) سرویس‌ورکر: هیچ جانشین آفلاین برای ناوبری و هیچ پاسخ ساختگی OFFLINE برای API
 *      ندارد — خطای واقعی شبکه دیده می‌شود، نه پوشش «آفلاین»
 *   ۳) قانون P6519 دست‌نخورده: HTML اپ هرگز کش نمی‌شود؛ داده حساس هرگز کش نمی‌شود
 *   ۴) نشان آفلاین مرورگر (OfflineBadge) از هدر حذف شده
 *   ۵) پاک‌سازی میراث: activate سوئیچ تازه، کش‌های قدیمی (شامل offline.html
 *      کش‌شدهٔ بیلدهای قبل) را حذف می‌کند
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const SW = readFileSync("public/sw.js", "utf8");
const HEADER = readFileSync("src/components/app/AppHeader.tsx", "utf8");

describe("PN-031-E · حذف حالت آفلاین از اپلیکیشن", () => {
  test("پوستهٔ آفلاین حذف شده — offline.html دیگر وجود ندارد", () => {
    expect(existsSync("public/offline.html")).toBe(false);
  });

  test("سرویس‌ورکر: offline.html در فهرست تغییرناپذیران نیست", () => {
    expect(SW).not.toContain('"/offline.html"');
    const immutable = SW.split("IMMUTABLE_ASSETS = [")[1].split("];")[0];
    const htmls = immutable.match(/"[^"]*\.html"/g) ?? [];
    expect(htmls).toEqual([]);
  });

  test("سرویس‌ورکر: جانشین ناوبری آفلاین حذف شده", () => {
    expect(SW).not.toContain('request.mode === "navigate"');
    expect(SW).not.toContain('caches.match("/offline.html")');
  });

  test("سرویس‌ورکر: پاسخ ساختگی OFFLINE برای API حذف شده", () => {
    expect(SW).not.toContain('"OFFLINE"');
    // 503 ساختگی — اسکریپت نباید Response آفلاین بسازد
    expect(SW).not.toContain("آفلاین هستید");
  });

  test("نشان آفلاین مرورگر از هدر حذف شده (OfflineBadge)", () => {
    expect(existsSync("src/components/app/OfflineBadge.tsx")).toBe(false);
    expect(HEADER).not.toContain("OfflineBadge");
  });

  test("قانون P6519 دست‌نخورده: HTML اپ هرگز کش نمی‌شود (شبکه-only)", () => {
    expect(SW).toContain("HTML هرگز کش نمی‌شود");
    expect(SW).toContain('url.pathname.startsWith("/api/")');
    expect(SW).toContain("داده حساس هرگز کش نمی‌شود");
  });

  test("پاک‌سازی میراث: activate کش‌های غیرجاری (شامل کش آفلاین قدیمی) را حذف می‌کند", () => {
    expect(SW).toContain("caches.delete(k)");
    expect(SW).toContain("self.skipWaiting()");
    expect(SW).toContain("self.clients.claim()");
  });

  test("سینتکس sw.js معتبر است (node --check)", () => {
    const proc = Bun.spawnSync(["node", "--check", "public/sw.js"]);
    expect(proc.exitCode).toBe(0);
  });
});
