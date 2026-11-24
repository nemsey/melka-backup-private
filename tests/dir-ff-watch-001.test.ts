/**
 * tests/dir-ff-watch-001.test.ts — دکمهٔ «تحت نظر» + کلید «ارجاع به تحت نظر» (کاشی فایل‌یابی)
 * ---------------------------------------------------------------------------
 * دستور مالک (۱۴۰۵/۰۹/۰۳ · DIR-FF-WATCH-001):
 *   اولاً) «کادری در فایل‌یابی هست که فرصت‌های شکار و پیگیری و بررسی در این کادر
 *            نمایش داده می‌شود — یک دکمه دیگر به این مادر اضافه شود با نام «تحت نظر»»
 *   ثانیاً) «برای هر فایل کشف‌شده ۴ دکمه پیش‌بینی شده (پل به دیوار، جزییات آگهی،
 *            رد آگهی، ثبت آگهی) — دکمه دیگری با نام «ارجاع به تحت نظر» ایجاد گردد
 *            که با زدن این دکمه فایل به بخش تحت نظر ارجاع گردد.»
 *
 * پوشش:
 *   الف) UI — کادر مادر: چهار دکمه شامل «تحت نظر» · کارت فایل: پنج کلید شامل
 *        «ارجاع به تحت نظر» · تب چهارم «تحت نظر»
 *   ب) رفتار مخزن — markAdWatched + پنجرهٔ watch (ارجاع‌شده‌ها فقط تحت نظر؛
 *        سه پنجرهٔ امتیازی فقط ارجاع‌نشده‌ها) + شمارندهٔ watch
 *   ج) روت — گسترش bucket=watch + روت watch (محلی، بدون رله/ARM — سیاست
 *        DIR-FF-RELAY-POLICY-001: رله فقط برای ثبت آگهی)
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

Object.assign(process.env, {
  NODE_ENV: process.env.NODE_ENV ?? "test",
  DATABASE_URL: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/test.db",
  MELK_TOKEN_KEY: process.env.MELK_TOKEN_KEY ?? "test-only-key-not-a-real-secret",
});

const ROOT = "/home/z/my-project";
const AD_CARD = readFileSync(join(ROOT, "src/core/tiles/tiles/file-finder/AdCard.tsx"), "utf8");
const FF_PAGE = readFileSync(join(ROOT, "src/core/tiles/tiles/file-finder/FileFinderPage.tsx"), "utf8");
const ADS_ROUTE = readFileSync(join(ROOT, "src/app/api/divar/ads/route.ts"), "utf8");
const WATCH_ROUTE = readFileSync(join(ROOT, "src/app/api/divar/ads/[token]/watch/route.ts"), "utf8");
const PRISMA_REPO = readFileSync(join(ROOT, "src/core/repositories/prisma/market.repository.ts"), "utf8");

/* ═══════════ الف — UI: کادر مادر + پنج کلید کارت ═══════════ */

describe("DIR-FF-WATCH-001 · اولاً — دکمهٔ «تحت نظر» در کادر مادر شاخص‌ها", () => {
  test("الف-۱ کادر شاخص‌ها چهار دکمه دارد — چهارم «تحت نظر» با شمارنده", () => {
    // کادر مادر (شاخص‌ها) — شبکهٔ چهارستونه پس از افزودن دکمهٔ چهارم
    expect(FF_PAGE).toContain("grid grid-cols-2 sm:grid-cols-4 gap-2");
    expect(FF_PAGE).toMatch(/key: "watch", label: "فایل‌های تحت نظر"/);
    expect(FF_PAGE).toContain("ارجاع‌شده برای پایش");
  });

  test("الف-۲ تب چهارم «تحت نظر» در پنجره‌های فایل‌یابی", () => {
    expect(FF_PAGE).toMatch(/TabsTrigger value="watch"/);
    expect(FF_PAGE).toContain('تحت نظر ({faNumber(counts.watch)})');
    expect(FF_PAGE).toMatch(/\["hunt", "follow", "review", "watch"\]/);
  });

  test("الف-۳ پاسخ فهرست آگهی‌ها شامل شمارندهٔ watch است", () => {
    expect(FF_PAGE).toMatch(/bucketCounts: \{ hunt: number; follow: number; review: number; watch: number \}/);
  });
});

describe("DIR-FF-WATCH-001 · ثانیاً — کلید «ارجاع به تحت نظر» روی هر کارت فایل", () => {
  test("ب-۱ کارت فایل پنج کلید دارد — پنجم «ارجاع به تحت نظر»", () => {
    expect(AD_CARD).toContain("ارجاع به تحت نظر");
    expect(AD_CARD).toMatch(/onWatch: \(ad: DivarAdRow\) => void/);
    // کنار همان چهار کلید موجود
    expect(AD_CARD).toContain("پل به دیوار");
    expect(AD_CARD).toContain("جزییات آگهی");
    expect(AD_CARD).toContain("رد آگهی");
    expect(AD_CARD).toContain("ثبت آگهی");
  });

  test("ب-۲ کلید ارجاع فقط برای فایل ارجاع‌نشده (watchedAt == null) دیده می‌شود", () => {
    expect(AD_CARD).toMatch(/\{!watched && \(/);
    expect(AD_CARD).toMatch(/watchedAt: string \| null/);
  });

  test("ب-۳ روت API ارجاع موجود است — محلی، بدون رله و بدون ARM", () => {
    expect(WATCH_ROUTE).toContain("markAdWatched");
    expect(WATCH_ROUTE).toContain("DIVAR_WATCH");
    const code = WATCH_ROUTE
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("ensureChangesSessionForOperation");
    expect(code).not.toContain("armCall");
    expect(code).not.toMatch(/\brelay\b/i);
  });

  test("ب-۴ روت فهرست، پنجرهٔ watch را می‌پذیرد", () => {
    expect(ADS_ROUTE).toMatch(/"hunt", "follow", "review", "watch", "all"/);
  });
});

/* ═══════════ ج — رفتار مخزن (پایگاه تست) ═══════════ */

describe("DIR-FF-WATCH-001 · رفتار مخزن — ارجاع و پنجرهٔ تحت نظر", () => {
  const TOKEN = "ff-watch-001-test";

  beforeEach(async () => {
    const { db } = await import("@/lib/db");
    await db.divarAd.deleteMany({ where: { token: TOKEN } }).catch(() => undefined);
  });

  test("ج-۱ markAdWatched: فایل فعال ارجاع می‌شود؛ فایل غایب false", async () => {
    const { db } = await import("@/lib/db");
    const { getMarketRepository } = await import("@/core/repositories");
    await db.divarAd.create({
      data: {
        token: TOKEN,
        category: "apartment-sell",
        title: "آزمون ارجاع به تحت نظر",
        personalScore: 80,
        underpriceScore: 60,
        totalScore: 70,
        bucket: "hunt",
        status: "active",
      },
    });

    const market = getMarketRepository();
    // پیش از ارجاع: فایل در پنجرهٔ شکار (hunt) دیده می‌شود
    const before = await market.listAdsWithBucketCounts({ filter: { bucket: "hunt" }, limit: 1000, offset: 0 });
    expect(before.rows.some((r) => r.token === TOKEN)).toBe(true);
    expect(before.bucketCounts.hunt).toBeGreaterThanOrEqual(1);

    // ارجاع
    const ok = await market.markAdWatched(TOKEN);
    expect(ok).toBe(true);

    // پس از ارجاع: فایل فقط در «تحت نظر» است — از شکار خارج شد
    const afterHunt = await market.listAdsWithBucketCounts({ filter: { bucket: "hunt" }, limit: 1000, offset: 0 });
    expect(afterHunt.rows.some((r) => r.token === TOKEN)).toBe(false);
    const afterWatch = await market.listAdsWithBucketCounts({ filter: { bucket: "watch" }, limit: 1000, offset: 0 });
    expect(afterWatch.rows.some((r) => r.token === TOKEN)).toBe(true);
    expect(afterWatch.rows.find((r) => r.token === TOKEN)!.watchedAt).toBeTruthy();
    expect(afterWatch.bucketCounts.watch).toBeGreaterThanOrEqual(1);

    // فایل غایب: false (بدون استثنا)
    expect(await market.markAdWatched("no-such-token-xyz")).toBe(false);
  });

  test("ج-۲ شمارندهٔ سه پنجرهٔ امتیازی فایل ارجاع‌شده را نمی‌شمارد؛ شمارندهٔ watch می‌شمارد", async () => {
    const { db } = await import("@/lib/db");
    const { getMarketRepository } = await import("@/core/repositories");
    await db.divarAd.create({
      data: {
        token: TOKEN,
        category: "apartment-sell",
        title: "آزمون شمارنده‌ها",
        personalScore: 80,
        totalScore: 70,
        bucket: "follow",
        status: "active",
      },
    });
    const market = getMarketRepository();
    await market.markAdWatched(TOKEN);

    const counts = (await market.listAdsWithBucketCounts({ filter: { bucket: "all" }, limit: 1000, offset: 0 })).bucketCounts;
    // مجموع سه پنجره + تحت نظر = کل فعال‌های این سناریو (۱ فایل)
    expect(counts.follow + counts.hunt + counts.review + counts.watch).toBe(1);
    expect(counts.watch).toBe(1);
    expect(counts.follow).toBe(0);
  });

  test("ج-۳ دادهٔ آگهی با ارجاع دست‌نخورده می‌ماند (قانون دادهٔ مقدس)", async () => {
    const { db } = await import("@/lib/db");
    const { getMarketRepository } = await import("@/core/repositories");
    await db.divarAd.create({
      data: {
        token: TOKEN,
        category: "apartment-sell",
        title: "آزمون پابرجایی داده با ارجاع",
        price: 3_000_000_000,
        bucket: "review",
        status: "active",
        personalScore: 50,
        totalScore: 45,
      },
    });
    const market = getMarketRepository();
    await market.markAdWatched(TOKEN);

    const ad = await db.divarAd.findUnique({ where: { token: TOKEN } });
    expect(ad!.title).toBe("آزمون پابرجایی داده با ارجاع");
    expect(ad!.price).toBe(3_000_000_000);
    expect(ad!.bucket).toBe("review"); // دست‌نخورده — پنجرهٔ اصلی که از آن ارجاع شد
    expect(ad!.status).toBe("active"); // دست‌نخورده — رد/ثبت هنوز ممکن است
    expect(ad!.watchedAt).toBeTruthy();
  });

  test("ج-۴ مخزن: پنجرهٔ watch بر اساس watchedAt مرتب می‌شود (تازه‌ترین ارجاع اول)", () => {
    expect(PRISMA_REPO).toMatch(/isWatch \? \{ watchedAt: "desc" \} : \{ totalScore: "desc" \}/);
  });
});
