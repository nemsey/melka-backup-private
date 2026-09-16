/**
 * Builder ویژگی مشتری — PHASE 6 / P6-02
 * ------------------------------------------------------
 * تابع خالص: CustomerInput → CustomerFeatureSet.
 * قرارداد فیلدها: docs/PREDICTION-CONTRACT.md بند ۱-۲.
 *
 * نقش: clamp نمره‌ها به [0,1] + گارد نامنفی شمارندها + کپی دفاعی آرایه‌ها.
 * مشتق‌سازی جعلی نمی‌سازد (سند طراحی بند ۳-۳).
 *
 * نسخه ویژگی: customer-features-v1.
 */

import { clamp01, clampCount } from "./guards";

/** ورودی خام مشتری — تایپ ساده ضدفساد (بدون Prisma) */
export interface CustomerInput {
  id: string;
  /** RFM: روز از آخرین تعامل */
  recencyDays: number;
  /** RFM: تعداد تعاملات */
  frequencyCount: number;
  /** RFM: ارزش تخمینی (تومان) */
  monetaryValue: number;

  // رفتار (۰..۱)
  responseRate: number;
  seriousnessScore: number;
  budgetCompatibility: number;
  activityScore: number;

  // تاریخچه
  previousInquiries: number;
  previousVisits: number;
  previousTransactions: number;

  // زمینه
  preferredAreas: string[];
  preferredPropertyTypes: string[];
  preferredTradeType: string;
}

/** ویژگی‌های استاندارد مشتری — docs/PREDICTION-CONTRACT.md بند ۱-۲ */
export interface CustomerFeatureSet {
  // RFM
  recencyDays: number;
  frequencyCount: number;
  monetaryValue: number;

  // رفتار
  responseRate: number;
  seriousnessScore: number;
  budgetCompatibility: number;
  activityScore: number;

  // تاریخچه
  previousInquiries: number;
  previousVisits: number;
  previousTransactions: number;

  // زمینه
  preferredAreas: string[];
  preferredPropertyTypes: string[];
  preferredTradeType: string;
}

/**
 * ساخت ویژگی مشتری — خالص و حتمی.
 * آرایه‌ها کپی دفاعی می‌شوند تا فراخواننده با جهش ورودی، خروجی را نفسد نکند.
 */
export function buildCustomerFeatures(customer: CustomerInput): CustomerFeatureSet {
  return {
    recencyDays: clampCount(customer.recencyDays),
    frequencyCount: clampCount(customer.frequencyCount),
    monetaryValue: Math.max(0, Number.isNaN(customer.monetaryValue) ? 0 : customer.monetaryValue),

    responseRate: clamp01(customer.responseRate),
    seriousnessScore: clamp01(customer.seriousnessScore),
    budgetCompatibility: clamp01(customer.budgetCompatibility),
    activityScore: clamp01(customer.activityScore),

    previousInquiries: clampCount(customer.previousInquiries),
    previousVisits: clampCount(customer.previousVisits),
    previousTransactions: clampCount(customer.previousTransactions),

    preferredAreas: [...(customer.preferredAreas ?? [])],
    preferredPropertyTypes: [...(customer.preferredPropertyTypes ?? [])],
    preferredTradeType: customer.preferredTradeType ?? "",
  };
}
