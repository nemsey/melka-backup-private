/**
 * بدنه موتور پیش‌بینی (PredictionEngineImpl) — PHASE 6 / P6-04
 * ------------------------------------------------------
 * پنجمین موتور بدنه‌دار (پس از Context / Memory / Retrieval / Feature).
 *
 * قرارداد v1 (دست‌نخورده — engines/prediction.ts):
 *  - predict(query: PredictionQuery): Promise<PredictionResult> — پل کم‌افت
 *    روی بردار عددی v1؛ اهداف شناخته‌شده = زیرمجموعه‌ای که کلیدهای عددی
 *    لازم در بردار v1 قابل flatten بودن دارند (قانون صادق: رشته‌ها — مثل
 *    publisherType — در بردار v1 جایی ندارند؛ اهداف وابسته به آن‌ها در پل
 *    پشتیبانی نمی‌شوند و مسیر افزودنی کامل، مسیر اصلی است).
 *
 * متدهای افزودنی (قاعده طلایی فاز):
 *  - predictProperty / predictCustomer / predictExpert — full PredictionRecord
 *    با drivers/risks/assumptions/snapshot.
 *
 * مرز: صفر Prisma / صفر @/lib/db / صفر fetch / صفر React.
 *
 * ⚠️ قانون H: heuristic v0 — «baseline قابل ارزیابی»، نه مدل آموخته‌شده.
 * هیچ ادعای دقت پیش از ارزیابی Outcome در PHASE 7.
 */

import type {
  PredictionEngine,
  PredictionQuery,
  PredictionResult,
} from "../engines/prediction";
import type { FeatureSet } from "../engines/feature";
import { clamp01 } from "../feature/builders/guards";
import type { PropertyFeatureSet } from "../feature/builders/property-features";
import type { MarketFeatureSet } from "../feature/builders/market-features";
import type { CustomerFeatureSet } from "../feature/builders/customer-features";
import type { ExpertFeatureSet } from "../feature/builders/expert-features";
import type {
  PredictionRecord,
  PredictOptions,
  PropertyPredictionPayload,
  CustomerPredictionPayload,
  ExpertPredictionPayload,
} from "./prediction-record";
import { PropertyPredictor } from "./predictors/property-predictor";
import { CustomerPredictor } from "./predictors/customer-predictor";
import { ExpertPredictor } from "./predictors/expert-predictor";

export const PREDICTION_BRIDGE_VERSION = "prediction-engine-v0.1-bridge";

// ===================== جدول اهداف پل v1 =====================

/**
 * اهداف پشتیبانی‌شده پل v1 — فقط اهداف با ورودی کاملاً عددی.
 * هر هدف: کلیدهای لازم بردار + تابع احتمال (هم‌ارز جدول‌های مرجع).
 */
const BRIDGE_TARGETS: Record<string, {
  keys: string[];
  fn: (v: Record<string, number>) => number;
  rationale: (v: Record<string, number>) => string;
}> = {
  underpriceProbability: {
    keys: ["underpriceRatio", "publishedHoursAgo", "previousPriceDelta"],
    fn: (v) =>
      clamp01(0.65 * clamp01(v.underpriceRatio! * 5) + 0.2 * clamp01(v.publishedHoursAgo! / 720) + 0.15 * (v.previousPriceDelta! < 0 ? 1 : 0)),
    rationale: (v) =>
      `احتمال زیرقیمت‌بودن بر پایه نسبت ارزانی ${v.underpriceRatio!.toFixed(2)}، ${Math.round(v.publishedHoursAgo!)} ساعت انتشار و ${v.previousPriceDelta! < 0 ? "کاهش" : "بدون کاهش"} قیمت قبلی`,
  },
  churnProbability: {
    keys: ["recencyDays", "responseRate", "activityScore"],
    fn: (v) =>
      clamp01(0.5 * clamp01(v.recencyDays! / 60) + 0.3 * (1 - clamp01(v.responseRate!)) + 0.2 * (1 - clamp01(v.activityScore!))),
    rationale: (v) =>
      `احتمال ریزش بر پایه ${Math.round(v.recencyDays!)} روز عدم تعامل، نرخ پاسخ ${v.responseRate!.toFixed(2)} و فعالیت ${v.activityScore!.toFixed(2)}`,
  },
  conversionProbability: {
    keys: ["seriousnessScore", "budgetCompatibility", "previousVisits"],
    fn: (v) =>
      clamp01(0.4 * clamp01(v.seriousnessScore!) + 0.35 * clamp01(v.budgetCompatibility!) + 0.25 * clamp01(v.previousVisits! / 5)),
    rationale: (v) =>
      `احتمال تبدیل بر پایه جدیت ${v.seriousnessScore!.toFixed(2)}، سازگاری بودجه ${v.budgetCompatibility!.toFixed(2)} و ${Math.round(v.previousVisits!)} بازدید قبلی`,
  },
  capacitySaturation: {
    keys: ["currentLoad", "capacityScore"],
    fn: (v) => clamp01(0.7 * clamp01(v.currentLoad! / 20) + 0.3 * (1 - clamp01(v.capacityScore!))),
    rationale: (v) =>
      `اشباع ظرفیت بر پایه ${Math.round(v.currentLoad!)} پرونده فعال و نمره ظرفیت ${v.capacityScore!.toFixed(2)}`,
  },
  topRankProbability: {
    keys: ["conversionRate", "networkQuality", "activeDaysLast30"],
    fn: (v) =>
      clamp01(0.4 * clamp01(v.conversionRate!) + 0.3 * clamp01(v.networkQuality!) + 0.3 * clamp01(v.activeDaysLast30! / 30)),
    rationale: (v) =>
      `احتمال رتبه برتر بر پایه نرخ تبدیل ${v.conversionRate!.toFixed(2)}، کیفیت شبکه ${v.networkQuality!.toFixed(2)} و ${Math.round(v.activeDaysLast30!)} روز فعال در ۳۰ روز`,
  },
};

// ===================== بدنه =====================

export class PredictionEngineImpl implements PredictionEngine {
  readonly contractVersion = 1 as const;

  constructor(
    private readonly deps: {
      property?: PropertyPredictor;
      customer?: CustomerPredictor;
      expert?: ExpertPredictor;
    } = {},
  ) {}

  // ---------- قرارداد v1: predict (پل کم‌افت) ----------

  /**
   * پل v1 — شکل دقیق PredictionResult نسخه ۱:
   *  - هدف شناخته‌شده + کلیدهای کامل ⇔ heuristic روی بردار
   *  - وگرنه ⇔ نتیجه «داده ناکافی» صادقانه (predictedValue صفر، confidence صفر)
   *  - lowerBound/upperBound عمداً غایب — بدون کالیبراسیون PHASE 7،
   *    اختراع فاصله اطمینان مجاز نیست (قانون H).
   */
  async predict(query: PredictionQuery): Promise<PredictionResult> {
    const target = BRIDGE_TARGETS[query.target];
    const vector = query.features.vector ?? {};
    const computedAt = new Date().toISOString();

    if (!target) {
      return {
        id: crypto.randomUUID(),
        tileId: query.tileId,
        target: query.target,
        predictedValue: 0,
        unit: "probability",
        confidence: 0,
        horizonDays: query.horizonDays ?? 30,
        modelVersion: PREDICTION_BRIDGE_VERSION,
        rationale: `هدف «${query.target}» در پل v0 شناخته نشد — مسیر کامل: متد افزودنی دامنه‌ای`,
        computedAt,
      };
    }

    const missing = target.keys.filter((k) => typeof vector[k] !== "number");
    if (missing.length > 0) {
      return {
        id: crypto.randomUUID(),
        tileId: query.tileId,
        target: query.target,
        predictedValue: 0,
        unit: "probability",
        confidence: 0,
        horizonDays: query.horizonDays ?? 30,
        modelVersion: PREDICTION_BRIDGE_VERSION,
        rationale: `داده ناکافی برای «${query.target}» — کلیدهای غایب بردار: ${missing.join("، ")}`,
        computedAt,
      };
    }

    return {
      id: crypto.randomUUID(),
      tileId: query.tileId,
      target: query.target,
      predictedValue: target.fn(vector),
      unit: "probability",
      confidence: 0.5, // heuristic بدون کالیبراسیون — اعتماد میانه صادقانه
      horizonDays: query.horizonDays ?? 30,
      modelVersion: PREDICTION_BRIDGE_VERSION,
      rationale: target.rationale(vector),
      computedAt,
    };
  }

  // ---------- متدهای افزودنی دامنه‌ای (مسیر کامل) ----------

  async predictProperty(
    property: PropertyFeatureSet,
    market: MarketFeatureSet,
    options?: PredictOptions,
  ): Promise<PredictionRecord<PropertyPredictionPayload>> {
    return (this.deps.property ?? new PropertyPredictor()).predict(property, market, options);
  }

  async predictCustomer(
    customer: CustomerFeatureSet,
    options?: PredictOptions,
  ): Promise<PredictionRecord<CustomerPredictionPayload>> {
    return (this.deps.customer ?? new CustomerPredictor()).predict(customer, options);
  }

  async predictExpert(
    expert: ExpertFeatureSet,
    options?: PredictOptions,
  ): Promise<PredictionRecord<ExpertPredictionPayload>> {
    return (this.deps.expert ?? new ExpertPredictor()).predict(expert, options);
  }
}

// ===================== قابلیت اختیاری برای duck-typing ایجنت =====================

/**
 * قرارداد قابلیت «تولیدکننده پیش‌بینی» — برای duck-typing در
 * BaseIntelligentAgent.predict (P6-06)؛ موتور بدون این متدها همچنان
 * PredictionEngine معتبر v1 است (استاندارد قابلیت اختیاری فاز).
 */
export interface PredictionProducer {
  predictProperty(
    property: PropertyFeatureSet,
    market: MarketFeatureSet,
    options?: PredictOptions,
  ): Promise<PredictionRecord<PropertyPredictionPayload>>;
  predictCustomer(
    customer: CustomerFeatureSet,
    options?: PredictOptions,
  ): Promise<PredictionRecord<CustomerPredictionPayload>>;
  predictExpert(
    expert: ExpertFeatureSet,
    options?: PredictOptions,
  ): Promise<PredictionRecord<ExpertPredictionPayload>>;
}
