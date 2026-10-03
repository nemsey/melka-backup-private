/**
 * پیش‌بینی‌کننده ملک (PropertyPredictor) — PHASE 6 / P6-04
 * ------------------------------------------------------
 * heuristic شفاف v0 با ۹ خروجی فایل‌یابی (دستور PHASE 0).
 * جدول مرجع: docs/PREDICTION-CONTRACT.md بند ۴-۱.
 *
 * ⚠️ قانون H: این یک «baseline قابل ارزیابی» است — نه مدل آموخته‌شده.
 * دقت تنها با Outcome واقعی و Brier/Calibration در PHASE 7 سنجیده می‌شود.
 * همه وزن‌ها ثابت‌های exported و بازرسی‌پذیرند (قابل تنظیم برای PHASE 7).
 */

import { clamp01 } from "../../feature/builders/guards";
import type { PropertyFeatureSet } from "../../feature/builders/property-features";
import type { MarketFeatureSet } from "../../feature/builders/market-features";
import {
  makeDriver,
  type PredictionRecord,
  type PredictionRisk,
  type PredictOptions,
  type PropertyPredictionPayload,
} from "../prediction-record";
import { PROPERTY_FEATURES_VERSION } from "../../feature/feature-engine";

export const PROPERTY_PREDICTOR_VERSION = "property-predictor-v0.1";

/** جدول وزن — بازرسی‌پذیر و قابل تنظیم برای کالیبراسیون PHASE 7 */
export const PROPERTY_WEIGHTS = {
  personal: { publisher: 0.55, keyword: 0.25, photo: 0.2 },
  underprice: { ratio: 0.65, age: 0.2, priceDrop: 0.15 },
  contact: { personal: 0.45, underprice: 0.35, freshness: 0.2 },
  ownerVerification: { personal: 0.6, photo: 0.25, video: 0.15 },
  negotiation: { underprice: 0.5, priceChange: 0.3, age: 0.2 },
  crm: { contact: 0.6, personalPublisher: 0.25, description: 0.15 },
  transaction: { contact: 0.5, areaTrend: 0.25, marketPressure: 0.25 },
  revenueCommissionRate: 0.01, // فرض — در assumptions ثبت می‌شود
} as const;

/** پایه نوع آگهی‌دهنده برای سیگنال شخصی‌بودن */
function publisherBase(publisherType: PropertyFeatureSet["publisherType"]): number {
  if (publisherType === "personal") return 1;
  if (publisherType === "agency") return 0;
  return 0.5;
}

export class PropertyPredictor {
  predict(
    property: PropertyFeatureSet,
    market: MarketFeatureSet,
    options?: PredictOptions,
  ): PredictionRecord<PropertyPredictionPayload> {
    const w = PROPERTY_WEIGHTS;

    // ---------- سیگنال‌های خام ----------
    const keywordSignal = clamp01(property.descriptionKeywordScore);
    const photoSignal = 1 - clamp01(property.photoCount / 20);
    const ageSignal = clamp01(property.publishedHoursAgo / 720);
    const priceDropSignal = property.previousPriceDelta < 0 ? 1 : 0;
    const freshness = 1 - clamp01(property.publishedHoursAgo / 336);
    const trendSignal = clamp01(0.5 + market.priceTrend30d * 5);
    const pressureSignal = 1 - clamp01(market.supplyDemandRatio / 2);

    // ---------- ۹ خروجی فایل‌یابی ----------
    const personalProbability = clamp01(
      w.personal.publisher * publisherBase(property.publisherType) +
        w.personal.keyword * keywordSignal +
        w.personal.photo * photoSignal,
    );
    const underpriceProbability = clamp01(
      w.underprice.ratio * clamp01(property.underpriceRatio * 5) +
        w.underprice.age * ageSignal +
        w.underprice.priceDrop * priceDropSignal,
    );
    const contactProbability = clamp01(
      w.contact.personal * personalProbability +
        w.contact.underprice * underpriceProbability +
        w.contact.freshness * freshness,
    );
    const ownerVerificationProbability = clamp01(
      w.ownerVerification.personal * personalProbability +
        w.ownerVerification.photo * clamp01(property.photoCount / 20) +
        w.ownerVerification.video * (property.hasVideo ? 1 : 0),
    );
    const negotiationProbability = clamp01(
      w.negotiation.underprice * underpriceProbability +
        w.negotiation.priceChange * (property.priceChangeCount > 0 ? 1 : 0) +
        w.negotiation.age * ageSignal,
    );
    const crmRegistrationProbability = clamp01(
      w.crm.contact * contactProbability +
        w.crm.personalPublisher * (property.publisherType === "personal" ? 1 : 0.3) +
        w.crm.description * clamp01(property.descriptionLength / 1000),
    );
    const transactionProbability = clamp01(
      w.transaction.contact * contactProbability +
        w.transaction.areaTrend * trendSignal +
        w.transaction.marketPressure * pressureSignal,
    );
    const expectedRevenue = transactionProbability * property.price * w.revenueCommissionRate;
    const mostLikelyDays = Math.round(7 + 30 * (1 - transactionProbability));
    const expectedTimeToConversionDays = mostLikelyDays;

    // ---------- drivers (۶ — سه مستقیم + سه ترکیب contact) ----------
    const drivers = [
      makeDriver("contactProbability", Number(contactProbability.toFixed(4)), w.transaction.contact, contactProbability),
      makeDriver("market.priceTrend30d", market.priceTrend30d, w.transaction.areaTrend, trendSignal),
      makeDriver("market.supplyDemandRatio", market.supplyDemandRatio, w.transaction.marketPressure, pressureSignal),
      makeDriver("contact.personalProbability", Number(personalProbability.toFixed(4)), w.contact.personal, personalProbability),
      makeDriver("contact.underpriceProbability", Number(underpriceProbability.toFixed(4)), w.contact.underprice, underpriceProbability),
      makeDriver("contact.freshness", Number(freshness.toFixed(4)), w.contact.freshness, freshness),
    ];

    // ---------- risks قاعده‌محور ----------
    const risks: PredictionRisk[] = [];
    if (property.publisherType === "unknown") {
      risks.push({ type: "DATA_QUALITY", description: "نوع آگهی‌دهنده نامشخص — احتمال شخصی‌بودن با عدم قطعیت بالا", severity: "medium" });
    }
    if (market.sampleSize < 10) {
      risks.push({ type: "LOW_SAMPLE", description: "نمونه بازار این منطقه کم است — شاخص‌های منطقه قابل اتکا نیستند", severity: "high" });
    }
    if (property.underpriceRatio > 0.3) {
      risks.push({ type: "SUSPICIOUS_UNDERPRICE", description: "ارزانی غیرعادی نسبت به میانه منطقه — احتمال خطای داده یا آگهی مشکوک", severity: "high" });
    }
    if (property.photoCount === 0) {
      risks.push({ type: "THIN_LISTING", description: "آگهی بدون عکس — سیگنال کیفیت پایین", severity: "low" });
    }

    // ---------- assumptions ----------
    const assumptions = [
      "heuristic نسخه v0 — نه مدل آموخته‌شده؛ کالیبره با Outcome در PHASE 7",
      `کارمزد فرضی ${(w.revenueCommissionRate * 100).toFixed(0)}٪ برای expectedRevenue — عدد واقعی با Outcome کالیبره می‌شود`,
      "روند بازار از snapshot معتبر فرض می‌شود",
    ];

    const now = options?.now ?? new Date();
    return {
      predictionId: crypto.randomUUID(),
      predictionType: "PROPERTY",
      probability: transactionProbability,
      confidence: clamp01(
        0.4 + 0.3 * (property.publisherType !== "unknown" ? 1 : 0) + 0.3 * clamp01(market.sampleSize / 50),
      ),
      expectedValue: expectedRevenue,
      expectedTimeWindow: {
        minDays: Math.max(1, Math.ceil(mostLikelyDays / 3)),
        maxDays: mostLikelyDays * 2,
        mostLikelyDays,
      },
      drivers,
      risks,
      assumptions,
      modelVersion: PROPERTY_PREDICTOR_VERSION,
      featureVersion: PROPERTY_FEATURES_VERSION,
      contextSnapshot: {
        agentId: options?.agentId ?? "",
        tileId: options?.tileId ?? "",
        entityId: options?.entityId ?? "",
        entityType: "property",
        capturedAt: now,
        features: { property, market },
      },
      createdAt: now,
      payload: {
        personalProbability,
        underpriceProbability,
        contactProbability,
        ownerVerificationProbability,
        negotiationProbability,
        crmRegistrationProbability,
        transactionProbability,
        expectedRevenue,
        expectedTimeToConversionDays,
      },
    };
  }
}
