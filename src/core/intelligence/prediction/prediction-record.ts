/**
 * رکورد پیش‌بینی استاندارد (PredictionRecord) — PHASE 6 / P6-04
 * ------------------------------------------------------
 * ساختار قابل‌ارزیابی برای حلقه Outcome در PHASE 7.
 *
 * ⚠️ نام‌گذاری صادقانه: پیش‌نویس دستور این ساختار را «PredictionResult»
 * نام‌گذاری کرده بود؛ این نام در قرارداد v1 (engines/prediction.ts) معنای
 * ثابت دیگری دارد. برای دست‌نخوردن ماندن v1 و پرهیز از ابهام export،
 * ساختار استاندارد «PredictionRecord» نام گرفت (رویه P5-01 / RetrievedItem).
 *
 * مرز: صفر Prisma / صفر fetch / صفر React — فقط تایپ و کارخانه driver.
 */

// ===================== انواع پایه =====================

export type PredictionType = "PROPERTY" | "CUSTOMER" | "EXPERT" | "MARKET";

/** محرک پیش‌بینی — سهم هر ویژگی در امتیاز نهایی، با جهت شفاف */
export interface PredictionDriver {
  /** نام ویژگی (نقطه‌گذاری سطح‌دار: «contact.personalProbability») */
  feature: string;
  value: number | string;
  /** w·signal — سهم این ویژگی در امتیاز نهایی */
  contribution: number;
  /** وزن در جدول heuristic */
  weight: number;
  /**
   * جهت نسبت به نقطه میانه سیگنال (۰٫۵):
   * positive = مقدار فعلی موافق احتمال · negative = مخالف · neutral = میانه
   */
  direction: "positive" | "negative" | "neutral";
}

/** ریسک شناخته‌شده — قاعده‌محور، نه حدس */
export interface PredictionRisk {
  type: string;
  description: string;
  severity: "low" | "medium" | "high";
}

/** پنجره زمانی موردانتظار (روز) */
export interface PredictionTimeWindow {
  minDays: number;
  maxDays: number;
  mostLikelyDays: number;
}

/** snapshot زمینه تولید — مبنای ارزیابی PHASE 7 */
export interface PredictionContextSnapshot {
  agentId: string;
  tileId: string;
  entityId: string;
  entityType: "property" | "customer" | "expert" | "market";
  capturedAt: Date;
  /** snapshot کامل FeatureSetهای ورودی در لحظه پیش‌بینی */
  features: Record<string, unknown>;
}

// ===================== رکورد استاندارد =====================

/**
 * رکورد پیش‌بینی استاندارد — تمام ۱۲ فیلد مصوب دستور + linkedOutcomeId (P6-05)
 * + payload تایپ‌شده دامنه (generic T — مثلاً ۹ احتمال فایل‌یابی).
 */
export interface PredictionRecord<T = unknown> {
  predictionId: string;
  predictionType: PredictionType;

  /** احتمال اصلی ۰..۱ — PROPERTY⇔transaction · CUSTOMER⇔conversion · EXPERT⇔topRank */
  probability: number;
  /** ۰..۱ — اعتماد به داده پشت محاسبه (نه دقت پیش‌بینی — قانون H) */
  confidence: number;

  /** PROPERTY ⇔ expectedRevenue (تومان) */
  expectedValue?: number;
  expectedTimeWindow?: PredictionTimeWindow;

  /** حداقل ۳ — قابل توضیح */
  drivers: PredictionDriver[];
  risks: PredictionRisk[];
  assumptions: string[];

  modelVersion: string;
  featureVersion: string;

  contextSnapshot: PredictionContextSnapshot;
  createdAt: Date;
  /** PHASE 7 — حلقه Outcome */
  linkedOutcomeId?: string;
  /** خروجی‌های تایپ‌شده دامنه — مثلاً ۹ احتمال فایل‌یابی برای PROPERTY */
  payload: T;
}

// ===================== payloadهای دامنه =====================

/** ۹ خروجی فایل‌یابی (دستور PHASE 0) — پیش‌بینی ملک */
export interface PropertyPredictionPayload {
  personalProbability: number;
  underpriceProbability: number;
  contactProbability: number;
  ownerVerificationProbability: number;
  negotiationProbability: number;
  crmRegistrationProbability: number;
  transactionProbability: number;
  /** درآمد موردانتظار (تومان) — کارمزد فرضی ۱٪ (assumptions) */
  expectedRevenue: number;
  /** روزِ محتمل‌ترین تبدیل */
  expectedTimeToConversionDays: number;
}

export interface CustomerPredictionPayload {
  churnProbability: number;
  conversionProbability: number;
}

export interface ExpertPredictionPayload {
  capacitySaturation: number;
  topRankProbability: number;
}

// ===================== گزینه‌های مشترک =====================

/**
 * گزینه‌های محرک‌های پیش‌بینی — الگوی asOf فاز ۴:
 * now تزریشی ⇔ حتمیت در تست؛ agentId/tileId/entityId برای contextSnapshot.
 */
export interface PredictOptions {
  now?: Date;
  agentId?: string;
  tileId?: string;
  entityId?: string;
}

// ===================== کارخانه driver =====================

/**
 * ساخت driver با جهت‌دهی نسبت به میانه سیگنال.
 * @param feature نام ویژگی (نقطه‌گذاری سطح‌دار مجاز)
 * @param value مقدار خام ویژگی (نمایشی)
 * @param weight وزن جدول heuristic
 * @param signal سیگنال جهت‌دارِ نرمال‌شده ۰..۱ (بالا = موافق احتمال)
 */
export function makeDriver(
  feature: string,
  value: number | string,
  weight: number,
  signal: number,
): PredictionDriver {
  return {
    feature,
    value,
    contribution: weight * signal,
    weight,
    direction: signal > 0.5 ? "positive" : signal < 0.5 ? "negative" : "neutral",
  };
}
