/**
 * تست‌های PHASE 6 — موتور پیش‌بینی (P6-04)
 * ------------------------------------------------------
 * پوشش (سند طراحی PHASE-6-DESIGN بند ۶ — بلوک PredictionEngine):
 *  ۱) سه predictor: فرمول‌های مرجع + payload کامل + drivers ≥۳ + risks + assumptions
 *  ۲) حتمیت با now ثابت (بدون predictionId/createdAt — سنداً)
 *  ۳) پل v1: هدف شناخته‌شده + هدف ناشناخته/کلید غایب + غیبت صادقانه bounds
 *
 * صفر وابستگی DB — heuristicهای خالص.
 */

import { describe, expect, test } from "bun:test";

import {
  PropertyPredictor,
  PROPERTY_PREDICTOR_VERSION,
} from "@/core/intelligence/prediction/predictors/property-predictor";
import {
  CustomerPredictor,
  CUSTOMER_PREDICTOR_VERSION,
} from "@/core/intelligence/prediction/predictors/customer-predictor";
import {
  ExpertPredictor,
  EXPERT_PREDICTOR_VERSION,
} from "@/core/intelligence/prediction/predictors/expert-predictor";
import {
  PredictionEngineImpl,
  PREDICTION_BRIDGE_VERSION,
} from "@/core/intelligence/prediction/prediction-engine";
import type { PredictionRecord } from "@/core/intelligence/prediction/prediction-record";
import type { PropertyFeatureSet } from "@/core/intelligence/feature/builders/property-features";
import type { MarketFeatureSet } from "@/core/intelligence/feature/builders/market-features";
import type { CustomerFeatureSet } from "@/core/intelligence/feature/builders/customer-features";
import type { ExpertFeatureSet } from "@/core/intelligence/feature/builders/expert-features";
import type { FeatureSet } from "@/core/intelligence/engines/feature";

// ===================== fixtureهای ثابت =====================

const NOW = new Date("2026-09-16T12:00:00.000Z");

const property: PropertyFeatureSet = {
  areaId: "area-veliasr",
  areaName: "ولیعصر",
  price: 3_200_000_000,
  pricePerMeter: 80_000_000,
  areaMedianPricePerMeter: 100_000_000,
  underpriceRatio: 0.2,
  propertyType: "apartment",
  tradeType: "sell",
  meterage: 40,
  rooms: 2,
  floor: 3,
  age: 12,
  hasElevator: true,
  hasParking: false,
  photoCount: 6,
  hasVideo: false,
  descriptionLength: 27,
  descriptionKeywordScore: 0.6,
  publisherType: "personal",
  publishedHoursAgo: 48,
  priceChangeCount: 1,
  previousPriceDelta: -150_000_000,
};

const market: MarketFeatureSet = {
  areaId: "area-veliasr",
  snapshotDate: NOW,
  medianPricePerMeter: 100_000_000,
  averagePricePerMeter: 102_000_000,
  sampleSize: 40,
  confidence: 0.8,
  priceTrend7d: 0.01,
  priceTrend30d: 0.03,
  volumeTrend7d: -0.02,
  volatility: 0.05,
  supplyDemandRatio: 1.2,
};

const customer: CustomerFeatureSet = {
  recencyDays: 7,
  frequencyCount: 12,
  monetaryValue: 3_000_000_000,
  responseRate: 0.8,
  seriousnessScore: 0.7,
  budgetCompatibility: 0.9,
  activityScore: 0.6,
  previousInquiries: 4,
  previousVisits: 2,
  previousTransactions: 0,
  preferredAreas: ["ولیعصر"],
  preferredPropertyTypes: ["apartment"],
  preferredTradeType: "buy",
};

const expert: ExpertFeatureSet = {
  personnelCode: "PC-2041",
  activeDaysLast30: 22,
  interactionsLast30: 140,
  responseRate: 0.9,
  conversionRate: 0.35,
  cooperationScore: 0.8,
  currentLoad: 18,
  capacityScore: 0.6,
  networkSize: 15,
  networkQuality: 0.7,
};

/** مقایسه حتمی: بدون predictionId/createdAt (تنها رشته‌های غیرحتمی مجازند) */
function stablePart<T>(r: PredictionRecord<T>): Omit<PredictionRecord<T>, "predictionId" | "createdAt"> {
  const { predictionId: _id, createdAt: _at, ...rest } = r;
  return rest;
}

// ===================== ۱) PropertyPredictor =====================

describe("P6-04 PropertyPredictor — ۹ خروجی فایل‌یابی", () => {
  const predictor = new PropertyPredictor();

  test("payload کامل ۹فیلدی + محدوده‌ها + expectedRevenue + پنجره زمانی + drivers/risks/assumptions", () => {
    const r = predictor.predict(property, market, { now: NOW, entityId: "prop-001", agentId: "agent-x", tileId: "tile-req" });

    const p = r.payload;
    // همه احتمال‌ها در [0,1]
    for (const key of [
      "personalProbability", "underpriceProbability", "contactProbability",
      "ownerVerificationProbability", "negotiationProbability",
      "crmRegistrationProbability", "transactionProbability",
    ] as const) {
      expect(p[key]).toBeGreaterThanOrEqual(0);
      expect(p[key]).toBeLessThanOrEqual(1);
    }
    // احتمال اصلی = transactionProbability
    expect(r.probability).toBe(p.transactionProbability);
    // expectedRevenue = p × price × 1%
    expect(p.expectedRevenue).toBeCloseTo(p.transactionProbability * 3_200_000_000 * 0.01, 6);
    expect(r.expectedValue).toBe(p.expectedRevenue);
    // پنجره زمانی
    const w = r.expectedTimeWindow!;
    expect(w.mostLikelyDays).toBe(p.expectedTimeToConversionDays);
    expect(w.minDays).toBeGreaterThanOrEqual(1);
    expect(w.maxDays).toBe(w.mostLikelyDays * 2);
    // ساختار استاندارد
    expect(r.predictionType).toBe("PROPERTY");
    expect(r.modelVersion).toBe(PROPERTY_PREDICTOR_VERSION);
    expect(r.featureVersion).toBe("property-features-v1");
    expect(r.drivers.length).toBeGreaterThanOrEqual(3);
    expect(r.assumptions.some((a) => a.includes("heuristic"))).toBe(true);
    expect(r.assumptions.some((a) => a.includes("کارمزد"))).toBe(true);
    // snapshot
    expect(r.contextSnapshot.entityId).toBe("prop-001");
    expect(r.contextSnapshot.agentId).toBe("agent-x");
    expect(r.contextSnapshot.tileId).toBe("tile-req");
    expect(r.contextSnapshot.entityType).toBe("property");
    expect(r.contextSnapshot.capturedAt.getTime()).toBe(NOW.getTime());
    expect((r.contextSnapshot.features.property as PropertyFeatureSet).price).toBe(3_200_000_000);
    // فرمول دستی: personal = 0.55·1 + 0.25·0.6 + 0.20·(1−0.3) = 0.55+0.15+0.14 = 0.84
    expect(p.personalProbability).toBeCloseTo(0.84, 10);
  });

  test("risks قاعده‌محور: نمونه کم بازار + آگهی بدون عکس + ارزانی مشکوک", () => {
    const r = predictor.predict(
      property,
      { ...market, sampleSize: 5 },
      { now: NOW },
    );
    expect(r.risks.some((x) => x.type === "LOW_SAMPLE" && x.severity === "high")).toBe(true);

    const thin = predictor.predict(
      { ...property, photoCount: 0, underpriceRatio: 0.4 },
      { ...market, sampleSize: 5 },
      { now: NOW },
    );
    expect(thin.risks.some((x) => x.type === "THIN_LISTING")).toBe(true);
    expect(thin.risks.some((x) => x.type === "SUSPICIOUS_UNDERPRICE" && x.severity === "high")).toBe(true);
  });

  test("حتمیت: دو فراخوانی با now یکسان ⇔ هم‌ارز (بدون predictionId/createdAt) + ordering sanely", () => {
    const a = predictor.predict(property, market, { now: NOW });
    const b = predictor.predict(property, market, { now: NOW });
    expect(stablePart(a)).toEqual(stablePart(b));

    // آگهی شخصی ارزان‌تر از آگهی آژانسی گران — احتمال تماس بالاتر
    const agencyOverpriced = predictor.predict(
      { ...property, publisherType: "agency", underpriceRatio: -0.1 },
      market,
      { now: NOW },
    );
    expect(a.payload.personalProbability).toBeGreaterThan(agencyOverpriced.payload.personalProbability);
    expect(a.payload.contactProbability).toBeGreaterThan(agencyOverpriced.payload.contactProbability);
  });
});

// ===================== ۲) CustomerPredictor =====================

describe("P6-04 CustomerPredictor — churn + conversion", () => {
  const predictor = new CustomerPredictor();

  test("فرمول‌های مرجع + drivers ≥۳ + proxy مستند در assumptions", () => {
    const r = predictor.predict(customer, { now: NOW, entityId: "cust-001" });
    // conversion = 0.4·0.7 + 0.35·0.9 + 0.25·(2/5) = 0.28+0.315+0.1 = 0.695
    expect(r.payload.conversionProbability).toBeCloseTo(0.695, 10);
    // churn = 0.5·(7/60) + 0.3·0.2 + 0.2·0.4 = 0.0583…+0.06+0.08
    expect(r.payload.churnProbability).toBeCloseTo(0.5 * (7 / 60) + 0.3 * 0.2 + 0.2 * 0.4, 10);
    expect(r.probability).toBe(r.payload.conversionProbability);
    expect(r.modelVersion).toBe(CUSTOMER_PREDICTOR_VERSION);
    expect(r.drivers.length).toBeGreaterThanOrEqual(3);
    expect(r.assumptions.some((a) => a.includes("previousVisits"))).toBe(true);
    expect(r.expectedValue).toBeUndefined(); // فقط PROPERTY
    expect(r.expectedTimeWindow).toBeUndefined();
    expect(r.contextSnapshot.entityType).toBe("customer");
  });

  test("ریسک INACTIVITY برای مشتری خاموش + NO_HISTORY", () => {
    const r = predictor.predict({ ...customer, recencyDays: 45 }, { now: NOW });
    expect(r.risks.some((x) => x.type === "INACTIVITY" && x.severity === "medium")).toBe(true);
    expect(r.risks.some((x) => x.type === "NO_HISTORY")).toBe(true);
    // خاموشی بیشتر ⇔ churn بالاتر
    expect(r.payload.churnProbability).toBeGreaterThan(
      predictor.predict(customer, { now: NOW }).payload.churnProbability,
    );
  });
});

// ===================== ۳) ExpertPredictor =====================

describe("P6-04 ExpertPredictor — capacitySaturation + topRank", () => {
  const predictor = new ExpertPredictor();

  test("فرمول‌ها + proxy فعالیت + ریسک OVERLOADED فقط در اشباع واقعی", () => {
    const r = predictor.predict(expert, { now: NOW, entityId: "exp-001" });
    // saturation = 0.7·(18/20) + 0.3·0.4 = 0.63+0.12 = 0.75 — زیر آستانه ریسک
    expect(r.payload.capacitySaturation).toBeCloseTo(0.75, 10);
    // topRank = 0.4·0.35 + 0.3·0.7 + 0.3·(22/30) = 0.14+0.21+0.22 = 0.57
    expect(r.payload.topRankProbability).toBeCloseTo(0.57, 10);
    expect(r.probability).toBe(r.payload.topRankProbability);
    expect(r.modelVersion).toBe(EXPERT_PREDICTOR_VERSION);
    expect(r.drivers.length).toBeGreaterThanOrEqual(3);
    expect(r.risks.some((x) => x.type === "OVERLOADED")).toBe(false); // 0.75 < 0.8
    expect(r.assumptions.some((a) => a.includes("اشباع"))).toBe(true);
    expect(r.contextSnapshot.entityType).toBe("expert");

    // سناریوی اشباع واقعی: ۲۰ پرونده + ظرفیت ضعیف ⇔ 0.7·1 + 0.3·0.6 = 0.88 > 0.8
    const overloaded = predictor.predict(
      { ...expert, currentLoad: 20, capacityScore: 0.4 },
      { now: NOW },
    );
    expect(overloaded.payload.capacitySaturation).toBeCloseTo(0.88, 10);
    expect(overloaded.risks.some((x) => x.type === "OVERLOADED" && x.severity === "high")).toBe(true);
  });
});

// ===================== ۴) PredictionEngineImpl — پل v1 + افزودنی‌ها =====================

describe("P6-04 PredictionEngineImpl — قرارداد v1 (پل) + متدهای افزودنی", () => {
  const engine = new PredictionEngineImpl();

  test("پل v1: هدف شناخته‌شده با بردار کامل ⇔ شکل دقیق v1 + rationale فارسی + بدون bounds صادقانه", async () => {
    const features: FeatureSet = {
      tileId: "t",
      domain: "customer",
      computedAt: NOW.toISOString(),
      vector: {
        recencyDays: 7,
        responseRate: 0.8,
        activityScore: 0.6,
      },
      missing: [],
    };
    const out = await engine.predict({ tileId: "t", target: "churnProbability", features });
    expect(out.tileId).toBe("t");
    expect(out.target).toBe("churnProbability");
    expect(out.unit).toBe("probability");
    expect(out.horizonDays).toBe(30); // پیش‌فرض
    expect(out.modelVersion).toBe(PREDICTION_BRIDGE_VERSION);
    expect(out.predictedValue).toBeCloseTo(0.5 * (7 / 60) + 0.3 * 0.2 + 0.2 * 0.4, 10);
    expect(out.rationale).toContain("ریزش");
    // bounds عمداً غایب — قانون H (بدون کالیبراسیون، فاصله اطمینان ساختنی نیست)
    expect(out.lowerBound).toBeUndefined();
    expect(out.upperBound).toBeUndefined();
  });

  test("پل v1: هدف ناشناخته یا کلید غایب ⇔ predictedValue صفر + confidence صفر + rationale صادقانه", async () => {
    const features: FeatureSet = {
      tileId: "t", domain: "customer", computedAt: NOW.toISOString(),
      vector: { recencyDays: 7 }, missing: [],
    };
    const unknown = await engine.predict({ tileId: "t", target: "galaxyProbability", features });
    expect(unknown.predictedValue).toBe(0);
    expect(unknown.confidence).toBe(0);
    expect(unknown.rationale).toContain("شناخته نشد");

    const missing = await engine.predict({ tileId: "t", target: "churnProbability", features });
    expect(missing.predictedValue).toBe(0);
    expect(missing.rationale).toContain("داده ناکافی");
    expect(missing.rationale).toContain("responseRate");
  });

  test("متدهای افزودنی: رکورد کامل از هر سه دامنه + حتمیت با now تزریقی", async () => {
    const pr = await engine.predictProperty(property, market, { now: NOW, entityId: "p1" });
    expect(pr.predictionType).toBe("PROPERTY");
    expect(pr.payload.transactionProbability).toBeGreaterThan(0);

    const cr = await engine.predictCustomer(customer, { now: NOW, entityId: "c1" });
    expect(cr.payload.conversionProbability).toBeCloseTo(0.695, 10);

    const er = await engine.predictExpert(expert, { now: NOW, entityId: "e1" });
    expect(er.payload.topRankProbability).toBeCloseTo(0.57, 10);

    // حتمیت
    const pr2 = await engine.predictProperty(property, market, { now: NOW, entityId: "p1" });
    expect(stablePart(pr)).toEqual(stablePart(pr2));
  });
});
