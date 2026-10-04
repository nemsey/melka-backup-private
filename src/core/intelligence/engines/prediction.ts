/**
 * قرارداد موتور پیش‌بینی (PredictionEngine) — PHASE 3 / interface خالص
 * ------------------------------------------------------
 * مسئولیت: تولید پیش‌بینی احتمالاتی استاندارد PredictionResult به‌جای
 * heuristicهای هاردکد امروزی (یافته F3 ممیزی PHASE 0). هر پیش‌بینی:
 * موضوع، مقدار نقطه‌ای، بازه اطمینان، افق، نسخه مدل، توضیح.
 *
 * مرز (قوانین اجرایی):
 *  - احتمالات همیشه در بازه [0,1] یا مقیاس اعلام‌شده.
 *  - rationale فارسی و قابل‌نمایش.
 *  - ذخیره‌سازی از طریق PredictionRepository تزریقی (فقط در فاز پیاده‌سازی).
 *
 * نسخه قرارداد: 1 — ساختار استاندارد یکسان برای همه ایجنت‌ها.
 * فاز پیاده‌سازی بدنه: PHASE 6. در PHASE 3 فقط قرارداد.
 */

import type { FeatureSet } from "./feature";

export interface PredictionQuery {
  tileId: string;
  target: string;
  features: FeatureSet;
  horizonDays?: number;
}

export interface PredictionResult {
  id: string;
  tileId: string;
  target: string;
  predictedValue: number;
  unit: string;
  /** اطمینان در بازه [0,1] */
  confidence: number;
  lowerBound?: number;
  upperBound?: number;
  horizonDays: number;
  modelVersion: string;
  rationale: string;
  computedAt: string;
}

export interface PredictionEngine {
  readonly contractVersion: 1;
  predict(query: PredictionQuery): Promise<PredictionResult>;
}
