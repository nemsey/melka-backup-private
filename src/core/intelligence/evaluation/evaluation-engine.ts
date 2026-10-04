/**
 * بدنهٔ موتور ارزیابی (EvaluationEngineImpl) — PHASE 8
 * ------------------------------------------------------
 * پایان «پیش‌بینی بدون داوری» (یافتهٔ F3 ممیزی PHASE 0) — معیارهای استاندارد:
 *
 *  Brier Score   = mean((p − o)²) روی جفت‌های قابل‌حل
 *  Calibration   = ۵ سطل [0,0.2) … [0.8,1] — میانگین احتمالِ گفته‌شده در برابر
 *                  فراوانی واقعی رخداد در هر سطل
 *  Lift          = بهبود نسبی Brier نسبت به پیش‌بینِ نرخ پایه (base-rate):
 *                    lift = (brierBase − brierModel) / brierBase
 *                  که brierBase = mean((baseRate − o)²) و baseRate = mean(o).
 *                  lift > 0 ⇔ بهتر از تصادفِ آگاه از نرخ پایه؛ lift < 0 ⇔ بدتر.
 *                  (تعریف صادقانه و ممیزی‌پذیر — همان چیزی که «نسبت به تصادفی»
 *                  قرارداد v1 با آن قابل‌محاسبه است؛ پیش‌بین نرخ پایه = مرجع
 *                  تصادفی استاندارد احتمالاتی.)
 *
 * صداقت ریاضی (قانون H — بدون اغراق):
 *  - نمونهٔ قابل‌حل < حداقل (پیش‌فرض ۱۰۰ طبق نظم نمونهٔ PREDICTION-BASELINE)
 *    → فقط INSUFFICIENT_DATA؛ هیچ عددی ادعا نمی‌شود.
 *  - جفت‌های تحلیل‌ناپذیر (پیامد بدون قرارداد قابل‌حل) حذف و شمارش
 *    می‌شوند (فیلد افزودنی unresolvablePairs — شفافیت کامل).
 *  - verdict صادقانه: |lift| ≤ 0.02 → AT_BASELINE؛ > 0.02 → ABOVE؛
 *    < −0.02 → BELOW.
 *
 * حل پیامد (resolveObserved) — قرارداد بازرسی‌پذیر:
 *  1. evidence.observed عددی ۰/۱ (یا بولی) → مرجع.
 *  2. رشتهٔ outcome با پیشوند/پسوند قراردادی:
 *     رخداد = TRANSACTION_OCCURRED · SOLD · RENTED · CONVERTED · POSITIVE · YES · SUCCESS
 *     عدم‌رخداد = NOT_OCCURRED · NOT_SOLD · NEGATIVE · NO · FAILED · WITHDRAWN
 *  3. هر چیز دیگر → تحلیل‌ناپذیر (حذف صادقانه، نه حدس).
 *
 * مرز: فقط خواندن + محاسبهٔ خالص (قرارداد v1) — صفر Prisma/fetch/react.
 */

import type {
  CalibrationBucket,
  EvaluationEngine,
  EvaluationQuery,
  EvaluationReport,
  EvaluationVerdict,
} from "../engines/evaluation";
import type { OutcomeRecord } from "../engines/outcome";
import type { PredictionRecord } from "../prediction/prediction-record";

/** حداقل نمونهٔ قابل‌حل برای ادعای عددی — نظم نمونهٔ PREDICTION-BASELINE.md */
export const MIN_SAMPLE = 100;

/** سطل‌های کالیبراسیون — ۵ سطل مساوی */
export const CALIBRATION_EDGES = [0, 0.2, 0.4, 0.6, 0.8, 1.0001];

/** واژه‌های قراردادی رخداد/عدم‌رخداد (بزرگی/کوچکی نادیده — تطبیق دقیق توکن) */
export const POSITIVE_TOKENS = new Set([
  "TRANSACTION_OCCURRED", "SOLD", "RENTED", "CONVERTED", "POSITIVE", "YES", "SUCCESS",
]);
export const NEGATIVE_TOKENS = new Set([
  "NOT_OCCURRED", "NOT_SOLD", "NEGATIVE", "NO", "FAILED", "WITHDRAWN",
]);

// ===================== حل پیامد =====================

/**
 * تبدیل رکورد پیامد به ۰/۱ — null = تحلیل‌ناپذیر (حذف صادقانه).
 * @param record رکورد پیامد قراردادی
 */
export function resolveObserved(record: OutcomeRecord): 0 | 1 | null {
  // ۱) شاهد عددی در evidence — مرجع نهایی
  const observed = record.evidence?.["observed"];
  if (typeof observed === "number" && (observed === 0 || observed === 1)) return observed as 0 | 1;
  if (typeof observed === "boolean") return observed ? 1 : 0;

  // ۲) توکن قراردادی
  const token = record.outcome.trim().toUpperCase();
  if (POSITIVE_TOKENS.has(token)) return 1;
  if (NEGATIVE_TOKENS.has(token)) return 0;

  // ۳) تحلیل‌ناپذیر — هرگز حدس نمی‌زنیم
  return null;
}

// ===================== ریاضیات خالص (ممیزی‌پذیر) =====================

/** Brier = mean((p − o)²) — خالص */
export function brierScore(pairs: { p: number; o: 0 | 1 }[]): number {
  if (pairs.length === 0) return Number.NaN;
  let sum = 0;
  for (const { p, o } of pairs) sum += (p - o) * (p - o);
  return sum / pairs.length;
}

/** سطل‌بندی کالیبراسیون — ۵ سطل با میانگین احتمال و فراوانی واقعی */
export function calibrationBuckets(pairs: { p: number; o: 0 | 1 }[]): CalibrationBucket[] {
  const buckets: CalibrationBucket[] = [];
  for (let i = 0; i < CALIBRATION_EDGES.length - 1; i++) {
    const lo = CALIBRATION_EDGES[i]!;
    const hi = CALIBRATION_EDGES[i + 1]!;
    const inBucket = pairs.filter((x) => x.p >= lo && x.p < hi);
    const predicted = inBucket.length > 0 ? inBucket.reduce((s, x) => s + x.p, 0) / inBucket.length : Number.NaN;
    const observed = inBucket.length > 0 ? inBucket.reduce((s, x) => s + x.o, 0) / inBucket.length : Number.NaN;
    buckets.push({
      bucket: `${lo.toFixed(1)}-${(hi > 1 ? 1 : hi).toFixed(1)}`,
      predicted: Number.isNaN(predicted) ? 0 : Math.round(predicted * 1000) / 1000,
      observed: Number.isNaN(observed) ? 0 : Math.round(observed * 1000) / 1000,
    });
  }
  return buckets;
}

/**
 * Lift = بهبود نسبی Brier نسبت به پیش‌بین نرخ پایه.
 * @returns lift یا NaN در نبود نمونه
 */
export function liftVersusBaseRate(pairs: { p: number; o: 0 | 1 }[]): number {
  if (pairs.length === 0) return Number.NaN;
  const baseRate = pairs.reduce((s, x) => s + x.o, 0) / pairs.length;
  const model = brierScore(pairs);
  const baseline = brierScore(pairs.map((x) => ({ p: baseRate, o: x.o })));
  if (baseline === 0) return Number.NaN; // همهٔ پیامدها یک‌سان — مرجع بی‌معنا
  return (baseline - model) / baseline;
}

/** حکم صادقانه از lift — با ناحیهٔ خنثی ±۰٫۰۲ */
export function verdictFromLift(lift: number, sampleSize: number, minSample: number): EvaluationVerdict {
  if (sampleSize < minSample) return "INSUFFICIENT_DATA";
  if (lift > 0.02) return "ABOVE_BASELINE";
  if (lift < -0.02) return "BELOW_BASELINE";
  return "AT_BASELINE";
}

// ===================== منابع داده (درگاه‌های تزریقی) =====================

/** منبع پیش‌بینی‌ها — پیاده‌سازی واقعی: PredictionRepository */
export interface EvaluationPredictionSource {
  list(tileId?: string, limit?: number): Promise<PredictionRecord[]>;
}

/** منبع پیامدها — پیاده‌سازی واقعی: OutcomeEngine */
export interface EvaluationOutcomeSource {
  query(query: { tileId: string; predictionId?: string; since?: string }): Promise<OutcomeRecord[]>;
}

export interface EvaluationEngineOptions {
  predictions: EvaluationPredictionSource;
  outcomes: EvaluationOutcomeSource;
  /** حداقل نمونه — پیش‌فرض ۱۰۰ (نظم نمونه)؛ تست‌ها می‌توانند کوچک‌تر بدهند */
  minSample?: number;
  /** now تزریقی ⇔ حتمیت در تست (الگوی asOf فاز ۴) */
  now?: () => Date;
}

// ===================== بدنهٔ موتور =====================

export class EvaluationEngineImpl implements EvaluationEngine {
  readonly contractVersion = 1 as const;

  private readonly predictions: EvaluationPredictionSource;
  private readonly outcomes: EvaluationOutcomeSource;
  private readonly minSample: number;
  private readonly now: () => Date;

  constructor(options: EvaluationEngineOptions) {
    this.predictions = options.predictions;
    this.outcomes = options.outcomes;
    this.minSample = options.minSample ?? MIN_SAMPLE;
    this.now = options.now ?? (() => new Date());
  }

  async evaluate(query: EvaluationQuery): Promise<EvaluationReport> {
    const windowDays = query.windowDays ?? 90;
    const now = this.now();
    const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    // پیش‌بینی‌های کاشی هدف (با پنجرهٔ زمانی روی رخداد پیامد)
    const predictions = await this.predictions.list(query.tileId);
    const target = query.target ?? "probability";

    const pairs: { p: number; o: 0 | 1 }[] = [];
    let unresolvable = 0;

    for (const prediction of predictions) {
      if (!prediction.linkedOutcomeId) continue;
      const records = await this.outcomes.query({
        tileId: query.tileId,
        predictionId: prediction.predictionId,
        since,
      });
      if (records.length === 0) continue;

      // اگر پیامدهای متعدد: آخرین رخداد مرجع است (جدیدترین-اول از query)
      const observed = resolveObserved(records[0]!);
      if (observed === null) {
        unresolvable += 1;
        continue;
      }
      const p = extractProbability(prediction, target);
      if (p === null) continue; // هدف ناموجود در payload — نه حدس، نه خطا
      pairs.push({ p, o: observed });
    }

    const base: EvaluationReport = {
      tileId: query.tileId,
      windowDays,
      sampleSize: pairs.length,
      verdict: "INSUFFICIENT_DATA",
      computedAt: now.toISOString(),
    };
    const withExtras: EvaluationReport & { unresolvablePairs?: number; target?: string } = {
      ...base,
      unresolvablePairs: unresolvable,
      target,
    };

    if (pairs.length < this.minSample) {
      return withExtras; // صداقت: بدون عدد — نمونه کافی نیست
    }

    const brier = brierScore(pairs);
    const lift = liftVersusBaseRate(pairs);
    return {
      ...withExtras,
      brierScore: Math.round(brier * 10000) / 10000,
      calibration: calibrationBuckets(pairs),
      lift: Math.round(lift * 10000) / 10000,
      verdict: verdictFromLift(lift, pairs.length, this.minSample),
    };
  }
}

/** استخراج احتمال هدف از رکورد — probability اصلی یا payload تایپ‌شده */
function extractProbability(prediction: PredictionRecord, target: string): number | null {
  if (target === "probability") {
    return typeof prediction.probability === "number" ? prediction.probability : null;
  }
  const v = (prediction.payload as Record<string, unknown> | undefined)?.[target];
  return typeof v === "number" ? v : null;
}

/** کارخانه */
export function createEvaluationEngine(options: EvaluationEngineOptions): EvaluationEngineImpl {
  return new EvaluationEngineImpl(options);
}
