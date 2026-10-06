/**
 * Builder ویژگی ملک — PHASE 6 / P6-02
 * ------------------------------------------------------
 * تابع خالص: PropertyInput (ضدفساد، بدون Prisma) + MarketFeatureSet
 * → PropertyFeatureSet. قرارداد فیلدها: docs/PREDICTION-CONTRACT.md بند ۱-۱.
 *
 * مرز (قوانین اجرایی):
 *  - خالص — ورودی یکسان همیشه خروجی یکسان (بدون clock/DB/fetch/React).
 *  - «ساعت‌دار بودن» از ورودی حذف شده: publishedHoursAgo از پیش محاسبه
 *    می‌آید (پیش‌فرض ۰) تا حتمیت ریاضی برقرار بماند.
 *  - فقط نرمال‌سازی + گارد مقادیر + مشتق صریح (underpriceRatio) —
 *    مشتق‌سازی جعلی نمی‌سازد (سند طراحی بند ۳-۳).
 *
 * نسخه ویژگی: property-features-v1.
 */

import type { MarketFeatureSet } from "./market-features";
import { clampCount, clampNonNegative } from "./guards";

/** ورودی خام ملک — تایپ ساده ضدفساد (بدون Prisma؛ ساعت‌ها از پیش‌محاسبه) */
export interface PropertyInput {
  id: string;
  areaId: string;
  areaName: string;
  districtId?: string;
  /** قیمت کل (تومان) */
  price: number;
  /** قیمت هر متر (تومان) */
  pricePerMeter: number;
  propertyType: string;
  tradeType: string;
  meterage: number;
  rooms: number;
  /** طبقه — علامت‌دار می‌ماند (زیرهمک = عدد نامثبت مجاز) */
  floor: number;
  /** سال ساخت */
  age: number;
  hasElevator: boolean;
  hasParking: boolean;
  photoCount: number;
  hasVideo: boolean;
  /** متن توضیح آگهی — طول آن محاسبه می‌شود؛ نبود = ۰ */
  description?: string;
  publisherType: "personal" | "agency" | "unknown";
  /** ساعت سپری‌شده از انتشار — فراخواننده (دارنده ساعت) محاسبه می‌کند */
  publishedHoursAgo?: number;
  priceChangeCount?: number;
  /** دلتای علامت‌دار آخرین تغییر قیمت (منفی = کاهش) */
  previousPriceDelta?: number;
}

/** ویژگی‌های استاندارد ملک — docs/PREDICTION-CONTRACT.md بند ۱-۱ */
export interface PropertyFeatureSet {
  // مکان
  areaId: string;
  areaName: string;
  districtId?: string;

  // قیمت
  price: number;
  pricePerMeter: number;
  areaMedianPricePerMeter: number;
  /** (median − pricePerMeter) / median — مثبت = ارزان‌تر از میانه؛ میانگین صفر ⇔ ۰ */
  underpriceRatio: number;

  // مشخصات ملک
  propertyType: string;
  tradeType: string;
  meterage: number;
  rooms: number;
  floor: number;
  age: number;
  hasElevator: boolean;
  hasParking: boolean;

  // آگهی
  photoCount: number;
  hasVideo: boolean;
  descriptionLength: number;
  /** امتیاز کلیدواژه‌ای توضیح (BM25) — از textSignals؛ پیش‌فرض ۰ */
  descriptionKeywordScore: number;
  publisherType: "personal" | "agency" | "unknown";
  publishedHoursAgo: number;

  // تاریخچه (اگر موجود)
  priceChangeCount: number;
  previousPriceDelta: number;
}

/** سیگنال‌های متنی اختیاری — از لایه بازیابی (BM25) می‌آید */
export interface PropertyTextSignals {
  keywordScore: number;
}

/**
 * ساخت ویژگی ملک — خالص و حتمی.
 * @param property ورودی خام (ضدفساد)
 * @param market ویژگی بازار همان منطقه
 * @param textSignals امتیاز کلیدواژه‌ای توضیح (اختیاری — پیش‌فرض صفر)
 */
export function buildPropertyFeatures(
  property: PropertyInput,
  market: MarketFeatureSet,
  textSignals?: PropertyTextSignals,
): PropertyFeatureSet {
  const price = clampNonNegative(property.price);
  const pricePerMeter = clampNonNegative(property.pricePerMeter);
  const median = clampNonNegative(market.medianPricePerMeter);

  // مشتق صریح با گارد تقسیم‌برصفر
  const underpriceRatio = median > 0 ? (median - pricePerMeter) / median : 0;

  return {
    areaId: property.areaId,
    areaName: property.areaName,
    districtId: property.districtId,

    price,
    pricePerMeter,
    areaMedianPricePerMeter: median,
    underpriceRatio,

    propertyType: property.propertyType,
    tradeType: property.tradeType,
    meterage: clampNonNegative(property.meterage),
    rooms: clampCount(property.rooms),
    floor: property.floor,
    age: clampNonNegative(property.age),
    hasElevator: property.hasElevator === true,
    hasParking: property.hasParking === true,

    photoCount: clampCount(property.photoCount),
    hasVideo: property.hasVideo === true,
    descriptionLength: clampCount(property.description?.length ?? 0),
    descriptionKeywordScore: clampNonNegative(textSignals?.keywordScore ?? 0),
    publisherType: property.publisherType ?? "unknown",
    publishedHoursAgo: clampNonNegative(property.publishedHoursAgo ?? 0),

    priceChangeCount: clampCount(property.priceChangeCount ?? 0),
    previousPriceDelta:
      typeof property.previousPriceDelta === "number" && !Number.isNaN(property.previousPriceDelta)
        ? property.previousPriceDelta
        : 0,
  };
}
