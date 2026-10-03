/**
 * PHASE 7 (سند ۰۲۷ §۲.۵) — تست‌های موتور یادگیری از نتیجه (≥ ۸۰ تست)
 * بخش ۱ Outcome (۲۰) · بخش ۲ Evaluation (۲۵) · بخش ۳ Learning (۲۵) · بخش ۴ حلقهٔ کامل (۱۰)
 */
import { describe, expect, test } from "bun:test";
import {
  DriftDetector,
  EvaluationEngineImpl,
  LearningEngineImpl,
  OutcomeEngineImpl,
  ShadowEvaluationFramework,
  tierFromRealData,
  type Pair,
  type RawOutcome,
  type RawPrediction,
} from "../src/core/intelligence/p7-core";
import { computeTier, tierProfile, type LearningPolicy, type OutcomeRecord } from "../src/core/intelligence/contracts-p7-p11";

/* دادهٔ معلوم برای تست ریاضی: ۶ جفت با احتمال و واقعیت مشخص */
const KNOWN: Array<{ predictedValue: number; observedValue: number }> = [
  { predictedValue: 0.8, observedValue: 1 },
  { predictedValue: 0.4, observedValue: 0 },
  { predictedValue: 0.6, observedValue: 1 },
  { predictedValue: 0.3, observedValue: 0 },
  { predictedValue: 0.9, observedValue: 1 },
  { predictedValue: 0.5, observedValue: 0 },
];

const policy = (tier: 0 | 1 | 2 | 3 | 4, over: Partial<LearningPolicy> = {}): LearningPolicy => ({
  id: "lp-test",
  modelId: "m1-listing-v0",
  version: "v1",
  strategy: "batch",
  learningRate: 0.05,
  updateWindowDays: 7,
  minSamplesPerUpdate: 3,
  driftThreshold: 0.05,
  status: "active_for_learning",
  requiresTier: tier,
  evidenceChain: [],
  ...over,
});

const samplePreds = (n: number): RawPrediction[] =>
  Array.from({ length: n }, (_, i) => ({
    predictionId: `pred-${i}`,
    probability: 0.3 + (i % 5) * 0.1,
    drivers: [
      { feature: "contactProbability", value: 0.5, contribution: 0.25, weight: 0.5 },
      { feature: "market.priceTrend30d", value: 0.2, contribution: 0.1, weight: 0.5 },
    ],
  }));

const sampleOutcomes = (preds: RawPrediction[]): RawOutcome[] =>
  preds.map((p, i) => ({
    predictionId: p.predictionId,
    outcome: "TRANSACTION_OCCURRED",
    occurredAt: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
    outcomeId: `out-${i}`,
    evidence: { observed: i % 2, status: i % 2 ? "معامله شده" : "منتشر شده", propertyCode: String(1000 + i) },
  }));

/* ═══════════ بخش ۱ — Outcome Engine (۲۰) ═══════════ */
describe("P7/بخش ۱ — Outcome Engine", () => {
  const engine = () => new OutcomeEngineImpl(3);
  const preds = samplePreds(12);
  const outs = sampleOutcomes(preds);

  test("۱-۱ ساختار OutcomeRecord: همهٔ فیلدهای قراردادی", () => {
    const recs = engine().collectOutcomes(preds, outs);
    expect(recs.length).toBe(12);
    for (const key of ["id", "predictionId", "predictionType", "predictedAt", "predictedValue", "observedAt", "observedValue", "timeWindowDays", "resolution", "rawPayloadJson", "evidenceChain", "tierAtObservation", "extractionBatchId", "extractedAt"]) {
      expect(key in recs[0]).toBe(true);
    }
  });
  test("۱-۲ predictionId ارجاع معتبر دارد", () => {
    const recs = engine().collectOutcomes(preds, outs);
    expect(recs.every((r) => r.predictionId.startsWith("pred-"))).toBe(true);
  });
  test("۱-۳ predictedValue در بازهٔ ۰-۱", () => {
    const recs = engine().collectOutcomes(preds, outs);
    expect(recs.every((r) => r.predictedValue >= 0 && r.predictedValue <= 1)).toBe(true);
  });
  test("۱-۴ observedValue دودویی است (۰ یا ۱)", () => {
    const recs = engine().collectOutcomes(preds, outs);
    expect(recs.every((r) => r.observedValue === 0 || r.observedValue === 1)).toBe(true);
  });
  test("۱-۵ resolution=success برای مشاهدهٔ ۱", () => {
    const recs = engine().collectOutcomes(preds, outs);
    expect(recs.filter((r) => r.observedValue === 1).every((r) => r.resolution === "success")).toBe(true);
  });
  test("۱-۶ resolution=failure برای مشاهدهٔ ۰", () => {
    const recs = engine().collectOutcomes(preds, outs);
    expect(recs.filter((r) => r.observedValue === 0).every((r) => r.resolution === "failure")).toBe(true);
  });
  test("۱-۷ اعتبارسنجی: پیامد بدون پیش‌بینی جمع نمی‌شود", () => {
    const recs = engine().collectOutcomes(preds, [...outs, { predictionId: "ghost", outcome: "X", occurredAt: "2026-09-01T00:00:00Z", evidence: { observed: 1 } }]);
    expect(recs.length).toBe(12);
  });
  test("۱-۸ ذخیره‌سازی و بازیابی: all() همان رکوردها را برمی‌گرداند", () => {
    const e = engine();
    e.collectOutcomes(preds, outs);
    expect(e.all().length).toBe(12);
  });
  test("۱-۹ findPendingPredictions: پیش‌بینی بدون نتیجه", () => {
    const e = engine();
    e.collectOutcomes(preds, outs.slice(0, 10));
    expect(e.findPendingPredictions().length).toBe(2);
  });
  test("۱-۱۰ getCoverage: درصد پوشش درست", () => {
    const e = engine();
    e.collectOutcomes(preds, outs.slice(0, 6));
    expect(e.getCoverage(12)).toBe(50);
  });
  test("۱-۱۱ getCoverage با صفر پیش‌بینی: صفر", () => {
    expect(engine().getCoverage(0)).toBe(0);
  });
  test("۱-۱۲ linkOutcome: اتصال موفق", () => {
    const e = engine();
    e.collectOutcomes(preds, outs);
    expect(e.linkOutcome("pred-0", "out-0")).toBe(true);
  });
  test("۱-۱۳ linkOutcome: اتصال نادرست رد می‌شود", () => {
    const e = engine();
    e.collectOutcomes(preds, outs);
    expect(e.linkOutcome("pred-1", "out-0")).toBe(false);
  });
  test("۱-۱۴ قانون دادهٔ مقدس: rawPayloadJson عین دادهٔ منبع", () => {
    const recs = engine().collectOutcomes(preds, outs);
    const raw = JSON.parse(recs[0].rawPayloadJson) as { outcome: RawOutcome };
    expect(raw.outcome.outcomeId).toBe("out-0");
  });
  test("۱-۱۵ زنجیرهٔ شاهد برای هر رکورد", () => {
    const recs = engine().collectOutcomes(preds, outs);
    expect(recs.every((r) => r.evidenceChain.length >= 1)).toBe(true);
  });
  test("۱-۱۶ tierAtObservation ثبت می‌شود", () => {
    const recs = new OutcomeEngineImpl(2).collectOutcomes(preds, outs);
    expect(recs[0].tierAtObservation).toBe(2);
  });
  test("۱-۱۷ extractionBatchId یکسان در یک دورهٔ جمع‌آوری", () => {
    const recs = engine().collectOutcomes(preds, outs);
    expect(new Set(recs.map((r) => r.extractionBatchId)).size).toBe(1);
  });
  test("۱-۱۸ پنجرهٔ زمانی: نتیجهٔ خارج از window کنار می‌رود", () => {
    const old = [...outs, { predictionId: preds[0].predictionId, outcome: "OLD", occurredAt: "2020-01-01T00:00:00Z", outcomeId: "out-old", evidence: { observed: 1 } }];
    const recs = new OutcomeEngineImpl(3).collectOutcomes([preds[0]], old.slice(-1), 365);
    expect(recs.length).toBe(0);
  });
  test("۱-۱۹ checkpoint continuation: دورهٔ دوم از همان انبار ادامه می‌یابد", () => {
    const e = engine();
    e.collectOutcomes(preds.slice(0, 6), outs.slice(0, 6));
    e.collectOutcomes(preds.slice(6), outs.slice(6));
    expect(e.all().length).toBe(12);
  });
  test("۱-۲۰ predictionType نرمال‌شده", () => {
    const recs = engine().collectOutcomes([{ ...preds[0], predictionType: "request" }], [outs[0]]);
    expect(recs[0].predictionType).toBe("request_match");
  });
});

/* ═══════════ بخش ۲ — Evaluation Engine (۲۵) ═══════════ */
describe("P7/بخش ۲ — Evaluation Engine", () => {
  const ev = new EvaluationEngineImpl();

  test("۲-۱ Brier با دادهٔ معلوم: (0.04+0.16+0.16+0.09+0.01+0.25)/6 = ۰٫۱۱۸۳", () => {
    expect(ev.computeBrierScore(KNOWN)).toBe(0.1183);
  });
  test("۲-۲ Brier مدل کامل: صفر", () => {
    expect(ev.computeBrierScore([{ predictedValue: 1, observedValue: 1 }, { predictedValue: 0, observedValue: 0 }])).toBe(0);
  });
  test("۲-۳ Brier مدل بدترین: ۱", () => {
    expect(ev.computeBrierScore([{ predictedValue: 1, observedValue: 0 }, { predictedValue: 0, observedValue: 1 }])).toBe(1);
  });
  test("۲-۴ Brier با ورودی خالی: NaN", () => {
    expect(Number.isNaN(ev.computeBrierScore([]))).toBe(true);
  });
  test("۲-۵ LogLoss مدل کامل نزدیک صفر", () => {
    expect(ev.computeLogLoss([{ predictedValue: 0.99, observedValue: 1 }])).toBeLessThan(0.02);
  });
  test("۲-۶ LogLoss مهار عددی در احتمال ۰ و ۱", () => {
    expect(Number.isFinite(ev.computeLogLoss([{ predictedValue: 0, observedValue: 1 }, { predictedValue: 1, observedValue: 0 }]))).toBe(true);
  });
  test("۲-۷ accuracy جهت‌دار", () => {
    expect(ev.computeAccuracy(KNOWN)).toBe(0.833);
  });
  test("۲-۸ کالیبراسیون: ۱۰ سطل", () => {
    expect(ev.computeCalibration(KNOWN).length).toBe(10);
  });
  test("۲-۹ کالیبراسیون: سطل ۰٫۸-۰٫۹ دارای ۱ نمونهٔ مشاهدهٔ ۱", () => {
    const cal = ev.computeCalibration(KNOWN);
    const b = cal.find((x) => x.bucket === "0.8-0.9");
    expect(b?.count).toBe(1);
    expect(b?.observed).toBe(1);
  });
  test("۲-۱۰ کالیبراسیون: سطل خالی صفر و صفر", () => {
    const b = ev.computeCalibration(KNOWN).find((x) => x.bucket === "0.0-0.1");
    expect(b?.count).toBe(0);
    expect(b?.observed).toBe(0);
  });
  test("۲-۱۱ کالیبراسیون: سطل ۰٫۵-۰٫۶ دارای ۱ نمونه (۰٫۶ به سطل بعدی می‌رود)", () => {
    expect(ev.computeCalibration(KNOWN).find((x) => x.bucket === "0.5-0.6")?.count).toBe(1);
    expect(ev.computeCalibration(KNOWN).find((x) => x.bucket === "0.6-0.7")?.count).toBe(1);
  });
  test("۲-۱۲ کالیبراسیون با سطل سفارشی ۵", () => {
    expect(ev.computeCalibration(KNOWN, 5).length).toBe(5);
  });
  test("۲-۱۳ مرز بالایی: احتمال ۱٫۰ در آخرین سطل", () => {
    const cal = ev.computeCalibration([{ predictedValue: 1, observedValue: 1 }]);
    expect(cal[cal.length - 1].count).toBe(1);
  });
  test("۲-۱۴ ECE با دادهٔ معلوم", () => {
    // سطل‌های پر: 0.3(1نمونه,p=.3,o=0), 0.4(1,p=.4,o=0), 0.5(1,p=.5,o=0), 0.6(1,p=.6,o=1), 0.8(1,p=.8,o=1), 0.9(1,p=.9,o=1)
    // ECE = (0.3+0.4+0.5+0.4+0.2+0.1)/6 = 0.3167
    expect(ev.computeECE(KNOWN)).toBeCloseTo(0.317, 2);
  });
  test("۲-۱۵ ECE مدل کالیبرهٔ کامل: صفر", () => {
    expect(ev.computeECE([{ predictedValue: 0.5, observedValue: 0.5 }])).toBe(0);
  });
  test("۲-۱۶ baseRateBrier: پیش‌بین نرخ پایه", () => {
    // نرخ پایه = 3/6 = 0.5 → Brier = میانگین (p−o)² = (0.25×6)/6 = 0.25
    expect(ev.baseRateBrier(KNOWN)).toBe(0.25);
  });
  test("۲-۱۷ Lift مثبت: مدل بهتر از نرخ پایه", () => {
    expect(ev.computeLift(0.09, 0.25)).toBe(64);
  });
  test("۲-۱۸ Lift منفی صادقانه گزارش می‌شود (قید حیاتی §۲.۳.۲)", () => {
    expect(ev.computeLift(0.3, 0.25)).toBe(-20);
  });
  test("۲-۱۹ Lift با خط پایهٔ صفر: صفر", () => {
    expect(ev.computeLift(0.1, 0)).toBe(0);
  });
  test("۲-۲۰ compareModels: better با اختلاف ≥ آستانه", () => {
    const a = { metrics: { brierScore: 0.2 }, sampleSize: 60 } as never;
    const b = { metrics: { brierScore: 0.25 }, sampleSize: 60 } as never;
    expect(ev.compareModels(a, b).verdict).toBe("better");
  });
  test("۲-۲۱ compareModels: worse", () => {
    const a = { metrics: { brierScore: 0.3 }, sampleSize: 60 } as never;
    const b = { metrics: { brierScore: 0.25 }, sampleSize: 60 } as never;
    expect(ev.compareModels(a, b).verdict).toBe("worse");
  });
  test("۲-۲۲ compareModels: equal نزدیک هم", () => {
    const a = { metrics: { brierScore: 0.25 }, sampleSize: 60 } as never;
    const b = { metrics: { brierScore: 0.26 }, sampleSize: 60 } as never;
    expect(ev.compareModels(a, b).verdict).toBe("equal");
  });
  test("۲-۲۳ compareModels: نمونهٔ کم، آستانهٔ سخت‌گیرانه‌تر", () => {
    const a = { metrics: { brierScore: 0.25 }, sampleSize: 10 } as never;
    const b = { metrics: { brierScore: 0.26 }, sampleSize: 10 } as never;
    expect(ev.compareModels(a, b).verdict).toBe("equal");
  });
  test("۲-۲۴ evaluate: گزارش کامل با rationale فارسی", () => {
    const pairs: Pair[] = KNOWN.map((k, i) => ({ predictionId: `p${i}`, ...k }));
    const r = ev.evaluate("m1", pairs, { from: "2026-09-01", to: "2026-09-30" }, 3);
    expect(r.metrics.brierScore).toBe(0.1183);
    expect(r.baseline.modelId).toBe("base-rate-v0");
    expect(r.rationale.length).toBeGreaterThan(20);
    expect(r.tier).toBe(3);
    expect(r.sampleSize).toBe(6);
  });
  test("۲-۲۵ evaluate: verdict better برای Lift مثبت", () => {
    const pairs: Pair[] = KNOWN.map((k, i) => ({ predictionId: `p${i}`, ...k }));
    expect(ev.evaluate("m1", pairs, { from: "", to: "" }, 3).verdict).toBe("better");
  });
});

/* ═══════════ بخش ۲ — Shadow Evaluation (§۲.۴) ═══════════ */
describe("P7/بخش ۲ — Shadow Evaluation", () => {
  const fw = new ShadowEvaluationFramework();
  const rep = (brier: number, n: number) => ({ metrics: { brierScore: brier }, sampleSize: n } as never);

  test("۲-۲۶ ساخت سایه: حداقل ۵۰ نمونه و ۷ روز", () => {
    const s = fw.build("primary", "shadow");
    expect(s.minSamples).toBe(50);
    expect(s.minWindowDays).toBe(7);
  });
  test("۲-۲۷ ارتقا: سایه ۰٫۰۲+ بهتر + نمونه + پنجره + شورا", () => {
    const s = fw.build("primary", "shadow");
    s.currentReport = rep(0.2, 60) as never;
    expect(fw.evaluate(s, rep(0.25, 60), 10, true).verdict).toBe("promote");
  });
  test("۲-۲۸ بدون تأیید شورا: ارتقا ممنوع (قفل ۲)", () => {
    const s = fw.build("primary", "shadow");
    s.currentReport = rep(0.2, 60) as never;
    expect(fw.evaluate(s, rep(0.25, 60), 10, false).verdict).toBe("keep_primary");
  });
  test("۲-۲۹ نمونهٔ ناکافی: ارتقا ممنوع", () => {
    const s = fw.build("primary", "shadow");
    s.currentReport = rep(0.2, 30) as never;
    expect(fw.evaluate(s, rep(0.25, 60), 10, true).verdict).toBe("keep_primary");
  });
  test("۲-۳۰ پنجرهٔ ناکافی (<۷ روز): ارتقا ممنوع", () => {
    const s = fw.build("primary", "shadow");
    s.currentReport = rep(0.2, 60) as never;
    expect(fw.evaluate(s, rep(0.25, 60), 5, true).verdict).toBe("keep_primary");
  });
  test("۲-۳۱ بهبود کمتر از ۰٫۰۲: ارتقا ممنوع", () => {
    const s = fw.build("primary", "shadow");
    s.currentReport = rep(0.235, 60) as never;
    expect(fw.evaluate(s, rep(0.25, 60), 10, true).verdict).toBe("keep_primary");
  });
  test("۲-۳۲ سایهٔ بدتر: reject", () => {
    const s = fw.build("primary", "shadow");
    s.currentReport = rep(0.3, 60) as never;
    expect(fw.evaluate(s, rep(0.25, 60), 10, true).verdict).toBe("reject");
  });
  test("۲-۳۳ بدون گزارش فعلی: keep_primary", () => {
    expect(fw.evaluate(fw.build("p", "s"), rep(0.25, 60), 10, true).verdict).toBe("keep_primary");
  });
});

/* ═══════════ بخش ۳ — Learning Engine (۲۵) ═══════════ */
describe("P7/بخش ۳ — Learning Engine (Tier-aware)", () => {
  const lrn = () => new LearningEngineImpl();
  const pairSet = (n: number): Array<Pair & { rawPayloadJson: string }> =>
    Array.from({ length: n }, (_, i) => ({
      predictionId: `p${i}`,
      predictedValue: 0.5,
      observedValue: i % 2,
      category: i % 2 ? "apartment" : "land",
      rawPayloadJson: JSON.stringify({
        prediction: { predictionId: `p${i}`, probability: 0.5, drivers: [{ feature: "contactProbability", value: 0.6, contribution: 0.3, weight: 0.5 }] },
      }),
    }));

  test("۳-۱ Tier 0: صفر یادگیری — فقط ثبت", () => {
    const r = lrn().learnFromOutcomes(policy(0), pairSet(20), { contactProbability: 0.5 });
    expect(r.learned).toBe(false);
    expect(r.weightUpdates.length).toBe(0);
  });
  test("۳-۲ Tier 1: صفر یادگیری — فقط ثبت", () => {
    const r = lrn().learnFromOutcomes(policy(1), pairSet(20), { contactProbability: 0.5 });
    expect(r.learned).toBe(false);
  });
  test("۳-۳ Tier 0 دلیل فارسی دارد", () => {
    const r = lrn().learnFromOutcomes(policy(0), pairSet(20), {});
    expect(r.reason).toContain("Tier 0");
  });
  test("۳-۴ Tier 2: یادگیری سطح دسته", () => {
    const r = lrn().learnFromOutcomes(policy(2), pairSet(20), {});
    expect(r.learned).toBe(true);
    expect(r.categoryMultipliers && Object.keys(r.categoryMultipliers).length).toBe(2);
  });
  test("۳-۵ Tier 2: ضریب دسته در بازهٔ ۰٫۵-۱٫۵", () => {
    const r = lrn().learnFromOutcomes(policy(2), pairSet(20), {});
    for (const m of Object.values(r.categoryMultipliers ?? {})) expect(m).toBeGreaterThanOrEqual(0.5), expect(m).toBeLessThanOrEqual(1.5);
  });
  test("۳-۶ Tier 3: یادگیری وزن‌های سراسری", () => {
    const r = lrn().learnFromOutcomes(policy(3), pairSet(10), { contactProbability: 0.5 });
    expect(r.learned).toBe(true);
    expect(r.weightUpdates.length).toBeGreaterThan(0);
  });
  test("۳-۷ Tier 3: پیشنهاد نسخهٔ جدید ندارد", () => {
    const r = lrn().learnFromOutcomes(policy(3), pairSet(10), { contactProbability: 0.5 });
    expect(r.proposedVersion).toBeUndefined();
  });
  test("۳-۸ Tier 4: یادگیری کامل + پیشنهاد نسخهٔ v جدید", () => {
    const r = lrn().learnFromOutcomes(policy(4), pairSet(10), { contactProbability: 0.5 });
    expect(r.learned).toBe(true);
    expect(r.proposedVersion).toBe("v2");
  });
  test("۳-۹ نمونهٔ کمتر از minSamplesPerUpdate: بدون یادگیری", () => {
    const r = lrn().learnFromOutcomes(policy(3, { minSamplesPerUpdate: 50 }), pairSet(10), {});
    expect(r.learned).toBe(false);
    expect(r.reason).toContain("نمونه کافی نیست");
  });
  test("۳-۱۰ هر به‌روزرسانی در PolicyChangeLog ثبت می‌شود (قید حیاتی)", () => {
    const e = lrn();
    e.learnFromOutcomes(policy(3), pairSet(10), { contactProbability: 0.5 });
    expect(e.changeLog().length).toBeGreaterThan(0);
  });
  test("۳-۱۱ جهت گرادیان: مدل بیش‌برآورد → وزن کم می‌شود", () => {
    const e = lrn();
    const w = { contactProbability: 0.5 };
    e.learnFromOutcomes(policy(3, { minSamplesPerUpdate: 1 }), [{ predictionId: "x", predictedValue: 0.9, observedValue: 0, rawPayloadJson: JSON.stringify({ prediction: { probability: 0.9, drivers: [{ feature: "contactProbability", value: 1, contribution: 0.5, weight: 0.5 }] } }) }], w);
    expect(w.contactProbability).toBeLessThan(0.5);
  });
  test("۳-۱۲ جهت گرادیان: مدل کم‌برآورد → وزن زیاد می‌شود", () => {
    const e = lrn();
    const w = { contactProbability: 0.5 };
    e.learnFromOutcomes(policy(3, { minSamplesPerUpdate: 1 }), [{ predictionId: "x", predictedValue: 0.1, observedValue: 1, rawPayloadJson: JSON.stringify({ prediction: { probability: 0.1, drivers: [{ feature: "contactProbability", value: 1, contribution: 0.5, weight: 0.5 }] } }) }], w);
    expect(w.contactProbability).toBeGreaterThan(0.5);
  });
  test("۳-۱۳ وزن‌ها در بازهٔ مهارشده ۰-۲", () => {
    const e = lrn();
    const w: Record<string, number> = {};
    for (let i = 0; i < 50; i += 1) {
      e.learnFromOutcomes(policy(3, { minSamplesPerUpdate: 1 }), [{ predictionId: "x", predictedValue: 0.99, observedValue: 0, rawPayloadJson: JSON.stringify({ prediction: { probability: 0.99, drivers: [{ feature: "f", value: 1, contribution: 0.5, weight: 0.5 }] } }) }], w);
    }
    expect(w.f).toBeLessThanOrEqual(2);
    expect(w.f).toBeGreaterThanOrEqual(0);
  });
  test("۳-۱۴ updateWeights: گام گرادیانی خالص", () => {
    const e = lrn();
    const next = e.updateWeights(policy(3, { learningRate: 0.1 }), { f: 0.5 }, [{ feature: "f", value: 1 }]);
    expect(next.f).toBe(0.4);
  });
  test("۳-۱۵ proposePolicyUpdate: status=proposed (دروازهٔ شورا)", () => {
    const e = lrn();
    const p = e.proposePolicyUpdate("m1", { verdict: "better" } as never, 3);
    expect(p.status).toBe("proposed");
    expect(p.requiresTier).toBeGreaterThanOrEqual(3);
  });
  test("۳-۱۶ proposePolicyUpdate: مدل بدتر → نرخ یادگیری محتاطانه", () => {
    const e = lrn();
    const p = e.proposePolicyUpdate("m1", { verdict: "worse" } as never, 3);
    expect(p.learningRate).toBe(0.01);
  });
  test("۳-۱۷ rollback: بازگشت به نسخهٔ پشتیبان", () => {
    const e = lrn();
    const r = e.rollback(policy(3, { rollbackTo: "v0" }));
    expect(r.rolledBack).toBe(true);
    expect(r.to).toBe("v0");
  });
  test("۳-۱۸ rollback پیش‌فرض: v0", () => {
    expect(lrn().rollback(policy(3)).to).toBe("v0");
  });
  test("۳-۱۹ rollback در تغییرنامه ثبت می‌شود", () => {
    const e = lrn();
    e.rollback(policy(3));
    expect(e.changeLog().some((l) => l.kind.includes("rollback"))).toBe(true);
  });
  test("۳-۲۰ زنجیرهٔ شاهد در نتیجهٔ یادگیری", () => {
    const r = lrn().learnFromOutcomes(policy(3), pairSet(10), {});
    expect(r.evidenceChain.length).toBeGreaterThanOrEqual(1);
  });
  test("۳-۲۱ Drift عملکرد: بدون تغییر → monitor", () => {
    const d = new DriftDetector().detectPerformanceDrift("m1", KNOWN as Pair[], KNOWN as Pair[]);
    expect(d.driftType).toBe("performance");
    expect(d.action).toBe("monitor");
  });
  test("۳-۲۲ Drift عملکرد: افت شدید → escalate", () => {
    const recent = KNOWN.map((k) => ({ ...k, predictedValue: 1 - k.observedValue }));
    const d = new DriftDetector().detectPerformanceDrift("m1", KNOWN as Pair[], recent as Pair[]);
    expect(d.action).toBe("escalate");
    expect(d.magnitude).toBeGreaterThan(0.1);
  });
  test("۳-۲۳ Drift عملکرد: افت متوسط (ΔBrier≈۰٫۰۶) → retrain", () => {
    const base = Array.from({ length: 10 }, (_, i) => ({ predictionId: `p${i}`, predictedValue: 0.5, observedValue: i % 2 }));
    const recent = Array.from({ length: 10 }, (_, i) => ({ predictionId: `p${i}`, predictedValue: 0.75, observedValue: i % 2 }));
    const d = new DriftDetector().detectPerformanceDrift("m1", base, recent);
    expect(d.action).toBe("retrain");
    expect(d.magnitude).toBeGreaterThanOrEqual(0.05);
  });
  test("۳-۲۴ Drift داده: جابه‌جایی ویژگی → affectedFeatures", () => {
    const d = new DriftDetector().detectDataDrift("m1", { f1: [0.1, 0.1] }, { f1: [0.9, 0.9] });
    expect(d.driftType).toBe("data");
    expect(d.affectedFeatures).toContain("f1");
  });
  test("۳-۲۵ Drift مفهوم: تغییر نرخ واقعی → alert", () => {
    const base = Array.from({ length: 10 }, (_, i) => ({ predictionId: `p${i}`, predictedValue: 0.5, observedValue: 0 }));
    const recent = Array.from({ length: 10 }, (_, i) => ({ predictionId: `p${i}`, predictedValue: 0.5, observedValue: i < 6 ? 1 : 0 }));
    const d = new DriftDetector().detectConceptDrift("m1", base, recent);
    expect(d.driftType).toBe("concept");
    expect(d.action).toBe("retrain");
  });
});

/* ═══════════ بخش ۳ — نظام Tier (§۱.۴) ═══════════ */
describe("P7/بخش ۳ — نظام Tier (جلسه ۰۲۵ / سند ۰۲۷ §۱.۴)", () => {
  test("۳-۲۶ Tier 0: ۰-۹ نتیجه", () => { expect(computeTier(9, 0)).toBe(0); });
  test("۳-۲۷ Tier 1: ۱۰-۱۹", () => { expect(computeTier(10, 0)).toBe(1); expect(computeTier(19, 5)).toBe(1); });
  test("۳-۲۸ Tier 2: ۲۰-۴۹", () => { expect(computeTier(20, 0)).toBe(2); expect(computeTier(49, 5)).toBe(2); });
  test("۳-۲۹ Tier 3: ۵۰-۶۹", () => { expect(computeTier(50, 0)).toBe(3); expect(computeTier(69, 5)).toBe(3); });
  test("۳-۳۰ Tier 4 نیازمند ≥۷۰ + ۳ دوره", () => { expect(computeTier(70, 3)).toBe(4); expect(computeTier(70, 2)).toBe(3); });
  test("۳-۳۱ قفل ابدی: autoExecute در هیچ Tier مجاز نیست", () => {
    for (const t of [0, 1, 2, 3, 4] as const) expect(tierProfile(t).capabilities.autoExecuteAllowed).toBe(false);
  });
  test("۳-۳۲ Tier 0 فقط سایه", () => { expect(tierProfile(0).capabilities.shadowOnly).toBe(true); });
  test("۳-۳۳ Tier 2: یادگیری دسته без وزن‌ها", () => {
    expect(tierProfile(2).capabilities.categoryLearning).toBe(true);
    expect(tierProfile(2).capabilities.weightLearning).toBe(false);
  });
  test("۳-۳۴ tierFromRealData: دوره از ماه مشاهدهٔ واقعی", () => {
    const recs = Array.from({ length: 80 }, (_, i) => ({ observedAt: `2026-0${(i % 3) + 1}-15T00:00:00Z` })) as OutcomeRecord[];
    const r = tierFromRealData(recs);
    expect(r.linkedOutcomes).toBe(80);
    expect(r.distinctPeriods).toBe(3);
    expect(r.tier).toBe(4);
  });
});

/* ═══════════ بخش ۴ — حلقهٔ کامل (۱۰) ═══════════ */
describe("P7/بخش ۴ — حلقهٔ کامل Prediction → Outcome → Evaluation → Learning", () => {
  test("۴-۱ چرخهٔ کامل روی دادهٔ نمونه", () => {
    const preds = samplePreds(30);
    const outs = sampleOutcomes(preds);
    const oe = new OutcomeEngineImpl(3);
    const records = oe.collectOutcomes(preds, outs);
    const pairs = records.map((r) => ({ predictionId: r.predictionId, predictedValue: r.predictedValue, observedValue: r.observedValue }));
    const ev = new EvaluationEngineImpl();
    const report = ev.evaluate("m1-full", pairs, { from: "", to: "" }, 3);
    const le = new LearningEngineImpl();
    const cycle = le.learnFromOutcomes(policy(3, { minSamplesPerUpdate: 10 }), pairs.map((p) => ({ ...p, rawPayloadJson: "{}" })), {});
    expect(records.length).toBe(30);
    expect(report.sampleSize).toBe(30);
    expect(cycle.learned).toBe(true);
  });
  test("۴-۲ پوشش کامل: ۱۰۰٪", () => {
    const preds = samplePreds(10);
    const oe = new OutcomeEngineImpl(3);
    oe.collectOutcomes(preds, sampleOutcomes(preds));
    expect(oe.getCoverage(10)).toBe(100);
  });
  test("۴-۳ حداقل یک نتیجه در دورهٔ جمع‌آوری (قید حیاتی §۲.۳.۱)", () => {
    const oe = new OutcomeEngineImpl(3);
    const preds = samplePreds(5);
    expect(oe.collectOutcomes(preds, sampleOutcomes(preds)).length).toBeGreaterThanOrEqual(1);
  });
  test("۴-۴ ارزیابی روی دادهٔ واقعی‌نما: حکم صادقانه", () => {
    const pairs = Array.from({ length: 40 }, (_, i) => ({ predictionId: `p${i}`, predictedValue: i < 20 ? 0.8 : 0.2, observedValue: i < 14 ? 1 : 0 }));
    const r = new EvaluationEngineImpl().evaluate("real-like", pairs, { from: "", to: "" }, 3);
    expect(["better", "equal", "worse"]).toContain(r.verdict);
    expect(r.rationale.length).toBeGreaterThan(20);
  });
  test("۴-۵ Lift منفی در حکم بازتاب می‌شود", () => {
    const pairs = Array.from({ length: 40 }, (_, i) => ({ predictionId: `p${i}`, predictedValue: i < 20 ? 0.2 : 0.8, observedValue: i < 20 ? 1 : 0 }));
    const r = new EvaluationEngineImpl().evaluate("bad-model", pairs, { from: "", to: "" }, 3);
    expect(r.verdict).toBe("worse");
    expect(r.rationale).toContain("بدتر");
  });
  test("۴-۶ یادگیری → پیشنهاد سیاست → rollback (زنجیرهٔ کامل)", () => {
    const le = new LearningEngineImpl();
    const pairs = Array.from({ length: 12 }, (_, i) => ({ predictionId: `p${i}`, predictedValue: 0.5, observedValue: i % 2 }));
    const cyc = le.learnFromOutcomes(policy(3), pairs.map((p) => ({ ...p, rawPayloadJson: "{}" })), {});
    const prop = le.proposePolicyUpdate("m1", { verdict: "better" } as never, 3);
    const rb = le.rollback(prop);
    expect(cyc.learned).toBe(true);
    expect(prop.status).toBe("proposed");
    expect(rb.rolledBack).toBe(true);
  });
  test("۴-۷ drift پس از افت → پیشنهاد retrain → سیاست تازه", () => {
    const dd = new DriftDetector();
    const base = Array.from({ length: 20 }, (_, i) => ({ predictionId: `p${i}`, predictedValue: 0.5, observedValue: i % 2 }));
    const recent = Array.from({ length: 20 }, (_, i) => ({ predictionId: `p${i}`, predictedValue: 0.9, observedValue: i % 4 === 0 ? 1 : 0 }));
    const d = dd.detectPerformanceDrift("m1", base, recent);
    const prop = new LearningEngineImpl().proposePolicyUpdate("m1", { verdict: "worse" } as never, 3);
    expect(d.action).not.toBe("monitor");
    expect(prop.learningRate).toBe(0.01);
  });
  test("۴-۸ Tier از دادهٔ واقعی حلقه محدود می‌کند", () => {
    const recs = Array.from({ length: 15 }, (_, i) => ({ observedAt: `2026-09-1${i % 2}T00:00:00Z` })) as OutcomeRecord[];
    const { tier } = tierFromRealData(recs);
    const le = new LearningEngineImpl();
    const r = le.learnFromOutcomes(policy(tier), Array.from({ length: 15 }, (_, i) => ({ predictionId: `p${i}`, predictedValue: 0.5, observedValue: i % 2, rawPayloadJson: "{}" })), {});
    expect(r.learned).toBe(false); // Tier 1 → فقط ثبت
  });
  test("۴-۹ Shadow کامل: ارتقا فقط با هر ۴ شرط", () => {
    const fw = new ShadowEvaluationFramework();
    const s = fw.build("primary", "shadow");
    s.currentReport = new EvaluationEngineImpl().evaluate("shadow", Array.from({ length: 60 }, (_, i) => ({ predictionId: `p${i}`, predictedValue: 0.7, observedValue: i < 42 ? 1 : 0 })), { from: "", to: "" }, 3);
    const primary = new EvaluationEngineImpl().evaluate("primary", Array.from({ length: 60 }, (_, i) => ({ predictionId: `p${i}`, predictedValue: 0.5, observedValue: i < 30 ? 1 : 0 })), { from: "", to: "" }, 3);
    expect(fw.evaluate(s, primary, 10, true).verdict).toBe("promote");
    expect(fw.evaluate(s, primary, 10, false).verdict).toBe("keep_primary");
  });
  test("۴-۱۰ صفر auto_execute در تمام خروجی‌های P7", () => {
    // در P7 هیچ مسیری اجرای خودکار ندارد؛ نتیجهٔ یادگیری فقط پیشنهاد است
    const le = new LearningEngineImpl();
    const r = le.learnFromOutcomes(policy(4), Array.from({ length: 10 }, (_, i) => ({ predictionId: `p${i}`, predictedValue: 0.5, observedValue: i % 2, rawPayloadJson: "{}" })), {});
    expect(r.proposedVersion).toBeDefined();
    expect("autoExecute" in r).toBe(false);
  });
});
