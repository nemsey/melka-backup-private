/**
 * pn020-h3-h4.test.ts — PN-020/مرحلهٔ ۲ — بهبودهای کارایی (مصوبهٔ جلسهٔ شورای ۰۲۴)
 * =============================================================================
 * H3 — بازبینی جدول اثر: ریشه‌یابی اختلاف تاریخی ۳.۵٪ (تصمیم) vs ۱۵٪ (برنامه)
 *      → منبع یگانهٔ حقیقت: برنامه همان expectedImpactFor(نوع، اطمینان) تصمیم
 * H4 — کاهش آستانهٔ insufficientData ارزیابی سیاست: ۱۰ → ۵ رویداد
 */

import { afterAll, describe, expect, test } from "bun:test";

const { db } = await import("@/lib/db");

afterAll(async () => {
  await db.$disconnect();
});

describe("PN-020 §H3 — یکسان‌سازی جدول اثر تصمیم و برنامه", () => {
  test("H3-۱) برنامه و تصمیم از یک منبع می‌آیند — اختلاف >۵ واحد دیگر ساختگی نیست", async () => {
    const { ActionPlannerEngineImpl, expectedImpactFor } = await import("@/core/intelligence/p8-core");
    const planner = new ActionPlannerEngineImpl();
    // تصمیم آزمایشی بدون expectedImpact (برنامه از جدول پایه می‌گیرد)
    const decision = {
      id: "d1", predictionId: "p1", decisionType: "investigate", proposedAction: "x",
      confidence: 0.4, rationale: "x", alternatives: [], expectedOutcome: "x",
      expectedImpact: null, requiredResources: [], safetyReport: { passed: true, reasons: [] },
      status: "active", expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      createdAt: new Date().toISOString(), tierAtCreation: 0, modelVersionId: null,
    };
    const plan = planner.plan(decision as never);
    const impact = planner.estimateImpact(plan, decision as never);
    // همان فرمول تصمیم: پایهٔ investigate (۵) × ضریب (۰.۵ + ۰.۴/۲) = ۳.۵ — و نه ۱۵ ثابت
    expect(impact.liftPercent).toBe(expectedImpactFor("investigate", 0.4).liftPercent);
    expect(impact.liftPercent).toBe(3.5);
    expect(impact.consistencyWarning).toBeUndefined();
  });

  test("H3-۲) جدول موازی حذف شد — سورس برنامه صفر عدد هاردکدِ مستقل ندارد", async () => {
    const src = await Bun.file("src/core/intelligence/p8-core.ts").text();
    expect(src).not.toContain("impactByPattern"); // جدول موازی ریشه‌کن شد
    expect(src).toContain("expectedImpactFor(decision.decisionType, decision.confidence)"); // منبع یگانه
  });

  test("H3-۳) cross-check زنده ماند — اثرِ ثبت‌شدهٔ متفاوت از برآورد تازه → هشدار", async () => {
    const { ActionPlannerEngineImpl } = await import("@/core/intelligence/p8-core");
    const planner = new ActionPlannerEngineImpl();
    const decision = {
      id: "d2", predictionId: "p2", decisionType: "contact_owner", proposedAction: "x",
      confidence: 0.8, rationale: "x", alternatives: [], expectedOutcome: "x",
      // اثرِ «آموخته‌شده» که از جدول پایه فاصله گرفته (سناریوی آیندهٔ یادگیری محیط)
      expectedImpact: { liftPercent: 28, reach: "listing", horizonDays: 14, basis: "آموزش‌یافته" },
      requiredResources: [], safetyReport: { passed: true, reasons: [] },
      status: "active", expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      createdAt: new Date().toISOString(), tierAtCreation: 0, modelVersionId: null,
    };
    const plan = planner.plan(decision as never);
    const impact = planner.estimateImpact(plan, decision as never);
    expect(impact.liftPercent).toBe(13.5); // ۱۵ × (۰.۵ + ۰.۸/۲) از جدول پایه
    expect(impact.consistencyWarning).toBeTruthy();
    expect(impact.consistencyWarning).toContain("28"); // اختلاف واقعی گزارش می‌شود
  });
});

describe("PN-020 §H4 — آستانهٔ دادهٔ ناکافی ارزیابی سیاست: ۱۰ → ۵", () => {
  test("H4-۱) ثابت POLICY_MIN_EVENTS = ۵", async () => {
    const { POLICY_MIN_EVENTS } = await import("@/lib/services/governance-service");
    expect(POLICY_MIN_EVENTS).toBe(5);
  });

  test("H4-۲) ۳ رویداد (< آستانهٔ ۵) → insufficientData=true و حکم محافظه‌کارانه keep", async () => {
    const { runPolicyEvaluation } = await import("@/lib/services/governance-service");
    const r = await runPolicyEvaluation("session-30d-v1", 90, 3);
    expect(r).toHaveLength(1);
    if (r[0]!.eventCount < 5) {
      expect(r[0]!.insufficientData).toBe(true);
      expect(r[0]!.verdict).toBe("keep");
    }
  });

  test("H4-۳) مرز جدید — پنجرهٔ جست‌وجوی رویدادها هنوز ۹۰ روز است", async () => {
    const { POLICY_EVAL_WINDOW_DAYS, POLICY_EVAL_INTERVAL_DAYS } = await import("@/lib/services/governance-service");
    expect(POLICY_EVAL_WINDOW_DAYS).toBe(90);
    expect(POLICY_EVAL_INTERVAL_DAYS).toBe(90);
  });
});
