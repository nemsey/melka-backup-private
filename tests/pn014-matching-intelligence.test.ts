/**
 * pn014-matching-intelligence.test.ts — راستی‌آزمایی ارتقای کاشی تطبیق (PN-014)
 * ---------------------------------------------------------------------------
 * دستور مالک (اولاً): هم‌ارزی کاشی تطبیق با فایل‌یابی:
 *   ۱) الگوریتم جست‌وجوی هوشمند (نرمال‌سازی فارسی)
 *   ۲) بندبندی سه‌گانهٔ نتایج (شکار/پیگیری/بررسی)
 *   ۳) تحلیل هوشمند امتیازدهی + پیش‌بینی هوشمند دلایل احتمالی رد + پیشنهاد تصمیم
 *   ۴) خلاصهٔ هوشمند ایجنت
 */

import { describe, expect, test } from "bun:test";
import {
  normFa,
  bucketOf,
  bucketCounts,
  decisionSuggestion,
  analyzeMatchScoring,
  predictMatchRejectionReasons,
  matchSummary,
  enrichMatchResult,
  MATCH_BUCKET_STYLES,
  FOLLOW_THRESHOLD,
} from "@/core/matching/match-analysis";
import { ALERT_SCORE_THRESHOLD, type MatchCandidate, type MatchResult } from "@/core/matching/matching-engine";

/** کاندیدای آزمونی سازنده */
function cand(partial: Partial<MatchCandidate> & { score: number }): MatchCandidate {
  return {
    requestId: "r-test",
    hardPassed: true,
    reasons: [
      { factor: "فاصله قیمت", value: 1, weight: 0.25, note: "بازهٔ 100-200" },
      { factor: "نزدیکی جغرافیایی", value: 1, weight: 0.15, note: "ولیعصر" },
      { factor: "تناسب متراژ", value: 1, weight: 0.2, note: "80-100 متر" },
      { factor: "تازگی آگهی", value: 1, weight: 0.15, note: "3 روز" },
      { factor: "سابقه کارشناس", value: 1, weight: 0.1, note: "12 معامله" },
      { factor: "تطابق نوع ملک", value: 1, weight: 0.15, note: "آپارتمان" },
    ],
    hardFilterNotes: ["تلاقی قیمت ✓"],
    signalCoverage: 1,
    ...partial,
  };
}

describe("PN-014 — ۱: الگوریتم جست‌وجوی هوشمند (نرمال‌سازی عین فایل‌یابی)", () => {
  test("۱-۱: ارقام فارسی و عربی به لاتین", () => {
    expect(normFa("۵۹۱۱۵")).toBe("59115");
    expect(normFa("٥٩١١٥")).toBe("59115");
  });
  test("۱-۲: آ/أ/إ هم‌ارز ا و حذف فاصله/نیم‌فاصله", () => {
    expect(normFa("آپارتمان أوج")).toBe("اپارتماناوج");
    expect(normFa("خانه\u200cویلا")).toBe("خانهویلا");
  });
  test("۱-۳: جست‌وجوی زیررشته‌ای پس از نرمال‌سازی", () => {
    const rows = [{ t: "خرید آپارتمان ۸۰ متری ولیعصر" }, { t: "فروش ویلا" }];
    // واژهٔ پیوسته پس از نرمال‌سازی — حتی با فاصله/نیم‌فاصله در متن اصلی
    expect(rows.some((r) => normFa(r.t).includes(normFa("اپارتمان")))).toBe(true);
    expect(rows.some((r) => normFa(r.t).includes(normFa("ولیعصر")))).toBe(true);
    expect(rows.some((r) => normFa(r.t).includes(normFa("ویلا")))).toBe(true);
    expect(rows.some((r) => normFa(r.t).includes(normFa("آپارتمان")))).toBe(true); // آ → ا
    expect(rows.some((r) => normFa(r.t).includes(normFa("زمین")))).toBe(false);
  });
});

describe("PN-014 — ۲: بندبندی سه‌گانهٔ نتایج", () => {
  test("۲-۱: آستانه‌ها — شکار = آستانهٔ فرصت موتور (۰٫۷) · پیگیری ۰٫۵", () => {
    expect(ALERT_SCORE_THRESHOLD).toBe(0.7);
    expect(FOLLOW_THRESHOLD).toBe(0.5);
    expect(bucketOf(0.7)).toBe("hunt");
    expect(bucketOf(0.95)).toBe("hunt");
    expect(bucketOf(0.69)).toBe("follow");
    expect(bucketOf(0.5)).toBe("follow");
    expect(bucketOf(0.49)).toBe("review");
    expect(bucketOf(0)).toBe("review");
  });
  test("۲-۲: شمارش بندها", () => {
    const counts = bucketCounts([{ score: 0.9 }, { score: 0.75 }, { score: 0.6 }, { score: 0.3 }, { score: 0.2 }]);
    expect(counts.hunt).toBe(2);
    expect(counts.follow).toBe(1);
    expect(counts.review).toBe(2);
  });
  test("۲-۳: استایل سه بند — همان خانوادهٔ سطل‌های فایل‌یابی (زمرد/کهربا/خنثی)", () => {
    expect(MATCH_BUCKET_STYLES.hunt.label).toBe("شکار");
    expect(MATCH_BUCKET_STYLES.follow.label).toBe("پیگیری");
    expect(MATCH_BUCKET_STYLES.review.label).toBe("بررسی");
    expect(MATCH_BUCKET_STYLES.hunt.chip).toContain("teal");
    expect(MATCH_BUCKET_STYLES.follow.chip).toContain("amber");
  });
});

describe("PN-014 — ۳: پیشنهاد تصمیم هوشمند", () => {
  test("۳-۱: چهار سطح اقدام", () => {
    expect(decisionSuggestion(0.9).level).toBe("contact-now");
    expect(decisionSuggestion(0.85).level).toBe("contact-now");
    expect(decisionSuggestion(0.8).level).toBe("priority");
    expect(decisionSuggestion(0.7).level).toBe("priority");
    expect(decisionSuggestion(0.6).level).toBe("follow-up");
    expect(decisionSuggestion(0.4).level).toBe("manual-review");
  });
  test("۳-۲: هر سطح عنوان و راهنمای غیرخالی دارد", () => {
    for (const s of [0.9, 0.75, 0.55, 0.3]) {
      const d = decisionSuggestion(s);
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.hint.length).toBeGreaterThan(5);
    }
  });
});

describe("PN-014 — ۴: تحلیل هوشمند امتیازدهی", () => {
  test("۴-۱: شش عامل با برچسب/رنگ/سهم", () => {
    const a = analyzeMatchScoring(cand({ score: 1 }));
    expect(a.length).toBe(6);
    expect(a.map((x) => x.label)).toEqual(["فاصله قیمت", "نزدیکی جغرافیایی", "تناسب متراژ", "تازگی آگهی", "سابقه کارشناس", "تطابق نوع ملک"]);
    for (const f of a) {
      expect(f.tone).toBeDefined();
      expect(f.contribution).toBeCloseTo(f.value * f.weight, 5);
    }
  });
  test("۴-۲: عامل خنثی ۰٫۵ بدون شاهد — علامت‌گذاری صداقت سیگنال", () => {
    const a = analyzeMatchScoring(cand({
      score: 0.5,
      reasons: [
        { factor: "فاصله قیمت", value: 0.5, weight: 0.25, note: "بدون بازهٔ قیمت (خنثی)" },
        { factor: "تازگی آگهی", value: 1, weight: 0.15, note: "2 روز" },
      ],
    }));
    expect(a[0].evidenceBacked).toBe(false);
    expect(a[1].evidenceBacked).toBe(true);
  });
});

describe("PN-014 — ۵: پیش‌بینی هوشمند دلایل احتمالی رد", () => {
  test("۵-۱: کاندیدای ضعیف چند دلیل ریسکی می‌گیرد، مرتب نزولی", () => {
    const p = predictMatchRejectionReasons(cand({
      score: 0.35,
      signalCoverage: 0.3,
      reasons: [
        { factor: "فاصله قیمت", value: 0.2, weight: 0.25, note: "بازهٔ 100-200" },
        { factor: "نزدیکی جغرافیایی", value: 0.3, weight: 0.15, note: "ابوریحان" },
        { factor: "تازگی آگهی", value: 0.1, weight: 0.15, note: "45 روز" },
        { factor: "تطابق نوع ملک", value: 0, weight: 0.15, note: "مغازه" },
      ],
    }));
    const keys = p.map((x) => x.key);
    expect(keys).toContain("price-off");
    expect(keys).toContain("geo-out");
    expect(keys).toContain("stale");
    expect(keys).toContain("type-mismatch");
    expect(keys).toContain("thin-signal");
    expect(keys).toContain("other"); // دلیل باز همیشه هست — عین الگوی فایل‌یابی
    for (let i = 1; i < p.length; i++) expect(p[i - 1].likely).toBeGreaterThanOrEqual(p[i].likely);
  });
  test("۵-۲: کاندیدای عالی فقط دلایل پایهٔ کم‌احتمال دارد", () => {
    const p = predictMatchRejectionReasons(cand({ score: 0.95 }));
    const risky = p.filter((x) => x.likely >= 40 && !["already-dealt", "customer-changed-mind", "visit-needed", "other"].includes(x.key));
    expect(risky.length).toBe(0);
    expect(p.length).toBeGreaterThanOrEqual(4); // چهار دلیل پایهٔ همیشگی
  });
  test("۵-۳: قیمت نامعلوم → پیش‌بینی مذاکرهٔ مبهم", () => {
    const p = predictMatchRejectionReasons(cand({
      score: 0.6,
      reasons: [{ factor: "فاصله قیمت", value: 0.5, weight: 0.25, note: "بدون بازهٔ قیمت (خنثی)" }],
    }));
    expect(p.some((x) => x.key === "no-price-range")).toBe(true);
  });
});

describe("PN-014 — ۶: خلاصهٔ هوشمند ایجنت", () => {
  test("۶-۱: تیتر شکار وقتی گزینهٔ بالای ۰٫۷ هست", () => {
    const s = matchSummary({
      candidates: [cand({ score: 0.8 }), cand({ score: 0.6 }), cand({ score: 0.3 })],
      weightsSource: "learned",
      weightsFeedbackCount: 7,
    });
    expect(s.buckets.hunt).toBe(1);
    expect(s.buckets.follow).toBe(1);
    expect(s.buckets.review).toBe(1);
    expect(s.headline).toContain("آستانهٔ فرصت");
    expect(s.weightsHint).toContain("۷");
  });
  test("۶-۲: بدون گزینه → تیتر صادقانهٔ خالی", () => {
    const s = matchSummary({ candidates: [], weightsSource: "base" });
    expect(s.headline).toContain("هیچ تطبیق");
    expect(s.weightsHint).toContain("پایه");
  });
});

describe("PN-014 — ۷: غنی‌سازی سرتاسری (قرارداد سرو)", () => {
  test("۷-۱: هر کاندیدا بند/تصمیم/تحلیل/پیش‌بینی می‌گیرد", () => {
    const result: MatchResult = {
      direction: "listing_to_request",
      listingCode: "L1",
      requestId: null,
      candidates: [
        { ...cand({ score: 0.8 }), listingCode: "L1", requestLabel: "خرید آپارتمان ولیعصر" },
        { ...cand({ score: 0.55, requestId: "r2", signalCoverage: 0.4 }), requestLabel: "خرید ویلا" },
      ],
      weightsUsed: { priceDistance: 0.25, geoProximity: 0.15, meterageFit: 0.2, freshness: 0.15, expertHistory: 0.1, propertyTypeMatch: 0.15, roomsFit: 0.05, floorFit: 0.04, buildAgeFit: 0.04 },
      tier: 3,
      evaluatedAt: new Date().toISOString(),
      weightsSource: "base",
    };
    const { candidates, summary } = enrichMatchResult(result);
    expect(candidates[0].bucket).toBe("hunt");
    expect(candidates[1].bucket).toBe("follow");
    for (const c of candidates) {
      expect(c.decision.level).toBeDefined();
      expect(c.analysis.length).toBeGreaterThan(0);
      expect(c.predictions.length).toBeGreaterThanOrEqual(4);
    }
    expect(summary.buckets.hunt + summary.buckets.follow + summary.buckets.review).toBe(2);
  });
});
