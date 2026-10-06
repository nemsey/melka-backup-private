/**
 * Builder ویژگی بازار — PHASE 6 / P6-02
 * ------------------------------------------------------
 * تابع خالص: MarketSampleInput → MarketFeatureSet.
 * قرارداد فیلدها: docs/PREDICTION-CONTRACT.md بند ۱-۴.
 *
 * نقش: محاسبه آمار توصیفی (میانه/میانگین/اندازه) از نمونه‌های
 * قیمت-متری + گارد غیبت روندها. نمونه صفر ⇔ آمار صفر + confidence صفر
 * (صداقت داده، نه عدد جعلی).
 *
 * نسخه ویژگی: market-features-v1.
 */

import { clamp01, clampNonNegative } from "./guards";

/** نمونه قیمت-متری یک آگهی/معامله در منطقه */
export interface MarketPriceSample {
  pricePerMeter: number;
}

/** ورودی خام بازار — ضدفساد؛ روندها اختیاری (غایب ⇔ ۰؛ نسبت ⇔ ۱ خنثی) */
export interface MarketSampleInput {
  areaId: string;
  /** تاریخ اسنپ‌شات — از ورودی می‌آید (builder ساعت نمی‌خواند) */
  snapshotDate: Date | string;
  /** نمونه‌های قیمت هر متر در این اسنپ‌شات */
  samples: ReadonlyArray<MarketPriceSample>;
  /** تغییر کسری قیمت ۷روزه (0.03 = +۳٪) — اختیاری */
  priceTrend7d?: number;
  /** تغییر کسری قیمت ۳۰روزه — اختیاری */
  priceTrend30d?: number;
  /** تغییر کسری حجم ۷روزه — اختیاری */
  volumeTrend7d?: number;
  /** نوسان (انحراف معیار نرمال‌شده) — اختیاری */
  volatility?: number;
  /** نسبت عرضه/تقاضا (۱ = متعادل) — اختیاری؛ پیش‌فرض خنثی ۱ */
  supplyDemandRatio?: number;
}

/** ویژگی‌های استاندارد بازار — docs/PREDICTION-CONTRACT.md بند ۱-۴ */
export interface MarketFeatureSet {
  areaId: string;
  snapshotDate: Date;

  // شاخص‌های کلی
  medianPricePerMeter: number;
  averagePricePerMeter: number;
  sampleSize: number;
  confidence: number;

  // روند
  priceTrend7d: number;
  priceTrend30d: number;
  volumeTrend7d: number;

  // نوسان
  volatility: number;
  supplyDemandRatio: number;
}

/** میانه آرایه اعداد — خالص؛ خالی ⇔ ۰ */
function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * ساخت ویژگی بازار — خالص و حتمی.
 * confidence = clamp01(sampleSize/50) × (سه روند حاضر؟ ۱ : ۰٫۷)
 */
export function buildMarketFeatures(snapshot: MarketSampleInput): MarketFeatureSet {
  const prices = snapshot.samples
    .map((s) => clampNonNegative(s.pricePerMeter))
    .filter((p) => p > 0);
  const sampleSize = snapshot.samples.length; // اندازه واقعی — نه فقط قیمت‌های مثبت

  const median = medianOf(prices);
  const average =
    prices.length > 0 ? prices.reduce((sum, p) => sum + p, 0) / prices.length : 0;

  const hasAllTrends =
    typeof snapshot.priceTrend7d === "number" &&
    typeof snapshot.priceTrend30d === "number" &&
    typeof snapshot.volumeTrend7d === "number";

  const confidence = clamp01(sampleSize / 50) * (hasAllTrends ? 1 : 0.7);

  return {
    areaId: snapshot.areaId,
    snapshotDate: new Date(snapshot.snapshotDate),

    medianPricePerMeter: median,
    averagePricePerMeter: average,
    sampleSize,
    confidence,

    priceTrend7d: snapshot.priceTrend7d ?? 0,
    priceTrend30d: snapshot.priceTrend30d ?? 0,
    volumeTrend7d: snapshot.volumeTrend7d ?? 0,

    volatility: clampNonNegative(snapshot.volatility ?? 0),
    supplyDemandRatio:
      typeof snapshot.supplyDemandRatio === "number" &&
      !Number.isNaN(snapshot.supplyDemandRatio) &&
      snapshot.supplyDemandRatio > 0
        ? snapshot.supplyDemandRatio
        : 1,
  };
}
