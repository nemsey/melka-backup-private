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
