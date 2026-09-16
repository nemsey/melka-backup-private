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

import { describe, expect, test, afterAll } from "bun:test";

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

// ===================== ۵) PredictionRepository (P6-05) =====================

import {
  InMemoryPredictionRepository,
  FileSystemPredictionRepository,
} from "@/core/intelligence/prediction/prediction-repository";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_REPO = mkdtempSync(join(tmpdir(), "melk-p6-repo-"));
afterAll(() => {
  rmSync(TMP_REPO, { recursive: true, force: true });
});

/** رکورد کمکی — پیش‌بینی حداقلی با مهرهای زمانی قابل‌کنترل */
function makeRecord(overrides: {
  id: string;
  entityId: string;
  entityType?: "property" | "customer" | "expert";
  model?: string;
  createdAt: Date;
  linkedOutcomeId?: string;
}): PredictionRecord<{ x: number }> {
  return {
    predictionId: overrides.id,
    predictionType: "PROPERTY",
    probability: 0.5,
    confidence: 0.5,
    drivers: [],
    risks: [],
    assumptions: [],
    modelVersion: overrides.model ?? "property-predictor-v0.1",
    featureVersion: "property-features-v1",
    contextSnapshot: {
      agentId: "",
      tileId: "",
      entityId: overrides.entityId,
      entityType: overrides.entityType ?? "property",
      capturedAt: overrides.createdAt,
      features: {},
    },
    createdAt: overrides.createdAt,
    ...(overrides.linkedOutcomeId ? { linkedOutcomeId: overrides.linkedOutcomeId } : {}),
    payload: { x: 1 },
  };
}

describe("P6-05 PredictionRepository — دو پیاده‌سازی", () => {
  test("InMemory: ذخیره و بازیابی کامل (دور کامل + بازگرداندن ساختار)", async () => {
    const repo = new InMemoryPredictionRepository();
    const record = makeRecord({ id: "p1", entityId: "prop-001", createdAt: new Date("2026-09-01T00:00:00Z") });
    await repo.save(record);
    const found = await repo.findById("p1");
    expect(found).not.toBeNull();
    expect(found!.predictionId).toBe("p1");
    expect(found!.payload).toEqual({ x: 1 });
    expect(found!.createdAt.getTime()).toBe(record.createdAt.getTime());
    expect(await repo.findById("missing")).toBeNull();
  });

  test("InMemory: findByEntity/findByModel با حد + findPendingOutcome + linkOutcome (و خطای نامه‌وجود)", async () => {
    const repo = new InMemoryPredictionRepository();
    const d1 = new Date("2026-08-01T00:00:00Z");
    const d2 = new Date("2026-09-10T00:00:00Z");
    await repo.save(makeRecord({ id: "a", entityId: "prop-1", createdAt: d1 }));
    await repo.save(makeRecord({ id: "b", entityId: "prop-1", createdAt: d2 }));
    await repo.save(makeRecord({ id: "c", entityId: "cust-1", entityType: "customer", model: "customer-predictor-v0.1", createdAt: d2 }));
    await repo.save(makeRecord({ id: "d", entityId: "prop-2", createdAt: d1, linkedOutcomeId: "out-99" }));

    // جدیدترین-اول
    const byEntity = await repo.findByEntity("prop-1", "property");
    expect(byEntity.map((r) => r.predictionId)).toEqual(["b", "a"]);

    const byModel = await repo.findByModel("property-predictor-v0.1", 1);
    expect(byModel.map((r) => r.predictionId)).toEqual(["b"]);

    // pending: قدیمی‌تر از 2026-09-05 و بدون outcome → a و d؟ d وصله شده → فقط a
    const pending = await repo.findPendingOutcome(new Date("2026-09-05T00:00:00Z"));
    expect(pending.map((r) => r.predictionId)).toEqual(["a"]);

    // پیوند پس از سررسید
    await repo.linkOutcome("a", "out-1");
    expect((await repo.findById("a"))!.linkedOutcomeId).toBe("out-1");
    expect(await repo.findPendingOutcome(new Date("2026-09-05T00:00:00Z"))).toEqual([]);

    // پیوند به رکورد ناموجود ⇔ خطا (یکپارچگی داده)
    expect(repo.linkOutcome("ghost", "out-x")).rejects.toThrow("یافت نشد");
  });

  test("FileSystem: ماندگاری بین نمونه‌ها + بازگرداندن تاریخ از JSON + آخرین-برنده + linkOutcome با بازنویسی", async () => {
    const file = join(TMP_REPO, "predictions.jsonl");
    const d1 = new Date("2026-08-01T00:00:00Z");
    const first = new FileSystemPredictionRepository(file);
    await first.save(makeRecord({ id: "f1", entityId: "prop-9", createdAt: d1 }));
    await first.save(makeRecord({ id: "f2", entityId: "prop-9", createdAt: new Date("2026-09-12T00:00:00Z") }));

    // نمونه دوم همان فایل — بارگذاری تنبل
    const second = new FileSystemPredictionRepository(file);
    const found = await second.findById("f1");
    expect(found).not.toBeNull();
    expect(found!.createdAt instanceof Date).toBe(true);
    expect(found!.createdAt.getTime()).toBe(d1.getTime());
    expect(found!.contextSnapshot.capturedAt instanceof Date).toBe(true);

    // ذخیره دوباره همان شناسه ⇔ آخرین برنده
    await second.save(makeRecord({ id: "f1", entityId: "prop-9", createdAt: d1, linkedOutcomeId: "out-early" }));
    const third = new FileSystemPredictionRepository(file);
    expect((await third.findById("f1"))!.linkedOutcomeId).toBe("out-early");

    // linkOutcome روی فایل
    await third.linkOutcome("f2", "out-f2");
    const fourth = new FileSystemPredictionRepository(file);
    expect((await fourth.findById("f2"))!.linkedOutcomeId).toBe("out-f2");
    expect((await fourth.findPendingOutcome(new Date("2026-09-20T00:00:00Z")))).toEqual([]);
    expect(fourth.linkOutcome("ghost", "x")).rejects.toThrow("یافت نشد");
  });

  test("FileSystem: خط خراب در JSONL بی‌صدا نادیده گرفته می‌شود (صلبیت — الگوی P4-02)", async () => {
    const file = join(TMP_REPO, "corrupt.jsonl");
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(join(TMP_REPO), { recursive: true });
    writeFileSync(file, '{"predictionId":"good","predictionType":"PROPERTY"...\nNOT-JSON-AT-ALL\n', "utf8");
    // فقط خط سالم معتبر نیست (contextSnapshot ندارد) → صفر رکورد، بدون throw
    const repo = new FileSystemPredictionRepository(file);
    expect(await repo.findById("good")).toBeNull();
    await repo.save(makeRecord({ id: "ok", entityId: "e", createdAt: new Date() }));
    expect(await repo.findById("ok")).not.toBeNull();
  });
});

// ===================== ۶) اتصال BaseIntelligentAgent (P6-06) =====================

import { BaseIntelligentAgent } from "@/core/intelligence/base-intelligent-agent";
import type { PropertyPredictionPayload, CustomerPredictionPayload } from "@/core/intelligence/prediction/prediction-record";
import type { InsightCard } from "@/core/agent/base-agent";

/** ایجنت نمونه‌مند — متد protected را برای تست نمایان می‌کند (الگوی P5-07) */
class PredictCapableAgent extends BaseIntelligentAgent {
  readonly tileId = "requests";
  readonly name = "predict-test-agent";
  readonly insightDomains = ["test"] as unknown as readonly string[];

  constructor(engines?: ConstructorParameters<typeof BaseIntelligentAgent>[0]) {
    super(engines);
  }

  protected async computeRawInsights(): Promise<InsightCard[]> {
    return [];
  }

  async runPredict<T extends PredictionRecord>(type: "PROPERTY" | "CUSTOMER" | "EXPERT" | "MARKET", entityId: string, data: unknown): Promise<T | null> {
    return this.predict<T>(type, entityId, data);
  }
}

describe("P6-06 اتصال افزودنی predict به BaseIntelligentAgent", () => {
  test("بدون PredictionEngine ⇔ null · با موتور بدون قابلیت ⇔ null · MARKET ⇔ null صادقانه", async () => {
    const bare = new PredictCapableAgent(); // فقط Placeholder زمینه — عین PHASE 3
    expect(await bare.runPredict("PROPERTY", "p1", { property, market })).toBeNull();

    const engineOnlyV1 = {
      // فقط قرارداد v1 بدون متدهای افزودنی — stub مینیمال
      prediction: {
        contractVersion: 1 as const,
        async predict() {
          throw new Error("نباید صدا زده شود");
        },
      },
    };
    const stubbed = new PredictCapableAgent({ engines: engineOnlyV1 });
    expect(await stubbed.runPredict("PROPERTY", "p1", { property, market })).toBeNull();

    const full = new PredictCapableAgent({ engines: { prediction: new PredictionEngineImpl() } });
    expect(await full.runPredict("MARKET", "area-1", { market })).toBeNull(); // predictor بازار در PHASE 6 نیست
  });

  test("با PredictionEngine کامل ⇔ رکورد محاسبه و در repository ذخیره می‌شود (findById شاهد)", async () => {
    const repo = new InMemoryPredictionRepository();
    const agent = new PredictCapableAgent({
      agentId: "agent-predict-1",
      engines: { prediction: new PredictionEngineImpl(), predictionRepository: repo },
    });

    const record = await agent.runPredict<PredictionRecord<PropertyPredictionPayload>>(
      "PROPERTY",
      "prop-001",
      { property, market },
    );
    expect(record).not.toBeNull();
    expect(record!.predictionType).toBe("PROPERTY");
    expect(record!.payload.transactionProbability).toBeGreaterThan(0);

    // شاهد ذخیره — دقیقاً همان رکورد در انبار
    const stored = await repo.findById(record!.predictionId);
    expect(stored).not.toBeNull();
    expect(stored!.predictionId).toBe(record!.predictionId);
  });

  test("snapshot درست: agentId/tileId/entityId از ایجنت پر می‌شوند + بدون repository هم رکورد برمی‌گردد", async () => {
    const withRepo = new InMemoryPredictionRepository();
    const agent = new PredictCapableAgent({
      agentId: "agent-snap",
      engines: { prediction: new PredictionEngineImpl(), predictionRepository: withRepo },
    });
    const record = await agent.runPredict<PredictionRecord<PropertyPredictionPayload>>(
      "PROPERTY", "prop-snap", { property, market },
    );
    expect(record!.contextSnapshot.agentId).toBe("agent-snap");
    expect(record!.contextSnapshot.tileId).toBe("requests"); // tileId ایجنت
    expect(record!.contextSnapshot.entityId).toBe("prop-snap");
    expect(record!.contextSnapshot.entityType).toBe("property");

    // بدون انبار — محاسبه می‌شود، ذخیره نمی‌شود، خطا نمی‌دهد
    const noRepo = new PredictCapableAgent({ engines: { prediction: new PredictionEngineImpl() } });
    const r2 = await noRepo.runPredict<PredictionRecord<CustomerPredictionPayload>>(
      "CUSTOMER", "cust-9", { customer },
    );
    expect(r2).not.toBeNull();
    expect(r2!.payload.conversionProbability).toBeCloseTo(0.695, 10);
    expect(r2!.contextSnapshot.agentId).toBe(""); // بدون agentId تزریقی
  });
});
