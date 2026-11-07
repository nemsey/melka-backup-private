/**
 * pn028-matching-lessons.test.ts — راستی‌آزمایی PN-028 (دستور مالک ۱۴۰۵/۰۷/۱۹)
 * ---------------------------------------------------------------------------
 * اولاً: نشانگرهای اتصال — موازی/کش (قرارداد ماژول، بدون شبکه)
 * ثانیاً: تحلیل نامحدود مغز (قفل شمارشی خاموش — فاز طرح)
 * رابعاً-ه/و: فیلتر سخت نوع ملک دوجهته («و لاغیر»)
 * رابعاً-د: تحلیل فراکامل چندوجهی (۹ عامل + ۵ بعد)
 * رابعاً-ج: درس‌های رد (جفت ردشده + تقویت وزن از دلایل)
 * خامساً-ث: پنجرهٔ اخیر گزارش معاملات
 */

import { describe, expect, test } from "bun:test";
import {
  propertyTypesCompatible,
  listingEffectivePropertyType,
  dealTypeCompatible,
  normalizePropertyType,
  parseRequestTitle,
  BASE_MATCH_WEIGHTS,
  type MatchCandidate,
} from "@/core/matching/matching-engine";
import { dimensionsOf, enrichMatchResult, type MatchResult } from "@/core/matching/match-analysis";
import {
  applyRejectionLessonBoosts,
  REJECT_REASON_TO_FACTOR,
} from "@/core/matching/weights-learning";
import { ANALYSIS_RATE_UNLIMITED, evaluateLock, DECISION_LOCK_CONSTANTS } from "@/core/intelligence/decision-lock";
import { buildRecentReportDateRange } from "@/lib/melk-api/sync";

/* ═══════════ ثانیاً — تحلیل نامحدود مغز (فاز طرح و توسعه) ═══════════ */

describe("PN-028/ثانیاً — تحلیل نامحدود مغز", () => {
  test("U-۱) پرچم نامحدود پیش‌فرض روشن است", () => {
    expect(ANALYSIS_RATE_UNLIMITED).toBe(true);
  });

  test("U-۲) قفل‌های شمارشی خاموش — ۱۰۰۰۰ تحلیل در روز هم عبور می‌کند", () => {
    const v = evaluateLock({ hoursSinceLastAdvice: 100, evidenceChangedSinceLast: false, advisorCountToday: 10_000, categoryCountToday: 10_000 });
    expect(v.locked).toBe(false);
  });

  test("U-۳) ضد-تکرار (TTL/Cooldown) سرجایش مانده — تکرار فوری همان توصیه رد", () => {
    const dup = evaluateLock({ hoursSinceLastAdvice: 0, evidenceChangedSinceLast: false, advisorCountToday: 999, categoryCountToday: 999 });
    expect(dup.locked).toBe(true);
    expect(dup.reason).toBe("ttl");
    const cool = evaluateLock({ hoursSinceLastAdvice: 10, evidenceChangedSinceLast: false, advisorCountToday: 999, categoryCountToday: 999 });
    expect(cool.locked).toBe(true);
    expect(cool.reason).toBe("cooldown");
  });

  test("U-۴) ثابت‌های سقف (۱۰/روز و ۳/دسته) مستند مانده‌اند — بازگشت با MELKA_ANALYSIS_UNLIMITED=disabled", () => {
    expect(DECISION_LOCK_CONSTANTS.ratePerDay).toBe(10);
    expect(DECISION_LOCK_CONSTANTS.ratePerCategory).toBe(3);
  });
});

/* ═══════════ رابعاً-ه/و — فیلتر سخت نوع ملک دوجهته ═══════════ */

describe("PN-028/رابعاً-ه/و — نوع ملک «و لاغیر»", () => {
  test("T-۱) هم‌خانواده‌های نوع — خانه،حیاط ⊂ خانه،حیاط،ویلایی", () => {
    expect(propertyTypesCompatible("آپارتمان", "آپارتمان")).toBe(true);
    expect(propertyTypesCompatible("خانه،حیاط", "خانه،حیاط،ویلایی")).toBe(true);
    expect(propertyTypesCompatible("زمین یا ملک کلنگی", "زمین")).toBe(true);
  });

  test("T-۲) غیرهم‌خانواده‌ها — آپارتمان ✕ زمین/ویلایی/مغازه", () => {
    expect(propertyTypesCompatible("آپارتمان", "زمین یا ملک کلنگی")).toBe(false);
    expect(propertyTypesCompatible("آپارتمان", "خانه،حیاط،ویلایی")).toBe(false);
    expect(propertyTypesCompatible("آپارتمان", "مغازه")).toBe(false);
  });

  test("T-۳) نرمال‌سازی — فاصله/نیم‌فاصله و ویرگول", () => {
    expect(normalizePropertyType("زمین ")).toBe(normalizePropertyType("زمین"));
    expect(normalizePropertyType("خانه،حیاط")).toBe(normalizePropertyType("خانه ، حیاط"));
  });

  test("T-۴) نوع مؤثر آگهی — ستون ساختاری مقدم بر عنوان", () => {
    expect(listingEffectivePropertyType("آپارتمان", "زمین بزرگراه")).toBe("آپارتمان");
    expect(listingEffectivePropertyType(null, "آپارتمان ۸۰ متری ولیعصر")).toBe("آپارتمان");
    expect(listingEffectivePropertyType(null, "کلنگی نوساز")).toBe("زمین");
    expect(listingEffectivePropertyType(null, null)).toBeNull();
  });

  test("T-۵) نوع مؤثر درخواست — ستون ساختاری مقدم بر کلیدواژهٔ عنوان", () => {
    const p = parseRequestTitle("خرید آپارتمان ۸۰ متری");
    expect(p.tradeIntent).toBe("buy");
    expect(p.wantedPropertyTypes).toContain("آپارتمان");
    // عنوان بدون کلیدواژهٔ نوع — بدون هیچ سیگنال
    const p2 = parseRequestTitle("ملک مناسب خانوادگی");
    expect(p2.wantedPropertyTypes).not.toContain("ویلا");
  });

  test("T-۶) نوع معاملهٔ ساختاری درخواست — «فروش» (نیت خرید) ⇒ فقط آگهی فروش", () => {
    // PN-028: درخواست بدون کلیدواژهٔ عنوان + tradeTypeName=فروش ⇒ آگهی رهن و اجاره رد
    expect(dealTypeCompatible("فروش", "unknown", "فروش")).toBe(true);
    expect(dealTypeCompatible("رهن و اجاره", "unknown", "فروش")).toBe(false);
    expect(dealTypeCompatible("مشارکت در ساخت", "unknown", "مشارکت در ساخت")).toBe(true);
    // نیت صریح عنوان همچنان معیار اول است
    expect(dealTypeCompatible("فروش", "buy", null)).toBe(true);
    expect(dealTypeCompatible("رهن و اجاره", "buy", null)).toBe(false);
    expect(dealTypeCompatible("فروش", "rent", null)).toBe(false);
  });
});

/* ═══════════ رابعاً-د — تحلیل فراکامل چندوجهی ═══════════ */

describe("PN-028/رابعاً-د — فراکامل چندوجهی", () => {
  test("D-۱) وزن‌های پایهٔ ۹ عامله — مجموع دقیقاً ۱", () => {
    const total = Object.values(BASE_MATCH_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-9);
    expect(BASE_MATCH_WEIGHTS.roomsFit).toBeGreaterThan(0);
    expect(BASE_MATCH_WEIGHTS.floorFit).toBeGreaterThan(0);
    expect(BASE_MATCH_WEIGHTS.buildAgeFit).toBeGreaterThan(0);
  });

  test("D-۲) ابعاد پنج‌گانه از عوامل ساخته می‌شوند (مالی/مکانی/فیزیکی/انسانی/زمانی)", () => {
    const reasons: MatchCandidate["reasons"] = [
      { factor: "فاصله قیمت", value: 1, weight: 0.22, note: "داخل بازه" },
      { factor: "نزدیکی جغرافیایی", value: 0.5, weight: 0.13, note: "بدون منطقه" },
      { factor: "تناسب متراژ", value: 1, weight: 0.17, note: "80-100 متر" },
      { factor: "تطابق نوع ملک", value: 1, weight: 0.15, note: "آپارتمان" },
      { factor: "تناسب اتاق", value: 1, weight: 0.05, note: "2 تا 3 خواب" },
      { factor: "تناسب طبقه", value: 0.5, weight: 0.04, note: "خنثی" },
      { factor: "تناسب سال ساخت", value: 1, weight: 0.04, note: "1397 تا 1402" },
      { factor: "تازگی آگهی", value: 1, weight: 0.12, note: "2 روز" },
      { factor: "سابقه کارشناس", value: 0.5, weight: 0.08, note: "خنثی" },
    ];
    const dims = dimensionsOf({ reasons });
    expect(dims.length).toBe(5);
    const keys = dims.map((d) => d.key);
    expect(keys).toEqual(["financial", "spatial", "physical", "human", "temporal"]);
    // بُعد فیزیکی از ۵ عامل ساخته شده
    const physical = dims.find((d) => d.key === "physical")!;
    expect(physical.factors.length).toBe(5);
    // امتیاز مالی = ۱ (تنها عاملش کامل)
    expect(dims.find((d) => d.key === "financial")!.value).toBe(1);
    // هر بُعد بین ۰ و ۱
    for (const d of dims) expect(d.value).toBeGreaterThanOrEqual(0), expect(d.value).toBeLessThanOrEqual(1);
  });

  test("D-۳) غنی‌سازی کاندیدا — dimensions + analysis نُه‌عامله + predictions", () => {
    const cand: MatchCandidate = {
      requestId: "r1",
      hardPassed: true,
      reasons: [
        { factor: "فاصله قیمت", value: 0.9, weight: 0.22, note: "نزدیک بازه" },
        { factor: "نزدیکی جغرافیایی", value: 1, weight: 0.13, note: "همان منطقه" },
        { factor: "تناسب متراژ", value: 1, weight: 0.17, note: "داخل بازه" },
        { factor: "تازگی آگهی", value: 1, weight: 0.12, note: "1 روز" },
        { factor: "سابقه کارشناس", value: 1, weight: 0.08, note: "15 معامله" },
        { factor: "تطابق نوع ملک", value: 1, weight: 0.15, note: "آپارتمان" },
        { factor: "تناسب اتاق", value: 1, weight: 0.05, note: "2 تا 3 خواب" },
        { factor: "تناسب طبقه", value: 1, weight: 0.04, note: "طبقهٔ 2 تا 5" },
        { factor: "تناسب سال ساخت", value: 1, weight: 0.04, note: "ساخت 1397 تا 1402" },
      ],
      hardFilterNotes: [],
      signalCoverage: 1,
      score: 0.95,
    };
    const result: MatchResult = {
      direction: "request_to_listing",
      listingCode: null,
      requestId: "14469",
      candidates: [{ ...cand, listingCode: "59115" }],
      weightsUsed: BASE_MATCH_WEIGHTS,
      tier: 3,
      evaluatedAt: new Date().toISOString(),
    };
    const { candidates, summary } = enrichMatchResult(result);
    expect(candidates[0].dimensions.length).toBe(5);
    expect(candidates[0].analysis.length).toBe(9);
    expect(candidates[0].bucket).toBe("hunt");
    expect(summary.buckets.hunt).toBe(1);
  });
});

/* ═══════════ رابعاً-ج — درس‌های رد ═══════════ */

describe("PN-028/رابعاً-ج — درس‌های رد", () => {
  test("R-۱) نقشهٔ دلیل → عامل — کلیدهای دیالوگ رد همه نگاشت دارند", () => {
    for (const reason of ["price", "geo", "meterage", "type", "rooms", "floor", "age", "stale", "expert"]) {
      expect(REJECT_REASON_TO_FACTOR[reason]).toBeDefined();
    }
    // سایر/dealt/customer عمداً بی‌نگاشت‌اند (سیگنال انسانی/وضعیتی — نه وزن عاملی)
    expect(REJECT_REASON_TO_FACTOR.other).toBeUndefined();
  });

  test("R-۲) ردِ مکرر قیمت ⇒ وزن فاصلهٔ قیمت تقویت و مجموع ۱ می‌ماند", () => {
    const boosted = applyRejectionLessonBoosts(BASE_MATCH_WEIGHTS, { price: 20 });
    expect(boosted.priceDistance).toBeGreaterThan(BASE_MATCH_WEIGHTS.priceDistance);
    const total = Object.values(boosted).reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-9);
  });

  test("R-۳) سقف تقویت محافظه‌کارانه — ۱۰۰۰ رد قیمت ⇒ حداکثر ۱٫۲۵×", () => {
    const boosted = applyRejectionLessonBoosts(BASE_MATCH_WEIGHTS, { price: 1000 });
    expect(boosted.priceDistance).toBeLessThanOrEqual(BASE_MATCH_WEIGHTS.priceDistance * 1.250001);
  });

  test("R-۴) بدون رد ⇒ وزن‌ها دست‌نخورده (صفر یادگیری بی‌داده)", () => {
    const out = applyRejectionLessonBoosts(BASE_MATCH_WEIGHTS, {});
    expect(out).toEqual(BASE_MATCH_WEIGHTS);
  });

  test("R-۵) چند دلیل هم‌زمان — هر عامل متناظر خودش تقویت می‌شود", () => {
    const boosted = applyRejectionLessonBoosts(BASE_MATCH_WEIGHTS, { price: 20, geo: 20, type: 20 });
    expect(boosted.priceDistance).toBeGreaterThan(BASE_MATCH_WEIGHTS.priceDistance);
    expect(boosted.geoProximity).toBeGreaterThan(BASE_MATCH_WEIGHTS.geoProximity);
    expect(boosted.propertyTypeMatch).toBeGreaterThan(BASE_MATCH_WEIGHTS.propertyTypeMatch);
    expect(boosted.freshness).toBeLessThan(BASE_MATCH_WEIGHTS.freshness); // نرمال‌سازی: سهم بقیه کم می‌شود
    const total = Object.values(boosted).reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-9);
  });
});

/* ═══════════ خامساً-ث — پنجرهٔ اخیر گزارش معاملات ═══════════ */

describe("PN-028/خامساً-ث — پنجرهٔ اخیر", () => {
  test("W-۱) بازهٔ ۲۱روزه — startDate درست در گذشته و endDate همان امروز تهران", () => {
    const now = new Date("2026-10-11T08:00:00.000Z");
    const r = buildRecentReportDateRange(21, now);
    const from = new Date(r.startDate).getTime();
    const to = new Date(r.endDate).getTime();
    expect(to).toBeGreaterThan(from);
    const days = (to - from) / (24 * 3600 * 1000);
    // مقصد = نیمه‌شبِ امروز تهران (عین انتخاب تاریخ خود سامانه) ⇒ تا ~نیم‌روز کوتاه‌تر از ۲۱
    expect(days).toBeGreaterThanOrEqual(20.4);
    expect(days).toBeLessThanOrEqual(21.1);
    expect(r.startDate.endsWith("Z")).toBe(true);
    expect(r.endDate.endsWith("Z")).toBe(true);
  });
});
