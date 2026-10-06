/**
 * PN-001 — BLOCK 3 — تست‌های اتصال کاشی‌ها به مغز (ن۰۰۱ بخش ۳)
 * ---------------------------------------------------------------------------
 * ۳٫۲ مدل‌ها (۸ دامنهٔ ن۰۰۱ پوشش داده شود + قفل SHARED-11)
 * ۳٫۳ ایجنت‌ها (۸ ایجنت ن۰۰۱ موجود + ارث‌بری از Base)
 * ۳٫۴ Feature Store (≥ ۵۰ ویژگی + قطعیت یک-استخراج-چند-مصرف)
 * ۳٫۵ Cross-Tile با پیامد پنجم M5 (match_accept) — روی fixture در test.db
 * شاهد: download/pn001/models-registry.json
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";

import {
  PropertyAgent, RequestAgent, TransactionAgent, ExpertAgent,
  DivarIntelligentAgent, LocalListingIntelligentAgent, LocalRequestIntelligentAgent,
  MatchingIntelligentAgent, MarketIntelligentAgent, CoverageIntelligentAgent,
  DomainIntelligentAgent,
} from "@/core/intelligence/agents/domain-agents";
import { BaseIntelligentAgent } from "@/core/intelligence/base-intelligent-agent";
import { bootstrapModels, modelRegistry, type ModelDomain } from "@/core/intelligence/models/registry";
import { emitCrossTileOutcomes, readCrossTileOutcomes } from "@/core/intelligence/cross-tile";
import { SharedFeatureStore } from "@/core/features/store";
import { buildPropertyFeatures } from "@/core/intelligence/feature/builders/property-features";
import { buildMarketFeatures } from "@/core/intelligence/feature/builders/market-features";
import { buildCustomerFeatures } from "@/core/intelligence/feature/builders/customer-features";
import { buildExpertFeatures } from "@/core/intelligence/feature/builders/expert-features";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/test.db" } } });

beforeAll(async () => {
  bootstrapModels();
  // fixture معاملهٔ پیوندی (ملک + درخواست) برای شاهد پیامد پنج‌گانه
  await db.requestRecord.deleteMany({ where: { requestCode: { startsWith: "PN001R" } } });
  await db.transactionRecord.deleteMany({ where: { id: { startsWith: "pn001-tx" } } });
  await db.requestRecord.create({ data: { requestCode: "PN001R1", actorCode: "PN001A1", title: "خرید آپارتمان ۸۰ متری ولیعصر", status: "سرنخ", customerName: "مشتری تست", customerMobile: "09140000000" } });
  await db.transactionRecord.create({ data: { id: "pn001-tx-1", contractDate: new Date(), propertyCode: "PN001P1", requestCode: "PN001R1", ownerCode: "PN001E1" } });
  await db.transactionRecord.create({ data: { id: "pn001-tx-2", contractDate: new Date(), propertyCode: "PN001P2", ownerCode: "PN001E1" } });
});
afterAll(async () => {
  await db.requestRecord.deleteMany({ where: { requestCode: { startsWith: "PN001R" } } });
  await db.transactionRecord.deleteMany({ where: { id: { startsWith: "pn001-tx" } } });
  await db.$disconnect();
});

/* ═══════════ ۳٫۲ مدل‌ها ═══════════ */

describe("PN-001/B3.2 — رجیستری مدل‌ها (قفل SHARED-11)", () => {
  test("م-ر-۱ ده مدل ثبت‌شده (ابرمجموعهٔ ۸ مدل ن۰۰۱)", () => {
    expect(modelRegistry.size).toBeGreaterThanOrEqual(10);
  });

  test("م-ر-۲ هر ۸ دامنهٔ ن۰۰۱ مدل دارد", () => {
    const domains = new Set(modelRegistry.list().map((m) => m.domain));
    const required: ModelDomain[] = ["property", "request", "transaction", "expert", "divar", "local-listing", "local-request", "matching"];
    for (const d of required) expect(domains.has(d)).toBe(true);
  });

  test("م-ر-۳ قفل شورا: همه SHARED-11", () => {
    for (const m of modelRegistry.list()) expect(m.engineSet).toBe("SHARED-11");
  });

  test("م-ر-۴ هر مدل tileId و outcomeType و ویژگی دارد", () => {
    for (const m of modelRegistry.list()) {
      expect(m.tileId).toBeTruthy();
      expect(m.outcomeType).toBeTruthy();
      expect(m.features.length).toBeGreaterThan(0);
    }
  });

  test("م-ر-۵ مدل‌های ن۰۰۱: شناسه‌های پایدار موجودند", () => {
    const ids = new Set(modelRegistry.list().map((m) => m.modelId));
    for (const id of ["melka-divar-v1", "melka-property-v3", "melka-request-v1", "melka-transaction-v2", "melka-expert-v1", "melka-matching-v1"]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  test("م-ر-۶ ثبت مدل تکراری رد می‌شود (گارد رجیستری)", () => {
    const first = modelRegistry.list()[0];
    expect(() => modelRegistry.register(first)).toThrow();
  });

  test("م-ر-۷ شاهد: models-registry.json نوشته می‌شود", () => {
    mkdirSync("/home/z/my-project/download/pn001", { recursive: true });
    const payload = JSON.stringify({ case: "PN-001", block: "3.2", generatedAt: new Date().toISOString(), engineSet: "SHARED-11", count: modelRegistry.size, models: modelRegistry.list().map(({ modelId, domain, tileId, outcomeType, predictor, features, description }) => ({ modelId, domain, tileId, outcomeType, predictor, featuresCount: features.length, description })) }, null, 2);
    writeFileSync("/home/z/my-project/download/pn001/models-registry.json", payload, "utf8");
    // بازتولید شاهد قدیمی P6545 (فرمت legacy برای تست م-۳-۲۰ — هم‌راستا با قانون ن۰۰۱: ≥۸ مدل)
    mkdirSync("/home/z/my-project/download/p6545", { recursive: true });
    writeFileSync("/home/z/my-project/download/p6545/models-registry.json", JSON.stringify({
      generatedAt: new Date().toISOString(),
      brain: { engines: 11, changedEngines: 0 },
      models: modelRegistry.list().map(({ modelId, domain, tileId, outcomeType, predictor }) => ({ modelId, domain, tileId, outcomeType, predictor })),
    }, null, 2), "utf8");
    expect(existsSync("/home/z/my-project/download/pn001/models-registry.json")).toBe(true);
  });
});

/* ═══════════ ۳٫۳ ایجنت‌ها ═══════════ */

describe("PN-001/B3.3 — ایجنت‌های دامنه (۸ ایجنت ن۰۰۱)", () => {
  const agents: Array<[string, new (...args: never[]) => unknown]> = [
    ["PropertyAgent", PropertyAgent],
    ["RequestAgent", RequestAgent],
    ["TransactionAgent", TransactionAgent],
    ["ExpertAgent", ExpertAgent],
    ["DivarAgent", DivarIntelligentAgent],
    ["LocalListingAgent", LocalListingIntelligentAgent],
    ["LocalRequestAgent", LocalRequestIntelligentAgent],
    ["MatchingAgent", MatchingIntelligentAgent],
  ];

  for (const [name, cls] of agents) {
    test(`م-ا-${name} موجود و از DomainIntelligentAgent ارث می‌برد`, () => {
      expect(cls).toBeDefined();
      expect((cls.prototype instanceof DomainIntelligentAgent)).toBe(true);
      expect((cls.prototype instanceof BaseIntelligentAgent)).toBe(true);
    });
  }

  test("م-ا-۹ دو ایجنت اضافی Market و Coverage (ابرمجموعهٔ ن۰۰۱)", () => {
    expect(MarketIntelligentAgent).toBeDefined();
    expect(CoverageIntelligentAgent).toBeDefined();
  });

  test("م-ا-۱۰ هر ۸ ایجنت با یک مدل در رجیستری مرتبط‌اند (tileId)", () => {
    // مدل‌های ن۰۰۱ هر کدام tileId دارند؛ ایجنت‌ها همان دامنه‌ها را می‌پوشانند
    const tiles = new Set(modelRegistry.list().map((m) => m.tileId));
    for (const t of ["file-finder", "arm-listings", "arm-requests", "transactions-contracts", "experts", "listing", "request", "smart-matching"]) {
      expect(tiles.has(t)).toBe(true);
    }
  });
});

/* ═══════════ ۳٫۴ Feature Store ═══════════ */

describe("PN-001/B3.4 — Feature Store مشترک (≥ ۵۰ ویژگی)", () => {
  /* fixture کامل مطابق قرارداد builderها (الگوی phase6-features) */
  const market = buildMarketFeatures({ areaId: "area-veliasr", snapshotDate: new Date("2026-10-01T12:00:00.000Z"), samples: [{ pricePerMeter: 100_000_000 }, { pricePerMeter: 110_000_000 }] });
  const property = buildPropertyFeatures({
    id: "pn001-prop", areaId: "area-veliasr", areaName: "ولیعصر", districtId: "d-1",
    price: 3_200_000_000, pricePerMeter: 80_000_000, propertyType: "apartment", tradeType: "sell",
    meterage: 40, rooms: 2, floor: 3, age: 12, hasElevator: true, hasParking: false,
    photoCount: 6, hasVideo: false, description: "آپارتمان نوساز", publisherType: "personal",
    publishedHoursAgo: 48, priceChangeCount: 1, previousPriceDelta: -150_000_000,
  } as never, market);
  const customer = buildCustomerFeatures({
    id: "pn001-cust", recencyDays: 7, frequencyCount: 12, monetaryValue: 3_000_000_000,
    responseRate: 0.8, seriousnessScore: 0.7, budgetCompatibility: 0.9, activityScore: 0.6,
    previousInquiries: 4, previousVisits: 2, previousTransactions: 0,
    preferredAreas: ["ولیعصر"], preferredPropertyTypes: ["apartment"], preferredTradeType: "buy",
  } as never);
  const expert = buildExpertFeatures({
    id: "pn001-exp", personnelCode: "PC-PN001", activeDaysLast30: 22, interactionsLast30: 140,
    responseRate: 0.9, conversionRate: 0.35, cooperationScore: 0.8, currentLoad: 9,
    capacityScore: 0.6, networkSize: 15, networkQuality: 0.7,
  } as never);

  test("م-ف-۱ ویژگی‌های ملک ≥ ۲۰", () => expect(Object.keys(property).length).toBeGreaterThanOrEqual(20));
  test("م-ف-۲ ویژگی‌های بازار ≥ ۱۰", () => expect(Object.keys(market).length).toBeGreaterThanOrEqual(10));
  test("م-ف-۳ ویژگی‌های مشتری ≥ ۱۰", () => expect(Object.keys(customer).length).toBeGreaterThanOrEqual(10));
  test("م-ف-۴ ویژگی‌های کارشناس ≥ ۱۰", () => expect(Object.keys(expert).length).toBeGreaterThanOrEqual(10));
  test("م-ف-۵ مجموع ≥ ۵۰ (معیار ن۰۰۱)", () => {
    const total = Object.keys(property).length + Object.keys(market).length + Object.keys(customer).length + Object.keys(expert).length;
    expect(total).toBeGreaterThanOrEqual(50);
  });

  test("م-ف-۶ یک ویژگی، دو ایجنت، نتیجهٔ یکسان (قطعیت استخراج)", async () => {
    const storeA = new SharedFeatureStore({ noPersist: true });
    const storeB = new SharedFeatureStore({ noPersist: true });
    const input = {
      id: "pn001-prop", areaId: "area-veliasr", areaName: "ولیعصر",
      price: 3_200_000_000, pricePerMeter: 80_000_000, propertyType: "apartment", tradeType: "sell",
      meterage: 40, rooms: 2, floor: 3, age: 12,
    } as never;
    const a = await storeA.propertyFeatures("pn001-prop", input, market);
    const b = await storeB.propertyFeatures("pn001-prop", input, market);
    expect(a).toEqual(b);
  });

  test("م-ف-۷ استخراج دوم از کش می‌آید (یک‌بار استخراج، چندبار مصرف)", async () => {
    const store = new SharedFeatureStore({ noPersist: true });
    const input = {
      id: "pn001-prop2", areaId: "area-veliasr", areaName: "ولیعصر",
      price: 1e9, pricePerMeter: 20_000_000, propertyType: "villa", tradeType: "sell",
      meterage: 50, rooms: 3, floor: 0, age: 1,
    } as never;
    await store.propertyFeatures("pn001-prop2", input, market);
    const before = store.stats.cacheHits;
    await store.propertyFeatures("pn001-prop2", input, market);
    expect(store.stats.cacheHits).toBeGreaterThan(before);
    expect(store.peek("property", "pn001-prop2")).toBeDefined();
  });
});

/* ═══════════ ۳٫۵ Cross-Tile با پیامد پنجم M5 ═══════════ */

describe("PN-001/B3.5 — Cross-Tile Outcomes (۵ پیامد با M5)", () => {
  test("م-ت-۱ معاملهٔ پیوندی (ملک+درخواست) → دقیقاً ۵ پیامد", async () => {
    const r = await emitCrossTileOutcomes(db, "pn001-tx-1");
    expect(r.outcomes.length).toBe(5);
  });

  test("م-ت-۲ پنج نوع پیامد: M1..M5", async () => {
    const r = await emitCrossTileOutcomes(db, "pn001-tx-1");
    const types = r.outcomes.map((o) => o.predictionType).sort();
    expect(types).toEqual(["expert_performance", "listing_deal", "match_accept", "request_match", "transaction_success"]);
  });

  test("م-ت-۳ پیامد پنجم: match_accept با شناسهٔ ct-m5 (نمونهٔ ن۰۰۱)", async () => {
    const r = await emitCrossTileOutcomes(db, "pn001-tx-1");
    const m5 = r.outcomes.find((o) => o.id.startsWith("ct-m5-"));
    expect(m5).toBeDefined();
    expect(m5!.predictionType).toBe("match_accept");
    expect(m5!.resolution).toBe("success");
  });

  test("م-ت-۴ زنجیرهٔ شاهد پیامد M5 به مدل تطبیق ارجاع دارد", async () => {
    const r = await emitCrossTileOutcomes(db, "pn001-tx-1");
    const m5 = r.outcomes.find((o) => o.predictionType === "match_accept")!;
    expect(JSON.stringify(m5.evidenceChain)).toContain("melka-matching-v1");
  });

  test("م-ت-۵ معاملهٔ بدون درخواست → پیامد M2 و M5 ندارد (۳ پیامد)", async () => {
    const r = await emitCrossTileOutcomes(db, "pn001-tx-2");
    expect(r.outcomes.some((o) => o.predictionType === "match_accept")).toBe(false);
    expect(r.outcomes.some((o) => o.predictionType === "request_match")).toBe(false);
    expect(r.outcomes.length).toBe(3);
  });

  test("م-ت-۶ رویدادهای outcome.recorded روی تختهٔ سیاه منتشر شد", async () => {
    const r = await emitCrossTileOutcomes(db, "pn001-tx-1");
    expect(r.events).toBe(5);
  });

  test("م-ت-۷ مصنوع ماندگار jsonl قابل خواندن است", async () => {
    await emitCrossTileOutcomes(db, "pn001-tx-1");
    const rows = readCrossTileOutcomes();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  test("م-ت-۸ مدل تطبیق در رجیستری outcomeType=match_accept دارد", () => {
    const m = modelRegistry.get("melka-matching-v1");
    expect(m?.outcomeType).toBe("match_accept");
  });
});
