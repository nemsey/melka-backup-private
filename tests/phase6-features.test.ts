/**
 * تست‌های PHASE 6 — Builderهای ویژگی (P6-02)
 * ------------------------------------------------------
 * پوشش (سند طراحی PHASE-6-DESIGN بند ۶ — بلوک Feature Builders):
 *  ۱) هر ۴ builder با fixture مشخص و خروجی قابل‌پیش‌بینی
 *  ۲) حتمیت (determinism) — ورودی یکسان ⇔ خروجی یکسان
 *  ۳) edge: تقسیم‌برصفر میانگین بازار · clamp مقادیر · کپی دفاعی آرایه
 *
 * صفر وابستگی DB — توابع خالص مستقیم.
 */

import { describe, expect, test } from "bun:test";

import {
  buildPropertyFeatures,
  type PropertyInput,
  type PropertyFeatureSet,
} from "@/core/intelligence/feature/builders/property-features";
import {
  buildMarketFeatures,
  type MarketSampleInput,
  type MarketFeatureSet,
} from "@/core/intelligence/feature/builders/market-features";
import {
  buildCustomerFeatures,
  type CustomerInput,
} from "@/core/intelligence/feature/builders/customer-features";
import {
  buildExpertFeatures,
  type ExpertInput,
} from "@/core/intelligence/feature/builders/expert-features";
import {
  FeatureEngineImpl,
  PROPERTY_FEATURES_VERSION,
  CUSTOMER_FEATURES_VERSION,
} from "@/core/intelligence/feature/feature-engine";
import {
  InMemoryFeatureStore,
  FileSystemFeatureStore,
} from "@/core/intelligence/feature/feature-store";
import type { FeatureSet } from "@/core/intelligence/engines/feature";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ===================== fixtureهای ثابت =====================

const SNAPSHOT = new Date("2026-09-16T12:00:00.000Z");

function marketFixture(overrides: Partial<MarketFeatureSet> = {}): MarketFeatureSet {
  return {
    areaId: "area-veliasr",
    snapshotDate: SNAPSHOT,
    medianPricePerMeter: 100_000_000,
    averagePricePerMeter: 102_000_000,
    sampleSize: 40,
    confidence: 0.8,
    priceTrend7d: 0.01,
    priceTrend30d: 0.03,
    volumeTrend7d: -0.02,
    volatility: 0.05,
    supplyDemandRatio: 1.2,
    ...overrides,
  };
}

function propertyFixture(overrides: Partial<PropertyInput> = {}): PropertyInput {
  return {
    id: "prop-001",
    areaId: "area-veliasr",
    areaName: "ولیعصر",
    districtId: "d-1",
    price: 3_200_000_000,
    pricePerMeter: 80_000_000, // زیر میانه ۱۰۰M ⇔ underpriceRatio = 0.2
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
    description: "آپارتمان نوساز نزدیک مترو",
    publisherType: "personal",
    publishedHoursAgo: 48,
    priceChangeCount: 1,
    previousPriceDelta: -150_000_000,
    ...overrides,
  };
}

function customerFixture(overrides: Partial<CustomerInput> = {}): CustomerInput {
  return {
    id: "cust-001",
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
    preferredAreas: ["ولیعصر", "ائل‌گلی"],
    preferredPropertyTypes: ["apartment"],
    preferredTradeType: "buy",
    ...overrides,
  };
}

function expertFixture(overrides: Partial<ExpertInput> = {}): ExpertInput {
  return {
    id: "exp-001",
    personnelCode: "PC-2041",
    activeDaysLast30: 22,
    interactionsLast30: 140,
    responseRate: 0.9,
    conversionRate: 0.35,
    cooperationScore: 0.8,
    currentLoad: 9,
    capacityScore: 0.6,
    networkSize: 15,
    networkQuality: 0.7,
    ...overrides,
  };
}

// ===================== ۱) Property builder =====================

describe("P6-02 buildPropertyFeatures", () => {
  test("fixture کامل: همه فیلدها + مشتق underpriceRatio", () => {
    const out = buildPropertyFeatures(propertyFixture(), marketFixture(), {
      keywordScore: 2.5,
    });

    expect(out.areaId).toBe("area-veliasr");
    expect(out.price).toBe(3_200_000_000);
    expect(out.pricePerMeter).toBe(80_000_000);
    expect(out.areaMedianPricePerMeter).toBe(100_000_000);
    // (100M − 80M) / 100M = 0.2
    expect(out.underpriceRatio).toBeCloseTo(0.2, 10);
    expect(out.descriptionLength).toBe("آپارتمان نوساز نزدیک مترو".length);
    expect(out.descriptionKeywordScore).toBe(2.5);
    expect(out.publisherType).toBe("personal");
    expect(out.publishedHoursAgo).toBe(48);
    expect(out.priceChangeCount).toBe(1);
    expect(out.previousPriceDelta).toBe(-150_000_000);
    expect(out.hasElevator).toBe(true);
    expect(out.hasParking).toBe(false);
  });

  test("حتمیت: دو فراخوانی با ورودی یکسان ⇔ خروجی هم‌ارز عمیق", () => {
    const a = buildPropertyFeatures(propertyFixture(), marketFixture());
    const b = buildPropertyFeatures(propertyFixture(), marketFixture());
    expect(a).toEqual(b);
  });

  test("edge: میانگین صفر ⇔ underpriceRatio صفر · نبود توضیح/سیگنال ⇔ صفر · گارد نامنفی", () => {
    const emptyMarket = marketFixture({ medianPricePerMeter: 0 });
    const out = buildPropertyFeatures(
      propertyFixture({ description: undefined, photoCount: -3, publishedHoursAgo: -10 }),
      emptyMarket,
    );
    expect(out.underpriceRatio).toBe(0);
    expect(out.descriptionLength).toBe(0);
    expect(out.descriptionKeywordScore).toBe(0);
    expect(out.photoCount).toBe(0);
    expect(out.publishedHoursAgo).toBe(0);
  });
});

// ===================== ۲) Customer builder =====================

describe("P6-02 buildCustomerFeatures", () => {
  test("fixture + clamp نمره‌های خارج از بازه", () => {
    const out = buildCustomerFeatures(
      customerFixture({
        responseRate: 1.4,   // بالای بازه → 1
        seriousnessScore: -0.2, // زیر بازه → 0
        previousVisits: 2.9, // شمارنده → گرد به 3
      }),
    );
    expect(out.responseRate).toBe(1);
    expect(out.seriousnessScore).toBe(0);
    expect(out.previousVisits).toBe(3);
    expect(out.recencyDays).toBe(7);
    expect(out.preferredAreas).toEqual(["ولیعصر", "ائل‌گلی"]);
    expect(out.preferredTradeType).toBe("buy");
  });

  test("کپی دفاعی: جهش آرایه ورودی پس از ساخت، خروجی ساخته‌شده را تغییر نمی‌دهد", () => {
    const input = customerFixture();
    const out = buildCustomerFeatures(input);
    input.preferredAreas.push("چایکنار");
    expect(out.preferredAreas).toEqual(["ولیعصر", "ائل‌گلی"]);
    expect(out.preferredAreas).toHaveLength(2);
  });
});

// ===================== ۳) Expert builder =====================

describe("P6-02 buildExpertFeatures", () => {
  test("fixture + clamp و گارد شمارندها", () => {
    const out = buildExpertFeatures(
      expertFixture({
        conversionRate: 2,        // → 1
        networkQuality: -1,       // → 0
        interactionsLast30: 140.6, // → 141
      }),
    );
    expect(out.personnelCode).toBe("PC-2041");
    expect(out.conversionRate).toBe(1);
    expect(out.networkQuality).toBe(0);
    expect(out.interactionsLast30).toBe(141);
    expect(out.currentLoad).toBe(9);
    expect(out.capacityScore).toBe(0.6);
  });

  test("حتمیت: ورودی یکسان ⇔ خروجی هم‌ارز عمیق", () => {
    expect(buildExpertFeatures(expertFixture())).toEqual(buildExpertFeatures(expertFixture()));
  });
});

// ===================== ۴) Market builder =====================

describe("P6-02 buildMarketFeatures", () => {
  const samples = [
    { pricePerMeter: 90_000_000 },
    { pricePerMeter: 100_000_000 },
    { pricePerMeter: 110_000_000 },
    { pricePerMeter: 120_000_000 },
  ];

  test("آمار توصیفی: میانه زوج/فرد + میانگین + confidence با روند کامل", () => {
    const even = buildMarketFeatures({
      areaId: "area-1",
      snapshotDate: SNAPSHOT,
      samples,
      priceTrend7d: 0.01,
      priceTrend30d: 0.03,
      volumeTrend7d: -0.02,
    });
    // میانه چهار نمونه = (100 + 110)/2 = 105
    expect(even.medianPricePerMeter).toBe(105_000_000);
    expect(even.averagePricePerMeter).toBe(105_000_000);
    expect(even.sampleSize).toBe(4);
    // clamp01(4/50)=0.08 × 1 (روند کامل) = 0.08
    expect(even.confidence).toBeCloseTo(0.08, 10);

    const odd = buildMarketFeatures({
      areaId: "area-1",
      snapshotDate: SNAPSHOT,
      samples: samples.slice(0, 3),
    });
    // میانه سه نمونه = 100 · روند ناقص ⇔ ×0.7
    expect(odd.medianPricePerMeter).toBe(100_000_000);
    expect(odd.confidence).toBeCloseTo(clamp01Odd(), 10);
    expect(odd.priceTrend30d).toBe(0); // غایب ⇔ ۰
    expect(odd.supplyDemandRatio).toBe(1); // پیش‌فرض خنثی
  });

  test("edge: نمونه صفر ⇔ آمار صفر + confidence صفر · حتمیت", () => {
    const input: MarketSampleInput = {
      areaId: "area-empty",
      snapshotDate: "2026-09-16T00:00:00.000Z",
      samples: [],
    };
    const a = buildMarketFeatures(input);
    const b = buildMarketFeatures(input);
    expect(a.medianPricePerMeter).toBe(0);
    expect(a.averagePricePerMeter).toBe(0);
    expect(a.sampleSize).toBe(0);
    expect(a.confidence).toBe(0);
    expect(a).toEqual(b); // حتمیت — حتی با snapshotDate رشته‌ای
    expect(a.snapshotDate.getTime()).toBe(new Date("2026-09-16T00:00:00.000Z").getTime());
  });
});

/** clamp01(3/50) × 0.7 — کمکی برای خوانایی تست میانه فرد */
function clamp01Odd(): number {
  return Math.min(1, Math.max(0, 3 / 50)) * 0.7;
}

// ===================== ۵) FeatureEngineImpl (P6-03) =====================

const TMP_P6 = mkdtempSync(join(tmpdir(), "melk-p6-"));
afterAllP6();
function afterAllP6() {
  // ثبت پاک‌سازی با afterAll مشترک فایل (یک بار)
}
import { afterAll } from "bun:test";
afterAll(() => {
  rmSync(TMP_P6, { recursive: true, force: true });
});

describe("P6-03 FeatureEngineImpl — قرارداد v1 + افزودنی‌ها", () => {
  test("compute v1 (دامنه property): بردار عددی + بولی→۱/۰ + missing خالی + asOf ارجی", async () => {
    const engine = new FeatureEngineImpl(); // بدون کش — حتمی
    const out: FeatureSet = await engine.compute({
      tileId: "tile-requests",
      domain: "property",
      source: {
        asOf: "2026-09-16T00:00:00.000Z",
        property: propertyFixture(),
        market: marketFixture(),
        textSignals: { keywordScore: 2 },
      },
    });
    expect(out.tileId).toBe("tile-requests");
    expect(out.domain).toBe("property");
    expect(out.computedAt).toBe("2026-09-16T00:00:00.000Z"); // asOf مقدم است
    expect(out.missing).toEqual([]);
    expect(out.vector.price).toBe(3_200_000_000);
    expect(out.vector.underpriceRatio).toBeCloseTo(0.2, 10);
    expect(out.vector.hasElevator).toBe(1);
    expect(out.vector.hasParking).toBe(0);
    // رشته‌ها عمداً بیرون بردارند (شکل v1 فقط عددی)
    expect(out.vector.propertyType).toBeUndefined();
    expect(out.vector.areaName).toBeUndefined();
  });

  test("compute v1 — bundle ناقص/دامنه ناشناخته ⇔ missing صادقانه", async () => {
    const engine = new FeatureEngineImpl();
    const partial = await engine.compute({ tileId: "t", domain: "property", source: { property: propertyFixture() } });
    expect(partial.missing).toEqual(["source.market"]);
    expect(partial.vector).toEqual({});

    const unknown = await engine.compute({ tileId: "t", domain: "galaxy" });
    expect(unknown.missing).toEqual(["domain:galaxy"]);
  });

  test("کش: بار دوم از کش می‌آید (ورودی جهش‌یافته اثر ندارد) و invalidate بازسازی می‌کند", async () => {
    const store = new InMemoryFeatureStore();
    const engine = new FeatureEngineImpl(store);

    const first = await engine.extractPropertyFeatures(propertyFixture(), marketFixture());
    expect(first.rooms).toBe(2);

    // جهش ورودی — نباید در خروجی دوم بیاید (کش)
    const mutated = await engine.extractPropertyFeatures(
      propertyFixture({ rooms: 4, price: 9_999_999_999 }),
      marketFixture(),
    );
    expect(mutated.rooms).toBe(2);
    expect(mutated.price).toBe(3_200_000_000);

    // invalidate زیررشته‌ای → بازسازی با ورودی جدید
    await store.invalidate("property:prop-001");
    const rebuilt = await engine.extractPropertyFeatures(
      propertyFixture({ rooms: 4 }),
      marketFixture(),
    );
    expect(rebuilt.rooms).toBe(4);

    // نسخه ناهماهنگ ⇔ null (کش کهنه برنمی‌گردد)
    expect(await store.load("property:prop-001", "property-features-v999")).toBeNull();
    expect(await store.load<PropertyFeatureSet>("property:prop-001", PROPERTY_FEATURES_VERSION)).not.toBeNull();
  });

  test("کش مشتری + structuredClone: جهش خروجی، کش را نفمی‌کند", async () => {
    const store = new InMemoryFeatureStore();
    const engine = new FeatureEngineImpl(store);
    const out = await engine.extractCustomerFeatures(customerFixture());
    expect(CUSTOMER_FEATURES_VERSION).toBe("customer-features-v1");
    out.responseRate = 0.123; // جهش خروجی
    const again = await engine.extractCustomerFeatures(customerFixture());
    expect(again.responseRate).toBe(0.8); // کش دست‌نخورده
  });

  test("FileSystemFeatureStore: دور کامل ذخیره/بارگذاری + ماندگاری بین نمونه‌ها + آخرین-برنده", async () => {
    const file = join(TMP_P6, "fs-store", "features.jsonl");
    const a = new FileSystemFeatureStore(file);
    await a.save("market:area-1", { medianPricePerMeter: 100 }, "market-features-v1");
    // نمونه دوم همان فایل — ماندگاری واقعی
    const b = new FileSystemFeatureStore(file);
    const loaded = await b.load<{ medianPricePerMeter: number }>("market:area-1", "market-features-v1");
    expect(loaded?.medianPricePerMeter).toBe(100);

    // الحاق مکرر همان کلید = آخرین برنده
    await b.save("market:area-1", { medianPricePerMeter: 120 }, "market-features-v1");
    const c = new FileSystemFeatureStore(file);
    expect((await c.load<{ medianPricePerMeter: number }>("market:area-1", "market-features-v1"))?.medianPricePerMeter).toBe(120);

    await c.invalidate("market:area-1");
    expect(await c.load("market:area-1", "market-features-v1")).toBeNull();
  });
});
