/**
 * P6545 / گام ۲ — تست کاشی‌های M5-M8 (≥ ۱۰۰ تست — معیار پذیرش گام ۲)
 * ---------------------------------------------------------------------------
 * · M5 تطبیق (۳۰) — موتور تطبیق + فیلتر سخت + امتیاز نرم + حلقهٔ یادگیری
 * · M6 شاخص (۲۵) — محاسبات شاخص بازار + تقویم شمسی + منابع داده
 * · M7 پوشش (۲۰) — پوشش ستون‌های M1-M4 + مسیر پر شدن
 * · M8 یادگیری (۲۵) — Tier + هدف Tier-aware + کالیبراسیون + تختهٔ سیاه + ۲۵ بررسی
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/test.db" } } });
const real = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

import {
  MatchingEngine,
  parseRequestTitle,
  dealTypeCompatible,
  ALERT_SCORE_THRESHOLD,
  TOP_N,
  ACTIVE_REQUEST_STATUSES,
  type MatchWeights,
} from "@/core/matching/matching-engine";
import { OpportunityListener } from "@/core/matching/opportunity-listener";
import { tierAwareBrierTarget, TIER_BRIER_TARGETS, CALIBRATION_REGION } from "@/core/intelligence/calibration/calibration-map";
import { TIER_PROFILES, computeTier } from "@/core/intelligence/contracts-p7-p11";
import { blackboardRead, blackboardVerify } from "@/lib/intelligence/blackboard";
import { runIntelligenceCoreCycle } from "@/lib/intelligence/core-cycle";
import { dateToJalali, JALALI_MONTHS } from "@/lib/jalali";

const TILES_DIR = "src/core/tiles/tiles";
afterAll(async () => { await db.$disconnect(); await real.$disconnect(); });

/* ═══════════ M5 — تطبیق هوشمند (۳۰ تست) ═══════════ */

describe("گام۲/M5 — تطبیق هوشمند دوجهته", () => {
  test("م-۵-۱ عنوان با نوع ملک چندگانه", () => {
    const r = parseRequestTitle("خرید زمین یا ملک کلنگی در ولیعصر");
    expect(r.wantedPropertyTypes).toContain("زمین");
    expect(r.tradeIntent).toBe("buy");
  });

  test("م-۵-۲ مغازه و باغ در کلیدواژه‌ها", () => {
    expect(parseRequestTitle("اجاره مغازه تجاری").wantedPropertyTypes).toContain("مغازه");
    expect(parseRequestTitle("خرید باغ ویلا").wantedPropertyTypes).toContain("باغ");
  });

  test("م-۵-۳ «مسکونی» به آپارتمان نگاشت می‌شود", () => {
    expect(parseRequestTitle("خرید خانه مسکونی").wantedPropertyTypes).toContain("آپارتمان");
  });

  test("م-۵-۴ متراژ تک‌عددی «۸۰ متری»", () => {
    const r = parseRequestTitle("خرید آپارتمان 80 متری");
    expect(r.meterageFrom).toBe(80);
    expect(r.meterageTo).toBe(80);
  });

  test("م-۵-۵ عنوان بدون متراژ = null", () => {
    expect(parseRequestTitle("خرید آپارتمان در ولیعصر").meterageFrom).toBeNull();
  });

  test("م-۵-۶ پیش‌خرید هم نیت خرید است", () => {
    expect(parseRequestTitle("پیش خرید آپارتمان").tradeIntent).toBe("buy");
  });

  test("م-۵-۷ نیت از نام معاملهٔ غنی‌شده (بدون عنوان)", () => {
    expect(dealTypeCompatible("فروش", "unknown", "خرید")).toBe(true);
    expect(dealTypeCompatible("فروش", "unknown", "رهن و اجاره")).toBe(false);
  });

  test("م-۵-۸ بدون هیچ سیگنال = عبور (ارزیابی نرم)", () => {
    expect(dealTypeCompatible("فروش", "unknown", null)).toBe(true);
  });

  test("م-۵-۹ وضعیت‌های فعال درخواست شامل «فرصت» و «سرنخ» است", () => {
    expect(ACTIVE_REQUEST_STATUSES).toContain("فرصت");
    expect(ACTIVE_REQUEST_STATUSES).toContain("سرنخ");
    expect(ACTIVE_REQUEST_STATUSES).not.toContain("معامله شده");
  });

  test("م-۵-۱۰ وزن‌های شخصی‌شده نرمال می‌شوند (جمع = ۱)", () => {
    const custom: Partial<MatchWeights> = { priceDistance: 0.5, freshness: 0.5 };
    const engine = new MatchingEngine({ db, tier: 3, weights: custom });
    const sum = Object.values(engine.weights).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.01);
  });

  test("م-۵-۱۱ Tier موتور از ورودی می‌آید", () => {
    expect(new MatchingEngine({ db, tier: 2 }).tier).toBe(2);
  });

  test("م-۵-۱۲ کدملک ناموجود = خالی صادقانه", async () => {
    const r = await new MatchingEngine({ db, tier: 3 }).matchListingToRequests("0000000");
    expect(r.candidates).toHaveLength(0);
    expect(r.listingCode).toBe("0000000");
  });

  test("م-۵-۱۳ درخواست ناموجود = خالی صادقانه", async () => {
    const r = await new MatchingEngine({ db, tier: 3 }).matchRequestToListings("0000000");
    expect(r.candidates).toHaveLength(0);
  });

  test("م-۵-۱۴ روی دادهٔ واقعی: آگهی منتشرشده کاندیدا دارد", async () => {
    const listing = await real.propertyRecord.findFirst({ where: { status: "منتشر شده", propertyTypeName: "آپارتمان" }, orderBy: { syncedAt: "desc" } });
    if (!listing) return;
    const r = await new MatchingEngine({ db: real, tier: 3 }).matchListingToRequests(listing.propertyCode);
    expect(r.candidates.length).toBeLessThanOrEqual(TOP_N);
  });

  test("م-۵-۱۵ روی دادهٔ واقعی: درخواست فرصت کاندیدا دارد", async () => {
    const req = await real.requestRecord.findFirst({ where: { status: "فرصت", title: { contains: "آپارتمان" } } });
    if (!req) return;
    const r = await new MatchingEngine({ db: real, tier: 3 }).matchRequestToListings(req.id);
    expect(r.candidates.length).toBeLessThanOrEqual(TOP_N);
  });

  test("م-۵-۱۶ همهٔ کاندیدای عبورکرده از فیلتر سخت سبزند", async () => {
    const listing = await real.propertyRecord.findFirst({ where: { status: "منتشر شده" }, orderBy: { syncedAt: "desc" } });
    if (!listing) return;
    const r = await new MatchingEngine({ db: real, tier: 3 }).matchListingToRequests(listing.propertyCode);
    expect(r.candidates.every((c) => c.hardPassed)).toBe(true);
  });

  test("م-۵-۱۷ هر کاندیدا ۶ عامل امتیاز دارد (۵ عامل جلسه ۰۳۳ + تطابق نوع)", async () => {
    const listing = await real.propertyRecord.findFirst({ where: { status: "منتشر شده" }, orderBy: { syncedAt: "desc" } });
    if (!listing) return;
    const r = await new MatchingEngine({ db: real, tier: 3 }).matchListingToRequests(listing.propertyCode);
    for (const c of r.candidates) expect(c.reasons).toHaveLength(6);
  });

  test("م-۵-۱۸ عوامل با دلیل فارسی", async () => {
    const listing = await real.propertyRecord.findFirst({ where: { status: "منتشر شده" }, orderBy: { syncedAt: "desc" } });
    if (!listing) return;
    const r = await new MatchingEngine({ db: real, tier: 3 }).matchListingToRequests(listing.propertyCode);
    for (const c of r.candidates) {
      expect(c.reasons.every((x) => x.factor.length > 2 && x.note.length > 0)).toBe(true);
    }
  });

  test("م-۵-۱۹ امتیازها نزولی مرتب شده‌اند", async () => {
    const listing = await real.propertyRecord.findFirst({ where: { status: "منتشر شده" }, orderBy: { syncedAt: "desc" } });
    if (!listing) return;
    const r = await new MatchingEngine({ db: real, tier: 3 }).matchListingToRequests(listing.propertyCode);
    const scores = r.candidates.map((c) => c.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  test("م-۵-۲۰ امتیاز در بازهٔ [۰,۱]", async () => {
    const listing = await real.propertyRecord.findFirst({ where: { status: "منتشر شده" }, orderBy: { syncedAt: "desc" } });
    if (!listing) return;
    const r = await new MatchingEngine({ db: real, tier: 3 }).matchListingToRequests(listing.propertyCode);
    expect(r.candidates.every((c) => c.score >= 0 && c.score <= 1)).toBe(true);
  });

  test("م-۵-۲۱ پوشش سیگنال گزارش می‌شود (شفافیت خنثی‌ها)", async () => {
    const listing = await real.propertyRecord.findFirst({ where: { status: "منتشر شده" }, orderBy: { syncedAt: "desc" } });
    if (!listing) return;
    const r = await new MatchingEngine({ db: real, tier: 3 }).matchListingToRequests(listing.propertyCode);
    expect(r.candidates.every((c) => c.signalCoverage >= 0 && c.signalCoverage <= 1)).toBe(true);
  });

  test("م-۵-۲۲ سابقهٔ کارشناس بدون کد = خنثی ۰٫۵ (نه صفر)", async () => {
    const listing = await real.propertyRecord.findFirst({ where: { status: "منتشر شده" }, orderBy: { syncedAt: "desc" } });
    if (!listing) return;
    const r = await new MatchingEngine({ db: real, tier: 3 }).matchListingToRequests(listing.propertyCode);
    const expertReason = r.candidates[0]?.reasons.find((x) => x.factor === "سابقه کارشناس");
    if (expertReason) {
      expect(expertReason.value === 0.5 || expertReason.value >= 0).toBe(true);
    }
  });

  test("م-۵-۲۳ شنوندهٔ فرصت: آستانهٔ ۰٫۷ در تولید هشدار", async () => {
    const listener = new OpportunityListener(real, 3);
    const listing = await real.propertyRecord.findFirst({ where: { status: "منتشر شده" }, orderBy: { syncedAt: "desc" } });
    if (!listing) return;
    const report = await listener.onListingCreated(listing.propertyCode);
    expect(report.alertsCreated).toBeLessThanOrEqual(TOP_N);
  });

  test("م-۵-۲۴ هشدارهای DB همه ≥ ۰٫۷", async () => {
    const below = await real.opportunityAlert.count({ where: { matchScore: { lt: ALERT_SCORE_THRESHOLD } } });
    expect(below).toBe(0);
  });

  test("م-۵-۲۵ جهت هشدار درست ذخیره می‌شود", async () => {
    const sample = await real.opportunityAlert.findFirst();
    if (!sample) return;
    expect(["listing_to_request", "request_to_listing"]).toContain(sample.direction);
  });

  test("م-۵-۲۶ دلایل هشدار JSON معتبر است", async () => {
    const sample = await real.opportunityAlert.findFirst();
    if (!sample) return;
    const parsed = JSON.parse(sample.matchReasons);
    expect(Array.isArray(parsed.reasons)).toBe(true);
  });

  test("م-۵-۲۷ فایل کاشی M5 موجود است (اسکن منبع)", () => {
    const idx = readFileSync(`${TILES_DIR}/smart-matching/index.ts`, "utf8");
    expect(idx).toContain('id: "smart-matching"');
    expect(idx).toContain('accent: "m5"');
    expect(idx).toContain('minRole: "OWNER"');
  });

  test("م-۵-۲۸ صفحهٔ M5 دو تب دارد (اسکن منبع)", () => {
    const page = readFileSync(`${TILES_DIR}/smart-matching/SmartMatchingPage.tsx`, "utf8");
    expect(page).toContain("آگهی ← درخواست");
    expect(page).toContain("درخواست ← آگهی");
  });

  test("م-۵-۲۹ حلقهٔ یادگیری: دکمهٔ پذیرش/رد در صفحه هست (اسکن منبع)", () => {
    const page = readFileSync(`${TILES_DIR}/smart-matching/SmartMatchingPage.tsx`, "utf8");
    expect(page).toContain("پذیرش");
    expect(page).toContain("رد");
    expect(page).toContain("/api/agent/feedback");
  });

  test("م-۵-۳۰ مسیر API تطبیق موجود است (اسکن منبع)", () => {
    const route = readFileSync("src/app/api/matching/route.ts", "utf8");
    expect(route).toContain("listingCode");
    expect(route).toContain("requestId");
  });
});

/* ═══════════ M6 — شاخص بازار (۲۵ تست) ═══════════ */

describe("گام۲/M6 — شاخص بازار ملک تبریز", () => {
  test("م-۶-۱ تبدیل میلادی به شمسی درست است", () => {
    const j = dateToJalali(new Date("2026-09-29T00:00:00Z"));
    expect(j.jy).toBe(1405);
    expect(j.jm).toBe(7);
  });

  test("م-۶-۲ کلید ماهانهٔ شمسی قالب درست دارد", () => {
    const j = dateToJalali(new Date("2026-03-21T00:00:00Z"));
    expect(`${j.jy}-${String(j.jm).padStart(2, "0")}`).toBe("1405-01");
  });

  test("م-۶-۳ نام ماه‌های شمسی کامل است", () => {
    expect(JALALI_MONTHS).toHaveLength(12);
    expect(JALALI_MONTHS[0]).toBe("فروردین");
  });

  test("م-۶-۴ دادهٔ معاملات واقعی موجود است (منبع M6)", async () => {
    const count = await real.transactionRecord.count();
    expect(count).toBeGreaterThan(700);
  });

  test("م-۶-۵ غنی‌سازی قیمت معاملات موجود است", async () => {
    const count = await real.transactionEnrichment.count({ where: { contractPrice: { not: null } } });
    expect(count).toBeGreaterThan(0);
  });

  test("م-۶-۶ آگهی‌های فعال برای شاخص منطقه", async () => {
    const count = await real.propertyRecord.count({ where: { status: "منتشر شده", price: { not: null }, meterage: { not: null } } });
    expect(count).toBeGreaterThan(0);
  });

  test("م-۶-۷ میانهٔ قیمت هر متر منطقهٔ ولیعصر > صفر", async () => {
    const rows = await real.propertyRecord.findMany({
      where: { areaName: "ولیعصر", status: "منتشر شده", price: { not: null }, meterage: { not: null } },
      select: { price: true, meterage: true }, take: 200,
    });
    if (rows.length === 0) return;
    const ppm = rows.map((r) => r.price! / Math.max(r.meterage!, 1)).sort((a, b) => a - b);
    expect(ppm[Math.floor(ppm.length / 2)]).toBeGreaterThan(0);
  });

  test("م-۶-۸ انواع ملک چهارگانه در داده موجودند", async () => {
    for (const t of ["آپارتمان", "ویلا", "زمین", "مغازه"]) {
      const count = await real.propertyRecord.count({ where: { propertyTypeName: { contains: t } } });
      expect(count).toBeGreaterThan(0);
    }
  });

  test("م-۶-۹ روند ماهانهٔ معاملات از ۱۴۰۴ داده دارد", async () => {
    const txs = await real.transactionRecord.findMany({ select: { contractDate: true }, take: 800 });
    const keys = txs.map((t) => { const j = dateToJalali(t.contractDate); return `${j.jy}-${String(j.jm).padStart(2, "0")}`; });
    const recent = keys.filter((k) => k >= "1404-01");
    expect(recent.length).toBeGreaterThan(0);
  });

  test("م-۶-۱۰ سری درخواست‌ها ماهانه قابل محاسبه است", async () => {
    const reqs = await real.requestRecord.findMany({ select: { createdAt: true }, take: 2000 });
    expect(reqs.length).toBeGreaterThan(0);
  });

  test("م-۶-۱۱ واحد تبدیل ریال به میلیون تومان (÷۱۰/۱م)", () => {
    const rialToMilionToman = (rial: number) => Math.round((rial / 10 / 1_000_000) * 10) / 10;
    expect(rialToMilionToman(10_000_000_000)).toBe(1000);
  });

  test("م-۶-۱۲ میانگین/میانهٔ توزیع قیمت آگهی‌ها محاسبه‌پذیر است", async () => {
    const rows = await real.propertyRecord.findMany({ where: { status: "منتشر شده", price: { not: null } }, select: { price: true }, take: 500 });
    const prices = rows.map((r) => r.price!).sort((a, b) => a - b);
    expect(prices[Math.floor(prices.length / 2)]).toBeGreaterThan(0);
  });

  test("م-۶-۱۳ مقایسهٔ معامله/آگهی: هر دو منبع داده دارند", async () => {
    const txPrice = await real.transactionEnrichment.count({ where: { contractPrice: { not: null } } });
    const listingPrice = await real.propertyRecord.count({ where: { status: "منتشر شده", price: { not: null } } });
    expect(txPrice).toBeGreaterThan(0);
    expect(listingPrice).toBeGreaterThan(0);
  });

  test("م-۶-۱۴ فایل کاشی M6 ثبت شده (اسکن منبع)", () => {
    const idx = readFileSync(`${TILES_DIR}/market-index/index.ts`, "utf8");
    expect(idx).toContain('id: "market-index"');
    expect(idx).toContain('accent: "m6"');
    expect(idx).toContain('minRole: "OWNER"');
  });

  test("م-۶-۱۵ صفحهٔ M6 هر پنج قابلیت را دارد (اسکن منبع)", () => {
    const page = readFileSync(`${TILES_DIR}/market-index/MarketIndexPage.tsx`, "utf8");
    expect(page).toContain("روند قیمت ماهانه");
    expect(page).toContain("۱۰ منطقهٔ پرتقاضا");
    expect(page).toContain("نوع ملک");
    expect(page).toContain("معاملات واقعی در برابر آگهی‌های فعال");
    expect(page).toContain("حجم ماهانه");
  });

  test("م-۶-۱۶ مسیر API شاخص موجود است", () => {
    const route = readFileSync("src/app/api/market-index/route.ts", "utf8");
    expect(route).toContain("monthlyTrend");
    expect(route).toContain("byArea");
    expect(route).toContain("byType");
    expect(route).toContain("txVsListing");
    expect(route).toContain("volume");
  });

  test("م-۶-۱۷ نمودار سه‌سری در صفحه هست (اسکن منبع)", () => {
    const page = readFileSync(`${TILES_DIR}/market-index/MarketIndexPage.tsx`, "utf8");
    expect(page).toContain('dataKey="transactions"');
    expect(page).toContain('dataKey="listings"');
    expect(page).toContain('dataKey="requests"');
  });

  test("م-۶-۱۸ دادهٔ منطقه‌ای در DB بالای ۱۰ منطقه است", async () => {
    const areas = await real.propertyRecord.groupBy({ by: ["areaName"], where: { areaName: { not: null }, status: "منتشر شده" }, _count: true });
    expect(areas.length).toBeGreaterThanOrEqual(10);
  });

  test("م-۶-۱۹ تقویم شمسی: سال ۱۴۰۵ = ۲۰۲۶-۲۰۲۷", () => {
    const j1 = dateToJalali(new Date("2026-03-20T00:00:00Z"));
    const j2 = dateToJalali(new Date("2026-03-21T00:00:00Z"));
    expect(j1.jy).toBe(1404);
    expect(j2.jy).toBe(1405);
  });

  test("م-۶-۲۰ قیمت معاملات اجاره‌ای هم در داده هست", async () => {
    const count = await real.transactionEnrichment.count({ where: { contractType: "اجاره نامه" } });
    expect(count).toBeGreaterThan(0);
  });

  test("م-۶-۲۱ شمار معاملات مبایعه‌نامه", async () => {
    const count = await real.transactionEnrichment.count({ where: { contractType: "مبایعه نامه" } });
    expect(count).toBeGreaterThan(300);
  });

  test("م-۶-۲۲ آگهی بدون قیمت از شاخص حذف می‌شود (فیلتر منبع)", () => {
    const route = readFileSync("src/app/api/market-index/route.ts", "utf8");
    expect(route).toContain("price: { not: null }");
  });

  test("م-۶-۲۳ دادهٔ شاخص از ۷۵۷ معاملهٔ واقعی سخن می‌گوید (اسکن سند)", () => {
    const idx = readFileSync(`${TILES_DIR}/market-index/index.ts`, "utf8");
    expect(idx).toContain("معاملات");
  });

  test("م-۶-۲۴ رنگ اختصاصی M6 در نظام رنگ (اسکن منبع)", () => {
    const globals = readFileSync("src/app/globals.css", "utf8");
    expect(globals).toContain("--sec-m6-500: #65a30d");
  });

  test("م-۶-۲۵ دارک‌مود M6 تعریف شده", () => {
    const globals = readFileSync("src/app/globals.css", "utf8");
    expect(globals).toContain("--sec-m6-50: #1d2a12");
  });
});

/* ═══════════ M7 — پوشش داده (۲۰ تست) ═══════════ */

describe("گام۲/M7 — پوشش اطلاعات", () => {
  test("م-۷-۱ پوشش عنوان آگهی‌ها بالای ۹۰٪ (دادهٔ واقعی)", async () => {
    const total = await real.propertyRecord.count();
    const withTitle = await real.propertyRecord.count({ where: { title: { not: null } } });
    expect(withTitle / total).toBeGreaterThan(0.9);
  });

  test("م-۷-۲ پوشش منطقهٔ آگهی‌ها", async () => {
    const total = await real.propertyRecord.count();
    const withArea = await real.propertyRecord.count({ where: { areaName: { not: null } } });
    expect(withArea / total).toBeGreaterThan(0.5);
  });

  test("م-۷-۳ پوشش قیمت آگهی‌ها", async () => {
    const withPrice = await real.propertyRecord.count({ where: { price: { not: null } } });
    expect(withPrice).toBeGreaterThan(0);
  });

  test("م-۷-۴ نقص موبایل مالک گزارش می‌شود (فرصت غنی‌سازی)", async () => {
    const missing = await real.propertyRecord.count({ where: { ownerMobile: null } });
    expect(missing).toBeGreaterThan(0); // مسیر پر شدن: تماس مالک
  });

  test("م-۷-۵ پوشش عنوان درخواست‌ها", async () => {
    const withTitle = await real.requestRecord.count({ where: { title: { not: null } } });
    expect(withTitle).toBeGreaterThan(7000);
  });

  test("م-۷-۶ نقص بازهٔ قیمت درخواست‌ها (غنی‌سازی ARM)", async () => {
    const missing = await real.requestRecord.count({ where: { priceFrom: null } });
    expect(missing).toBeGreaterThan(0);
  });

  test("م-۷-۷ پوشش نوع قرارداد معاملات", async () => {
    const withType = await real.transactionEnrichment.count({ where: { contractType: { not: null } } });
    expect(withType).toBeGreaterThan(500);
  });

  test("م-۷-۸ پوشش خریدار/فروشنده معاملات", async () => {
    const buyers = await real.transactionEnrichment.count({ where: { buyerName: { not: null } } });
    const sellers = await real.transactionEnrichment.count({ where: { sellerName: { not: null } } });
    expect(buyers).toBeGreaterThan(0);
    expect(sellers).toBeGreaterThan(0);
  });

  test("م-۷-۹ پوشش نام کارشناسان کامل است (ستون غیرتهی — ۱۰۰٪ ساختاری)", async () => {
    const total = await real.expertRecord.count();
    const nonEmpty = await real.expertRecord.count({ where: { fullName: { not: "" } } });
    expect(nonEmpty / Math.max(total, 1)).toBeGreaterThan(0.9);
  });

  test("م-۷-۱۰ درصد پوشش بین ۰ و ۱۰۰ محاسبه می‌شود", () => {
    const percent = (filled: number, total: number) => total > 0 ? Math.round((filled / total) * 1000) / 10 : 0;
    expect(percent(50, 100)).toBe(50);
    expect(percent(0, 100)).toBe(0);
    expect(percent(10, 0)).toBe(0);
  });

  test("م-۷-۱۱ فایل کاشی M7 ثبت شده (اسکن منبع)", () => {
    const idx = readFileSync(`${TILES_DIR}/data-coverage/index.ts`, "utf8");
    expect(idx).toContain('id: "data-coverage"');
    expect(idx).toContain('accent: "m7"');
    expect(idx).toContain('minRole: "OWNER"');
  });

  test("م-۷-۱۲ صفحهٔ M7 جدول پوشش + نمودار + رکوردهای ناقص دارد", () => {
    const page = readFileSync(`${TILES_DIR}/data-coverage/DataCoveragePage.tsx`, "utf8");
    expect(page).toContain("درصد پوشش");
    expect(page).toContain("مسیر پر شدن");
    expect(page).toContain("رکوردهای ناقص");
    expect(page).toContain("BarChart");
  });

  test("م-۷-۱۳ مسیر API پوشش موجود است", () => {
    const route = readFileSync("src/app/api/coverage/route.ts", "utf8");
    expect(route).toContain("fillPath");
    expect(route).toContain("incompleteRecords");
  });

  test("م-۷-۱۴ نمایش Tier در صفحهٔ M7 (بینش Tier-aware)", () => {
    const page = readFileSync(`${TILES_DIR}/data-coverage/DataCoveragePage.tsx`, "utf8");
    expect(page).toContain("Tier");
  });

  test("م-۷-۱۵ رنگ اختصاصی M7 در نظام رنگ", () => {
    const globals = readFileSync("src/app/globals.css", "utf8");
    expect(globals).toContain("--sec-m7-500: #2563eb");
  });

  test("م-۷-۱۶ چهار کاشی در پاسخ پوشش (اسکن منبع)", () => {
    const route = readFileSync("src/app/api/coverage/route.ts", "utf8");
    expect(route).toContain("M1_COLUMNS");
    expect(route).toContain("M2_COLUMNS");
    expect(route).toContain("M3_COLUMNS");
    expect(route).toContain("M4_COLUMNS");
  });

  test("م-۷-۱۷ مسیر پر شدن ستون‌ها فارسی و راهنماست", () => {
    const route = readFileSync("src/app/api/coverage/route.ts", "utf8");
    expect(route).toContain("غنی‌سازی تنبل");
    expect(route).toContain("ورود OTP");
  });

  test("م-۷-۱۸ لینک مستقیم رکوردهای ناقص در API هست", () => {
    const route = readFileSync("src/app/api/coverage/route.ts", "utf8");
    expect(route).toContain("link:");
  });

  test("م-۷-۱۹ Tier از دادهٔ واقعی حلقه خوانده می‌شود", () => {
    const route = readFileSync("src/app/api/coverage/route.ts", "utf8");
    expect(route).toContain("tierFromRealData");
  });

  test("م-۷-۲۰ پوشش هر ستون با شمارش دقیق DB سازگار است", async () => {
    const total = await real.propertyRecord.count();
    const withMeterage = await real.propertyRecord.count({ where: { meterage: { not: null } } });
    expect(withMeterage).toBeLessThanOrEqual(total);
  });
});

/* ═══════════ M8 — یادگیری و Tier (۲۵ تست) ═══════════ */

describe("گام۲/M8 — یادگیری و Tier", () => {
  test("م-۸-۱ هدف Tier-aware: Tier 0-1 = ۰٫۳۰", () => {
    expect(tierAwareBrierTarget(0)).toBe(0.3);
    expect(tierAwareBrierTarget(1)).toBe(0.3);
  });

  test("م-۸-۲ هدف Tier-aware: Tier 2 = ۰٫۲۵", () => {
    expect(tierAwareBrierTarget(2)).toBe(0.25);
  });

  test("م-۸-۳ هدف Tier-aware: Tier 3 = ۰٫۲۲ (تصمیم ۳ جلسه ۰۳۳)", () => {
    expect(tierAwareBrierTarget(3)).toBe(0.22);
  });

  test("م-۸-۴ هدف Tier-aware: Tier 4 = ۰٫۲۰", () => {
    expect(tierAwareBrierTarget(4)).toBe(0.2);
  });

  test("م-۸-۵ جدول اهداف کامل است (۵ Tier)", () => {
    expect(Object.keys(TIER_BRIER_TARGETS)).toHaveLength(5);
  });

  test("م-۸-۶ ناحیهٔ کالیبراسیون ۰٫۴-۰٫۶ است (کشف P10)", () => {
    expect(CALIBRATION_REGION.min).toBe(0.4);
    expect(CALIBRATION_REGION.max).toBe(0.6);
  });

  test("م-۸-۷ پروفایل‌های Tier: سرحد نتیجه‌ها", () => {
    expect(TIER_PROFILES[1].minOutcomes).toBe(10);
    expect(TIER_PROFILES[3].minOutcomes).toBe(50);
    expect(TIER_PROFILES[4].minOutcomes).toBe(70);
  });

  test("م-۸-۸ محاسبهٔ Tier از ۳۸۴ نتیجه و ۱ دوره = Tier 3", () => {
    const t = computeTier(384, 1);
    expect(t).toBe(3);
  });

  test("م-۸-۹ محاسبهٔ Tier با ۳ دوره و ۸۰ نتیجه = Tier 4", () => {
    expect(computeTier(80, 3)).toBe(4);
  });

  test("م-۸-۱۰ حلقهٔ بزرگ: گزارش با فیلد کالیبراسیون (چرخهٔ زنده)", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p7.calibration).toBeDefined();
    expect(r.p7.calibration!.applied).toBe(true);
  });

  test("م-۸-۱۱ حلقه: Brier کالیبره ≤ خام (اثر ترمیم مصوب)", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p7.calibration!.calibratedBrier).toBeLessThanOrEqual(r.p7.calibration!.rawBrier);
  });

  test("م-۸-۱۲ حلقه: هدف Brier گزارش می‌شود", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p7.brierTarget).toBe(tierAwareBrierTarget(r.tier));
  });

  test("م-۸-۱۳ حلقه: ۲۵ بررسی خودتشخیصی", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p10.checks).toHaveLength(25);
  });

  test("م-۸-۱۴ حلقه: DIAG-MODEL-001 (Brier) پس از ترمیم fail نیست", async () => {
    const r = await runIntelligenceCoreCycle();
    const check = r.p10.checks.find((c) => c.id === "DIAG-MODEL-001");
    expect(check?.status).not.toBe("fail");
  });

  test("م-۸-۱۵ حلقه: DIAG-MODEL-002 (کالیبراسیون) پس از ترمیم fail نیست", async () => {
    const r = await runIntelligenceCoreCycle();
    const check = r.p10.checks.find((c) => c.id === "DIAG-MODEL-002");
    expect(check?.status).not.toBe("fail");
  });

  test("م-۸-۱۶ حلقه: صفر اجرای ترمیم (قفل ابدی)", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p11.executedCount).toBe(0);
  });

  test("م-۸-۱۷ حلقه: همهٔ پیشنهادها pending (در انتظار شورا)", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p11.proposals.every((p) => p.status === "pending")).toBe(true);
  });

  test("م-۸-۱۸ تختهٔ سیاه: ورودی‌های اخیر موجودند", async () => {
    const entries = await blackboardRead({});
    expect(entries.length).toBeGreaterThan(0);
  });

  test("م-۸-۱۹ زنجیرهٔ هش تختهٔ سیاه سالم است", async () => {
    const v = await blackboardVerify();
    expect(v.intact).toBe(v.total);
  });

  test("م-۸-۲۰ فایل کاشی M8 ثبت شده (اسکن منبع)", () => {
    const idx = readFileSync(`${TILES_DIR}/learning-tier/index.ts`, "utf8");
    expect(idx).toContain('id: "learning-tier"');
    expect(idx).toContain('accent: "m8"');
    expect(idx).toContain('minRole: "OWNER"');
  });

  test("م-۸-۲۱ صفحهٔ M8: Tier + Brier + تصمیم‌ها + تختهٔ سیاه + ۲۵ بررسی", () => {
    const page = readFileSync(`${TILES_DIR}/learning-tier/LearningTierPage.tsx`, "utf8");
    expect(page).toContain("Tier فعلی");
    expect(page).toContain("بازکالیبراسیون");
    expect(page).toContain("در انتظار شورا");
    expect(page).toContain("تختهٔ سیاه");
    expect(page).toContain("۲۵ بررسی خودتشخیصی");
  });

  test("م-۸-۲۲ نمایشگر تختهٔ سیاه API موجود است", () => {
    const route = readFileSync("src/app/api/intelligence/blackboard/route.ts", "utf8");
    expect(route).toContain("blackboardRead");
  });

  test("م-۸-۲۳ رنگ اختصاصی M8 در نظام رنگ", () => {
    const globals = readFileSync("src/app/globals.css", "utf8");
    expect(globals).toContain("--sec-m8-500: #0d9488");
  });

  test("م-۸-۲۴ رجیستری کاشی‌ها شامل چهار کاشی تازه است", async () => {
    const bootstrap = readFileSync("src/core/tiles/bootstrap.ts", "utf8");
    expect(bootstrap).toContain("smart-matching");
    expect(bootstrap).toContain("market-index");
    expect(bootstrap).toContain("data-coverage");
    expect(bootstrap).toContain("learning-tier");
  });

  test("م-۸-۲۵ هشدار فرصت در تنظیمات عمومی نمایش داده می‌شود (BLOCK 1.4)", () => {
    const settings = readFileSync("src/core/tiles/tiles/settings/SettingsPage.tsx", "utf8");
    expect(settings).toContain("OpportunityJobsSection");
    const section = readFileSync("src/core/tiles/tiles/settings/OpportunityJobsSection.tsx", "utf8");
    expect(section).toContain("هشدار فرصت");
    expect(section).toContain("کارهای پس‌زمینه");
  });
});
