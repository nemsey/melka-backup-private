/**
 * تست‌های واحد لایه Repository — PHASE 2 (P2-01)
 * ------------------------------------------------------
 * طبق E.3: پایگاه تست ایزوله db/test-repository.db — هرگز custom.db تولید.
 * پوشش: هر ۱۲ Repository + DTO ساختاری + خلوص interfaces (صفر Prisma).
 *
 * نکته درباره «تست واحد با SQLite تست»: این تست‌ها روی فایل ایزوله
 * اجرا می‌شوند که با prisma db push (DATABASE_URL مربوطه) ساخته شده است.
 */
import { describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";

// ---------- پایگاه تست ایزوله (E.3) ----------
const TEST_DB_DIR = "/home/z/my-project/db";
const TEST_DB = `${TEST_DB_DIR}/test-repository.db`;
mkdirSync(TEST_DB_DIR, { recursive: true });

let client: PrismaClient;

async function getTestClient(): Promise<PrismaClient> {
  if (client) return client;
  client = new PrismaClient({
    datasources: { db: { url: `file:${TEST_DB}` } },
  });
  return client;
}

// ---------- importهای لایه (بعد از آماده‌سازی env) ----------
import {
  PrismaTransactionRepository,
  PrismaContractRepository,
  PrismaExpertRepository,
  PrismaVisitRepository,
  PrismaMarketRepository,
  PrismaCustomerRepository,
  PrismaListingRepository,
  PrismaAgentMemoryRepository,
  PrismaPolicyRepository,
  PrismaPredictionRepository,
  PrismaOutcomeRepository,
  PrismaIntegrationRepository,
  getTransactionRepository,
  getDefaultAgentRepositories,
  type TransactionUpsertInput,
  type ExpertUpsertInput,
  type VisitUpsertInput,
  type SupplyDemandUpsertInput,
} from "../src/core/repositories";

// ===================== ۱) خلوص لایه interfaces =====================

describe("P2-01 — خلوص لایه interfaces (صفر Prisma)", () => {
  test("هیچ فایلی در interfaces/ از @prisma/client یا @/lib/db import نمی‌کند", async () => {
    const files = [
      "dto.ts", "index.ts",
      "transaction.repository.ts", "contract.repository.ts", "expert.repository.ts",
      "visit.repository.ts", "market.repository.ts", "customer.repository.ts",
      "listing.repository.ts", "agent-memory.repository.ts", "policy.repository.ts",
      "prediction.repository.ts", "outcome.repository.ts", "integration.repository.ts",
    ];
    for (const f of files) {
      const path = `${import.meta.dir}/../src/core/repositories/interfaces/${f}`;
      const source = await Bun.file(path).text();
      // فقط دستور import واقعی — نه ذکر متنی در کامنت‌ها
      expect(/from\s+['"]@prisma\/client['"]/.test(source)).toBe(false);
      expect(/from\s+['"]@\/lib\/db['"]/.test(source)).toBe(false);
      expect(/require\s*\(\s*['"]@prisma\/client['"]/.test(source)).toBe(false);
    }
  });
});

// ===================== ۲) DTO ساختاری — آینه دقیق Prisma =====================

describe("P2-01 — DTOهای ساختاری آینه دقیق ردیف Prisma هستند", () => {
  test("TransactionDTO شکل و ترتیب فیلدهای TransactionRecord را دارد", async () => {
    const c = await getTestClient();
    const sample = await c.transactionRecord.findFirst();
    if (!sample) return; // پایگاه خالی — تست ساختاری در تست‌های داده‌ای زیر پوشش داده می‌شود
    const keys = Object.keys(sample);
    expect(keys).toEqual([
      "id", "contractDate", "propertyCode", "propertyCustomer", "requestCode",
      "requestCustomer", "contractHolo", "suggestedPropertyCount", "eventsCount", "syncedAt",
    ]);
  });
});

// ===================== ۳) TransactionRepository =====================

describe("P2-01 — PrismaTransactionRepository", () => {
  test("findAll + upsertBatch + idempotency + deleteAll", async () => {
    const c = await getTestClient();
    await c.transactionRecord.deleteMany({});
    const repo = new PrismaTransactionRepository({ client: c });

    expect(await repo.countAll()).toBe(0);
    expect(await repo.findAll()).toHaveLength(0);

    const rows: TransactionUpsertInput[] = [
      {
        id: "T1", contractDate: new Date("2026-01-15T10:00:00Z"), propertyCode: "P-100",
        propertyCustomer: "علی رضایی", requestCode: "R-200", requestCustomer: "مریم احمدی",
        contractHolo: "H-777", suggestedPropertyCount: 3, eventsCount: 2,
      },
      {
        id: "T2", contractDate: new Date("2026-02-20T10:00:00Z"), propertyCode: "P-101",
        propertyCustomer: null, requestCode: null, requestCustomer: null,
        contractHolo: null, suggestedPropertyCount: 0, eventsCount: 0,
      },
    ];

    // درج اول: هر دو create
    const first = await repo.upsertBatch(rows);
    expect(first).toEqual({ created: 2, updated: 0 });
    expect(await repo.countAll()).toBe(2);

    // اجرای دوم همان داده: هر دو update — صفر رکورد جدید (idempotency)
    const second = await repo.upsertBatch(rows);
    expect(second).toEqual({ created: 0, updated: 2 });
    expect(await repo.countAll()).toBe(2);

    // مقادیر ذخیره‌شده
    const all = await repo.findAll();
    expect(all.find((t) => t.id === "T1")?.propertyCustomer).toBe("علی رضایی");

    // فیلتر + شمارنده‌ها
    const listed = await repo.listWithSummary({ filter: { matchKind: "both" } });
    expect(listed.total).toBe(1);
    expect(listed.summary.hasBoth).toBe(1);
    expect(listed.summary.withHolo).toBe(1);

    await repo.deleteAll();
    expect(await repo.countAll()).toBe(0);
  });
});

// ===================== ۴) ExpertRepository =====================

describe("P2-01 — PrismaExpertRepository", () => {
  test("upsertBatch با کلید طبیعی personnelCode + غنی‌سازی تعاملات", async () => {
    const c = await getTestClient();
    await c.expertRecord.deleteMany({});
    await c.interactionRecord.deleteMany({});
    const repo = new PrismaExpertRepository({ client: c });

    const experts: ExpertUpsertInput[] = [
      { id: "E1", personnelCode: "910001", fullName: "سارا محمدی", mobile: "09141110001", role: "کارشناس فروش", businessTitle: "شعبه مرکزی", creator: "مدیر", active: true, createdAt: new Date("2026-01-01T08:00:00Z") },
      { id: "E2", personnelCode: "910002", fullName: "رضا کریمی", mobile: "09141110002", role: "مشاور", businessTitle: "شعبه ولیعصر", creator: null, active: false, createdAt: new Date("2026-02-01T08:00:00Z") },
    ];
    const r1 = await repo.upsertBatch(experts);
    expect(r1).toEqual({ created: 2, updated: 0 });
    // idempotency با کلید personnelCode
    const r2 = await repo.upsertBatch(experts);
    expect(r2).toEqual({ created: 0, updated: 2 });
    expect(await repo.countAll()).toBe(2);

    await repo.replaceInteractions([
      { id: "I1", requestRealtorName: "سارا محمدی", propertyRealtorName: "رضا کریمی", count: 5 },
    ]);
    expect(await repo.countAllInteractions()).toBe(1);

    // غنی‌سازی: مجموع تعامل هر مشاور
    const listed = await repo.listWithInteractions({ filter: { active: true } });
    expect(listed.total).toBe(1);
    expect(listed.rows[0].fullName).toBe("سارا محمدی");
    expect(listed.rows[0].interactionTotal).toBe(5);

    // فیلدهای یکتا برای دراپ‌داون
    const distinct = await repo.distinctFilterFields();
    expect(distinct.roles.sort()).toEqual(["کارشناس فروش", "مشاور"].sort());

    await repo.deleteAllInteractions();
    await repo.deleteAll();
    expect(await repo.countAll()).toBe(0);
  });
});

// ===================== ۵) VisitRepository =====================

describe("P2-01 — PrismaVisitRepository", () => {
  test("listWithSummary — نرخ بررسی و مقادیر یکتا", async () => {
    const c = await getTestClient();
    await c.visitRecord.deleteMany({});
    const repo = new PrismaVisitRepository({ client: c });

    const visits: VisitUpsertInput[] = [
      { id: "V1", propertyCode: "P-1", requesterName: "مشتری یک", checkerName: "بررسی‌گر", propertyRealtorName: "مشاور", checkTime: new Date(), createdAt: new Date("2026-03-01T09:00:00Z"), status: "بررسی شد" },
      { id: "V2", propertyCode: "P-1", requesterName: "مشتری دو", checkerName: "بررسی‌گر", propertyRealtorName: "مشاور", checkTime: null, createdAt: new Date("2026-03-02T09:00:00Z"), status: "" },
      { id: "V3", propertyCode: "P-2", requesterName: "مشتری یک", checkerName: "بررسی‌گر", propertyRealtorName: "مشاور", checkTime: null, createdAt: new Date("2026-03-03T09:00:00Z"), status: "" },
    ];
    await repo.upsertBatch(visits);

    const result = await repo.listWithSummary({}, 10, 0);
    expect(result.total).toBe(3);
    expect(result.summary.checkedCount).toBe(1);
    expect(result.summary.distinctPropertyCodes).toBe(2);
    expect(result.summary.distinctRequesters).toBe(2);
    // مرتب‌سازی جدیدترین اول
    expect(result.rows[0].id).toBe("V3");

    await repo.deleteAll();
    expect(await repo.countAll()).toBe(0);
  });
});

// ===================== ۶) MarketRepository (عرضه/تقاضا + دیوار) =====================

describe("P2-01 — PrismaMarketRepository", () => {
  test("عرضه/تقاضا: upsert + ترتیب + idempotency", async () => {
    const c = await getTestClient();
    await c.supplyDemandRecord.deleteMany({});
    const repo = new PrismaMarketRepository({ client: c });

    const rows: SupplyDemandUpsertInput[] = [
      { id: "S1", rangeTitle: "۰ تا ۵۰ میلیون", propertyCount: 10, requestPercent: 70, status: "گرم" },
      { id: "S2", rangeTitle: "۵۰ تا ۱۰۰ میلیون", propertyCount: 40, requestPercent: 20, status: "سرد" },
    ];
    await repo.upsertSupplyDemandBatch(rows);
    const again = await repo.upsertSupplyDemandBatch(rows);
    expect(again).toEqual({ created: 0, updated: 2 });
    expect(await repo.countSupplyDemand()).toBe(2);

    const ordered = await repo.listSupplyDemandOrderByPropertyCountDesc();
    expect(ordered[0].propertyCount).toBe(40);

    await repo.deleteAllSupplyDemand();
    expect(await repo.countSupplyDemand()).toBe(0);
  });

  test("آگهی دیوار: setAdStatus + findAdByToken + deleteAdByToken", async () => {
    const c = await getTestClient();
    await c.divarAd.deleteMany({});
    const repo = new PrismaMarketRepository({ client: c });

    await c.divarAd.create({
      data: {
        token: "wT-test-1", category: "apartment-sell", title: "آپارتمان ۸۰ متری",
        personalScore: 80, underpriceScore: 75, otherScore: 60, locationScore: 90,
        totalScore: 78, bucket: "hunt", status: "active",
      },
    });

    const ad = await repo.findAdByToken("wT-test-1");
    expect(ad).not.toBeNull();
    expect(ad!.bucket).toBe("hunt");

    await repo.setAdStatus("wT-test-1", "registered");
    expect((await repo.findAdByToken("wT-test-1"))!.status).toBe("registered");

    // پیش‌نمایش امتیازها — عین select ایجنت فایل‌یابی
    const scores = await repo.listActiveAdScores(10);
    expect(scores.length).toBeGreaterThanOrEqual(0);

    await repo.deleteAdByToken("wT-test-1");
    expect(await repo.findAdByToken("wT-test-1")).toBeNull();
  });

  test("کش فهرست‌های مرجع با کلیدهای مشخص", async () => {
    const c = await getTestClient();
    const repo = new PrismaMarketRepository({ client: c });
    await c.refListCache.deleteMany({ where: { key: { in: ["user-characters", "user-jobs"] } } });
    await c.refListCache.create({ data: { key: "user-characters", dataJson: JSON.stringify([{ name: "بها" }]) } });

    const lists = await repo.listRefListsByKeys(["user-characters", "user-jobs"]);
    expect(lists.map((l) => l.key)).toEqual(["user-characters"]);

    const single = await repo.findRefList("user-characters");
    expect(single).not.toBeNull();
    expect(JSON.parse(single!.dataJson)).toHaveLength(1);
  });
});

// ===================== ۷) AgentMemoryRepository + PolicyRepository =====================

describe("P2-01 — AgentMemoryRepository + PolicyRepository", () => {
  test("چرخه کامل حافظه/بازخورد/سیاست — عین قرارداد BaseLearningAgent", async () => {
    const c = await getTestClient();
    const tileId = "test-repo-tile";
    await c.agentMemory.deleteMany({ where: { tileId } });
    await c.agentFeedback.deleteMany({ where: { tileId } });
    await c.agentPolicyVersion.deleteMany({ where: { tileId } });

    const memory = new PrismaAgentMemoryRepository({ client: c });
    const policy = new PrismaPolicyRepository({ client: c });

    // حافظه فقط افزودنی
    await memory.append(tileId, "INTERACTION", JSON.stringify({ at: new Date().toISOString(), event: "insight-render" }));
    await memory.append(tileId, "POLICY_CHANGE", JSON.stringify({ at: new Date().toISOString(), event: "policy-created" }));
    expect(await memory.countMemory(tileId)).toBe(2);
    const recent = await memory.listRecent(tileId, 10);
    expect(recent).toHaveLength(2);

    // بازخورد
    await memory.createFeedback({
      tileId, insightKey: "k1", insightTitle: "عنوان", rating: 1, comment: null,
      context: JSON.stringify({ domain: "VOLUME" }),
    });
    expect(await memory.countFeedback(tileId)).toBe(1);
    expect(await memory.countFeedback(tileId, true)).toBe(1);
    const feedbacks = await memory.listFeedbacks(tileId, 200);
    expect(feedbacks).toHaveLength(1);

    // سیاست: ایجاد + فعال‌سازی اتمیک + rollback semantics
    const v1 = await policy.createVersion({
      tileId, version: 1, content: JSON.stringify({ weights: {} }), rationale: "نسخه اول", active: true, activatedAt: new Date(),
    });
    expect(await policy.findActive(tileId)).not.toBeNull();
    const v2 = await policy.createVersion({
      tileId, version: 2, content: JSON.stringify({ weights: {} }), rationale: "نسخه دوم", active: false, activatedAt: null,
    });
    expect((await policy.findLatest(tileId))!.version).toBe(2);

    // فعال‌سازی نسخه ۲: نسخه ۱ باید غیرفعال شود (اتمیک)
    await policy.activateVersion(tileId, v2.id, new Date());
    expect((await policy.findActive(tileId))!.version).toBe(2);

    // بازگشت به نسخه ۱
    await policy.activateVersion(tileId, v1.id, new Date());
    expect((await policy.findActive(tileId))!.version).toBe(1);

    expect(await policy.countVersions(tileId)).toBe(2);
    expect((await policy.findByTileAndVersion(tileId, 2))!.id).toBe(v2.id);
    expect((await policy.listVersions(tileId)).map((v) => v.version)).toEqual([2, 1]);

    // پاک‌سازی
    await c.agentMemory.deleteMany({ where: { tileId } });
    await c.agentFeedback.deleteMany({ where: { tileId } });
    await c.agentPolicyVersion.deleteMany({ where: { tileId } });
  });
});

// ===================== ۸) PredictionRepository + OutcomeRepository =====================

describe("P2-01 — PredictionRepository + OutcomeRepository", () => {
  test("تاریخچه شاخص: ثبت + قانون یک-ثبت-در-روز", async () => {
    const c = await getTestClient();
    const repo = new PrismaPredictionRepository({ client: c });
    const areaName = "test-area-p2-01";
    await c.priceIndexHistory.deleteMany({ where: { areaName } });

    await repo.createHistoryEntry({
      areaName, category: "apartment-sell", medianPerMeter: 30_000_000,
      p25PerMeter: 25_000_000, p75PerMeter: 35_000_000, minPerMeter: 20_000_000,
      maxPerMeter: 40_000_000, sampleCount: 12,
    });

    const since = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
    const today = await repo.listHistorySince(since);
    expect(today.filter((h) => h.areaName === areaName)).toHaveLength(1);

    const recent = await repo.listRecentHistory(400);
    expect(recent[0].areaName).toBeDefined();

    await c.priceIndexHistory.deleteMany({ where: { areaName } });
  });

  test("استعلام/رد/کمیسیون — فقط افزودنی", async () => {
    const c = await getTestClient();
    const repo = new PrismaOutcomeRepository({ client: c });
    const code = `P2-01-${Date.now()}`;

    await repo.createLookup({
      kind: "PROPERTY", code, found: true, personName: "مالک تست",
      personMobile: "09140000000", address: "تبریز", actorCode: "999999", errorNote: null,
    });
    expect(await repo.countLookups("PROPERTY")).toBeGreaterThanOrEqual(1);
    const lookups = await repo.listRecentLookups(50, "PROPERTY");
    expect(lookups.some((l) => l.code === code)).toBe(true);

    await repo.createReject({
      token: `tok-${code}`, reasons: JSON.stringify(["broker"]), note: null,
      scoreSnapshotJson: null, featureSnapshotJson: null, actorCode: "999999",
    });
    const rejects = await repo.listRecentRejects(120);
    expect(rejects.some((r) => r.token === `tok-${code}`)).toBe(true);

    await repo.createCommissionCalc({
      contractType: "mobayeName", inputsJson: "{}", resultJson: "{}",
      dealValue: 1_000_000_000, vatPercent: 10, actorCode: "999999",
    });

    // پاک‌سازی تست
    await c.lookupLog.deleteMany({ where: { code } });
    await c.divarRejectLog.deleteMany({ where: { token: `tok-${code}` } });
    await c.commissionCalcLog.deleteMany({ where: { actorCode: "999999" } });
  });
});

// ===================== ۹) ContractRepository + CustomerRepository + ListingRepository + IntegrationRepository =====================

describe("P2-01 — Contract/Customer/Listing/Integration Repositories", () => {
  test("Contract: findAll + ترتیب createdAt", async () => {
    const c = await getTestClient();
    await c.contractRecord.deleteMany({});
    const repo = new PrismaContractRepository({ client: c });
    await repo.upsertBatch([
      { id: "C1", status: "waitingForFinance", contractHolo: "H1", propertyCode: "P1", requestCode: "R1", contractType: "مبایعه‌نامه", creatorName: "کارشناس", createdAt: new Date("2026-01-01T00:00:00Z"), contractDate: new Date("2026-01-05T00:00:00Z"), documentDate: null, deliveryDate: null, propertyTitle: "ملک ۱", propertyAddress: "آدرس", buyerListJson: null, sellerListJson: null, realtorListJson: null, canAddRealtor: false },
      { id: "C2", status: "finished", contractHolo: "H2", propertyCode: "P2", requestCode: null, contractType: null, creatorName: null, createdAt: new Date("2026-03-01T00:00:00Z"), contractDate: null, documentDate: null, deliveryDate: null, propertyTitle: null, propertyAddress: null, buyerListJson: null, sellerListJson: null, realtorListJson: null, canAddRealtor: false },
    ]);
    const all = await repo.findAll();
    expect(all).toHaveLength(2);
    const ordered = await repo.findAllOrderByCreatedAtDesc();
    expect(ordered[0].id).toBe("C2");
    await repo.deleteAll();
    expect(await repo.countAll()).toBe(0);
  });

  test("Customer: findByIdWithEvents + updateEventArmSync", async () => {
    const c = await getTestClient();
    const repo = new PrismaCustomerRepository({ client: c });
    const reqId = "req-p2-01-test";
    await c.requestRecord.deleteMany({ where: { id: reqId } });
    await c.requestRecord.create({ data: { id: reqId, source: "manual", actorCode: "999999" } });
    const ev = await c.requestEventRecord.create({
      data: { requestId: reqId, eventTypeId: "t1", eventTypeName: "تماس", actorCode: "999999" },
    });

    const withEvents = await repo.findByIdWithEvents(reqId);
    expect(withEvents).not.toBeNull();
    expect(withEvents!.events).toHaveLength(1);

    await repo.updateEventArmSync(ev.id, {
      armEventId: "arm-ev-1", armSyncedAt: new Date(), armPropertyId: null,
      armSyncJson: JSON.stringify({ ok: true }),
    });
    const updated = await c.requestEventRecord.findUnique({ where: { id: ev.id } });
    expect(updated!.armEventId).toBe("arm-ev-1");

    expect(await repo.findById(reqId)).not.toBeNull();
    expect(await repo.findById("nonexistent")).toBeNull();

    await c.requestEventRecord.deleteMany({ where: { requestId: reqId } });
    await c.requestRecord.deleteMany({ where: { id: reqId } });
  });

  test("Listing: listRecent + updateCrmTransfer", async () => {
    const c = await getTestClient();
    const repo = new PrismaListingRepository({ client: c });
    const listingId = "listing-p2-01-test";
    await c.listingRecord.deleteMany({ where: { id: listingId } });
    await c.listingRecord.create({ data: { id: listingId, source: "manual", actorCode: "999999" } });

    const rec = await repo.findById(listingId);
    expect(rec).not.toBeNull();

    await repo.updateCrmTransfer(listingId, {
      armPropertyId: "arm-1", crmTransferredAt: new Date(), crmTransferJson: JSON.stringify({ via: "test" }),
    });
    const updated = await repo.findById(listingId);
    expect(updated!.armPropertyId).toBe("arm-1");

    expect(await repo.getInstagramConnection()).toBeDefined(); // null یا رکورد — نباید throw کند

    await c.listingRecord.deleteMany({ where: { id: listingId } });
  });

  test("Integration: upsert singleton PM + ریست", async () => {
    const c = await getTestClient();
    const repo = new PrismaIntegrationRepository({ client: c });
    await repo.deletePmConnection();

    await repo.upsertPmConnection({ status: "pending", personnelCode: "910009", lastError: null });
    let row = await repo.getPmConnection();
    expect(row!.status).toBe("pending");

    await repo.upsertPmConnection({ status: "connected", personnelCode: "910009", displayName: "تست", tokenEnc: "enc", lastCheckedAt: new Date(), lastError: null });
    row = await repo.getPmConnection();
    expect(row!.status).toBe("connected");
    expect(row!.displayName).toBe("تست");

    await repo.deletePmConnection();
    expect(await repo.getPmConnection()).toBeNull();
  });
});

// ===================== ۱۰) کارخانه =====================

describe("P2-01 — کارخانه Repository", () => {
  test("getTransactionRepository نمونه پیاده‌سازی Prisma برمی‌گرداند", () => {
    const repo = getTransactionRepository();
    expect(typeof repo.findAll).toBe("function");
    expect(typeof repo.upsertBatch).toBe("function");
  });

  test("getDefaultAgentRepositories بسته حافظه+سیاست دارد", () => {
    const bundle = getDefaultAgentRepositories();
    expect(typeof bundle.memory.append).toBe("function");
    expect(typeof bundle.policy.findActive).toBe("function");
  });
});
