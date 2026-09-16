/**
 * تست‌های مهاجرت ایجنت‌ها به Repository — PHASE 2 (P2-02)
 * ------------------------------------------------------
 * پذیرش P2-02: «تست اختصاصی هر ایجنت با Repository in-memory یا stub».
 * هر ایجنت با Repository ساختگی (بدون هیچ DB) ساخته می‌شود و
 * بینش‌هایش باید عین رفتار قبلی تولید شوند.
 */
import { describe, expect, test } from "bun:test";
import { TransactionAgent } from "../src/core/agent/transaction-agent";
import { ContractAgent } from "../src/core/agent/contract-agent";
import { SupplyDemandAgent } from "../src/core/agent/supply-demand-agent";
import { VisitsAgent } from "../src/core/agent/visits-agent";
import { ExtractionAgent } from "../src/core/agent/extraction-agent";
import type {
  ContractDTO,
  ContractRepository,
  ExpertRepository,
  LookupLogDTO,
  MarketRepository,
  OutcomeRepository,
  SupplyDemandDTO,
  TransactionDTO,
  TransactionRepository,
  VisitDTO,
  VisitRepository,
} from "../src/core/repositories/interfaces";

// ===================== ساختگاه Stub های درون-حافظه =====================

const stubTx = (over: Partial<TransactionDTO> = {}): TransactionDTO => ({
  id: "T1", contractDate: new Date("2026-04-15T10:00:00Z"), propertyCode: "P-100",
  propertyCustomer: "علی رضایی", requestCode: "R-200", requestCustomer: "مریم احمدی",
  contractHolo: "H-777", suggestedPropertyCount: 3, eventsCount: 2, syncedAt: new Date(),
  ...over,
});

const stubContract = (over: Partial<ContractDTO> = {}): ContractDTO => ({
  id: "C1", status: "waitingForFinance", contractHolo: "H1", propertyCode: "P1", requestCode: "R1",
  contractType: "مبایعه‌نامه", creatorName: "کارشناس", createdAt: new Date("2026-04-01T00:00:00Z"),
  contractDate: new Date("2026-04-05T00:00:00Z"), documentDate: null, deliveryDate: null,
  propertyTitle: "ملک", propertyAddress: "آدرس", buyerListJson: null, sellerListJson: null,
  realtorListJson: JSON.stringify([{ name: "مشاور یک", unitPercent: 50, confirmation: "confirm", description: "", role: "" }]),
  canAddRealtor: false, syncedAt: new Date(),
  ...over,
});

const stubVisit = (over: Partial<VisitDTO> = {}): VisitDTO => ({
  id: "V1", propertyCode: "P-1", requesterName: "مشتری", checkerName: "بررسی‌گر",
  propertyRealtorName: "مشاور", checkTime: new Date(), createdAt: new Date("2026-04-01T09:00:00Z"),
  status: "بررسی شد", syncedAt: new Date(),
  ...over,
});

const stubSd = (over: Partial<SupplyDemandDTO> = {}): SupplyDemandDTO => ({
  id: "S1", rangeTitle: "۰ تا ۵۰ میلیون", propertyCount: 10, requestPercent: 70,
  status: "گرم", syncedAt: new Date(),
  ...over,
});

const stubLookup = (over: Partial<LookupLogDTO> = {}): LookupLogDTO => ({
  id: "L1", kind: "PROPERTY", code: "P-900", found: true, personName: "مالک",
  personMobile: "09140000000", address: "تبریز", actorCode: "1", errorNote: null,
  createdAt: new Date(),
  ...over,
});

/** ساخت TransactionRepository ساختگی با داده ثابت */
function makeTxRepo(rows: TransactionDTO[]): TransactionRepository {
  return {
    findAll: async () => rows,
    listWithSummary: async () => ({ rows, total: rows.length, summary: { totalCount: rows.length, hasRequestEvent: 0, hasSuggestedProperty: 0, hasBoth: 0, withHolo: 0, withRequest: 0 } }),
    countAll: async () => rows.length,
    replaceAll: async () => rows.length,
    upsertBatch: async () => ({ created: 0, updated: 0 }),
    deleteAll: async () => undefined,
  };
}

function makeContractRepo(rows: ContractDTO[]): ContractRepository {
  return {
    findAll: async () => rows,
    findAllOrderByCreatedAtDesc: async () => rows,
    countAll: async () => rows.length,
    replaceAll: async () => rows.length,
    upsertBatch: async () => ({ created: 0, updated: 0 }),
    deleteAll: async () => undefined,
  };
}

function makeVisitRepo(rows: VisitDTO[]): VisitRepository {
  return {
    findAll: async () => rows,
    listWithSummary: async () => ({ rows, total: rows.length, summary: { totalCount: rows.length, checkedCount: 0, distinctPropertyCodes: 0, distinctRequesters: 0 } }),
    countAll: async () => rows.length,
    replaceAll: async () => rows.length,
    upsertBatch: async () => ({ created: 0, updated: 0 }),
    deleteAll: async () => undefined,
  };
}

function makeMarketRepo(supplyDemand: SupplyDemandDTO[]): MarketRepository {
  return {
    listSupplyDemand: async () => supplyDemand,
    listSupplyDemandOrderByPropertyCountDesc: async () => supplyDemand,
    countSupplyDemand: async () => supplyDemand.length,
    replaceSupplyDemand: async () => supplyDemand.length,
    upsertSupplyDemandBatch: async () => ({ created: 0, updated: 0 }),
    deleteAllSupplyDemand: async () => undefined,
    listActiveAdScores: async () => [],
    listAdsWithPrice: async () => [],
    listAdPrices: async () => [],
    listPriceSamples: async () => [],
    listAdsWithBucketCounts: async () => ({ rows: [], bucketCounts: { hunt: 0, follow: 0, review: 0 } }),
    findAdByToken: async () => null,
    setAdStatus: async () => undefined,
    deleteAdByToken: async () => undefined,
    listMarketPriceStats: async () => [],
    listRecentScanLogs: async () => [],
    getDivarSettings: async () => null,
    listRefListsByKeys: async () => [],
    findRefList: async () => null,
  };
}

function makeOutcomeRepo(lookups: LookupLogDTO[]): OutcomeRepository {
  return {
    listRecentLookups: async () => lookups,
    countLookups: async () => lookups.length,
    createLookup: async () => { throw new Error("stub — write not expected"); },
    listRecentRejects: async () => [],
    createReject: async () => { throw new Error("stub — write not expected"); },
    createCommissionCalc: async () => { throw new Error("stub — write not expected"); },
  };
}

/** ExpertRepository خالی برای سازگاری تایپی در تست‌های آینده */
function makeEmptyExpertRepo(): ExpertRepository {
  return {
    findAll: async () => [],
    listWithInteractions: async () => ({ rows: [], total: 0 }),
    distinctFilterFields: async () => ({ roles: [], businesses: [], creators: [] }),
    listInteractions: async () => ({ rows: [], total: 0 }),
    listAllInteractions: async () => [],
    countAll: async () => 0,
    countAllInteractions: async () => 0,
    replaceAll: async () => 0,
    replaceInteractions: async () => 0,
    upsertBatch: async () => ({ created: 0, updated: 0 }),
    upsertInteractionsBatch: async () => ({ created: 0, updated: 0 }),
    deleteAll: async () => undefined,
    deleteAllInteractions: async () => undefined,
  };
}

// ===================== تست‌ها =====================

describe("P2-02-A — ایجنت‌های تک‌جدولی با Repository ساختگی (صفر DB)", () => {
  test("TransactionAgent: بینش‌ها از داده Stub تولید می‌شوند", async () => {
    const agent = new TransactionAgent({
      transactions: makeTxRepo([
        stubTx(),
        stubTx({ id: "T2", requestCode: null, requestCustomer: null, contractHolo: null, eventsCount: 0, suggestedPropertyCount: 0 }),
      ]),
    });
    const cards = await agent["computeRawInsights"]();
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.some((c) => c.key === "tx-volume")).toBe(true);
    expect(cards.some((c) => c.key === "tx-composition")).toBe(true);
    const volume = cards.find((c) => c.key === "tx-volume")!;
    expect(volume.metrics?.[0].value).toBe("۲"); // faNumber(2)
  });

  test("TransactionAgent: داده خالی → صفر بینش", async () => {
    const agent = new TransactionAgent({ transactions: makeTxRepo([]) });
    const cards = await agent["computeRawInsights"]();
    expect(cards).toEqual([]);
  });

  test("ContractAgent: قیف و گلوگاه و حق‌السهم از Stub", async () => {
    const agent = new ContractAgent({
      contracts: makeContractRepo([
        stubContract(),
        stubContract({ id: "C2", status: "finished", documentDate: null }),
        stubContract({ id: "C3", status: "rejectedByFinance" }),
      ]),
    });
    const cards = await agent["computeRawInsights"]();
    expect(cards.some((c) => c.key === "contract-funnel")).toBe(true);
    expect(cards.some((c) => c.key === "contract-bottleneck")).toBe(true);
    expect(cards.some((c) => c.key === "contract-share")).toBe(true);
    expect(cards.some((c) => c.key === "contract-reject")).toBe(true);
  });

  test("SupplyDemandAgent: تعادل بازار گرم از Stub", async () => {
    const agent = new SupplyDemandAgent({
      market: makeMarketRepo([
        stubSd(),
        stubSd({ id: "S2", rangeTitle: "۵۰ تا ۱۰۰", propertyCount: 40, requestPercent: 15 }),
      ]),
    });
    const cards = await agent["computeRawInsights"]();
    expect(cards.some((c) => c.key === "sd-balance")).toBe(true);
    expect(cards.some((c) => c.key === "sd-pressure")).toBe(true);
    expect(cards.some((c) => c.key === "sd-strategy")).toBe(true);
  });

  test("VisitsAgent: نرخ بررسی و بررسی‌کنندگان از Stub", async () => {
    const agent = new VisitsAgent({
      visits: makeVisitRepo([
        stubVisit(),
        stubVisit({ id: "V2", checkTime: null, status: "", propertyCode: "P-2" }),
      ]),
    });
    const cards = await agent["computeRawInsights"]();
    expect(cards.some((c) => c.key === "vi-volume")).toBe(true);
    expect(cards.some((c) => c.key === "vi-status")).toBe(true);
    expect(cards.some((c) => c.key === "vi-leaders")).toBe(true);
  });

  test("ExtractionAgent: حجم و پوشش و امنیت از Stub", async () => {
    const agent = new ExtractionAgent({
      outcomes: makeOutcomeRepo([
        stubLookup(),
        stubLookup({ id: "L2", kind: "REQUEST", code: "R-900", personMobile: null }),
        stubLookup({ id: "L3", code: "P-900", found: false, personName: null, errorNote: "یافت نشد" }),
        stubLookup({ id: "L4", code: "P-900" }),
      ]),
    });
    const cards = await agent["computeRawInsights"]();
    expect(cards.some((c) => c.key === "lk-volume")).toBe(true);
    expect(cards.some((c) => c.key === "lk-coverage")).toBe(true);
    // کد P-900 سه بار استعلام شده → هشدار امنیتی
    expect(cards.some((c) => c.key === "lk-security")).toBe(true);
  });
});

describe("P2-02-A — خلوص import ایجنت‌های مهاجرت‌کرده", () => {
  const migrated = [
    "transaction-agent.ts", "contract-agent.ts", "supply-demand-agent.ts",
    "visits-agent.ts", "extraction-agent.ts", "analyzers.ts",
  ];
  for (const f of migrated) {
    test(`${f} نه @/lib/db import می‌کند نه @prisma/client`, async () => {
      const source = await Bun.file(`${import.meta.dir}/../src/core/agent/${f}`).text();
      expect(/from\s+['"]@\/lib\/db['"]/.test(source)).toBe(false);
      expect(/from\s+['"]@prisma\/client['"]/.test(source)).toBe(false);
    });
  }
});

// ===================== P2-02-B — ایجنت‌های چندجدولی =====================

import { ExpertAgent } from "../src/core/agent/expert-agent";
import { RequestAgent } from "../src/core/agent/request-agent";
import { FinanceAgent } from "../src/core/agent/finance-agent";
import { PriceIndexAgent } from "../src/core/agent/price-index-agent";
import { ListingAgent } from "../src/core/agent/listing-agent";
import { CustomerClubAgent } from "../src/core/agent/customer-club-agent";
import type {
  CustomerRepository,
  ExpertDTO,
  InteractionDTO,
  ListingRepository,
  PredictionRepository,
  RefListCacheDTO,
} from "../src/core/repositories/interfaces";
import type { CommissionCityConfig } from "../src/lib/melk-api/types";

const stubExpert = (over: Partial<ExpertDTO> = {}): ExpertDTO => ({
  id: "E1", personnelCode: "910001", fullName: "سارا محمدی", mobile: "09141110001",
  role: "کارشناس فروش", businessTitle: "شعبه مرکزی", creator: null, active: true,
  createdAt: new Date("2026-01-01T08:00:00Z"), syncedAt: new Date(),
  ...over,
});

const stubInteraction = (over: Partial<InteractionDTO> = {}): InteractionDTO => ({
  id: "I1", requestRealtorName: "سارا محمدی", propertyRealtorName: "رضا کریمی",
  count: 4, syncedAt: new Date(),
  ...over,
});

function makeExpertRepoFull(experts: ExpertDTO[], interactions: InteractionDTO[]): ExpertRepository {
  return {
    findAll: async () => experts,
    listWithInteractions: async () => ({ rows: [], total: 0 }),
    distinctFilterFields: async () => ({ roles: [], businesses: [], creators: [] }),
    listInteractions: async () => ({ rows: interactions, total: interactions.length }),
    listAllInteractions: async () => interactions,
    countAll: async () => experts.length,
    countAllInteractions: async () => interactions.length,
    replaceAll: async () => 0,
    replaceInteractions: async () => 0,
    upsertBatch: async () => ({ created: 0, updated: 0 }),
    upsertInteractionsBatch: async () => ({ created: 0, updated: 0 }),
    deleteAll: async () => undefined,
    deleteAllInteractions: async () => undefined,
  };
}

function makeMarketRepoWithRefLists(refLists: RefListCacheDTO[], adPrices: Array<{ price: number | null }>): MarketRepository {
  return {
    listSupplyDemand: async () => [],
    listSupplyDemandOrderByPropertyCountDesc: async () => [],
    countSupplyDemand: async () => 0,
    replaceSupplyDemand: async () => 0,
    upsertSupplyDemandBatch: async () => ({ created: 0, updated: 0 }),
    deleteAllSupplyDemand: async () => undefined,
    listActiveAdScores: async () => [],
    listAdsWithPrice: async () => [],
    listAdPrices: async () => adPrices,
    listPriceSamples: async () => [],
    listAdsWithBucketCounts: async () => ({ rows: [], bucketCounts: { hunt: 0, follow: 0, review: 0 } }),
    findAdByToken: async () => null,
    setAdStatus: async () => undefined,
    deleteAdByToken: async () => undefined,
    listMarketPriceStats: async () => [],
    listRecentScanLogs: async () => [],
    getDivarSettings: async () => null,
    listRefListsByKeys: async () => refLists,
    findRefList: async () => null,
  };
}

function makeEmptyPredictionRepo(history: Array<{ areaName: string; category: string; medianPerMeter: number; recordedAt: string }>): PredictionRepository {
  return {
    listRecentHistory: async (take: number) => history.slice(0, take).map((h, i) => ({
      id: `H${i}`, areaName: h.areaName, category: h.category, medianPerMeter: h.medianPerMeter,
      p25PerMeter: 0, p75PerMeter: 0, minPerMeter: 0, maxPerMeter: 0, sampleCount: 5,
      recordedAt: new Date(h.recordedAt),
    })),
    listHistorySince: async () => [],
    createHistoryEntry: async () => { throw new Error("stub"); },
  };
}

function makeEmptyListingRepo(): ListingRepository {
  return {
    listRecent: async () => [],
    listRecentPostLogs: async () => [],
    getInstagramConnection: async () => null,
    findById: async () => null,
    updateCrmTransfer: async () => undefined,
    updateInstagramPublication: async () => undefined,
  };
}

function makeEmptyCustomerRepo(): CustomerRepository {
  return {
    listRecentRequests: async () => [],
    listRecentEvents: async () => [],
    findById: async () => null,
    findByIdWithEvents: async () => null,
    updateEventArmSync: async () => undefined,
  };
}

describe("P2-02-B — ایجنت‌های چندجدولی با Repository ساختگی (صفر DB)", () => {
  test("ExpertAgent: شبکه همکاری و مشاوران منزوی از Stub", async () => {
    const agent = new ExpertAgent({
      experts: makeExpertRepoFull(
        [stubExpert(), stubExpert({ id: "E2", personnelCode: "910002", fullName: "رضا کریمی", active: true })],
        [stubInteraction()]
      ),
    });
    const cards = await agent["computeRawInsights"]();
    expect(cards.some((c) => c.key === "ex-composition")).toBe(true);
    expect(cards.some((c) => c.key === "ex-activity")).toBe(true);
    expect(cards.some((c) => c.key === "ex-network")).toBe(true);
  });

  test("RequestAgent: بدون داده → بینش جامعه در حال شکل‌گیری (بدون throw)", async () => {
    const agent = new RequestAgent({ customers: makeEmptyCustomerRepo() });
    const cards = await agent["computeRawInsights"]();
    expect(cards.some((c) => c.key === "community-empty")).toBe(true);
  });

  test("FinanceAgent: تعرفه فقط از کش — کش خالی → هشدار «در دسترس نیست» (E.2)، بدون HTTP", async () => {
    const agent = new FinanceAgent({
      contracts: makeContractRepo([]),
      experts: makeEmptyExpertRepo(),
      market: makeMarketRepoWithRefLists([], []),
      commissionConfig: async () => ({ configs: [], liveError: "تعرفه کمیسیون در کش محلی موجود نیست." }),
    });
    const cards = await agent["computeRawInsights"]();
    // مسیر HTTP هرگز صدا زده نشد → کارت هشدار تعرفه؛
    // و چون کارتی موجود است، کارت «داده خالی» ساخته نمی‌شود (بازگشت زودهنگام عین کد قبلی)
    expect(cards.some((c) => c.key === "finance-tariff-error")).toBe(true);
    expect(cards.some((c) => c.key === "finance-empty")).toBe(false);
  });

  test("FinanceAgent: کش پر → کارت تعرفه + بینش درآمد از Stub", async () => {
    const tariff: CommissionCityConfig = {
      cityId: "1", cityName: "تبریز", valueAddedPercentage: 10,
      realEstateTariff: "", image: null,
      detail: [{ contractType: "mobayeName", contractTypeFa: "مبایعه‌نامه", buyerLabel: "خریدار", sellerLabel: "فروشنده", inputs: [] }],
    };
    const agent = new FinanceAgent({
      contracts: makeContractRepo([
        stubContract({ status: "confirmedByFinance", realtorListJson: JSON.stringify([{ name: "سارا محمدی", unitPercent: 60, confirmation: "confirm", description: "", role: "" }]) }),
        stubContract({ id: "C2", status: "finished", realtorListJson: JSON.stringify([{ name: "رضا کریمی", unitPercent: 40, confirmation: "confirm", description: "", role: "" }]) }),
        stubContract({ id: "C3", status: "waitingForRealtors", realtorListJson: JSON.stringify([{ name: "سارا محمدی", unitPercent: 50, confirmation: "pending", description: "", role: "" }]) }),
      ]),
      experts: makeExpertRepoFull([
        stubExpert(),
        stubExpert({ id: "E2", personnelCode: "910002", fullName: "رضا کریمی", businessTitle: "شعبه ولیعصر" }),
      ], []),
      market: makeMarketRepoWithRefLists([], [{ price: 2_000_000_000 }, { price: 4_000_000_000 }]),
      commissionConfig: async () => ({ configs: [tariff], liveError: null }),
    });
    const cards = await agent["computeRawInsights"]();
    expect(cards.some((c) => c.key === "finance-tariff")).toBe(true);
    expect(cards.some((c) => c.key === "finance-revenue")).toBe(true);
    expect(cards.some((c) => c.key === "finance-branch")).toBe(true);
    expect(cards.some((c) => c.key === "finance-pipeline")).toBe(true);
  });

  test("PriceIndexAgent: فقط-کش پیکربندی + شاخص از آگهی‌های Stub", async () => {
    const agent = new PriceIndexAgent({
      market: {
        ...makeMarketRepoWithRefLists([], []),
        listAdsWithPrice: async () => {
          const mk = (token: string, lineId: string, lineName: string, ppm: number) => ({
            token, category: "apartment-sell", title: `آپارتمان ${token}`, description: null, priceText: null,
            price: ppm * 100, pricePerMeter: ppm, meterage: 100, rooms: 2, floor: 3, buildYear: 1400,
            publishedAt: new Date(), bumpedAt: null, firstSeenAt: new Date(), lastSeenAt: new Date(),
            locationText: null, latitude: null, longitude: null, matchedAreaId: "1", matchedAreaName: "منطقه ۱",
            matchedLineId: lineId, matchedLineName: lineName, personalScore: 80, underpriceScore: 70,
            locationScore: 85, otherScore: 60, totalScore: 75, bucket: "hunt", status: "active",
            analysisJson: null, imagesJson: null, specsJson: null, changeKey: null,
            publisherType: "personal", publisherName: null, publisherAdCount: null, publisherBrandUrl: null,
          });
          // دو نمونه در هر محله → هر دو محله «قابل‌اتکا» (reliable ≥ ۲ نمونه)
          return [
            mk("a1", "10", "محله ۱", 30_000_000),
            mk("a2", "10", "محله ۱", 32_000_000),
            mk("a3", "11", "محله ۲", 20_000_000),
            mk("a4", "11", "محله ۲", 22_000_000),
          ];
        },
      },
      predictions: makeEmptyPredictionRepo([
        { areaName: "محله ۱", category: "apartment-sell", medianPerMeter: 25_000_000, recordedAt: "2026-05-01T00:00:00Z" },
        { areaName: "محله ۱", category: "apartment-sell", medianPerMeter: 35_000_000, recordedAt: "2026-06-01T00:00:00Z" },
      ]),
      priceIndexConfigs: async () => ({ indices: [], liveError: "پیکربندی در کش نیست." }),
    });
    const cards = await agent["computeRawInsights"]();
    expect(cards.some((c) => c.key === "index-config-error")).toBe(true);
    expect(cards.some((c) => c.key === "index-overall")).toBe(true);
    expect(cards.some((c) => c.key === "index-region")).toBe(true);
    // جهش ۴۰٪ محله ۱ → هشدار
    expect(cards.some((c) => c.key === "index-jump")).toBe(true);
  });

  test("ListingAgent: داده خالی → بینش راه‌اندازی دفتر آگهی + هشدار اینستاگرام", async () => {
    const agent = new ListingAgent({ listings: makeEmptyListingRepo() });
    const cards = await agent["computeRawInsights"]();
    expect(cards.some((c) => c.key === "registry-empty")).toBe(true);
    expect(cards.some((c) => c.key === "instagram-connection")).toBe(true);
  });

  test("CustomerClubAgent: فهرست مرجع از کش + جامعه از معاملات/قراردادها/مشاوران", async () => {
    const agent = new CustomerClubAgent({
      transactions: makeTxRepo([stubTx()]),
      contracts: makeContractRepo([stubContract()]),
      experts: makeExpertRepoFull([stubExpert()], []),
      market: makeMarketRepoWithRefLists([
        { key: "user-characters", dataJson: JSON.stringify([{ name: "بها" }, { name: "خوش‌قول" }]), fetchedAt: new Date() },
        { key: "user-jobs", dataJson: JSON.stringify([{ name: "کارمند" }]), fetchedAt: new Date() },
      ], []),
    });
    const cards = await agent["computeRawInsights"]();
    expect(cards.some((c) => c.key === "club-catalog")).toBe(true);
    expect(cards.some((c) => c.key === "club-community")).toBe(true);
  });
});

describe("P2-02-B — خلوص import ایجنت‌های چندجدولی", () => {
  const migrated = ["expert-agent.ts", "request-agent.ts", "finance-agent.ts", "price-index-agent.ts", "listing-agent.ts", "customer-club-agent.ts"];
  for (const f of migrated) {
    test(`${f} نه @/lib/db import می‌کند نه @prisma/client`, async () => {
      const source = await Bun.file(`${import.meta.dir}/../src/core/agent/${f}`).text();
      expect(/from\s+['"]@\/lib\/db['"]/.test(source)).toBe(false);
      expect(/from\s+['"]@prisma\/client['"]/.test(source)).toBe(false);
    });
  }
});

// ===================== P2-02-C — ایجنت فایل‌یابی (پرخطرترین) =====================

import { DivarAgent } from "../src/core/agent/divar-agent";
import type {
  AdScoreProjection,
  DivarScanLogDTO,
  DivarSettingDTO,
  MarketStatDTO,
} from "../src/core/repositories/interfaces";

describe("P2-02-C — ایجنت فایل‌یابی با Repository ساختگی — خروجی عین رفتار قبلی", () => {
  const adScore = (over: Partial<AdScoreProjection> = {}): AdScoreProjection => ({
    bucket: "hunt", personalScore: 80, totalScore: 76, underpriceScore: 72,
    otherScore: 65, locationScore: 88, matchedLineName: "محله ۱", matchedAreaName: "منطقه ۱",
    category: "apartment-sell", publishedAt: new Date(), pricePerMeter: 25_000_000,
    publisherType: "personal", publisherName: null,
    ...over,
  });

  const scanLog = (over: Partial<DivarScanLogDTO> = {}): DivarScanLogDTO => ({
    id: "SC1", startedAt: new Date(), durationMs: 4200, scanned: 120, fetched: 40,
    inWindow: 30, outOfArea: 5, autoRejected: 8, newAds: 4, updatedAds: 2,
    source: "web", error: null,
    ...over,
  });

  function makeDivarMarket(
    ads: AdScoreProjection[],
    scans: DivarScanLogDTO[],
    stats: MarketStatDTO[],
    settings: DivarSettingDTO | null
  ): MarketRepository {
    return {
      listSupplyDemand: async () => [],
      listSupplyDemandOrderByPropertyCountDesc: async () => [],
      countSupplyDemand: async () => 0,
      replaceSupplyDemand: async () => 0,
      upsertSupplyDemandBatch: async () => ({ created: 0, updated: 0 }),
      deleteAllSupplyDemand: async () => undefined,
      listActiveAdScores: async () => ads,
      listAdsWithPrice: async () => [],
      listAdPrices: async () => [],
      listPriceSamples: async () => [],
      listAdsWithBucketCounts: async () => ({ rows: [], bucketCounts: { hunt: 0, follow: 0, review: 0 } }),
      findAdByToken: async () => null,
      setAdStatus: async () => undefined,
      deleteAdByToken: async () => undefined,
      listMarketPriceStats: async () => stats,
      listRecentScanLogs: async () => scans,
      getDivarSettings: async () => settings,
      listRefListsByKeys: async () => [],
      findRefList: async () => null,
    };
  }

  test("سناریوی کامل: اسکن سالم + قانون مالک + زیرقیمت + فیلتر مکان + یادگیری از رد", async () => {
    const settings: DivarSettingDTO = {
      id: "singleton",
      dataJson: JSON.stringify({ areaIds: ["1", "2"], lineIds: ["10", "11", "12"] }),
      locFilterInit: true, updatedAt: new Date(),
    };
    const agent = new DivarAgent({
      market: makeDivarMarket(
        [
          adScore(),
          adScore({ bucket: "follow", personalScore: 45, publisherType: "agent", publisherName: "املاک طاهری" }),
          adScore({ underpriceScore: 85, pricePerMeter: null }),
        ],
        [scanLog(), scanLog({ id: "SC2", error: "network" })],
        [
          { id: "M1", scopeKey: "line:10", medianPerMeter: 28_000_000, p25PerMeter: 25_000_000, p75PerMeter: 31_000_000, sampleCount: 22, armPerMeter: null, updatedAt: new Date() },
          { id: "M2", scopeKey: "area:1", medianPerMeter: 27_000_000, p25PerMeter: 24_000_000, p75PerMeter: 30_000_000, sampleCount: 40, armPerMeter: null, updatedAt: new Date() },
        ],
        settings
      ),
      outcomes: {
        listRecentLookups: async () => [],
        countLookups: async () => 0,
        createLookup: async () => { throw new Error("stub"); },
        listRecentRejects: async () => [
          { id: "RJ1", token: "t1", reasons: JSON.stringify(["broker", "broker", "overpriced"]), note: null, scoreSnapshotJson: null, featureSnapshotJson: null, actorCode: "1", createdAt: new Date() },
        ],
        createReject: async () => { throw new Error("stub"); },
        createCommissionCalc: async () => { throw new Error("stub"); },
      },
    });

    const cards = await agent["computeRawInsights"]();

    // SCAN — سلامت اسکن (آخرین موفق + نرخ ۵ اسکن)
    const scan = cards.find((c) => c.key === "scan-health")!;
    expect(scan).toBeDefined();
    expect(scan.severity).toBe("info");
    // durationMs=4200 → Math.round(4200/100)/10 = 4.2 ثانیه (ارقام لاتین — عین کد قبل از مهاجرت)
    expect(scan.body).toContain("4.2 ثانیه");

    // PERSONAL — قانون مالک: ۳ فایل فعال (ارقام لاتین عین کد قبل از مهاجرت)؛
    // شخصی قوی (۶۰+): آگهی ۱ و ۳ (هر دو ۸۰) → ۲؛ برچسب personal: ۲
    const personal = cards.find((c) => c.key === "personal-filter")!;
    expect(personal.body).toContain("3 فایل فعال");
    expect(personal.body).toContain("2 فایل با نشانه‌های قوی");

    // PRICE — زیرقیمت ۷۰+: هر سه آگهی (۷۲، ۷۲ پیش‌فرض، ۸۵) → ۳
    const price = cards.find((c) => c.key === "price-filter")!;
    expect(price.metrics?.[0].value).toBe("3");
    // ۱ محله آماردار (line:10)
    expect(price.metrics?.[1].value).toBe("1");

    // OTHER — سایر فاکتورها: میانگین (۶۵+۶۵... فقط >0 ها: 65) → میانگین ۶۵
    const other = cards.find((c) => c.key === "other-factors")!;
    expect(other).toBeDefined();

    // LOCATION — فیلتر مکان فعال (۲ منطقه، ۳ محله) + ۳/۳ نگاشت — ارقام لاتین عین کد قبل
    const location = cards.find((c) => c.key === "location-filter")!;
    expect(location.title).toContain("2 منطقه و 3 محله");

    // LEARNING — الگوی ردها: broker×2 + overpriced×1 (ارقام لاتین)
    const learning = cards.find((c) => c.key === "reject-learning")!;
    expect(learning.body).toContain("آگهی مشاور املاک (2 بار)");
    // سه رد broker → هشدار نشت مشاوران
    // (فقط ۲ بار ثبت شده؛ هشدار broker-leak نیاز به ۳+ دارد — عین آستانه قبلی)
    expect(cards.some((c) => c.key === "broker-leak")).toBe(false);
  });

  test("بدون هیچ داده → فقط کارت راهنمای اسکن", async () => {
    const agent = new DivarAgent({
      market: makeDivarMarket([], [], [], null),
      outcomes: {
        listRecentLookups: async () => [],
        countLookups: async () => 0,
        createLookup: async () => { throw new Error("stub"); },
        listRecentRejects: async () => [],
        createReject: async () => { throw new Error("stub"); },
        createCommissionCalc: async () => { throw new Error("stub"); },
      },
    });
    const cards = await agent["computeRawInsights"]();
    expect(cards).toHaveLength(1);
    expect(cards[0].key).toBe("scan-empty");
  });

  test("خطای Repository → catch داخلی، بدون throw (عین رفتار قبلی)", async () => {
    const failing: MarketRepository = {
      ...makeDivarMarket([], [], [], null),
      listActiveAdScores: async () => { throw new Error("db down"); },
      listRecentScanLogs: async () => { throw new Error("db down"); },
    };
    const agent = new DivarAgent({
      market: failing,
      outcomes: {
        listRecentLookups: async () => [],
        countLookups: async () => 0,
        createLookup: async () => { throw new Error("stub"); },
        listRecentRejects: async () => { throw new Error("db down"); },
        createReject: async () => { throw new Error("stub"); },
        createCommissionCalc: async () => { throw new Error("stub"); },
      },
    });
    const cards = await agent["computeRawInsights"]();
    // عین رفتار قبلی: هر فراخوانی db.* در کد قدیم ‎.catch(() => [])‎ داشت → خطا همان داده خالی است
    // → کارت راهنمای scan-empty ساخته می‌شود (نه آرایه خالی، نه throw)
    expect(cards).toHaveLength(1);
    expect(cards[0].key).toBe("scan-empty");
  });

  test("divar-agent.ts نه @/lib/db import می‌کند نه @prisma/client", async () => {
    const source = await Bun.file(`${import.meta.dir}/../src/core/agent/divar-agent.ts`).text();
    expect(/from\s+['"]@\/lib\/db['"]/.test(source)).toBe(false);
    expect(/from\s+['"]@prisma\/client['"]/.test(source)).toBe(false);
  });
});
