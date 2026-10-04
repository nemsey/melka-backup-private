/**
 * PHASE 7 (سند ۰۲۷) — موتور یادگیری از نتیجه: سه موتور + سایه + رانش
 * ---------------------------------------------------------------------------
 * فلسفه: «یادگیری بدون نتیجه، ادعا است.»
 * همهٔ محاسبات خالص و قابل تست‌اند؛ دادهٔ واقعی از حلقهٔ ARM
 * (intelligence-data/predictions.jsonl + outcomes.jsonl) تغذیه می‌شود.
 */

import {
  type CalibrationBucket,
  type DriftReport,
  type EvaluationReport,
  type EvaluationVerdict,
  type EvidenceLink,
  type LearningPolicy,
  type LearningTier,
  type OutcomeRecord,
  type PredictionType,
  type ShadowEvaluation,
  computeTier,
  evidenceLink,
  tierProfile,
} from "./contracts-p7-p11";

/* ═══════════════════════ ابزارهای مشترک ═══════════════════════ */

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export interface RawPrediction {
  predictionId: string;
  predictionType?: string;
  probability: number;
  confidence?: number;
  expectedValue?: number;
  expectedTimeWindow?: { minDays: number; maxDays: number; mostLikelyDays?: number };
  drivers?: Array<{ feature: string; value: number; contribution: number; weight: number; direction?: string }>;
  predictedAt?: string;
  category?: string;
}

export interface RawOutcome {
  predictionId: string;
  outcome: string;
  occurredAt: string;
  recordedAt?: string;
  outcomeId?: string;
  evidence?: { observed: number; status?: string; propertyCode?: string; source?: string };
}

function normalizePredictionType(t: string | undefined): PredictionType {
  if (t === "request" || t === "REQUEST_MATCH") return "request_match";
  if (t === "expert" || t === "EXPERT_PERFORMANCE") return "expert_performance";
  return "listing_deal";
}

/** دستهٔ ملک از payload خام (برای یادگیری سطح دسته — Tier 2) */
function categoryOf(raw: string): string {
  try {
    const p = JSON.parse(raw) as { category?: string; evidence?: { propertyType?: string } };
    if (p.category) return p.category;
    if (p.evidence?.propertyType) return p.evidence.propertyType;
  } catch {
    /* بدون دسته */
  }
  return "unknown";
}

/* ═══════════════════ ۲.۳.۱ — Outcome Engine ═══════════════════ */

export class OutcomeEngineImpl {
  private records: OutcomeRecord[] = [];
  private pendingPredictionIds: string[] = [];
  private batchCounter = 0;

  constructor(private readonly tierAtObservation: LearningTier = 0) {}

  /** جمع‌آوری دوره‌ای نتیجهٔ واقعی از پیوند پیش‌بینی↔پیامد خام (منبع: حلقهٔ ARM) */
  collectOutcomes(predictions: RawPrediction[], outcomes: RawOutcome[], windowDays = 3650): OutcomeRecord[] {
    this.batchCounter += 1;
    const batchId = `extract-${new Date().toISOString().slice(0, 10)}-${this.batchCounter}`;
    const byId = new Map(predictions.map((p) => [p.predictionId, p]));
    const collected: OutcomeRecord[] = [];
    const now = new Date();

    for (const o of outcomes) {
      const p = byId.get(o.predictionId);
      if (!p) continue;
      const observedAt = new Date(o.occurredAt);
      const predictedAt = p.predictedAt ? new Date(p.predictedAt) : new Date(observedAt.getTime() - 86400000 * 30);
      const ageDays = (now.getTime() - observedAt.getTime()) / 86400000;
      if (ageDays > windowDays) continue;
      const observed = o.evidence?.observed ?? 0;
      collected.push({
        id: o.outcomeId ?? `out-${o.predictionId.slice(0, 8)}`,
        predictionId: o.predictionId,
        predictionType: normalizePredictionType(p.predictionType),
        predictedAt: predictedAt.toISOString(),
        predictedValue: clamp(p.probability, 0, 1),
        observedAt: observedAt.toISOString(),
        observedValue: observed === 1 ? 1 : 0,
        timeWindowDays: p.expectedTimeWindow?.maxDays ?? 90,
        resolution: observed === 1 ? "success" : "failure",
        rawPayloadJson: JSON.stringify({ prediction: p, outcome: o }),
        evidenceChain: [
          evidenceLink(
            "file",
            "intelligence-data/outcomes.jsonl",
            `پیامد واقعی ARM برای پیش‌بینی ${o.predictionId.slice(0, 8)} — وضعیت: ${o.evidence?.status ?? "نامشخص"}`,
          ),
        ],
        tierAtObservation: this.tierAtObservation,
        extractionBatchId: batchId,
        extractedAt: new Date().toISOString(),
      });
    }
    this.records.push(...collected);
    this.pendingPredictionIds = predictions
      .filter((p) => !outcomes.some((o) => o.predictionId === p.predictionId))
      .map((p) => p.predictionId);
    return collected;
  }

  /** پیش‌بینی‌های بدون نتیجه (پوشش‌نشده) */
  findPendingPredictions(): string[] {
    return [...this.pendingPredictionIds];
  }

  /** اتصال دستی یک پیامد به یک پیش‌بینی */
  linkOutcome(predictionId: string, outcomeId: string): boolean {
    const rec = this.records.find((r) => r.id === outcomeId && r.predictionId === predictionId);
    return rec !== undefined;
  }

  /** درصد پوشش: سهم پیش‌بینی‌هایی که نتیجهٔ واقعی دارند */
  getCoverage(totalPredictions: number): number {
    if (totalPredictions <= 0) return 0;
    const linked = new Set(this.records.map((r) => r.predictionId)).size;
    return Math.round((linked / totalPredictions) * 1000) / 10;
  }

  all(): OutcomeRecord[] {
    return [...this.records];
  }
}

/* ═══════════════════ ۲.۳.۲ — Evaluation Engine ═══════════════════ */

export interface Pair {
  predictionId: string;
  predictedValue: number;
  observedValue: number;
  category?: string;
  /** زمان پیش‌بینی برای پنجره‌های رانش (اختیاری) */
  predictedAt?: string;
}

export class EvaluationEngineImpl {
  /** §۲.۲.۲ — میانگین مربع خطا (Brier) */
  computeBrierScore(pairs: Array<{ predictedValue: number; observedValue: number }>): number {
    if (pairs.length === 0) return NaN;
    const s = pairs.reduce((acc, p) => acc + (p.predictedValue - p.observedValue) ** 2, 0);
    return Math.round((s / pairs.length) * 10000) / 10000;
  }

  /** LogLoss با مهار عددی */
  computeLogLoss(pairs: Array<{ predictedValue: number; observedValue: number }>): number {
    if (pairs.length === 0) return NaN;
    const s = pairs.reduce((acc, p) => {
      const q = clamp(p.predictedValue, 0.01, 0.99);
      return acc - (p.observedValue * Math.log(q) + (1 - p.observedValue) * Math.log(1 - q));
    }, 0);
    return Math.round((s / pairs.length) * 10000) / 10000;
  }

  /** دقت جهت‌دار: آیا سمت احتمال درست بود؟ */
  computeAccuracy(pairs: Array<{ predictedValue: number; observedValue: number }>): number {
    if (pairs.length === 0) return NaN;
    const ok = pairs.filter((p) => (p.predictedValue >= 0.5 ? 1 : 0) === p.observedValue).length;
    return Math.round((ok / pairs.length) * 1000) / 1000;
  }

  /** §۲.۳.۲ — کالیبراسیون در ۱۰ سطل */
  computeCalibration(pairs: Array<{ predictedValue: number; observedValue: number }>, buckets = 10): CalibrationBucket[] {
    const out: CalibrationBucket[] = [];
    for (let i = 0; i < buckets; i += 1) {
      const lo = i / buckets;
      const hi = (i + 1) / buckets;
      const inBucket = pairs.filter((p) => p.predictedValue >= lo && (i === buckets - 1 ? p.predictedValue <= hi : p.predictedValue < hi));
      const count = inBucket.length;
      const predicted = count === 0 ? 0 : inBucket.reduce((a, p) => a + p.predictedValue, 0) / count;
      const observed = count === 0 ? 0 : inBucket.reduce((a, p) => a + p.observedValue, 0) / count;
      out.push({
        bucket: `${lo.toFixed(1)}-${hi.toFixed(1)}`,
        predicted: Math.round(predicted * 1000) / 1000,
        observed: Math.round(observed * 1000) / 1000,
        count,
      });
    }
    return out;
  }

  /** Expected Calibration Error — میانگین وزنی فاصلهٔ سطل‌ها */
  computeECE(pairs: Array<{ predictedValue: number; observedValue: number }>, buckets = 10): number {
    if (pairs.length === 0) return NaN;
    const cal = this.computeCalibration(pairs, buckets);
    const ece = cal.reduce((acc, b) => acc + (b.count / pairs.length) * Math.abs(b.predicted - b.observed), 0);
    return Math.round(ece * 10000) / 10000;
  }

  /** پیش‌بین نرخ پایه: همه را با نرخ مشاهدهٔ کل پیش‌بینی می‌کند */
  baseRateBrier(pairs: Array<{ predictedValue: number; observedValue: number }>): number {
    if (pairs.length === 0) return NaN;
    const rate = pairs.reduce((a, p) => a + p.observedValue, 0) / pairs.length;
    return this.computeBrierScore(pairs.map((p) => ({ ...p, predictedValue: rate })));
  }

  /** §۲.۳.۲ — Lift نسبت به خط پایه (نرخ پایه)؛ منفی = صادقانه گزارش می‌شود */
  computeLift(modelBrier: number, baselineBrier: number): number {
    if (baselineBrier === 0) return 0;
    return Math.round(((baselineBrier - modelBrier) / baselineBrier) * 10000) / 100;
  }

  /** مقایسهٔ دو مدل با حکم صادقانه — نمونهٔ کم = آستانهٔ سخت‌گیرانه‌تر (دوبرابر) */
  compareModels(modelA: EvaluationReport, modelB: EvaluationReport): { verdict: EvaluationVerdict; margin: number } {
    const margin = Math.round((modelB.metrics.brierScore - modelA.metrics.brierScore) * 10000) / 10000;
    const sampleFactor = Math.min(modelA.sampleSize, modelB.sampleSize) >= 50 ? 1 : 2;
    const threshold = 0.02 * sampleFactor;
    if (margin >= threshold) return { verdict: "better", margin };
    if (margin <= -threshold) return { verdict: "worse", margin };
    return { verdict: "equal", margin };
  }

  /** ارزیابی کامل روی جفت‌های واقعی — گزارش با توضیح فارسی صادقانه */
  evaluate(modelId: string, pairs: Pair[], window: { from: string; to: string }, tier: LearningTier): EvaluationReport {
    const brier = this.computeBrierScore(pairs);
    const baselineBrier = this.baseRateBrier(pairs);
    const lift = this.computeLift(brier, baselineBrier);
    const ece = this.computeECE(pairs);
    const calibration = this.computeCalibration(pairs);
    const verdict: EvaluationVerdict = lift > 0 ? "better" : lift < -2 ? "worse" : "equal";
    const worstBucket = [...calibration].filter((b) => b.count > 0).sort((a, b) => Math.abs(b.observed - b.predicted) - Math.abs(a.observed - a.predicted))[0];
    const rationale =
      lift >= 0
        ? `مدل ${modelId} روی ${pairs.length} جفت واقعی، Brier=${brier} دارد؛ ${lift >= 0 ? `${lift}% بهتر` : `${Math.abs(lift)}% بدتر`} از پیش‌بین نرخ پایه (Brier=${baselineBrier}). بدترین سطل کالیبراسیون: ${worstBucket ? `${worstBucket.bucket} (پیش‌بینی ${worstBucket.predicted} / مشاهده ${worstBucket.observed})` : "—"}؛ ECE=${ece}.`
        : `مدل ${modelId} از خط پایه بدتر است (${Math.abs(lift)}%) — صادقانه گزارش می‌شود، صفر گرد کردن.`;
    return {
      id: `eval-${modelId}-${Date.now().toString(36)}`,
      modelId,
      evaluatedAt: new Date().toISOString(),
      window,
      sampleSize: pairs.length,
      metrics: {
        brierScore: brier,
        logLoss: this.computeLogLoss(pairs),
        accuracy: this.computeAccuracy(pairs),
        calibration,
        lift,
        ece,
      },
      baseline: { modelId: "base-rate-v0", brierScore: baselineBrier },
      verdict,
      rationale,
      tier,
    };
  }
}

/* ═══════════════════ ۲.۳.۳ — Learning Engine (Tier-aware) ═══════════════════ */

export interface WeightVector {
  [feature: string]: number;
}

export interface LearningCycleResult {
  policyId: string;
  tier: LearningTier;
  learned: boolean;
  reason: string;
  weightUpdates: Array<{ feature: string; from: number; to: number }>;
  categoryMultipliers?: Record<string, number>;
  proposedVersion?: string;
  evidenceChain: EvidenceLink[];
  logged: boolean;
}

export class LearningEngineImpl {
  private policyLog: Array<{ policyId: string; at: string; kind: string }> = [];

  /**
   * §۲.۳.۳ — یادگیری Tier-aware:
   *  Tier 0-1: صفر یادگیری — فقط ثبت
   *  Tier 2: یادگیری سطح دسته
   *  Tier 3: یادگیری وزن‌های سراسری (گرادیان Brier)
   *  Tier 4: یادگیری کامل + پیشنهاد نسخهٔ v جدید
   */
  learnFromOutcomes(
    policy: LearningPolicy,
    pairs: Array<Pair & { rawPayloadJson?: string }>,
    weights: WeightVector,
  ): LearningCycleResult {
    const tier = policy.requiresTier;
    const profile = tierProfile(tier);
    const updates: Array<{ feature: string; from: number; to: number }> = [];
    let learned = false;
    let reason = "";
    let categoryMultipliers: Record<string, number> | undefined;
    let proposedVersion: string | undefined;

    if (pairs.length < policy.minSamplesPerUpdate) {
      reason = `نمونه کافی نیست (${pairs.length} < ${policy.minSamplesPerUpdate}) — طبق سیاست، یادگیری انجام نمی‌شود.`;
    } else if (tier <= 1) {
      reason = `Tier ${tier} (${profile.label}) — صفر یادگیری، فقط ثبت. طبق سند ۰۲۷ §۱.۴.`;
    } else if (tier === 2) {
      const cats = new Map<string, { n: number; sumP: number; sumO: number }>();
      for (const p of pairs) {
        const c = p.category ?? categoryOf(p.rawPayloadJson ?? "{}");
        const cur = cats.get(c) ?? { n: 0, sumP: 0, sumO: 0 };
        cur.n += 1;
        cur.sumP += p.predictedValue;
        cur.sumO += p.observedValue;
        cats.set(c, cur);
      }
      categoryMultipliers = {};
      for (const [c, v] of cats) {
        const obsRate = v.sumO / v.n;
        const predRate = v.sumP / v.n;
        const m = clamp(1 + (obsRate - predRate) * policy.learningRate, 0.5, 1.5);
        categoryMultipliers[c] = Math.round(m * 1000) / 1000;
      }
      learned = true;
      reason = `Tier 2 — یادگیری سطح دسته روی ${cats.size} دسته (ضریب هر دسته از فاصلهٔ نرخ مشاهده تا نرخ پیش‌بینی).`;
    } else {
      // Tier 3-4: گرادیان Brier روی وزن‌ها: ∂B/∂w_i = 2(p−o)·x_i
      const lr = policy.learningRate;
      for (const p of pairs) {
        const err = p.predictedValue - p.observedValue;
        const raw = JSON.parse(p.rawPayloadJson ?? "{}") as { prediction?: RawPrediction };
        for (const d of raw.prediction?.drivers ?? []) {
          const w = weights[d.feature] ?? d.weight;
          const next = clamp(w - lr * 2 * err * d.value, 0, 2);
          if (!(d.feature in weights)) weights[d.feature] = w;
          weights[d.feature] = next;
        }
      }
      for (const [f, to] of Object.entries(weights)) updates.push({ feature: f, from: to, to });
      learned = true;
      reason =
        tier === 4
          ? `Tier 4 — یادگیری کامل وزن‌ها با نرخ ${lr} + پیشنهاد نسخهٔ جدید.`
          : `Tier 3 — یادگیری وزن‌های سراسری با نرخ ${lr}.`;
      if (tier === 4) {
        const mm = policy.version.match(/v(\d+)/);
        proposedVersion = `v${(mm ? Number(mm[1]) : 0) + 1}`;
      }
    }

    // هر به‌روزرسانی مدل در PolicyChangeLog ثبت می‌شود (قید حیاتی)
    this.policyLog.push({ policyId: policy.id, at: new Date().toISOString(), kind: learned ? "weight-update" : "record-only" });
    if (proposedVersion) this.policyLog.push({ policyId: policy.id, at: new Date().toISOString(), kind: `proposed-${proposedVersion}` });

    return {
      policyId: policy.id,
      tier,
      learned,
      reason,
      weightUpdates: updates,
      categoryMultipliers,
      proposedVersion,
      evidenceChain: [
        evidenceLink("file", "intelligence-data/loop-latest.json", "حلقهٔ واقعی ARM — ورودی یادگیری"),
        evidenceLink("test", "tests/p6537-p7-core.test.ts", "تست‌های یادگیری Tier-aware"),
      ],
      logged: this.policyLog.some((l) => l.policyId === policy.id),
    };
  }

  /** گرادیان خام برای یک جفت (ابزار تست ریاضی با دادهٔ معلوم) */
  updateWeights(policy: LearningPolicy, weights: WeightVector, gradient: Array<{ feature: string; value: number }>): WeightVector {
    const next: WeightVector = { ...weights };
    for (const g of gradient) next[g.feature] = clamp((next[g.feature] ?? 0) - policy.learningRate * g.value, 0, 2);
    return next;
  }

  /** پیشنهاد سیاست تازه از ارزیابی — نیازمند دروازهٔ شورا */
  proposePolicyUpdate(modelId: string, report: EvaluationReport, tier: LearningTier): LearningPolicy {
    return {
      id: `lp-${modelId}-${Date.now().toString(36)}`,
      modelId,
      version: "v1",
      strategy: "batch",
      learningRate: report.verdict === "worse" ? 0.01 : 0.05,
      updateWindowDays: 7,
      minSamplesPerUpdate: 10,
      driftThreshold: 0.05,
      status: "proposed",
      requiresTier: Math.max(tier, 3) as LearningTier,
      evidenceChain: [evidenceLink("query", `evaluation:${report.id}`, report.rationale)],
      rollbackTo: "v0",
    };
  }

  /** بازگشت به نسخهٔ پشتیبان */
  rollback(policy: LearningPolicy): { rolledBack: boolean; to: string; logged: boolean } {
    const target = policy.rollbackTo ?? "v0";
    this.policyLog.push({ policyId: policy.id, at: new Date().toISOString(), kind: `rollback→${target}` });
    return { rolledBack: true, to: target, logged: true };
  }

  changeLog(): Array<{ policyId: string; at: string; kind: string }> {
    return [...this.policyLog];
  }
}

/* ═══════════════════ ۲.۴ — Shadow Evaluation Framework ═══════════════════ */

export class ShadowEvaluationFramework {
  /**
   * معیار ارتقا از سایه (§۲.۴): Shadow Brier ≤ Primary Brier − 0.02
   * + حداقل ۵۰ نمونه + حداقل ۷ روز + تأیید شورا (شرط چهارم بیرون از نوع بررسی می‌شود)
   */
  evaluate(shadow: ShadowEvaluation, primaryReport: EvaluationReport, windowDays: number, councilApproved: boolean): ShadowEvaluation {
    const r = shadow.currentReport;
    if (!r) return { ...shadow, verdict: "keep_primary" };
    const enoughSamples = r.sampleSize >= shadow.minSamples;
    const enoughWindow = windowDays >= shadow.minWindowDays;
    const enoughBetter = r.metrics.brierScore <= primaryReport.metrics.brierScore - 0.02;
    const verdict = enoughSamples && enoughWindow && enoughBetter && councilApproved ? "promote" : enoughSamples && windowDays >= shadow.minWindowDays && r.metrics.brierScore > primaryReport.metrics.brierScore + 0.02 ? "reject" : "keep_primary";
    return { ...shadow, verdict };
  }

  build(primaryModelId: string, shadowModelId: string): ShadowEvaluation {
    return { primaryModelId, shadowModelId, startedAt: new Date().toISOString(), minSamples: 50, minWindowDays: 7 };
  }
}

/* ═══════════════════ ۲.۲.۴ — Drift Detection ═══════════════════ */

export class DriftDetector {
  /** رانش عملکرد: مقایسهٔ Brier دو پنجره */
  detectPerformanceDrift(modelId: string, baseline: Pair[], recent: Pair[]): DriftReport {
    const ev = new EvaluationEngineImpl();
    const bBrier = ev.computeBrierScore(baseline);
    const rBrier = ev.computeBrierScore(recent);
    const magnitude = clamp(Math.abs(rBrier - bBrier), 0, 1);
    const action = magnitude >= 0.1 ? "escalate" : magnitude >= 0.05 ? "retrain" : magnitude >= 0.02 ? "alert" : "monitor";
    return {
      id: `drift-${modelId}-${Date.now().toString(36)}`,
      modelId,
      detectedAt: new Date().toISOString(),
      driftType: "performance",
      magnitude: Math.round(magnitude * 1000) / 1000,
      affectedFeatures: [],
      baselineWindow: { from: baseline[0]?.predictedAt ?? "", to: baseline[baseline.length - 1]?.predictedAt ?? "" },
      recentWindow: { from: recent[0]?.predictedAt ?? "", to: recent[recent.length - 1]?.predictedAt ?? "" },
      action,
      rationale: `Brier خط پایه ${bBrier} → پنجرهٔ اخیر ${rBrier} (اختلاف ${Math.round((rBrier - bBrier) * 1000) / 1000}). کنش: ${action}.`,
      evidenceChain: [evidenceLink("query", `brier:${modelId}`, `brier پایه=${bBrier} اخیر=${rBrier}`)],
    };
  }

  /** رانش داده: جابه‌جایی میانگین ویژگی‌ها */
  detectDataDrift(modelId: string, baselineFeatures: Record<string, number[]>, recentFeatures: Record<string, number[]>): DriftReport {
    const affected: string[] = [];
    let totalShift = 0;
    let n = 0;
    for (const [f, base] of Object.entries(baselineFeatures)) {
      const rec = recentFeatures[f];
      if (!rec || rec.length === 0 || base.length === 0) continue;
      const bm = base.reduce((a, x) => a + x, 0) / base.length;
      const rm = rec.reduce((a, x) => a + x, 0) / rec.length;
      const shift = Math.abs(rm - bm);
      totalShift += shift;
      n += 1;
      if (shift > 0.1) affected.push(f);
    }
    const magnitude = n === 0 ? 0 : clamp(totalShift / n, 0, 1);
    return {
      id: `drift-data-${modelId}-${Date.now().toString(36)}`,
      modelId,
      detectedAt: new Date().toISOString(),
      driftType: "data",
      magnitude: Math.round(magnitude * 1000) / 1000,
      affectedFeatures: affected,
      baselineWindow: { from: "", to: "" },
      recentWindow: { from: "", to: "" },
      action: affected.length > 0 ? "alert" : "monitor",
      rationale: affected.length > 0 ? `میانگین ${affected.length} ویژگی بیش از ۰٫۱ جابه‌جا شده: ${affected.join("، ")}` : "جابه‌جایی معنادار ویژگی‌ها دیده نشد.",
      evidenceChain: [evidenceLink("query", `features:${modelId}`, `ویژگی‌های جابه‌جاشده: ${affected.length}`)],
    };
  }

  /** رانش مفهوم: تغییر نرخ مشاهدهٔ واقعی بین دو پنجره */
  detectConceptDrift(modelId: string, baseline: Pair[], recent: Pair[]): DriftReport {
    const rate = (xs: Pair[]) => (xs.length === 0 ? 0 : xs.reduce((a, p) => a + p.observedValue, 0) / xs.length);
    const magnitude = clamp(Math.abs(rate(recent) - rate(baseline)), 0, 1);
    return {
      id: `drift-concept-${modelId}-${Date.now().toString(36)}`,
      modelId,
      detectedAt: new Date().toISOString(),
      driftType: "concept",
      magnitude: Math.round(magnitude * 1000) / 1000,
      affectedFeatures: [],
      baselineWindow: { from: "", to: "" },
      recentWindow: { from: "", to: "" },
      action: magnitude >= 0.2 ? "retrain" : magnitude >= 0.05 ? "alert" : "monitor",
      rationale: `نرخ وقوع واقعی: خط پایه ${Math.round(rate(baseline) * 1000) / 1000} → اخیر ${Math.round(rate(recent) * 1000) / 1000}.`,
      evidenceChain: [evidenceLink("query", `concept:${modelId}`, `اختلاف نرخ ${Math.round(magnitude * 1000) / 1000}`)],
    };
  }
}

/** Tier از دادهٔ واقعی: تعداد پیامد پیوندشده + دوره‌های متمایز (ماه مشاهده) */
export function tierFromRealData(records: OutcomeRecord[]): { tier: LearningTier; linkedOutcomes: number; distinctPeriods: number } {
  const linked = records.length;
  const periods = new Set(records.map((r) => r.observedAt.slice(0, 7))).size;
  return { tier: computeTier(linked, periods), linkedOutcomes: linked, distinctPeriods: periods };
}
