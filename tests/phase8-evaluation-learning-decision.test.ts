/**
 * تست‌های بازسازی PHASE 8 — بدنهٔ موتورهای Evaluation + Learning + Decision
 * ------------------------------------------------------
 * §۴ EvaluationEngine (ریاضیات صادقانه: Brier/کالیبراسیون/Lift/حکم)
 * §۵ LearningEngine (نسخهٔ سیاست از سیگنال بازخورد + پیامد)
 * §۶ DecisionEngine (رتبه‌بندی قابل‌توضیح + مشورت ایمنی + candidateMeta)
 * اجرا: bun test tests/phase8-evaluation-learning-decision.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  brierScore,
  calibrationBuckets,
  liftVersusBaseRate,
  verdictFromLift,
  resolveObserved,
  createEvaluationEngine,
  MIN_SAMPLE,
} from "@/core/intelligence/evaluation/evaluation-engine";
import {
  createLearningEngine,
  clampWeightMirror,
  WEIGHT_STEP,
  DEFAULT_OUTCOME_BATCH_THRESHOLD,
  type LearningPolicyPort,
} from "@/core/intelligence/learning/learning-engine";
import { clampWeight } from "@/core/agent/policy";
import {
  createDecisionEngine,
  scoreCandidate,
  candidateProbability,
  SEVERITY_MULTIPLIERS,
} from "@/core/intelligence/decision/decision-engine";
import type { PredictionRecord } from "@/core/intelligence/prediction/prediction-record";
import type { OutcomeRecord } from "@/core/intelligence/engines/outcome";

const NOW = new Date("2026-09-29T12:00:00.000Z");

/* ==========================================================================
 * §۴ — EvaluationEngine (پایان «پیش‌بینی بدون داوری»)
 * ========================================================================== */

describe("PHASE 8 §۴ — EvaluationEngine", () => {
  test("۴-۱) Brier دستی — mean((p−o)²) با محاسبهٔ کاغذی", () => {
    // (0.8,1): (−0.2)²=0.04 · (0.4,0): (0.4)²=0.16 → میانگین 0.1
    expect(brierScore([{ p: 0.8, o: 1 }, { p: 0.4, o: 0 }])).toBeCloseTo(0.1, 12);
    expect(brierScore([{ p: 1, o: 1 }])).toBe(0); // پیش‌بینی کامل
    expect(brierScore([{ p: 1, o: 0 }])).toBe(1); // بدترین حالت
    expect(Number.isNaN(brierScore([]))).toBe(true);
  });

  test("۴-۲) Lift دستی نسبت به پیش‌بین نرخ پایه — محاسبهٔ کاغذی", () => {
    // پایه = 0.5 → Brier خط پایه = mean((0.5−1)²,(0.5−0)²) = 0.25
    // مدل = 0.1 → lift = (0.25−0.1)/0.25 = 0.6
    expect(liftVersusBaseRate([{ p: 0.8, o: 1 }, { p: 0.4, o: 0 }])).toBeCloseTo(0.6, 12);
    // مدل عین خط پایه ⇔ lift = 0
    expect(liftVersusBaseRate([{ p: 0.5, o: 1 }, { p: 0.5, o: 0 }])).toBeCloseTo(0, 12);
    // همهٔ پیامدها یک‌سان ⇔ مرجع بی‌معنا ⇔ NaN (صداقت)
    expect(Number.isNaN(liftVersusBaseRate([{ p: 0.3, o: 1 }]))).toBe(true);
  });

  test("۴-۳) سطل‌بندی کالیبراسیون — ۵ سطل مساوی با میانگین‌ها", () => {
    const buckets = calibrationBuckets([
      { p: 0.1, o: 0 }, { p: 0.15, o: 0 }, { p: 0.5, o: 1 }, { p: 0.95, o: 1 },
    ]);
    expect(buckets.length).toBe(5);
    expect(buckets[0]!.bucket).toBe("0.0-0.2");
    expect(buckets[0]!.predicted).toBeCloseTo(0.125, 3);
    expect(buckets[0]!.observed).toBe(0);
    expect(buckets[2]!.predicted).toBeCloseTo(0.5, 3);
    expect(buckets[2]!.observed).toBe(1);
    expect(buckets[4]!.observed).toBe(1);
    // سطل خالی = صفرهای صادقانه
    expect(buckets[1]!.predicted).toBe(0);
    expect(buckets[3]!.observed).toBe(0);
  });

  test("۴-۴) آینهٔ محلی clampWeight هم‌ارز نسخهٔ مرجع لایهٔ ایجنت (گارد پل P3-06)", () => {
    for (const w of [-5, 0, 0.29, 0.3, 0.87, 1, 1.79, 1.8, 2.5, 100, 0.123456]) {
      expect(clampWeightMirror(w)).toBe(clampWeight(w));
    }
  });

  test("۴-۵) حکم صادقانه — ناحیهٔ خنثی ±۰٫۰۲ و حداقل نمونه", () => {
    expect(verdictFromLift(0.01, 200, MIN_SAMPLE)).toBe("AT_BASELINE");
    expect(verdictFromLift(-0.01, 200, MIN_SAMPLE)).toBe("AT_BASELINE");
    expect(verdictFromLift(0.03, 200, MIN_SAMPLE)).toBe("ABOVE_BASELINE");
    expect(verdictFromLift(-0.03, 200, MIN_SAMPLE)).toBe("BELOW_BASELINE");
    expect(verdictFromLift(0.5, 50, MIN_SAMPLE)).toBe("INSUFFICIENT_DATA"); // نمونهٔ ناکافی = بدون ادعا
  });

  test("۴-۶) resolveObserved — شاهد عددی مرجع، توکن قراردادی، تحلیل‌ناپذیر = null", () => {
    expect(resolveObserved({ tileId: "t", outcome: "X", occurredAt: NOW.toISOString(), evidence: { observed: 1 } })).toBe(1);
    expect(resolveObserved({ tileId: "t", outcome: "X", occurredAt: NOW.toISOString(), evidence: { observed: 0 } })).toBe(0);
    expect(resolveObserved({ tileId: "t", outcome: "X", occurredAt: NOW.toISOString(), evidence: { observed: true } })).toBe(1);
    expect(resolveObserved({ tileId: "t", outcome: "sold", occurredAt: NOW.toISOString() })).toBe(1);
    expect(resolveObserved({ tileId: "t", outcome: "NOT_OCCURRED", occurredAt: NOW.toISOString() })).toBe(0);
    expect(resolveObserved({ tileId: "t", outcome: "اتفاق مبهم", occurredAt: NOW.toISOString() })).toBeNull();
  });

  function pairPrediction(i: number, p: number, linked = true): PredictionRecord {
    return {
      predictionId: `pred-${i}`,
      predictionType: "PROPERTY",
      probability: p,
      confidence: 0.6,
      drivers: [],
      risks: [],
      assumptions: [],
      modelVersion: "property-predictor-v0.1",
      featureVersion: "property-features-v1",
      contextSnapshot: {
        agentId: "a", tileId: "arm-listing", entityId: `e${i}`, entityType: "property",
        capturedAt: NOW, features: {},
      },
      createdAt: NOW,
      linkedOutcomeId: linked ? `out-${i}` : undefined,
      payload: {},
    };
  }
  function pairOutcome(i: number, observed: 0 | 1): OutcomeRecord {
    return {
      tileId: "arm-listing",
      predictionId: `pred-${i}`,
      outcome: observed === 1 ? "TRANSACTION_OCCURRED" : "NOT_OCCURRED",
      occurredAt: NOW.toISOString(),
      evidence: { observed },
    };
  }

  test("۴-۷) evaluate — جفت‌سازی پیش‌بینی↔پیامد + پنجرهٔ زمانی + حذف تحلیل‌ناپذیر", async () => {
    const predictions: PredictionRecord[] = [];
    const outcomes: OutcomeRecord[] = [];
    // ۱۰ جفت کامل + ۱ پیش‌بینی بدون پیامد + ۱ پیامد قدیمی (بیرون پنجره)
    for (let i = 0; i < 10; i++) {
      predictions.push(pairPrediction(i, 0.3 + i * 0.04));
      outcomes.push(pairOutcome(i, i % 2 === 0 ? 1 : 0));
    }
    predictions.push(pairPrediction(90, 0.5)); // بدون پیامد
    predictions.push(pairPrediction(91, 0.5));
    outcomes.push({
      tileId: "arm-listing", predictionId: "pred-91", outcome: "OLD", occurredAt: "2020-01-01T00:00:00.000Z",
      evidence: { observed: 1 },
    });

    const engine = createEvaluationEngine({
      predictions: { list: async () => predictions },
      outcomes: { query: async (q) => outcomes.filter((o) => o.predictionId === q.predictionId && (!q.since || o.occurredAt >= q.since)) },
      minSample: 5, // برای این تست کوچک
      now: () => NOW,
    });
    const report = await engine.evaluate({ tileId: "arm-listing", windowDays: 365 });
    expect(report.sampleSize).toBe(10); // pred-90 حذف؛ pred-91 پیامد بیرون پنجره
    expect(report.windowDays).toBe(365);
    expect(typeof report.brierScore).toBe("number");
    expect(report.calibration!.length).toBe(5);
    expect(typeof report.lift).toBe("number");
    expect(report.verdict === "ABOVE_BASELINE" || report.verdict === "AT_BASELINE" || report.verdict === "BELOW_BASELINE").toBe(true);
  });

  test("۴-۸) نمونهٔ زیر حداقل ⇒ INSUFFICIENT_DATA بدون هیچ عددی (قانون H)", async () => {
    const engine = createEvaluationEngine({
      predictions: { list: async () => [pairPrediction(1, 0.6)] },
      outcomes: { query: async () => [pairOutcome(1, 1)] },
      minSample: 100,
      now: () => NOW,
    });
    const report = await engine.evaluate({ tileId: "arm-listing" });
    expect(report.sampleSize).toBe(1);
    expect(report.verdict).toBe("INSUFFICIENT_DATA");
    expect(report.brierScore).toBeUndefined();
    expect(report.lift).toBeUndefined();
    expect(report.calibration).toBeUndefined();
  });
});

/* ==========================================================================
 * §۵ — LearningEngine (یادگیری حلقه‌بسته)
 * ========================================================================== */

describe("PHASE 8 §۵ — LearningEngine", () => {
  interface PolicyState {
    versions: { tileId: string; version: number; content: string; rationale: string; active: boolean; activatedAt: Date | null }[];
  }

  function makePolicy(state: PolicyState, activeContent = JSON.stringify({ weights: { VOLUME: 1, REGION: 0.8 }, maxInsights: 6 })): LearningPolicyPort {
    return {
      findActive: async (tileId) => {
        const v = state.versions.find((x) => x.tileId === tileId && x.active);
        return v ? { content: v.content, version: v.version, activatedAt: v.activatedAt?.toISOString() ?? null } : null;
      },
      findLatest: async (tileId) => {
        const v = state.versions.filter((x) => x.tileId === tileId).pop();
        return v ? { version: v.version } : null;
      },
      createVersion: async (input) => {
        state.versions.push({
          tileId: input.tileId, version: input.version, content: input.content,
          rationale: input.rationale, active: input.active, activatedAt: input.activatedAt,
        });
        return input;
      },
      activateVersion: async (tileId, version) => {
        for (const v of state.versions) if (v.tileId === tileId) v.active = v.version === version;
      },
    };
  }

  function seedActive(state: PolicyState) {
    state.versions.push({
      tileId: "arm-listing", version: 1, content: JSON.stringify({ weights: { VOLUME: 1, REGION: 0.8 }, maxInsights: 6 }),
      rationale: "initial", active: true, activatedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
  }

  test("۵-۱) بدون سیاست فعال ⇒ updated=false با rationale صریح (LRN-004)", async () => {
    const state: PolicyState = { versions: [] };
    const engine = createLearningEngine({
      policy: makePolicy(state),
      feedback: { countSince: async () => 5 },
      outcomes: { countSince: async () => 50 },
    });
    const r = await engine.learn({ tileId: "arm-listing", trigger: "MANUAL" });
    expect(r.updated).toBe(false);
    expect(r.newVersion).toBeNull();
    expect(r.rationale).toContain("LRN-004");
  });

  test("۵-۲) OUTCOME_BATCH زیر آستانه ⇒ بدون نسخهٔ جدید (LRN-001)", async () => {
    const state: PolicyState = { versions: [] };
    seedActive(state);
    const engine = createLearningEngine({
      policy: makePolicy(state),
      feedback: { countSince: async () => 0 },
      outcomes: { countSince: async () => DEFAULT_OUTCOME_BATCH_THRESHOLD - 1 },
    });
    const r = await engine.learn({ tileId: "arm-listing", trigger: "OUTCOME_BATCH" });
    expect(r.updated).toBe(false);
    expect(r.signalBreakdown.outcomeSignals).toBe(DEFAULT_OUTCOME_BATCH_THRESHOLD - 1);
    expect(state.versions.length).toBe(1); // هیچ نسخهٔ جدیدی ساخته نشد
  });

  test("۵-۳) ارزیابی ABOVE_BASELINE ⇒ نسخهٔ جدید + فعال + وزن دامنه +۰٫۰۵ (LRN-002/003)", async () => {
    const state: PolicyState = { versions: [] };
    seedActive(state);
    const engine = createLearningEngine({
      policy: makePolicy(state),
      feedback: { countSince: async () => 3 },
      outcomes: { countSince: async () => 300 },
      evaluation: async () => ({ verdict: "ABOVE_BASELINE", domain: "VOLUME", sampleSize: 300 }),
      defaultDomain: "VOLUME",
    });
    const r = await engine.learn({ tileId: "arm-listing", trigger: "OUTCOME_BATCH" });
    expect(r.updated).toBe(true);
    expect(r.newVersion).toBe(2);
    expect(r.signalBreakdown).toEqual({ feedbackSignals: 3, outcomeSignals: 300 });
    const created = state.versions.find((v) => v.version === 2)!;
    expect(created.active).toBe(true);
    const content = JSON.parse(created.content);
    expect(content.weights.VOLUME).toBeCloseTo(1 + WEIGHT_STEP, 10);
    expect(content.weights.REGION).toBe(0.8); // دامنهٔ دیگر دست‌نخورده
    expect(created.rationale).toContain("OUTCOME_BATCH");
  });

  test("۵-۴) ارزیابی BELOW_BASELINE ⇒ کاهش وزن (−۰٫۰۵) با سقف/کف clamp", async () => {
    const state: PolicyState = { versions: [] };
    state.versions.push({
      tileId: "arm-listing", version: 7,
      content: JSON.stringify({ weights: { VOLUME: 1.79, REGION: 0.31 }, maxInsights: 6 }),
      rationale: "x", active: true, activatedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    const engine = createLearningEngine({
      policy: makePolicy(state),
      feedback: { countSince: async () => 1 },
      outcomes: { countSince: async () => 30 },
      evaluation: async () => ({ verdict: "BELOW_BASELINE", domain: "VOLUME", sampleSize: 120 }),
      defaultDomain: "VOLUME",
    });
    const r = await engine.learn({ tileId: "arm-listing", trigger: "OUTCOME_BATCH" });
    expect(r.updated).toBe(true);
    expect(r.newVersion).toBe(8);
    const content = JSON.parse(state.versions.find((v) => v.version === 8)!.content);
    expect(content.weights.VOLUME).toBe(1.74); // 1.79 − 0.05 (کاهش — ارزیابی BELOW)
    // دوباره با BELOW → باز هم پایین می‌آید (تا کف 0.3)
    const r2 = await engine.learn({ tileId: "arm-listing", trigger: "OUTCOME_BATCH" });
    expect(r2.updated).toBe(true);
    const c2 = JSON.parse(state.versions.find((v) => v.version === 9)!.content);
    expect(c2.weights.VOLUME).toBeCloseTo(1.74 - WEIGHT_STEP, 10);
  });

  test("۵-۵) AT_BASELINE ⇒ نسخهٔ پایش بدون تغییر وزن (شفافیت چرخه)", async () => {
    const state: PolicyState = { versions: [] };
    seedActive(state);
    const engine = createLearningEngine({
      policy: makePolicy(state),
      feedback: { countSince: async () => 2 },
      outcomes: { countSince: async () => 40 },
      evaluation: async () => ({ verdict: "AT_BASELINE", domain: "VOLUME", sampleSize: 150 }),
      defaultDomain: "VOLUME",
    });
    const r = await engine.learn({ tileId: "arm-listing", trigger: "SCHEDULED" });
    expect(r.updated).toBe(true);
    const content = JSON.parse(state.versions.find((v) => v.version === 2)!.content);
    expect(content.weights.VOLUME).toBe(1); // بدون تغییر
    expect(state.versions.find((v) => v.version === 2)!.rationale).toContain("حفظ وزن");
  });

  test("۵-۶) FEEDBACK_THRESHOLD زیر آستانه ⇒ بدون نسخه؛ MANUAL با حداقل یک سیگنال ⇒ نسخه", async () => {
    const state: PolicyState = { versions: [] };
    seedActive(state);
    const engine = createLearningEngine({
      policy: makePolicy(state),
      feedback: { countSince: async () => 2 },
      outcomes: { countSince: async () => 0 },
    });
    const r1 = await engine.learn({ tileId: "arm-listing", trigger: "FEEDBACK_THRESHOLD" });
    expect(r1.updated).toBe(false);
    const r2 = await engine.learn({ tileId: "arm-listing", trigger: "MANUAL" });
    expect(r2.updated).toBe(true); // حداقل یک سیگنال (۲ بازخورد) کافی است
  });
});

/* ==========================================================================
 * §۶ — DecisionEngine
 * ========================================================================== */

describe("PHASE 8 §۶ — DecisionEngine", () => {
  const ctx = { tileId: "arm-listing", generatedAt: NOW.toISOString(), purpose: "action" as const };
  const policy = { weights: { listing: 1.5, experts: 0.5 }, maxInsights: 6 };

  test("۶-۱) فرمول امتیاز — وزن × شدت × (1 + 0.5×احتمال) با محاسبهٔ کاغذی", () => {
    expect(scoreCandidate(
      { key: "k", domain: "listing", severity: "critical", prediction: undefined, metadata: {} },
      1.5,
    )).toBeCloseTo(1.5 * 3 * (1 + 0.5 * 0.5), 3); // پیش‌بینی نداریم ⇔ ۰٫۵ خنثی
    expect(scoreCandidate(
      {
        key: "k", domain: "listing", severity: "warning",
        prediction: { id: "p", tileId: "t", target: "x", predictedValue: 0.8, unit: "probability", confidence: 0.5, horizonDays: 30, modelVersion: "v", rationale: "r", computedAt: NOW.toISOString() },
        metadata: {},
      },
      1,
    )).toBeCloseTo(1 * 2 * (1 + 0.5 * 0.8), 3);
    expect(SEVERITY_MULTIPLIERS.critical).toBe(3);
  });

  test("۶-۲) candidateProbability — فقط unit=probability؛ در غیر این صورت خنثی صادقانه", () => {
    expect(candidateProbability(undefined)).toBe(0.5);
    expect(candidateProbability({ id: "p", tileId: "t", target: "x", predictedValue: 0.9, unit: "probability", confidence: 0.5, horizonDays: 30, modelVersion: "v", rationale: "r", computedAt: NOW.toISOString() })).toBe(0.9);
    expect(candidateProbability({ id: "p", tileId: "t", target: "x", predictedValue: 900, unit: "toman", confidence: 0.5, horizonDays: 30, modelVersion: "v", rationale: "r", computedAt: NOW.toISOString() })).toBe(0.5);
  });

  test("۶-۳) رتبه‌بندی نزولی پایدار + topKey + rationale قابل‌توضیح", async () => {
    const engine = createDecisionEngine();
    const result = await engine.decide({
      context: ctx,
      policy,
      candidates: [
        { key: "low", domain: "experts", severity: "info", metadata: {} },
        { key: "high", domain: "listing", severity: "critical", metadata: {} },
        { key: "mid", domain: "listing", severity: "warning", metadata: {} },
      ],
    });
    expect(result.ranked.map((r) => r.key)).toEqual(["high", "mid", "low"]);
    expect(result.topKey).toBe("high");
    expect(result.ranked[0]!.score).toBeGreaterThan(result.ranked[1]!.score);
    expect(result.ranked[0]!.rationale).toContain("وزن دامنه 1.5");
    expect(result.appliedRuleIds).toContain("DEC-001");
  });

  test("۶-۴) مشورت ایمنی — نامزد خارجی ⇒ requiresApproval؛ candidateMeta منتقل می‌شود", async () => {
    const engine = createDecisionEngine();
    const result = await engine.decide({
      context: ctx,
      policy,
      candidates: [
        { key: "sms", domain: "listing", severity: "warning", metadata: { affectsExternalSystem: true } },
        { key: "safe", domain: "listing", severity: "warning", metadata: {} },
      ],
    });
    const byKey = Object.fromEntries(result.ranked.map((r) => [r.key, r]));
    expect(byKey.sms!.requiresApproval).toBe(true);
    expect(byKey.safe!.requiresApproval).toBe(false);
    const meta = (result as { candidateMeta?: Record<string, Record<string, unknown>> }).candidateMeta!;
    expect(meta.sms!.affectsExternalSystem).toBe(true);
    expect(meta.safe!.domain).toBe("listing");
    expect(result.appliedRuleIds).toContain("DEC-002");
  });

  test("۶-۵) تساوی امتیاز = ترتیب ورود (پایداری قطعی)", async () => {
    const engine = createDecisionEngine();
    const result = await engine.decide({
      context: ctx,
      policy: { weights: {}, maxInsights: 6 },
      candidates: [
        { key: "a", domain: "x", severity: "info", metadata: {} },
        { key: "b", domain: "y", severity: "info", metadata: {} },
        { key: "c", domain: "z", severity: "info", metadata: {} },
      ],
    });
    expect(result.ranked.map((r) => r.key)).toEqual(["a", "b", "c"]);
  });
});
