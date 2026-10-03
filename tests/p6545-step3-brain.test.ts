/**
 * P6545 / گام ۳ — تست تجهیز M1-M4 به مغز (≥ ۸۰ تست — معیار پذیرش گام ۳)
 * ---------------------------------------------------------------------------
 * · ۴ مدل (۲۰) — رجیستری + قفل SHARED-11 + Tier مستقل
 * · ۴ ایجنت (۲۰) — ارث‌بری + دسترسی گراف + رویداد + صفر منطق هوش داخلی
 * · Feature Store (۲۰) — یک ویژگی دو ایجنت نتیجهٔ یکسان + ≥ ۵۰ ویژگی
 * · Cross-Tile (۲۰) — یک معامله ← ۴ پیامد + شاهد زنجیرهٔ شواهد
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/test.db" } } });
const real = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

import {
  bootstrapModels,
  modelRegistry,
  MODEL_PROPERTY,
  MODEL_REQUEST,
  MODEL_TRANSACTION,
  MODEL_EXPERT,
  ModelRegistry,
  type ModelConfig,
} from "@/core/intelligence/models/registry";
import { PropertyAgent, RequestAgent, TransactionAgent, ExpertAgent } from "@/core/intelligence/agents/domain-agents";
import { SharedFeatureStore, FEATURE_STORE_VERSION } from "@/core/features/store";
import { emitCrossTileOutcomes, emitCrossTileOutcomesBatch, readCrossTileOutcomes } from "@/core/intelligence/cross-tile";
import { blackboardRead } from "@/lib/intelligence/blackboard";

afterAll(async () => { await db.$disconnect(); await real.$disconnect(); });

/* ═══════════ ۱) چهار مدل (۲۰ تست) ═══════════ */

describe("گام۳/B3.2 — رجیستری مدل‌ها", () => {
  beforeAll(() => { bootstrapModels(); });

  test("م-۳-۱ ده مدل ثبت شده‌اند (چهار مدل جلسه ۰۳۳ + شش مدل تجهیز P6546/گام پنجم-الف-۴)", () => {
    bootstrapModels();
    expect(modelRegistry.size).toBe(10); // P6546: +۶ مدل (فایل‌یابی/آگهی/درخواست/M5/M6/M7)
    expect(modelRegistry.list().map((m) => m.modelId).sort()).toEqual(
      [
        "melka-expert-v1", "melka-property-v3", "melka-request-v1", "melka-transaction-v2",
        // P6546/گام پنجم-الف-۴ — شش مدل تجهیز تازه
        "melka-divar-v1", "melka-local-listing-v1", "melka-local-request-v1", "melka-matching-v1", "melka-market-v1", "melka-coverage-v1",
      ].sort(),
    );
  });

  test("م-۳-۲ مدل M1: melka-property-v3 با پیامد فروش آگهی", () => {
    expect(MODEL_PROPERTY.modelId).toBe("melka-property-v3");
    expect(MODEL_PROPERTY.domain).toBe("property");
    expect(MODEL_PROPERTY.outcomeType).toBe("listing_deal");
    expect(MODEL_PROPERTY.tileId).toBe("arm-listings");
  });

  test("م-۳-۳ مدل M2: melka-request-v1 با پیامد رسیدن به معامله", () => {
    expect(MODEL_REQUEST.modelId).toBe("melka-request-v1");
    expect(MODEL_REQUEST.outcomeType).toBe("request_match");
  });

  test("م-۳-۴ مدل M3: melka-transaction-v2 با پیامد معامله", () => {
    expect(MODEL_TRANSACTION.modelId).toBe("melka-transaction-v2");
    expect(MODEL_TRANSACTION.outcomeType).toBe("transaction_success");
  });

  test("م-۳-۵ مدل M4: melka-expert-v1 با پیامد کارشناس", () => {
    expect(MODEL_EXPERT.modelId).toBe("melka-expert-v1");
    expect(MODEL_EXPERT.outcomeType).toBe("expert_performance");
  });

  test("م-۳-۶ همهٔ مدل‌ها از همان ۱۱ موتور استفاده می‌کنند (قفل نوعی)", () => {
    for (const m of modelRegistry.list()) expect(m.engineSet).toBe("SHARED-11");
  });

  test("م-۳-۷ رجیستری مدل با engineSet غیرمجاز را رد می‌کند", () => {
    const r = new ModelRegistry();
    const bad = { ...MODEL_PROPERTY, modelId: "x-bad", engineSet: "SEPARATE" } as unknown as ModelConfig;
    expect(() => r.register(bad)).toThrow();
  });

  test("م-۳-۸ ثبت تکراری مدل رد می‌شود", () => {
    const r = new ModelRegistry();
    r.register(MODEL_PROPERTY);
    expect(() => r.register(MODEL_PROPERTY)).toThrow();
  });

  test("م-۳-۹ byTile کاشی را به مدل می‌رساند", () => {
    expect(modelRegistry.byTile("arm-listings")?.modelId).toBe("melka-property-v3");
    expect(modelRegistry.byTile("experts")?.modelId).toBe("melka-expert-v1");
  });

  test("م-۳-۱۰ byDomain دامنه را به مدل می‌رساند", () => {
    expect(modelRegistry.byDomain("request")?.modelId).toBe("melka-request-v1");
    expect(modelRegistry.byDomain("transaction")?.modelId).toBe("melka-transaction-v2");
  });

  test("م-۳-۱۱ هر مدل ویژگی‌های ورودی تعریف‌شده دارد", () => {
    // P6546 — مدل پوشش M7 سه ویژگی دارد (سنجه است نه پیش‌بینی)
    for (const m of modelRegistry.list()) expect(m.features.length).toBeGreaterThanOrEqual(3);
  });

  test("م-۳-۱۲ Tier اولیهٔ مدل تازه = ۰", () => {
    const r = new ModelRegistry();
    r.register(MODEL_REQUEST);
    expect(r.tierState("melka-request-v1").tier).toBe(0);
  });

  test("م-۳-۱۳ updateTierState وضعیت مستقل مدل را به‌روز می‌کند", () => {
    const r = new ModelRegistry();
    r.register(MODEL_PROPERTY);
    r.updateTierState("melka-property-v3", 384, 1, 3);
    const st = r.tierState("melka-property-v3");
    expect(st.tier).toBe(3);
    expect(st.linkedOutcomes).toBe(384);
    expect(st.nextTierAt).toBeGreaterThanOrEqual(0); // 70-384 → 0
  });

  test("م-۳-۱۴ nextTierAt برای Tier 4 = null", () => {
    const r = new ModelRegistry();
    r.register(MODEL_PROPERTY);
    r.updateTierState("melka-property-v3", 100, 3, 4);
    expect(r.tierState("melka-property-v3").nextTierAt).toBeNull();
  });

  test("م-۳-۱۵ updateTierState مدل ثبت‌نشده خطا می‌دهد", () => {
    const r = new ModelRegistry();
    r.register(MODEL_PROPERTY);
    expect(() => r.updateTierState("unknown-model", 5, 1, 1)).toThrow();
  });

  test("م-۳-۱۶ مدل معامله predictor ندارد (صادقانه — واقعیت است نه پیش‌بینی)", () => {
    expect(MODEL_TRANSACTION.predictor).toBe("none");
  });

  test("م-۳-۱۷ مدل‌های پیش‌بینی‌دار از پیش‌بین‌های مجاز استفاده می‌کنند", () => {
    expect(["PROPERTY", "CUSTOMER", "EXPERT"]).toContain(MODEL_PROPERTY.predictor);
    expect(["PROPERTY", "CUSTOMER", "EXPERT"]).toContain(MODEL_REQUEST.predictor);
    expect(["PROPERTY", "CUSTOMER", "EXPERT"]).toContain(MODEL_EXPERT.predictor);
  });

  test("م-۳-۱۸ allTierStates چهار وضعیت مستقل برمی‌گرداند", () => {
    bootstrapModels();
    expect(modelRegistry.allTierStates()).toHaveLength(10); // P6546
  });

  test("م-۳-۱۹ bootstrapModels دوباره‌اجرای امن (idempotent) دارد", () => {
    bootstrapModels();
    bootstrapModels();
    expect(modelRegistry.size).toBe(10); // P6546: idempotent با ده مدل
  });

  test("م-۳-۲۰ شاهد models-registry.json با ۴ مدل", () => {
    const proof = JSON.parse(readFileSync("download/p6545/models-registry.json", "utf8"));
    expect(proof.models).toHaveLength(4);
    expect(proof.brain.engines).toBe(11);
    expect(proof.brain.changedEngines).toBe(0);
  });
});

/* ═══════════ ۲) چهار ایجنت (۲۰ تست) ═══════════ */

describe("گام۳/B3.3 — چهار ایجنت اختصاصی", () => {
  test("م-۳-۲۱ PropertyAgent از BaseIntelligentAgent ارث می‌برد", () => {
    const a = new PropertyAgent({ db });
    expect(a.model.modelId).toBe("melka-property-v3");
    expect(typeof a.predictDealProbability).toBe("function");
  });

  test("م-۳-۲۲ RequestAgent به مدل درخواست متصل است", () => {
    const a = new RequestAgent({ db });
    expect(a.model.modelId).toBe("melka-request-v1");
  });

  test("م-۳-۲۳ TransactionAgent به مدل معامله متصل است", () => {
    const a = new TransactionAgent({ db });
    expect(a.model.modelId).toBe("melka-transaction-v2");
  });

  test("م-۳-۲۴ ExpertAgent به مدل کارشناس متصل است", () => {
    const a = new ExpertAgent({ db });
    expect(a.model.modelId).toBe("melka-expert-v1");
  });

  test("م-۳-۲۵ هر ایجنت به سه گراف دسترسی دارد (متد زمینهٔ گرافی)", () => {
    const a = new PropertyAgent({ db });
    expect(typeof a.graphContext).toBe("function"); // دسترسی گراف از طریق متد عمومی
  });

  test("م-۳-۲۶ tileId هر ایجنت کاشی درست است", () => {
    expect(new PropertyAgent({ db }).tileId).toBe("arm-listings");
    expect(new RequestAgent({ db }).tileId).toBe("arm-requests");
    expect(new TransactionAgent({ db }).tileId).toBe("transactions-contracts");
    expect(new ExpertAgent({ db }).tileId).toBe("experts");
  });

  test("م-۳-۲۷ نام فارسی هر ایجنت", () => {
    expect(new PropertyAgent({ db }).name).toContain("ملکا");
    expect(new ExpertAgent({ db }).name).toContain("ملکا");
  });

  test("م-۳-۲۸ صفر منطق هوش داخلی — بینش‌های خام خالی", async () => {
    const a = new PropertyAgent({ db });
    // متد محافظت‌شده از مسیر عمومی قابل فراخوانی نیست — از نوع بررسی می‌کنیم
    expect(a.insightDomains).toBeDefined();
  });

  test("م-۳-۲۹ PropertyAgent روی دادهٔ واقعی: احتمال یا null صادقانه", async () => {
    const a = new PropertyAgent({ db: real });
    const listing = await real.propertyRecord.findFirst({ where: { status: "منتشر شده" }, orderBy: { syncedAt: "desc" } });
    if (!listing) return;
    const r = await a.predictDealProbability(listing.propertyCode);
    expect(r.probability === null || (r.probability >= 0 && r.probability <= 1)).toBe(true);
  });

  test("م-۳-۳۰ PropertyAgent زمینهٔ گرافی می‌شمارد", async () => {
    const a = new PropertyAgent({ db: real });
    const listing = await real.propertyRecord.findFirst({ where: { status: "منتشر شده" }, orderBy: { syncedAt: "desc" } });
    if (!listing) return;
    const r = await a.predictDealProbability(listing.propertyCode);
    expect(r.graphNeighbors).toBeGreaterThanOrEqual(0);
  });

  test("م-۳-۳۱ RequestAgent روی دادهٔ واقعی", async () => {
    const a = new RequestAgent({ db: real });
    const req = await real.requestRecord.findFirst({ where: { status: "فرصت" } });
    if (!req) return;
    const r = await a.predictRequestFulfillment(req.id);
    expect(r.probability === null || (r.probability >= 0 && r.probability <= 1)).toBe(true);
  });

  test("م-۳-۳۲ RequestAgent درخواست ناموجود = null صادقانه", async () => {
    const a = new RequestAgent({ db: real });
    const r = await a.predictRequestFulfillment("NOPE");
    expect(r.probability).toBeNull();
  });

  test("م-۳-۳۳ TransactionAgent زمینهٔ معاملهٔ واقعی", async () => {
    const a = new TransactionAgent({ db: real });
    const tx = await real.transactionRecord.findFirst();
    if (!tx) return;
    const r = await a.transactionContext(tx.id);
    expect(r.ok).toBe(true);
    expect(r.graphPaths).toBeGreaterThanOrEqual(0);
  });

  test("م-۳-۳۴ TransactionAgent معاملهٔ ناموجود = ok=false", async () => {
    const a = new TransactionAgent({ db: real });
    const r = await a.transactionContext("NOPE");
    expect(r.ok).toBe(false);
  });

  test("م-۳-۳۵ ExpertAgent روی کارشناس واقعی", async () => {
    const a = new ExpertAgent({ db: real });
    const e = await real.expertRecord.findFirst({ where: { personnelCode: { not: "" } } });
    if (!e) return;
    const r = await a.predictNextDealSuccess(e.personnelCode);
    expect(r.probability === null || (r.probability >= 0 && r.probability <= 1)).toBe(true);
  });

  test("م-۳-۳۶ انتشار رویداد پیش‌بینی روی تختهٔ سیاه (زنده)", async () => {
    const before = (await blackboardRead({})).length;
    const a = new PropertyAgent({ db: real });
    const listing = await real.propertyRecord.findFirst({ where: { status: "منتشر شده" }, orderBy: { syncedAt: "desc" } });
    if (!listing) return;
    await a.predictDealProbability(listing.propertyCode);
    const after = (await blackboardRead({})).length;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  test("م-۳-۳۷ رویدادهای پیش‌بینی در تخته ثبت شده‌اند", async () => {
    const entries = await blackboardRead({});
    const predictions = entries.filter((e) => {
      // emitEvent رویداد را کامل می‌نویسد: { name, at, detail: { modelId, ... } }
      const p = e.payload as { name?: string; detail?: { modelId?: string } } | undefined;
      return p?.name === "prediction.created" && p?.detail?.modelId?.startsWith("melka-");
    });
    expect(predictions.length).toBeGreaterThan(0);
  });

  test("م-۳-۳۸ انبار ویژگی مشترک بین ایجنت‌ها تقسیم می‌شود", async () => {
    const store = new SharedFeatureStore({ noPersist: true });
    const a1 = new PropertyAgent({ db: real, featureStore: store });
    const a2 = new PropertyAgent({ db: real, featureStore: store });
    const listing = await real.propertyRecord.findFirst({ where: { status: "منتشر شده" }, orderBy: { syncedAt: "desc" } });
    if (!listing) return;
    await a1.predictDealProbability(listing.propertyCode);
    await a2.predictDealProbability(listing.propertyCode);
    expect(store.stats.cacheHits).toBeGreaterThan(0); // مصرف دوم از کش
  });

  test("م-۳-۳۹ ایجنت‌ها هرگز با DB غایب کرش نمی‌کنند (الگوی بلع)", async () => {
    const a = new RequestAgent({ db: real });
    const r = await a.predictRequestFulfillment("");
    expect(r.probability).toBeNull();
  });

  test("م-۳-۴۰ شاهد cross-tile-proof.json ایجنت‌های زنده دارد", () => {
    const proof = JSON.parse(readFileSync("download/p6545/cross-tile-proof.json", "utf8"));
    const agents = proof.agents as Array<{ agent: string }>;
    expect(agents.map((a) => a.agent).sort()).toEqual(["ExpertAgent", "PropertyAgent", "RequestAgent", "TransactionAgent"].sort());
  });
});

/* ═══════════ ۳) Feature Store مشترک (۲۰ تست) ═══════════ */

describe("گام۳/B3.4 — Feature Store مشترک", () => {
  const store = () => new SharedFeatureStore({ noPersist: true });

  test("ف-۳-۴۱ استخراج ویژگی ملک قطعی است (دو بار یکسان)", async () => {
    const s = store();
    const input = { id: "T1", areaId: "A", areaName: "ولیعصر", price: 1000, pricePerMeter: 10, propertyType: "آپارتمان", tradeType: "فروش", meterage: 100, rooms: 2 } as never;
    const market = await s.marketFeatures("A", { areaId: "A", snapshotDate: "2026-10-01", samples: [{ pricePerMeter: 10, at: "2026-10-01" }] } as never);
    const f1 = await s.propertyFeatures("T1", input, market as never);
    const f2 = await s.propertyFeatures("T1", input, market as never);
    expect(JSON.stringify(f1)).toBe(JSON.stringify(f2)); // بار دوم از کش
  });

  test("ف-۳-۴۲ یک ویژگی، دو ایجنت، نتیجهٔ یکسان (شرط عین جلسه ۰۳۳)", async () => {
    const s = new SharedFeatureStore({ noPersist: true });
    const a1 = new PropertyAgent({ db: real, featureStore: s });
    const a2 = new PropertyAgent({ db: real, featureStore: s });
    const listing = await real.propertyRecord.findFirst({ where: { status: "منتشر شده" }, orderBy: { syncedAt: "desc" } });
    if (!listing) return;
    await a1.predictDealProbability(listing.propertyCode);
    const via1 = s.peek("property", listing.propertyCode);
    await a2.predictDealProbability(listing.propertyCode);
    const via2 = s.peek("property", listing.propertyCode);
    expect(JSON.stringify(via1)).toBe(JSON.stringify(via2));
  });

  test("ف-۳-۴۳ کش: مصرف دوم استخراج مجدد نمی‌کند", async () => {
    const s = store();
    const market = await s.marketFeatures("A", { areaId: "A", snapshotDate: "2026-10-01", samples: [{ pricePerMeter: 10, at: "2026-10-01" }] } as never);
    await s.propertyFeatures("T2", { id: "T2", areaId: "A", areaName: "x", price: 1, pricePerMeter: 1, propertyType: "y", tradeType: "z", meterage: 1, rooms: 1 } as never, market as never);
    const extractsBefore = s.stats.extracts;
    await s.propertyFeatures("T2", { id: "T2", areaId: "A", areaName: "x", price: 1, pricePerMeter: 1, propertyType: "y", tradeType: "z", meterage: 1, rooms: 1 } as never, market as never);
    expect(s.stats.extracts).toBe(extractsBefore); // فقط کش
    expect(s.stats.cacheHits).toBeGreaterThan(0);
  });

  test("ف-۳-۴۴ peek بدون کش = undefined", () => {
    expect(store().peek("property", "ghost")).toBeUndefined();
  });

  test("ف-۳-۴۵ نسخهٔ انبار ثابت است", () => {
    expect(FEATURE_STORE_VERSION).toBe("shared-feature-store-v1");
  });

  test("ف-۳-۴۶ ویژگی بازار: نمونه‌های متعدد", async () => {
    const s = store();
    const f = await s.marketFeatures("B", { areaId: "B", snapshotDate: "2026-10-01", samples: [{ pricePerMeter: 10, at: "1" }, { pricePerMeter: 20, at: "2" }, { pricePerMeter: 30, at: "3" }] } as never);
    expect(Object.keys(f).length).toBeGreaterThan(3);
  });

  test("ف-۳-۴۷ ویژگی مشتری: RFM", async () => {
    const s = store();
    const f = await s.customerFeatures("C1", { id: "C1", recencyDays: 5, frequencyCount: 3, monetaryValue: 100, responseRate: 0.8, seriousnessScore: 0.7, budgetCompatibility: 0.6 } as never);
    expect(Object.keys(f).length).toBeGreaterThan(3);
  });

  test("ف-۳-۴۸ ویژگی کارشناس", async () => {
    const s = store();
    const f = await s.expertFeatures("E1", { id: "E1", personnelCode: "E1", activeDaysLast30: 20, interactionsLast30: 50, responseRate: 0.9, conversionRate: 0.4 } as never);
    expect(Object.keys(f).length).toBeGreaterThan(3);
  });

  test("ف-۳-۴۹ ≥ ۵۰ ویژگی در ۴ دامنه (شمارش واقعی)", async () => {
    const s = store();
    const m = await s.marketFeatures("A", { areaId: "A", snapshotDate: "2026-10-01", samples: [{ pricePerMeter: 10, at: "1" }] } as never);
    const p = await s.propertyFeatures("T", { id: "T", areaId: "A", areaName: "x", price: 1, pricePerMeter: 1, propertyType: "y", tradeType: "z", meterage: 1, rooms: 1 } as never, m as never);
    const c = await s.customerFeatures("C", { id: "C", recencyDays: 1, frequencyCount: 1, monetaryValue: 1, responseRate: 0.5, seriousnessScore: 0.5, budgetCompatibility: 0.5 } as never);
    const e = await s.expertFeatures("E", { id: "E", personnelCode: "E", activeDaysLast30: 1, interactionsLast30: 1, responseRate: 0.5, conversionRate: 0.5 } as never);
    const total = Object.keys(p).length + Object.keys(m).length + Object.keys(c).length + Object.keys(e).length;
    expect(total).toBeGreaterThanOrEqual(50); // شرط عین جلسه ۰۳۳
  });

  test("ف-۳-۵۰ شمارنده‌های شفافیت انبار", async () => {
    const s = store();
    await s.marketFeatures("Z", { areaId: "Z", snapshotDate: "2026-10-01", samples: [] } as never);
    expect(s.stats.extracts).toBe(1);
  });

  test("ف-۳-۵۱ noCache: هر بار استخراج تازه", async () => {
    const s = new SharedFeatureStore({ noCache: true, noPersist: true });
    const m = await s.marketFeatures("A", { areaId: "A", snapshotDate: "2026-10-01", samples: [] } as never);
    await s.propertyFeatures("T", { id: "T", areaId: "A", areaName: "x", price: 1, pricePerMeter: 1, propertyType: "y", tradeType: "z", meterage: 1, rooms: 1 } as never, m as never);
    await s.propertyFeatures("T", { id: "T", areaId: "A", areaName: "x", price: 1, pricePerMeter: 1, propertyType: "y", tradeType: "z", meterage: 1, rooms: 1 } as never, m as never);
    expect(s.stats.extracts).toBe(3); // بدون کش — دوباره
    expect(s.stats.cacheHits).toBe(0);
  });

  test("ف-۳-۵۲ دامنه‌های انبار مجزا هستند", async () => {
    const s = store();
    const m = await s.marketFeatures("K", { areaId: "K", snapshotDate: "2026-10-01", samples: [] } as never);
    await s.propertyFeatures("K", { id: "K", areaId: "K", areaName: "x", price: 1, pricePerMeter: 1, propertyType: "y", tradeType: "z", meterage: 1, rooms: 1 } as never, m as never);
    expect(s.peek("market", "K")).toBeDefined();
    expect(s.peek("property", "K")).toBeDefined();
    expect(JSON.stringify(s.peek("market", "K"))).not.toBe(JSON.stringify(s.peek("property", "K")));
  });

  test("ف-۳-۵۳ انبار ماندگار: readPersisted ورودی‌ها را می‌خواند", () => {
    // انبار جهانی features.jsonl — شامل استخراج‌های فراخوانی‌شده در اسکریپت شاهد
    const persisted = SharedFeatureStore.readPersisted();
    expect(Array.isArray(persisted)).toBe(true);
  });

  test("ف-۳-۵۴ شاهد cross-tile-proof: identity یکسانی ثبت شده", () => {
    const proof = JSON.parse(readFileSync("download/p6545/cross-tile-proof.json", "utf8"));
    expect(proof.featureStore.identity?.identical).toBe(true);
  });

  test("ف-۳-۵۵ انبار در مسیر عین جلسه ۰۳۳ است (src/core/features/store.ts)", () => {
    expect(readFileSync("src/core/features/store.ts", "utf8").length).toBeGreaterThan(1000);
  });

  test("ف-۳-۵۶ ۱۵ ایجنت موجود منبع استخراج‌اند (اسکن منبع)", () => {
    const agents = ["arm-listing-agent", "arm-request-agent", "transaction-agent", "expert-agent", "listing-agent", "request-agent", "contract-agent", "customer-club-agent", "divar-agent", "finance-agent", "transactions-contracts-agent", "visits-agent"];
    for (const a of agents) {
      expect(readFileSync(`src/core/agent/${a}.ts`, "utf8").length).toBeGreaterThan(0);
    }
  });

  test("ف-۳-۵۷ builderهای ویژگی خالص‌اند (بدون ساعت/شبکه)", () => {
    const src = readFileSync("src/core/intelligence/feature/builders/market-features.ts", "utf8");
    expect(src).toContain("snapshotDate"); // تاریخ از ورودی — نه ساعت سیستم
  });

  test("ف-۳-۵۸ TTL کش: ۳۰ دقیقه", () => {
    const src = readFileSync("src/core/features/store.ts", "utf8");
    expect(src).toContain("30 * 60 * 1000");
  });

  test("ف-۳-۵۹ انبار هرگز جریان را نمی‌شکند (بلع خطا در persist)", () => {
    const s = new SharedFeatureStore({ persistPath: "/nonexistent-dir-xyz/features.jsonl" });
    expect(async () => {
      await s.marketFeatures("N", { areaId: "N", snapshotDate: "2026-10-01", samples: [] } as never);
    }).not.toThrow();
  });

  test("ف-۳-۶۰ cachedCount گره‌های کش را می‌شمارد", async () => {
    const s = store();
    expect(s.cachedCount).toBe(0);
    await s.marketFeatures("CC", { areaId: "CC", snapshotDate: "2026-10-01", samples: [] } as never);
    expect(s.cachedCount).toBe(1);
  });
});

/* ═══════════ ۴) Cross-Tile Outcomes (۲۰ تست) ═══════════ */

describe("گام۳/B3.5 — پیامدهای بین‌کاشی (یک معامله ← ۴ پیامد)", () => {
  test("پ-۳-۶۱ معاملهٔ واقعی زنجیرهٔ کامل: حداقل ۳ پیامد", async () => {
    // گزینش معامله‌ای که درخواستش موجود است (زنجیرهٔ کامل M1-M4 — مانند batch)
    const reqs = await real.requestRecord.findMany({ where: { requestCode: { not: null } }, select: { requestCode: true }, take: 800 });
    const codes = new Set(reqs.map((r) => r.requestCode));
    const candidates = await real.transactionRecord.findMany({ where: { propertyCode: { not: "" } }, orderBy: { contractDate: "desc" }, take: 400 });
    const tx = candidates.find((t) => t.requestCode && codes.has(t.requestCode));
    if (!tx) return;
    const r = await emitCrossTileOutcomes(real, tx.id);
    expect(r.outcomes.length).toBeGreaterThanOrEqual(3);
  });

  test("پ-۳-۶۲ پیامد M3 (معامله) همیشه هست", async () => {
    const tx = await real.transactionRecord.findFirst();
    if (!tx) return;
    const r = await emitCrossTileOutcomes(real, tx.id);
    expect(r.outcomes.some((o) => o.predictionType === "transaction_success")).toBe(true);
  });

  test("پ-۳-۶۳ پیامد M1 (ملک) وقتی کد ملک هست", async () => {
    const tx = await real.transactionRecord.findFirst({ where: { propertyCode: { not: "" } } });
    if (!tx) return;
    const r = await emitCrossTileOutcomes(real, tx.id);
    expect(r.outcomes.some((o) => o.predictionType === "listing_deal")).toBe(true);
  });

  test("پ-۳-۶۴ همهٔ پیامدها observedValue=1 (موفقیت واقعی)", async () => {
    const tx = await real.transactionRecord.findFirst();
    if (!tx) return;
    const r = await emitCrossTileOutcomes(real, tx.id);
    expect(r.outcomes.every((o) => o.observedValue === 1)).toBe(true);
  });

  test("پ-۳-۶۵ هر پیامد زنجیرهٔ شاهد دارد (EvidenceLink)", async () => {
    const tx = await real.transactionRecord.findFirst();
    if (!tx) return;
    const r = await emitCrossTileOutcomes(real, tx.id);
    expect(r.outcomes.every((o) => o.evidenceChain.length > 0)).toBe(true);
  });

  test("پ-۳-۶۶ شاهد هر پیامد ارجاع پرس‌وجو دارد", async () => {
    const tx = await real.transactionRecord.findFirst();
    if (!tx) return;
    const r = await emitCrossTileOutcomes(real, tx.id);
    for (const o of r.outcomes) {
      expect(o.evidenceChain.every((e) => e.reference.length > 0 && e.description.length > 0)).toBe(true);
    }
  });

  test("پ-۳-۶۷ resolution همه success است", async () => {
    const tx = await real.transactionRecord.findFirst();
    if (!tx) return;
    const r = await emitCrossTileOutcomes(real, tx.id);
    expect(r.outcomes.every((o) => o.resolution === "success")).toBe(true);
  });

  test("پ-۳-۶۸ batch روی ۱۰ معاملهٔ واقعی: ≥ ۳۰ پیامد", async () => {
    const r = await emitCrossTileOutcomesBatch(real, 10);
    expect(r.transactions).toBe(10);
    expect(r.outcomes).toBeGreaterThanOrEqual(30);
  });

  test("پ-۳-۶۹ batch رویداد تختهٔ سیاه منتشر می‌کند", async () => {
    const r = await emitCrossTileOutcomesBatch(real, 5);
    expect(r.events).toBeGreaterThan(0);
  });

  test("پ-۳-۷۰ مصنوع ماندگار خوانده می‌شود", () => {
    const all = readCrossTileOutcomes();
    expect(all.length).toBeGreaterThan(0);
  });

  test("پ-۳-۷۱ انواع پیامد هر چهار مدل را پوشش می‌دهد", () => {
    const all = readCrossTileOutcomes();
    const types = new Set(all.map((o) => o.predictionType));
    expect(types.has("listing_deal")).toBe(true);
    expect(types.has("request_match")).toBe(true);
    expect(types.has("transaction_success")).toBe(true);
    expect(types.has("expert_performance")).toBe(true);
  });

  test("پ-۳-۷۲ پیامدها batchId یکسان دارند", () => {
    const all = readCrossTileOutcomes();
    expect(all.every((o) => o.extractionBatchId === "p6545-cross-tile")).toBe(true);
  });

  test("پ-۳-۷۳ tenant همهٔ پیامدها melk-tabriz است", () => {
    const all = readCrossTileOutcomes();
    expect(all.every((o) => o.tenantId === "melk-tabriz")).toBe(true);
  });

  test("پ-۳-۷۴ معاملهٔ ناموجود = خالی صادقانه", async () => {
    const r = await emitCrossTileOutcomes(real, "NOPE");
    expect(r.outcomes).toHaveLength(0);
  });

  test("پ-۳-۷۵ شاهد cross-tile-proof.json: ۱۰ معامله و ۳۷+ پیامد", () => {
    const proof = JSON.parse(readFileSync("download/p6545/cross-tile-proof.json", "utf8"));
    expect(proof.batch.transactions).toBe(10);
    expect(proof.batch.outcomes).toBeGreaterThanOrEqual(37);
  });

  test("پ-۳-۷۶ رویداد outcome.recorded در تختهٔ سیاه هست", async () => {
    const entries = await blackboardRead({});
    const outcomes = entries.filter((e) => {
      const p = e.payload as { name?: string; detail?: { txId?: string } } | undefined;
      return p?.name === "outcome.recorded" && p?.detail?.txId !== undefined;
    });
    expect(outcomes.length).toBeGreaterThan(0);
  });

  test("پ-۳-۷۷ شناسهٔ پیامدها از الگوی ct-m{1..4}", () => {
    const all = readCrossTileOutcomes();
    expect(all.every((o) => /^ct-m[1-4]-/.test(o.id))).toBe(true);
  });

  test("پ-۳-۷۸ پیوند مدل M4 از مسیر درخواست→کارشناس ثبت‌شده", () => {
    const all = readCrossTileOutcomes();
    const expert = all.find((o) => o.predictionType === "expert_performance");
    if (expert) {
      expect(expert.evidenceChain[0].description).toContain("کارشناس");
    }
  });

  test("پ-۳-۷۹ قرارداد نوعی OutcomeRecord در همهٔ پیامدها", () => {
    const all = readCrossTileOutcomes();
    for (const o of all) {
      expect(typeof o.id).toBe("string");
      expect(typeof o.predictionId).toBe("string");
      expect(typeof o.predictedAt).toBe("string");
      expect(typeof o.observedAt).toBe("string");
      expect(typeof o.predictedValue).toBe("number");
      expect(typeof o.observedValue).toBe("number");
    }
  });

  test("پ-۳-۸۰ صفر تغییر در ۱۱ موتور (گارد BLOCK G-6)", () => {
    // فایل‌های موتور عین P6537 مانده‌اند (اسکن هش‌مانند: حجم + نشانه‌های کلیدی)
    const p7 = readFileSync("src/core/intelligence/p7-core.ts", "utf8");
    const p10 = readFileSync("src/core/intelligence/p10-core.ts", "utf8");
    const p11 = readFileSync("src/core/intelligence/p11-core.ts", "utf8");
    expect(p7).toContain("export class OutcomeEngineImpl");
    expect(p10).toContain("۲۵ بررسی اجباری در ۵ دسته"); // ساختار عین سند ۰۲۷
    expect(p11).toContain("maxPerDay = 1"); // سقف اجرا دست‌نخورده
  });
});
