/**
 * تست‌های الزامی P6.5-04-i — نقش owner + رفع دامنه (فاز ۱ دستور چهارفازی مالک)
 * ---------------------------------------------------------------------------
 * ده اثبات الزامِ پذیرش (عین فهرست دستور، نگاشت‌شده به معماری واقعی):
 *  ۱) owner-sees-all-trades — مالک همهٔ ۷۲۸+ معامله را می‌بیند
 *  ۲) owner-sees-all-experts — مالک همهٔ ۲۹۱+ کارشناس را می‌بیند
 *  ۳) owner-sees-all-contracts — مالک همهٔ قراردادها را می‌بیند
 *  ۴) owner-sees-all-listings — مالک آگهی‌های «دیگران» را هم می‌بیند (صفر فیلتر)
 *  ۵) expert-scope-unchanged — مشاور فقط نمای خودش (ماتریس §۵.۳) + تجمیعی‌ها دست‌نخورده
 *  ۶) owner-audit-log — رد owner.read با resource=<entity>:<count> + session={role,path}
 *  ۷) owner-from-expert-ui — ورود OTP با کد MANAGER_CODE ⇒ نقش OWNER
 *  ۸) no-raw-scope-filter — گارد AST: صفر فیلتر دامنهٔ دست‌نویس خارج از helper
 *  ۹) owner-tiles-unfiltered — مالک روی «همهٔ» موجودیت‌ها صفر فیلتر (هر ۱۰ موجودیت)
 * ۱۰) owner-idempotent-reads — خواندن‌های مکرر مالک: نتیجهٔ یکسان، داده دست‌نخورده
 *
 * پایگاه: db/test.db (هدایت اجباری preload-guard) · seed با پیشوند p6504i- + پاک‌سازی
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { db } from "../src/lib/db";
import {
  getContractRepository,
  getExpertRepository,
  getTransactionRepository,
  getVisitRepository,
} from "../src/core/repositories";
import {
  resolveEntityAccess,
  personalScopeWhere,
  isOwnerSession,
  ownerLoginPath,
  type AccessSession,
  type ScopeEntity,
} from "../src/lib/access/scope";
import { witnessOwnerRead, witnessScopedRead } from "../src/lib/audit";
import { listListings } from "../src/lib/listing/store";
import { listRequests } from "../src/lib/request/store";

// ---------- نشست‌های آزمون ----------
const OWNER_MASTER: AccessSession = { personnelCode: "OWNER", role: "OWNER", accessScope: "OWNER" };
const OWNER_EXPERT_UI: AccessSession = { personnelCode: "410031320", role: "OWNER", accessScope: "OWNER" };
const CONSULTANT_A: AccessSession = { personnelCode: "910101", role: "CONSULTANT", accessScope: "CONSULTANT" };
const CONSULTANT_B: AccessSession = { personnelCode: "910202", role: "CONSULTANT", accessScope: "CONSULTANT" };

// ---------- seed: عین مقیاس واقعی شب اول (۷۲۸ معامله / ۲۹۱ کارشناس) ----------
const TX_COUNT = 728;
const EX_COUNT = 291;
const A = "910101";
const B = "910202";
const P = "p6504i-";

const txIds = Array.from({ length: TX_COUNT }, (_, i) => `${P}T${i}`);
const exIds = Array.from({ length: EX_COUNT }, (_, i) => `${P}E${i}`);

async function seed(): Promise<void> {
  await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } });
  await db.expertRecord.deleteMany({ where: { id: { startsWith: P } } });
  await db.contractRecord.deleteMany({ where: { id: { startsWith: P } } });
  await db.listingRecord.deleteMany({ where: { id: { startsWith: P } } });
  await db.requestRecord.deleteMany({ where: { id: { startsWith: P } } });
  await db.visitRecord.deleteMany({ where: { id: { startsWith: P } } });
  await db.auditLog.deleteMany({ where: { actor: { startsWith: P } } });
  await db.auditLog.deleteMany({ where: { action: "owner.read", actor: { in: [OWNER_MASTER.personnelCode, OWNER_EXPERT_UI.personnelCode, A, B] } } });

  await db.transactionRecord.createMany({
    data: txIds.map((id, i) => ({
      id,
      contractDate: new Date(2024, 0, 1 + (i % 400)),
      propertyCode: `PC-${i}`,
      contractHolo: i % 3 === 0 ? `H-${i}` : null,
      suggestedPropertyCount: i % 5,
      eventsCount: i % 3,
    })),
  });
  await db.expertRecord.createMany({
    data: exIds.map((id, i) => ({
      id,
      personnelCode: `${P}pc-${i}`,
      fullName: `کارشناس آزمون ${i}`,
      mobile: "09140000000",
      role: "کارشناس و مشاور فروش",
      businessTitle: "شعبه مرکزی",
      active: true,
      createdAt: new Date(2024, 0, 1),
    })),
  });
  await db.contractRecord.createMany({
    data: [
      { id: `${P}C1`, status: "finished", contractHolo: "HC-1", createdAt: new Date(2026, 5, 1) },
      { id: `${P}C2`, status: "waitingForFinance", contractHolo: "HC-2", createdAt: new Date(2026, 5, 2) },
    ],
  });
  await db.listingRecord.createMany({
    data: [
      { id: `${P}LA`, source: "manual", actorCode: A, status: "ready" },
      { id: `${P}LB`, source: "manual", actorCode: B, status: "ready" },
      { id: `${P}LO`, source: "divar", actorCode: "410031320", status: "ready" },
    ],
  });
  await db.requestRecord.createMany({
    data: [
      { id: `${P}RA`, source: "manual", actorCode: A, status: "ready" },
      { id: `${P}RB`, source: "manual", actorCode: B, status: "ready" },
    ],
  });
  await db.visitRecord.createMany({
    data: [
      { id: `${P}VA`, propertyCode: "P-1", requesterName: "مشتری", checkerName: "الف", propertyRealtorName: "مشاور", createdAt: new Date("2026-05-01T09:00:00Z"), status: "", ownerCode: A },
      { id: `${P}VB`, propertyCode: "P-2", requesterName: "مشتری", checkerName: "ب", propertyRealtorName: "مشاور", createdAt: new Date("2026-05-02T09:00:00Z"), status: "", ownerCode: B },
    ],
  });
}

async function cleanup(): Promise<void> {
  await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } });
  await db.expertRecord.deleteMany({ where: { id: { startsWith: P } } });
  await db.contractRecord.deleteMany({ where: { id: { startsWith: P } } });
  await db.listingRecord.deleteMany({ where: { id: { startsWith: P } } });
  await db.requestRecord.deleteMany({ where: { id: { startsWith: P } } });
  await db.visitRecord.deleteMany({ where: { id: { startsWith: P } } });
  await db.auditLog.deleteMany({ where: { actor: { startsWith: P } } });
  await db.auditLog.deleteMany({ where: { action: "owner.read", actor: { in: [OWNER_MASTER.personnelCode, OWNER_EXPERT_UI.personnelCode, A, B] } } });
}

beforeAll(seed);
afterAll(cleanup);

// ===================== ۱) owner-sees-all-trades =====================
describe("P6.5-04-i — ۱۰ تست الزامی: نقش owner + رفع دامنه", () => {
  test("۱) owner-sees-all-trades — مالک همهٔ ۷۲۸ معامله را می‌بیند (صفر فیلتر)", async () => {
    const access = resolveEntityAccess(OWNER_MASTER, "transaction");
    expect(access.clause.kind).toBe("ALL");
    expect(access.isOwnerRead).toBe(true);
    const { total } = await getTransactionRepository().listWithSummary({
      filter: {},
      sortBy: "contractDate",
      sortDir: "asc",
      limit: 5000,
      offset: 0,
    });
    expect(total).toBeGreaterThanOrEqual(TX_COUNT);
    // عین شاهد شب اول: مالک همهٔ معاملات حساب خودش را می‌بیند
    const all = await db.transactionRecord.count({ where: { id: { startsWith: P } } });
    expect(total).toBeGreaterThanOrEqual(all);
  });

  test("۲) owner-sees-all-experts — مالک همهٔ ۲۹۱ کارشناس را می‌بیند", async () => {
    const access = resolveEntityAccess(OWNER_MASTER, "expert");
    expect(access.clause.kind).toBe("ALL");
    const { total } = await getExpertRepository().listWithInteractions({ filter: {}, sortDir: "asc", limit: 1000, offset: 0 });
    expect(total).toBeGreaterThanOrEqual(EX_COUNT);
  });

  test("۳) owner-sees-all-contracts — مالک همهٔ قراردادها را می‌بیند", async () => {
    const access = resolveEntityAccess(OWNER_MASTER, "contract");
    expect(access.clause.kind).toBe("ALL");
    const rows = await getContractRepository().findAllOrderByCreatedAtDesc();
    const mine = rows.filter((r) => r.id.startsWith(P));
    expect(mine.length).toBe(2);
  });

  test("۴) owner-sees-all-listings — مالک آگهی‌های کارشناسان دیگر را هم می‌بیند (ماتریس §۵.۳ زیرپا گذاشته نمی‌شود برای مالک)", async () => {
    const access = resolveEntityAccess(OWNER_MASTER, "listing");
    expect(access.isOwnerRead).toBe(true);
    const scopeWhere = personalScopeWhere(access);
    expect(scopeWhere).toBeUndefined(); // صفر فیلتر برای مالک
    const { rows } = await listListings(undefined, scopeWhere ?? undefined);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(`${P}LA`); // آگهی مشاور الف
    expect(ids).toContain(`${P}LB`); // آگهی مشاور ب
    expect(ids).toContain(`${P}LO`); // آگهی خود مالک
    // خواندن از مسیر expert-ui هم همان نتیجه را می‌دهد
    const access2 = resolveEntityAccess(OWNER_EXPERT_UI, "listing");
    expect(personalScopeWhere(access2)).toBeUndefined();
  });

  test("۵) expert-scope-unchanged — مشاور فقط نمای خودش؛ تجمیعی‌ها دست‌نخورده", async () => {
    // شخصی: آگهی — مشاور الف فقط آگهی خودش
    const accessLA = resolveEntityAccess(CONSULTANT_A, "listing");
    expect(accessLA.clause).toEqual({ kind: "PERSONAL", code: A });
    const whereLA = personalScopeWhere(accessLA);
    expect(whereLA).toEqual({ actorCode: A });
    const { rows: rowsA } = await listListings(undefined, whereLA ?? undefined);
    expect(rowsA.every((r) => r.id === `${P}LA` || !r.id.startsWith(P))).toBe(true);
    expect(rowsA.map((r) => r.id)).toContain(`${P}LA`);
    expect(rowsA.map((r) => r.id)).not.toContain(`${P}LB`);

    // شخصی: درخواست
    const accessRA = resolveEntityAccess(CONSULTANT_A, "request");
    const whereRA = personalScopeWhere(accessRA);
    expect(whereRA).toEqual({ actorCode: A });
    const { rows: reqA } = await listRequests(undefined, whereRA ?? undefined);
    expect(reqA.map((r) => r.id)).toContain(`${P}RA`);
    expect(reqA.map((r) => r.id)).not.toContain(`${P}RB`);

    // شخصی: بازدید — ستون ownerCode (قرارداد §۵.۳)
    const accessVA = resolveEntityAccess(CONSULTANT_A, "visit");
    const whereVA = personalScopeWhere(accessVA);
    expect(whereVA).toEqual({ ownerCode: A });
    const vi = await getVisitRepository().listWithSummary({}, 100, 0, whereVA ?? undefined);
    expect(vi.rows.map((r) => r.id)).toContain(`${P}VA`);
    expect(vi.rows.map((r) => r.id)).not.toContain(`${P}VB`);

    // تجمیعی: معامله — مشاور هم همه را می‌بیند (عین گزارش دپارتمانی خود سامانه)
    const accessTA = resolveEntityAccess(CONSULTANT_A, "transaction");
    expect(accessTA.clause.kind).toBe("ALL");
    const { total } = await getTransactionRepository().listWithSummary({ filter: {}, sortBy: "contractDate", sortDir: "asc", limit: 5000, offset: 0 });
    expect(total).toBeGreaterThanOrEqual(TX_COUNT);

    // fail-closed: نشست مشاور بدون کد پرسنلی ⇒ DENY_ALL
    const noCode = resolveEntityAccess({ personnelCode: "", role: "CONSULTANT", accessScope: "CONSULTANT" }, "listing");
    expect(noCode.clause.kind).toBe("DENY_ALL");
    expect(personalScopeWhere(noCode)).toBeNull();
  });

  test("۶) owner-audit-log — رد owner.read با resource + session (عین قرارداد دستور)", async () => {
    await witnessOwnerRead(OWNER_MASTER, "transaction", 727, "manager-code");
    await witnessScopedRead(OWNER_EXPERT_UI, "expert", 291, true, "expert-login");
    await witnessScopedRead(CONSULTANT_A, "listing", 1, false, "expert-login");

    const ownerRows = await db.auditLog.findMany({
      where: { action: "owner.read", actor: { in: [OWNER_MASTER.personnelCode, OWNER_EXPERT_UI.personnelCode] } },
      orderBy: { createdAt: "asc" },
    });
    expect(ownerRows.length).toBe(2);
    expect(ownerRows[0].detail).toContain("resource=transaction:727");
    expect(ownerRows[0].detail).toContain("role:OWNER");
    expect(ownerRows[0].detail).toContain("path:manager-code");
    expect(ownerRows[0].operation).toBe("READ");
    expect(ownerRows[0].accessScope).toBe("OWNER");
    expect(ownerRows[1].detail).toContain("resource=expert:291");
    expect(ownerRows[1].detail).toContain("path:expert-login");

    // مشاور ⇒ DATA_ACCESS (قرارداد §۶.۲) نه owner.read
    const consultantRow = await db.auditLog.findFirst({
      where: { action: "DATA_ACCESS", actor: A, entityType: "listing" },
      orderBy: { createdAt: "desc" },
    });
    expect(consultantRow).not.toBeNull();
    expect(consultantRow!.operation).toBe("READ");
  });

  test("۷) owner-from-expert-ui — ورود OTP با MANAGER_CODE ⇒ نقش OWNER", async () => {
    const { resolveDashboardRole } = await import("../src/lib/melk-api/provider");
    const armUser = { type: "realtor", fullName: "سید نعمت اله سیدی" };
    // کد خود مالک با MANAGER_CODE تنظیم‌شده ⇒ OWNER
    expect(resolveDashboardRole("410031320", armUser, "410031320")).toBe("OWNER");
    // MANAGER_CODE تنظیم نشده ⇒ ویژگی خاموش (رفتار قبلی)
    expect(resolveDashboardRole("410031320", armUser, "")).toBe("CONSULTANT");
    // کارشناس دیگر ⇒ CONSULTANT
    expect(resolveDashboardRole("419999999", armUser, "410031320")).toBe("CONSULTANT");
    // نشست تازه با نقش OWNER ⇒ دامنه OWNER (زنجیرهٔ کامل ورود تا دسترسی)
    const session = { personnelCode: "410031320", role: resolveDashboardRole("410031320", armUser, "410031320"), accessScope: "OWNER" };
    expect(isOwnerSession(session)).toBe(true);
    expect(resolveEntityAccess(session, "listing").isOwnerRead).toBe(true);
    expect(ownerLoginPath(session)).toBe("expert-login");
    // ورود مدیر ⇒ مسیر manager-code
    expect(ownerLoginPath(OWNER_MASTER)).toBe("manager-code");
  });

  test("۸) no-raw-scope-filter — گارد AST: صفر فیلتر دامنهٔ دست‌نویس خارج از helper", async () => {
    const proc = Bun.spawnSync(["bun", "scripts/audit-scope-usage.ts"], {
      cwd: "/home/z/my-project",
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = proc.stdout.toString() + proc.stderr.toString();
    expect(proc.exitCode).toBe(0);
    expect(out).toContain("AUDIT-SCOPE-USAGE PASS");
  });

  test("۹) owner-tiles-unfiltered — مالک روی همهٔ موجودیت‌ها صفر فیلتر (کاشی بدون محدودیت)", async () => {
    const entities: ScopeEntity[] = [
      "transaction", "expert", "contract", "interaction",
      "visit", "listing", "request", "customer", "supply-demand", "property",
    ];
    for (const e of entities) {
      const a1 = resolveEntityAccess(OWNER_MASTER, e);
      expect(a1.clause.kind).toBe("ALL");
      expect(a1.isOwnerRead).toBe(true);
      const a2 = resolveEntityAccess(OWNER_EXPERT_UI, e);
      expect(a2.clause.kind).toBe("ALL");
      expect(a2.isOwnerRead).toBe(true);
    }
    // ماتریس مشاور: شخصی‌ها PERSONAL، تجمیعی‌ها ALL (عین §۵.۳)
    expect(resolveEntityAccess(CONSULTANT_B, "listing").clause.kind).toBe("PERSONAL");
    expect(resolveEntityAccess(CONSULTANT_B, "request").clause.kind).toBe("PERSONAL");
    expect(resolveEntityAccess(CONSULTANT_B, "visit").clause.kind).toBe("PERSONAL");
    expect(resolveEntityAccess(CONSULTANT_B, "customer").clause.kind).toBe("PERSONAL");
    expect(resolveEntityAccess(CONSULTANT_B, "transaction").clause.kind).toBe("ALL");
    expect(resolveEntityAccess(CONSULTANT_B, "expert").clause.kind).toBe("ALL");
    expect(resolveEntityAccess(CONSULTANT_B, "contract").clause.kind).toBe("ALL");
    expect(resolveEntityAccess(CONSULTANT_B, "interaction").clause.kind).toBe("ALL");
    expect(resolveEntityAccess(CONSULTANT_B, "supply-demand").clause.kind).toBe("ALL");
    expect(resolveEntityAccess(CONSULTANT_B, "property").clause.kind).toBe("ALL");
  });

  test("۱۰) owner-idempotent-reads — خواندن مکرر مالک: نتیجهٔ یکسان، داده دست‌نخورده", async () => {
    const read1 = await listListings(undefined, undefined);
    const counts1 = {
      tx: await db.transactionRecord.count(),
      ex: await db.expertRecord.count(),
    };
    const read2 = await listListings(undefined, undefined);
    const counts2 = {
      tx: await db.transactionRecord.count(),
      ex: await db.expertRecord.count(),
    };
    expect(read2.rows.length).toBe(read1.rows.length);
    expect(read2.stats).toEqual(read1.stats);
    expect(counts2).toEqual(counts1);
    // helper خالص است: ورودی یکسان ⇒ خروجی یکسان
    const a1 = resolveEntityAccess(OWNER_MASTER, "listing");
    const a2 = resolveEntityAccess(OWNER_MASTER, "listing");
    expect(a1).toEqual(a2);
  });
});
