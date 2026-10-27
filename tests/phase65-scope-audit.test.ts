/**
 * تست‌های P6.5-02 — ConsultantScope + AuditLog + tenantId (§۵.۶ طراحی)
 * ------------------------------------------------------
 * پنج اثبات الزامِ پذیرش:
 *  ۱) مشاور A رکورد مشاور B را در مخازن شخصی (Listing/Customer/Visit) نمی‌بیند
 *  ۲) OWNER همه داده را می‌بیند
 *  ۳) AuditLog برای هر findWithScope ثبت می‌شود (فیلدهای §۶.۱)
 *  ۴) نشست قدیمی بدون accessScope با default OWNER کار می‌کند — صفر شکست
 *  ۵) ردیف بدون انتساب در جدول شخصی: برای CONSULTANT/BRANCH نامرئی، برای OWNER مرئی (fail-closed)
 *
 * مکمل:
 *  - ماتریس تجمیعی Transaction (همه دامنه‌ها همه ردیف‌ها) + AuditLog
 *  - دامنه BRANCH (+ fail-closed بدون شعبه)
 *  - TenantResolver placeholder (§۵.۵/§۱۴) + غیرفعال‌بودن فیلتر tenant
 *  - auditAccess: ردیف درست + شکست غیرمسدودکننده (§۶.۲ Availability)
 *  - آینه DTOها پس از ستون‌های افزودنی (ترتیب عین Schema)
 *
 * پایگاه: ایزوله db/test-repository.db (عین E.3 و phase2-repositories.test.ts)
 */
import { describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";

// ---------- پایگاه تست ایزوله ----------
const TEST_DB_DIR = "/home/z/my-project/db";
const TEST_DB = `${TEST_DB_DIR}/test-repository.db`;
mkdirSync(TEST_DB_DIR, { recursive: true });

let client: PrismaClient;
async function getTestClient(): Promise<PrismaClient> {
  if (client) return client;
  client = new PrismaClient({ datasources: { db: { url: `file:${TEST_DB}` } } });
  return client;
}

import {
  PrismaTransactionRepository,
  PrismaCustomerRepository,
  PrismaListingRepository,
  PrismaVisitRepository,
  DefaultTenantResolver,
  defaultTenantResolver,
  resolveTenantId,
  DEFAULT_TENANT_ID,
  defaultAccessScopeForRole,
  scopeFromSession,
  personalScopeClause,
  type ScopeFilter,
  type ScopedTransactionRepository,
  type ScopedListingRepository,
  type ScopedCustomerRepository,
  type ScopedVisitRepository,
} from "../src/core/repositories";
import { auditAccess } from "../src/lib/audit";

// ---------- شناسه‌های seed (ایزوله از بقیه تست‌ها) ----------
const A = "910101"; // مشاور الف
const B = "910202"; // مشاور ب
const OWNER = "910001"; // مدیر
const BR1 = "p6502-br-1";

const scopeOwner: ScopeFilter = { tenantId: "melk-tabriz", accessScope: "OWNER", personnelCode: OWNER, branchId: null };
const scopeA: ScopeFilter = { tenantId: "melk-tabriz", accessScope: "CONSULTANT", personnelCode: A, branchId: null };
const scopeB: ScopeFilter = { tenantId: "melk-tabriz", accessScope: "CONSULTANT", personnelCode: B, branchId: null };
const scopeBranch1: ScopeFilter = { tenantId: "melk-tabriz", accessScope: "BRANCH", personnelCode: A, branchId: BR1 };
const scopeBranchNoBranch: ScopeFilter = { tenantId: "melk-tabriz", accessScope: "BRANCH", personnelCode: A, branchId: null };

/** شمارش ردیف‌های حسابرسی این تست (actorهای seed) */
async function auditCount(c: PrismaClient): Promise<number> {
  return c.auditLog.count({ where: { action: "DATA_ACCESS", actor: { in: [A, B, OWNER] } } });
}

async function seed(c: PrismaClient): Promise<void> {
  await c.listingRecord.deleteMany({ where: { id: { in: ["p6502-LA", "p6502-LB", "p6502-LBR", "p6502-LX"] } } });
  await c.requestRecord.deleteMany({ where: { id: { in: ["p6502-RA", "p6502-RB", "p6502-RBR"] } } });
  await c.visitRecord.deleteMany({ where: { id: { in: ["p6502-VA", "p6502-VB", "p6502-VUN", "p6502-VBR"] } } });
  await c.transactionRecord.deleteMany({ where: { id: { in: ["p6502-T1", "p6502-T2"] } } });

  await c.listingRecord.createMany({
    data: [
      { id: "p6502-LA", source: "manual", actorCode: A, status: "ready" },
      { id: "p6502-LB", source: "manual", actorCode: B, status: "ready" },
      { id: "p6502-LBR", source: "manual", actorCode: B, status: "ready", branchId: BR1 },
      // شاهد §۱۴: مستأجر غیرپیش‌فرض — فیلتر tenant عمداً غیرفعال است تا PHASE 8+
      { id: "p6502-LX", source: "manual", actorCode: A, status: "ready", tenantId: "future-tenant" },
    ],
  });
  await c.requestRecord.createMany({
    data: [
      { id: "p6502-RA", source: "manual", actorCode: A, status: "ready" },
      { id: "p6502-RB", source: "manual", actorCode: B, status: "ready" },
      { id: "p6502-RBR", source: "manual", actorCode: B, status: "ready", branchId: BR1 },
    ],
  });
  await c.visitRecord.createMany({
    data: [
      { id: "p6502-VA", propertyCode: "P-1", requesterName: "مشتری", checkerName: "الف", propertyRealtorName: "مشاور", createdAt: new Date("2026-05-01T09:00:00Z"), status: "", ownerCode: A },
      { id: "p6502-VB", propertyCode: "P-2", requesterName: "مشتری", checkerName: "ب", propertyRealtorName: "مشاور", createdAt: new Date("2026-05-02T09:00:00Z"), status: "", ownerCode: B },
      // بدون انتساب — کاوشگر fail-closed (§۵.۶-۵)
      { id: "p6502-VUN", propertyCode: "P-3", requesterName: "مشتری", checkerName: "ناشناس", propertyRealtorName: "مشاور", createdAt: new Date("2026-05-03T09:00:00Z"), status: "" },
      { id: "p6502-VBR", propertyCode: "P-4", requesterName: "مشتری", checkerName: "ب", propertyRealtorName: "مشاور", createdAt: new Date("2026-05-04T09:00:00Z"), status: "", ownerCode: B, branchId: BR1 },
    ],
  });
  await c.transactionRecord.createMany({
    data: [
      { id: "p6502-T1", contractDate: new Date("2026-05-01T00:00:00Z"), propertyCode: "P-1", contractHolo: "H-1" },
      { id: "p6502-T2", contractDate: new Date("2026-05-02T00:00:00Z"), propertyCode: "P-2", contractHolo: null },
    ],
  });
}

async function cleanup(c: PrismaClient): Promise<void> {
  await c.listingRecord.deleteMany({ where: { id: { in: ["p6502-LA", "p6502-LB", "p6502-LBR", "p6502-LX"] } } });
  await c.requestRecord.deleteMany({ where: { id: { in: ["p6502-RA", "p6502-RB", "p6502-RBR"] } } });
  await c.visitRecord.deleteMany({ where: { id: { in: ["p6502-VA", "p6502-VB", "p6502-VUN", "p6502-VBR"] } } });
  await c.transactionRecord.deleteMany({ where: { id: { in: ["p6502-T1", "p6502-T2"] } } });
  await c.session.deleteMany({ where: { tokenHash: { startsWith: "p6502-th-" } } });
  await c.auditLog.deleteMany({ where: { action: "DATA_ACCESS", actor: { in: [A, B, OWNER] } } });
  await c.propertyRecord.deleteMany({ where: { id: "p6502-PR1" } });
  await c.customerRecord.deleteMany({ where: { id: { startsWith: "p6502-cr-" } }, });
}

// ===================== ۱) قراردادهای خالص =====================

describe("P6.5-02 — TenantResolver placeholder (§۵.۵/§۱۴)", () => {
  test("DEFAULT_TENANT_ID = 'melk-tabriz' و resolve همیشه همین را برمی‌گرداند", () => {
    expect(DEFAULT_TENANT_ID).toBe("melk-tabriz");
    expect(resolveTenantId(null)).toBe("melk-tabriz");
    expect(resolveTenantId(undefined)).toBe("melk-tabriz");
    expect(resolveTenantId({ personnelCode: A, branchId: "x", accessScope: "CONSULTANT" })).toBe("melk-tabriz");

    const resolver = new DefaultTenantResolver();
    expect(resolver.resolve(null)).toBe("melk-tabriz");
    expect(resolver.resolve({ personnelCode: "1" })).toBe("melk-tabriz");
    expect(defaultTenantResolver.resolve({})).toBe("melk-tabriz");
  });

  test("scopeFromSession — نشست قدیمی بدون accessScope = OWNER (§۵.۶-۴: صفر شکست)", () => {
    const legacy = scopeFromSession({ personnelCode: A });
    expect(legacy).toEqual({ tenantId: "melk-tabriz", accessScope: "OWNER", personnelCode: A, branchId: null });

    expect(scopeFromSession({ personnelCode: A, accessScope: "CONSULTANT" }).accessScope).toBe("CONSULTANT");
    expect(scopeFromSession({ personnelCode: A, accessScope: "BRANCH", branchId: BR1 })).toEqual({
      tenantId: "melk-tabriz", accessScope: "BRANCH", personnelCode: A, branchId: BR1,
    });
    // مقدار ناشناخته →OWNER (fail-safe)
    expect(scopeFromSession({ personnelCode: A, accessScope: "SUPERUSER" }).accessScope).toBe("OWNER");
    // resolver جایگزین (تزریق‌پذیری)
    const fake = { resolve: () => "other-tenant" };
    expect(scopeFromSession({ personnelCode: A }, fake).tenantId).toBe("other-tenant");
  });

  test("defaultAccessScopeForRole — مدیر=OWNER، مشاور=CONSULTANT (§۵.۱)", () => {
    expect(defaultAccessScopeForRole("OWNER")).toBe("OWNER");
    expect(defaultAccessScopeForRole("CONSULTANT")).toBe("CONSULTANT");
  });

  test("personalScopeClause — ماتریس خالص + fail-closed (§۵.۳)", () => {
    expect(personalScopeClause(scopeOwner)).toEqual({ kind: "ALL" });
    expect(personalScopeClause(scopeA)).toEqual({ kind: "PERSONAL", code: A });
    expect(personalScopeClause({ ...scopeA, personnelCode: "" })).toEqual({ kind: "DENY_ALL" });
    expect(personalScopeClause(scopeBranch1)).toEqual({ kind: "BRANCH", branchId: BR1 });
    expect(personalScopeClause(scopeBranchNoBranch)).toEqual({ kind: "DENY_ALL" });
  });
});

// ===================== ۲) اثبات‌های §۵.۶ روی پایگاه ایزوله =====================

describe("P6.5-02 — اثبات‌های پذیرش §۵.۶ (داده seed دو کارشناس)", () => {
  test("§۵.۶-۱ — مشاور A رکورد مشاور B را در مخازن شخصی نمی‌بیند", async () => {
    const c = await getTestClient();
    await seed(c);
    try {
      const listing = new PrismaListingRepository({ client: c });
      const customer = new PrismaCustomerRepository({ client: c });
      const visit = new PrismaVisitRepository({ client: c });

      // فایل‌های آگهی: A فقط فایل خودش (نه فایل B؛ نه فایل شعبه‌دار B)
      const aListings = await listing.findWithScope({}, scopeA);
      expect(aListings.map((r) => r.id).sort()).toEqual(["p6502-LA", "p6502-LX"]);
      const bListings = await listing.findWithScope({}, scopeB);
      expect(bListings.map((r) => r.id).sort()).toEqual(["p6502-LB", "p6502-LBR"]);

      // دامنه مشتری (درخواست‌ها): جداسازی کامل
      const aRequests = await customer.findWithScope({}, scopeA);
      expect(aRequests.map((r) => r.id)).toEqual(["p6502-RA"]);
      const bRequests = await customer.findWithScope({}, scopeB);
      expect(bRequests.map((r) => r.id).sort()).toEqual(["p6502-RB", "p6502-RBR"]);

      // بازدیدها: A فقط بازدید منتسب به خودش
      const aVisits = await visit.findWithScope({}, scopeA);
      expect(aVisits.map((r) => r.id)).toEqual(["p6502-VA"]);
      const bVisits = await visit.findWithScope({}, scopeB);
      expect(bVisits.map((r) => r.id).sort()).toEqual(["p6502-VB", "p6502-VBR"]);
    } finally {
      await cleanup(c);
    }
  });

  test("§۵.۶-۲ — OWNER همه داده را می‌بیند", async () => {
    const c = await getTestClient();
    await seed(c);
    try {
      const listing = new PrismaListingRepository({ client: c });
      const customer = new PrismaCustomerRepository({ client: c });
      const visit = new PrismaVisitRepository({ client: c });
      const tx = new PrismaTransactionRepository({ client: c });

      expect((await listing.findWithScope({}, scopeOwner)).length).toBe(4);
      expect((await customer.findWithScope({}, scopeOwner)).length).toBe(3);
      expect((await visit.findWithScope({}, scopeOwner)).length).toBe(4);
      expect((await tx.findWithScope({}, scopeOwner)).length).toBe(2);
    } finally {
      await cleanup(c);
    }
  });

  test("§۵.۶-۳ — AuditLog برای هر findWithScope ثبت می‌شود (فیلدهای §۶.۱)", async () => {
    const c = await getTestClient();
    await seed(c);
    try {
      const visit = new PrismaVisitRepository({ client: c });
      const before = await auditCount(c);

      const rows = await visit.findWithScope({}, scopeA); // → فقط p6502-VA

      const after = await auditCount(c);
      expect(after).toBe(before + 1);

      const entry = await c.auditLog.findFirst({
        where: { action: "DATA_ACCESS", actor: A, operation: "READ", entityType: "visit" },
        orderBy: { createdAt: "desc" },
      });
      expect(entry).not.toBeNull();
      expect(entry!.recordCount).toBe(rows.length);
      expect(entry!.accessScope).toBe("CONSULTANT");
      expect(entry!.tenantId).toBe("melk-tabriz");
      expect(entry!.action).toBe("DATA_ACCESS");

      // مشاور بدون کد → DENY_ALL بازگردانده و «همچنان» حسابرسی می‌شود
      const denied = await visit.findWithScope({}, { ...scopeA, personnelCode: "" });
      expect(denied).toHaveLength(0);
      const denyAudit = await c.auditLog.count({
        where: { action: "DATA_ACCESS", actor: "", operation: "READ", entityType: "visit" },
      });
      expect(denyAudit).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup(c);
    }
  });

  test("§۵.۶-۴ — نشست قدیمی بدون accessScope با default OWNER کار می‌کند", async () => {
    const c = await getTestClient();
    const tokenHash = `p6502-th-${Date.now()}`;
    try {
      // ایجاد بدون accessScope — default اسکیما باید OWNER بنویسد
      const created = await c.session.create({
        data: {
          tokenHash,
          personnelCode: A,
          displayName: "مشاور قدیمی",
          role: "CONSULTANT",
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      expect(created.accessScope).toBe("OWNER");
      const reloaded = await c.session.findUnique({ where: { tokenHash } });
      expect(reloaded!.accessScope).toBe("OWNER");
      expect(reloaded!.branchId).toBeNull();
    } finally {
      await c.session.deleteMany({ where: { tokenHash } });
    }
  });

  test("§۵.۶-۵ — fail-closed: ردیف بدون انتساب فقط برای OWNER مرئی است", async () => {
    const c = await getTestClient();
    await seed(c);
    try {
      const visit = new PrismaVisitRepository({ client: c });

      // p6502-VUN بدون ownerCode است
      const asA = (await visit.findWithScope({}, scopeA)).map((r) => r.id);
      expect(asA).not.toContain("p6502-VUN");
      const asBranch = (await visit.findWithScope({}, scopeBranch1)).map((r) => r.id);
      expect(asBranch).not.toContain("p6502-VUN");
      const asOwner = (await visit.findWithScope({}, scopeOwner)).map((r) => r.id);
      expect(asOwner).toContain("p6502-VUN");
    } finally {
      await cleanup(c);
    }
  });

  test("ماتریس §۵.۳ — Transaction تجمیعی: همه دامنه‌ها همه ردیف‌ها + AuditLog", async () => {
    const c = await getTestClient();
    await seed(c);
    try {
      const tx = new PrismaTransactionRepository({ client: c });
      const before = await auditCount(c);

      const asA = await tx.findWithScope({}, scopeA);
      expect(asA.map((r) => r.id).sort()).toEqual(["p6502-T1", "p6502-T2"]);
      const asOwner = await tx.findWithScope({}, scopeOwner);
      expect(asOwner.map((r) => r.id).sort()).toEqual(["p6502-T1", "p6502-T2"]);

      // حسابرسی برای دامنه تجمیعی هم ثبت شد
      expect(await auditCount(c)).toBe(before + 2);
      const entry = await c.auditLog.findFirst({
        where: { action: "DATA_ACCESS", actor: A, entityType: "transaction" },
        orderBy: { createdAt: "desc" },
      });
      expect(entry!.recordCount).toBe(2);
    } finally {
      await cleanup(c);
    }
  });

  test("دامنه BRANCH — فقط ردیف‌های شعبه؛ بدون شعبه = هیچ (fail-closed)", async () => {
    const c = await getTestClient();
    await seed(c);
    try {
      const listing = new PrismaListingRepository({ client: c });
      const customer = new PrismaCustomerRepository({ client: c });
      const visit = new PrismaVisitRepository({ client: c });

      expect((await listing.findWithScope({}, scopeBranch1)).map((r) => r.id)).toEqual(["p6502-LBR"]);
      expect((await customer.findWithScope({}, scopeBranch1)).map((r) => r.id)).toEqual(["p6502-RBR"]);
      expect((await visit.findWithScope({}, scopeBranch1)).map((r) => r.id)).toEqual(["p6502-VBR"]);

      // BRANCH بدون شعبه → صفر ردیف + حسابرسی صفر-رکوردی
      const before = await auditCount(c);
      expect(await listing.findWithScope({}, scopeBranchNoBranch)).toHaveLength(0);
      expect(await customer.findWithScope({}, scopeBranchNoBranch)).toHaveLength(0);
      expect(await visit.findWithScope({}, scopeBranchNoBranch)).toHaveLength(0);
      expect(await auditCount(c)).toBe(before + 3);
    } finally {
      await cleanup(c);
    }
  });

  test("§۱۴ — فیلتر tenant عمداً غیرفعال است (ردیف مستأجر دیگر برای OWNER مرئی می‌ماند)", async () => {
    const c = await getTestClient();
    await seed(c);
    try {
      const listing = new PrismaListingRepository({ client: c });
      // p6502-LX با tenantId='future-tenant' کاشته شد — PHASE 8+ این را فیلتر خواهد کرد
      const asOwner = await listing.findWithScope({}, scopeOwner);
      expect(asOwner.map((r) => r.id)).toContain("p6502-LX");
      // مشاور A همچنان فقط فایل‌های خودش را می‌بیند (دامنه شخصی مستقل از tenant)
      const asA = await listing.findWithScope({}, scopeA);
      expect(asA.map((r) => r.id).sort()).toEqual(["p6502-LA", "p6502-LX"]);
    } finally {
      await cleanup(c);
    }
  });

  test("فیلتر v1 با دامنه ترکیب می‌شود (Visit: propertyCode + scope)", async () => {
    const c = await getTestClient();
    await seed(c);
    try {
      const visit = new PrismaVisitRepository({ client: c });
      const filtered = await visit.findWithScope({ filter: { propertyCode: "P-2" } }, scopeOwner);
      expect(filtered.map((r) => r.id)).toEqual(["p6502-VB"]);
      const filteredA = await visit.findWithScope({ filter: { propertyCode: "P-2" } }, scopeA);
      expect(filteredA).toHaveLength(0);
    } finally {
      await cleanup(c);
    }
  });

  test("پیاده‌سازی‌ها قرارداد Scoped را ارضا می‌کنند و متدهای v1 دست‌نخورده‌اند", async () => {
    const c = await getTestClient();
    const tx: ScopedTransactionRepository = new PrismaTransactionRepository({ client: c });
    const listing: ScopedListingRepository = new PrismaListingRepository({ client: c });
    const customer: ScopedCustomerRepository = new PrismaCustomerRepository({ client: c });
    const visit: ScopedVisitRepository = new PrismaVisitRepository({ client: c });

    for (const repo of [tx, listing, customer, visit]) {
      expect(typeof repo.findWithScope).toBe("function");
    }
    // v1 زنده است
    expect(typeof tx.findAll).toBe("function");
    expect(typeof listing.listRecent).toBe("function");
    expect(typeof customer.listRecentRequests).toBe("function");
    expect(typeof visit.listWithSummary).toBe("function");
  });
});

// ===================== ۳) auditAccess — قرارداد §۶.۲ =====================

describe("P6.5-02 — auditAccess (§۶.۲)", () => {
  test("ردیف درست می‌نویسد: action/operation/entityType/recordCount/accessScope/tenantId/actor", async () => {
    const c = await getTestClient();
    await auditAccess(
      { personnelCode: OWNER, accessScope: "OWNER", branchId: null },
      "WRITE",
      "property",
      42,
      "bulk-run-test",
      { client: c }
    );
    const entry = await c.auditLog.findFirst({
      where: { action: "DATA_ACCESS", actor: OWNER, operation: "WRITE", entityType: "property" },
      orderBy: { createdAt: "desc" },
    });
    expect(entry).not.toBeNull();
    expect(entry!.recordCount).toBe(42);
    expect(entry!.accessScope).toBe("OWNER");
    expect(entry!.tenantId).toBe("melk-tabriz"); // default اسکیما
    expect(entry!.detail).toBe("bulk-run-test");
    await c.auditLog.deleteMany({ where: { id: entry!.id } });
  });

  test("شکست نوشتن AuditLog سد عملیات نیست (Availability §۶.۲)", async () => {
    const broken = {
      auditLog: { create: async () => { throw new Error("audit-write-boom"); } },
    } as unknown as PrismaClient;
    // نباید throw کند — فقط رویداد warn در logger
    await auditAccess({ personnelCode: "x" }, "READ", "visit", 0, undefined, { client: broken });
    expect(true).toBe(true);
  });
});

// ===================== ۴) آینه DTOها پس از ستون‌های افزودنی =====================

describe("P6.5-02 — آینه DTO/ردیف (ترتیب کلیدها عین Schema)", () => {
  test("TransactionDTO — ۲۱ کلید؛ ستون‌های P6.5-02/03/04 + خام‌های B.3 در دنباله", async () => {
    const c = await getTestClient();
    await seed(c);
    try {
      const sample = await c.transactionRecord.findFirst({ where: { id: "p6502-T1" } });
      // P6.5-04-e-v2 + B.3: ستون‌های سه‌لایه حقیقت (خام + provenance) در دنباله
      expect(Object.keys(sample!)).toEqual([
        "id", "contractDate", "propertyCode", "propertyCustomer", "requestCode",
        "requestCustomer", "contractHolo", "suggestedPropertyCount", "eventsCount", "syncedAt",
        "ownerCode", "branchId", "tenantId", "sourceRunId",
        "rawDate", "rawPropertyCustomer", "rawRequestCustomer",
        "rawSourceVersion", "extractedAt", "extractionBatchId", "normalizationVersion",
      ]);
    } finally {
      await cleanup(c);
    }
  });

  test("VisitDTO — ۲۰ کلید؛ ExpertDTO — ۲۱ کلید (با خام‌های B.3 + provenance)", async () => {
    const c = await getTestClient();
    await seed(c);
    try {
      const v = await c.visitRecord.findFirst({ where: { id: "p6502-VA" } });
      // P6.5-04-e-v2 + B.3: ستون‌های خام + provenance در دنباله
      expect(Object.keys(v!)).toEqual([
        "id", "propertyCode", "requesterName", "checkerName", "propertyRealtorName",
        "checkTime", "createdAt", "status", "syncedAt", "ownerCode", "branchId", "tenantId", "sourceRunId",
        "rawRequesterName", "rawCheckerName", "rawPropertyRealtorName",
        "rawSourceVersion", "extractedAt", "extractionBatchId", "normalizationVersion",
      ]);
    } finally {
      await cleanup(c);
    }
    const e = await c.expertRecord.findFirst();
    if (e) {
      // B.3: چهار ستون خام نام/موبایل + چهار ستون provenance در دنباله
      expect(Object.keys(e).slice(-4)).toEqual(["rawSourceVersion", "extractedAt", "extractionBatchId", "normalizationVersion"]);
      expect(Object.keys(e).slice(-8)).toEqual([
        "rawFullName", "rawMobile", "rawBusinessTitle", "rawCreator",
        "rawSourceVersion", "extractedAt", "extractionBatchId", "normalizationVersion",
      ]);
    }
  });

  test("RequestRecordDTO — ۷۴ کلید (P6547 + PN-002/گام۲: +۲۱ ستون M2 + PN-027 نرمال×۳)؛ ستون‌های P6.5-02/03/04/10 + P6530/گام ۲ + خام‌های B.3 در دنباله", async () => {
    const c = await getTestClient();
    await seed(c);
    try {
      const r = await c.requestRecord.findFirst({ where: { id: "p6502-RA" } });
      const keys = Object.keys(r!);
      // P6530/گام ۲ — دو ستون تازهٔ بازهٔ قیمت متقاضی (بعد از inputsJson)
      // P6547/گام دوم — سه ستون تازه: urgent/luxury/changeable (پس از جدیت مشتری)
      // PN-002/گام ۲ — ۲۱ ستون تازهٔ M2 در دنبالهٔ مدل (پس از normalizationVersion)
      expect(keys.length).toBe(76); // events رابطه است — در findFirst نمی‌آید · PN-027 · ۵-پ-۱: +۳ نرمال · PN-039/گام ۴: +۱ ownerNote · PN-046/گام اول-۱: +۲ بودجهٔ رهن/اجارهٔ ملکتون
      // PN-039 (گام ۴) — یادداشت مالک بلافاصله پس از updatedAt
      expect(keys[keys.indexOf("updatedAt") + 1]).toBe("ownerNote");
      // P6547 — سه ستون تازه بلافاصله پس از جدیت مشتری (userSeriousityName)
      const ui = keys.indexOf("urgent");
      expect(keys.slice(ui - 1, ui + 3)).toEqual(["userSeriousityName", "urgent", "luxury", "changeable"]);
      // PN-046/گام اول-۱ — بودجهٔ رهن/اجاره بلافاصله پس از بازهٔ قیمت (priceFrom/priceTo → depositBudget/rentBudget)
      expect(keys.slice(18, 23)).toEqual(["inputsJson", "priceFrom", "priceTo", "depositBudget", "rentBudget"]);
      // PN-002/گام ۲ — ۲۱ ستون M2 در انتهای مدل · PN-027 · ۵-پ-۱ — +۳ ستون سایهٔ نرمال
      expect(keys.slice(-24)).toEqual([
        "spaceFrom", "spaceTo", "roomsFrom", "roomsTo", "floorFrom", "floorTo",
        "buildYearFrom", "buildYearTo", "sanadNames", "constructTypeNames", "sideNames",
        "occasion", "deposit", "confirmSms", "notifyMe", "changeWithNames",
        "armBranchTitle", "countryName", "stateName", "cityName", "platform",
        "customerNameNorm", "sanadNamesNorm", "actorNameNorm",
      ]);
      // P6.5-10 — ستون‌های افزودنی کاتالوگ ARM (نام کارشناس + عنوان درخواست)
      expect(keys).toContain("actorName");
      expect(keys).toContain("title");
    } finally {
      await cleanup(c);
    }
  });

  test("ListingDTO — ۴۸ کلید؛ ستون‌های P6.5-02 در دنباله", async () => {
    const c = await getTestClient();
    await seed(c);
    try {
      const l = await c.listingRecord.findFirst({ where: { id: "p6502-LA" } });
      const keys = Object.keys(l!);
      expect(keys.length).toBe(48);
      expect(keys.slice(-2)).toEqual(["branchId", "tenantId"]);
    } finally {
      await cleanup(c);
    }
  });

  test("PropertyRecordDTO — ۵۷ کلید (PN-002/گام۱: +۱۴ ستون M1 + PN-027 نرمال×۳)؛ CustomerRecordDTO — ۱۳ کلید (مدل‌های جدید)", async () => {
    const c = await getTestClient();
    await c.propertyRecord.deleteMany({ where: { id: "p6502-PR1" } });
    await c.customerRecord.deleteMany({ where: { mobile: "09140009999" } });
    try {
      const p = await c.propertyRecord.create({
        data: { id: "p6502-PR1", propertyCode: "p6502-PC1", title: "آپارتمان تست" },
      });
      expect(Object.keys(p)).toEqual([
        "id", "propertyCode", "title", "status", "ownerCode", "ownerName", "branchId",
        "cityId", "areaId", "areaName", "lineId", "lineName", "address",
        "propertyTypeId", "propertyTypeName", "tradeTypeId", "tradeTypeName",
        "price", "pricePerMeter", "meterage", "rooms", "floor", "buildYear",
        "description", "detailsJson", "ownerMobile", "tenantId", "sourceRunId",
        "rawPrice", "rawPriceUnit", "rawArea", "rawOwnerName", "rawOwnerMobile",
        "rawSourceVersion", "extractedAt", "extractionBatchId", "normalizationVersion",
        "syncedAt", "createdAt", "updatedAt",
        // PN-002/گام ۱ — ۱۴ ستون تازهٔ M1 (رهن/اجاره، بازدید، انتشار، شعبه ARM، …)
        "isRental", "depositPrice", "rentPrice", "viewCount", "imageCount",
        "addedToDivar", "addedToInsta", "isReposted", "isTarget", "armBranchTitle",
        "stateName", "cityName", "publicUrl", "statusDate",
        // PN-039 (گام ۴) — یادداشت مالک
        "ownerNote",
        // PN-027 · ۵-پ-۲ — سه ستون سایهٔ نرمال
        "realtorNameNorm", "ownerSearchNorm", "addressSearchNorm",
      ]);
      expect(p.tenantId).toBe("melk-tabriz"); // default

      const cr = await c.customerRecord.create({
        data: { fullName: "مشتری تست", mobile: "09140009999", ownerCode: A },
      });
      expect(Object.keys(cr)).toEqual([
        "id", "mobile", "personnelCode", "fullName", "rolesJson", "sourceCountsJson",
        "ownerCode", "branchId", "firstSeenAt", "lastSeenAt", "tenantId", "sourceRunId", "updatedAt",
      ]);
      expect(cr.tenantId).toBe("melk-tabriz");
    } finally {
      await c.propertyRecord.deleteMany({ where: { id: "p6502-PR1" } });
      await c.customerRecord.deleteMany({ where: { mobile: "09140009999" } });
    }
  });
});
