/**
 * Builder ویژگی کارشناس — PHASE 6 / P6-02
 * ------------------------------------------------------
 * تابع خالص: ExpertInput → ExpertFeatureSet.
 * قرارداد فیلدها: docs/PREDICTION-CONTRACT.md بند ۱-۳.
 *
 * نقش: clamp نمره‌ها به [0,1] + گارد نامنفی شمارندها.
 * مشتق‌سازی جعلی نمی‌سازد (سند طراحی بند ۳-۳).
 *
 * نسخه ویژگی: expert-features-v1.
 */

import { clamp01, clampCount } from "./guards";

/** ورودی خام کارشناس — تایپ ساده ضدفساد (بدون Prisma) */
export interface ExpertInput {
  id: string;
  personnelCode: string;

  // فعالیت
  activeDaysLast30: number;
  interactionsLast30: number;

  // کیفیت (۰..۱)
  responseRate: number;
  conversionRate: number;
  cooperationScore: number;

  // ظرفیت
  /** پرونده‌های فعال فعلی */
  currentLoad: number;
  /** کیفیت ظرفیت (۰..۱) */
  capacityScore: number;

  // شبکه
  networkSize: number;
  /** کیفیت شبکه (۰..۱) */
  networkQuality: number;
}

/** ویژگی‌های استاندارد کارشناس — docs/PREDICTION-CONTRACT.md بند ۱-۳ */
export interface ExpertFeatureSet {
  personnelCode: string;

  // فعالیت
  activeDaysLast30: number;
  interactionsLast30: number;

  // کیفیت
  responseRate: number;
  conversionRate: number;
  cooperationScore: number;

  // ظرفیت
  currentLoad: number;
  capacityScore: number;

  // شبکه
  networkSize: number;
  networkQuality: number;
}

/** ساخت ویژگی کارشناس — خالص و حتمی */
export function buildExpertFeatures(expert: ExpertInput): ExpertFeatureSet {
  return {
    personnelCode: expert.personnelCode ?? "",

    activeDaysLast30: clampCount(expert.activeDaysLast30),
    interactionsLast30: clampCount(expert.interactionsLast30),

    responseRate: clamp01(expert.responseRate),
    conversionRate: clamp01(expert.conversionRate),
    cooperationScore: clamp01(expert.cooperationScore),

    currentLoad: clampCount(expert.currentLoad),
    capacityScore: clamp01(expert.capacityScore),

    networkSize: clampCount(expert.networkSize),
    networkQuality: clamp01(expert.networkQuality),
  };
}
