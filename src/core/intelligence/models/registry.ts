/**
 * P6545 / گام ۳ — BLOCK 3.1 + 3.2: تعریف رسمی مفاهیم + رجیستری مدل‌ها
 * ---------------------------------------------------------------------------
 * تعریف رسمی مصوب شورا (جلسه ۰۳۳):
 *   مغز (Brain)  = Intelligence Core با ۱۱ موتور — دقیقاً ۱ عدد
 *   مدل (Model)  = پیکربندی مغز برای یک دامنه — چند (۴+)
 *   ایجنت (Agent) = متخصص دامنه که مدل را فراخوانی می‌کند — ۴+
 *
 * قید مطلق: هر مدل جدید باید از همان ۱۱ موتور استفاده کند — صفر موتور
 * جداگانه (engineSet = "SHARED-11"). مدل فقط پیکربندی است.
 * هر مدل Tier مستقل دارد (چرخهٔ پیامد خودش).
 */

import type { LearningTier } from "@/core/intelligence/contracts-p7-p11";
import { TIER_PROFILES } from "@/core/intelligence/contracts-p7-p11";

/** دامنه‌های چهارگانهٔ ملکا (M1-M4) */
export type ModelDomain = "property" | "request" | "transaction" | "expert";

/** نوع پیامدی که مدل برای آن کالیبره می‌شود */
export type ModelOutcomeType = "listing_deal" | "request_match" | "transaction_success" | "expert_performance";

/** پیش‌بین مصرفی از مجموعهٔ مشترک (PredictionEngine) */
export type ModelPredictor = "PROPERTY" | "CUSTOMER" | "EXPERT" | "none";

export interface ModelConfig {
  /** شناسهٔ پایدار مدل — مثل melka-property-v3 */
  modelId: string;
  domain: ModelDomain;
  /** کاشی مرتبط */
  tileId: string;
  /** پیش‌بین مصرفی (از همان PredictionEngine مشترک) */
  predictor: ModelPredictor;
  /** نوع پیامد */
  outcomeType: ModelOutcomeType;
  /** ویژگی‌های ورودی — کلیدهای FeatureStore مشترک */
  features: string[];
  /** توضیح فارسی دامنه */
  description: string;
  /** همهٔ مدل‌ها از همان ۱۱ موتور استفاده می‌کنند — قفل نوعی */
  engineSet: "SHARED-11";
}

/** وضعیت Tier مستقل هر مدل — از چرخهٔ پیامد خودش */
export interface ModelTierState {
  modelId: string;
  linkedOutcomes: number;
  distinctPeriods: number;
  tier: LearningTier;
  nextTierAt: number | null; // چند نتیجهٔ واقعی تا Tier بعدی
}

/* ───────────────── چهار مدل مصوب جلسه ۰۳۳ (BLOCK 3.2) ───────────────── */

export const MODEL_PROPERTY: ModelConfig = {
  modelId: "melka-property-v3",
  domain: "property",
  tileId: "arm-listings",
  predictor: "PROPERTY",
  outcomeType: "listing_deal",
  features: ["property.areaId", "property.price", "property.pricePerMeter", "property.meterage", "property.propertyType", "property.tradeType", "property.rooms", "property.age", "market.medianPricePerMeter", "market.underpriceRatio", "market.supplyDemandRatio"],
  description: "آگهی‌های ملک — پیامد: فروش/اجاره شدن آگهی",
  engineSet: "SHARED-11",
};

export const MODEL_REQUEST: ModelConfig = {
  modelId: "melka-request-v1",
  domain: "request",
  tileId: "arm-requests",
  predictor: "CUSTOMER",
  outcomeType: "request_match",
  features: ["customer.seriousness", "customer.paymentMethod", "customer.areaPreference", "customer.budgetRange", "customer.freshness"],
  description: "درخواست‌ها — پیامد: درخواست به معامله رسید؟",
  engineSet: "SHARED-11",
};

export const MODEL_TRANSACTION: ModelConfig = {
  modelId: "melka-transaction-v2",
  domain: "transaction",
  tileId: "transactions-contracts",
  predictor: "none", // پیامد‌محور: معامله واقعیت است نه پیش‌بینی جلو — ثبت پیامد و بینش
  outcomeType: "transaction_success",
  features: ["transaction.contractType", "transaction.contractPrice", "transaction.areaName", "transaction.expertHistory", "transaction.season"],
  description: "معاملات — پیامد: زمان بسته شدن و قیمت نهایی",
  engineSet: "SHARED-11",
};

export const MODEL_EXPERT: ModelConfig = {
  modelId: "melka-expert-v1",
  domain: "expert",
  tileId: "experts",
  predictor: "EXPERT",
  outcomeType: "expert_performance",
  features: ["expert.branch", "expert.role", "expert.businessTitle", "expert.dealHistory", "expert.activeStatus"],
  description: "کارشناسان — پیامد: موفقیت در معامله بعدی",
  engineSet: "SHARED-11",
};

/* ───────────────── رجیستری ───────────────── */

/**
 * رجیستری مدل‌ها — منبع یگانهٔ حقیقت.
 * مدل فقط پیکربندی است؛ موتورها همیشه مشترک‌اند (قفل engineSet).
 */
export class ModelRegistry {
  private readonly models = new Map<string, ModelConfig>();
  private readonly tierStates = new Map<string, ModelTierState>();

  register(config: ModelConfig): void {
    if (config.engineSet !== "SHARED-11") {
      throw new Error("قفل شورا: هر مدل باید از همان ۱۱ موتور استفاده کند (engineSet=SHARED-11)");
    }
    if (this.models.has(config.modelId)) {
      throw new Error(`مدل ${config.modelId} قبلاً ثبت شده است`);
    }
    this.models.set(config.modelId, config);
    // Tier اولیه: صفر نتیجه = Tier 0
    this.tierStates.set(config.modelId, { modelId: config.modelId, linkedOutcomes: 0, distinctPeriods: 0, tier: 0, nextTierAt: TIER_PROFILES[1].minOutcomes });
  }

  get(modelId: string): ModelConfig | undefined {
    return this.models.get(modelId);
  }

  list(): ModelConfig[] {
    return [...this.models.values()];
  }

  byTile(tileId: string): ModelConfig | undefined {
    return this.list().find((m) => m.tileId === tileId);
  }

  byDomain(domain: ModelDomain): ModelConfig | undefined {
    return this.list().find((m) => m.domain === domain);
  }

  /** به‌روزرسانی Tier مستقل مدل از چرخهٔ پیامد خودش */
  updateTierState(modelId: string, linkedOutcomes: number, distinctPeriods: number, tier: LearningTier): void {
    const cfg = this.models.get(modelId);
    if (!cfg) throw new Error(`مدل ${modelId} ثبت نشده است`);
    const nextProfile = tier < 4 ? TIER_PROFILES[tier + 1] : null;
    this.tierStates.set(modelId, {
      modelId,
      linkedOutcomes,
      distinctPeriods,
      tier,
      nextTierAt: nextProfile ? Math.max(0, nextProfile.minOutcomes - linkedOutcomes) : null,
    });
  }

  tierState(modelId: string): ModelTierState {
    return this.tierStates.get(modelId) ?? { modelId, linkedOutcomes: 0, distinctPeriods: 0, tier: 0, nextTierAt: TIER_PROFILES[1].minOutcomes };
  }

  allTierStates(): ModelTierState[] {
    return [...this.tierStates.values()];
  }

  get size(): number {
    return this.models.size;
  }
}

/** رجیستری singleton — با چهار مدل مصوب جلسه ۰۳۳ ثبت‌شده */
export const modelRegistry = new ModelRegistry();

/** ثبت چهار مدل (idempotent — بار دوم skip) */
export function bootstrapModels(): ModelRegistry {
  const existing = modelRegistry.list().map((m) => m.modelId);
  if (!existing.includes(MODEL_PROPERTY.modelId)) modelRegistry.register(MODEL_PROPERTY);
  if (!existing.includes(MODEL_REQUEST.modelId)) modelRegistry.register(MODEL_REQUEST);
  if (!existing.includes(MODEL_TRANSACTION.modelId)) modelRegistry.register(MODEL_TRANSACTION);
  if (!existing.includes(MODEL_EXPERT.modelId)) modelRegistry.register(MODEL_EXPERT);
  return modelRegistry;
}
