/**
 * pn060-registrar-names.test.ts — PN-060 (دستورات الف و ب مالک — ۱۴۰۵/۰۸/۱۱)
 * =============================================================================
 * فهرست معاملات (M3): «در زیر کدملک نام کارشناس ثبت کننده آگهی» و
 * «در زیر کددرخواست نام کارشناس ثبت کننده درخواست» (قالب: کد / نام زیر آن)
 *   §۱ — غنی‌سازی خالص: propertyRegistrarName/requestRegistrarName از lookups می‌نشینند
 *   §۲ — سازگاری عقبه: بدون lookups تازه، ستون‌های تازه null می‌مانند (شکسته نمی‌شوند)
 *   §۳ — مخازن (زنده روی DB تست): آگهی → relatedRealtor (نه مالک واقعی) · درخواست → actorName
 *   §۴ — سیم‌کشی روت زنده: /api/crm/transactions هر دو نام را در ردیف می‌فرستد
 *   §۵ — UI فهرست: نام زیر کد در هر دو ستون + حالت تهی شفاف + TxRow تایپ‌دار
 *   §۶ — اکسل فهرست معاملات: دو ستون تازه در خروجی
 */

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const SRC = "/home/z/my-project/src";
const TILES = `${SRC}/core/tiles/tiles`;
const M3_SRC = readFileSync(`${TILES}/transactions-contracts/TransactionsTab.tsx`, "utf8");
const ROUTE_SRC = readFileSync(`${SRC}/app/api/crm/transactions/route.ts`, "utf8");
const EXPORT_SRC = readFileSync(`${SRC}/app/api/crm/export/[entity]/route.ts`, "utf8");

const SEED_PROP_CODE = "98601";
const SEED_REQ_CODE = "98602";
const SEED_PROP_REGISTRAR = "سید نعمت اله سیدی"; // عین مثال دستور مالک (آگهی ۵۶۱۰۱)
const SEED_REQ_REGISTRAR = "جواد ستوده";
const SEED_REAL_OWNER = "مالک تستی PN-060"; // rawOwnerName — مالک واقعی، ≠ کارشناس ثبت‌کننده

/* ==========================================================================
 * §۱ + §۲ — غنی‌سازی خالص (تابع محض — بدون DB)
 * ========================================================================== */

describe("PN-060 §۱ — غنی‌سازی: نام کارشناس ثبت‌کننده روی ردیف می‌نشیند", () => {
  test("۱-الف) lookup آگهی/درخواست → propertyRegistrarName/requestRegistrarName", async () => {
    const { enrichTransactionRows } = await import("@/lib/melk-api/tx-enrichment");
    const rows = enrichTransactionRows(
      [
        {
          id: "tx-pn060-a", contractDate: new Date("2025-01-01T00:00:00Z"), propertyCode: "56101",
          propertyCustomer: null, requestCode: "54754", requestCustomer: null, contractHolo: null,
          suggestedPropertyCount: 0, eventsCount: 0,
        },
      ],
      {
        owners: [], requesters: [], contracts: [], agencies: [],
        propertyRegistrars: [
          { propertyCode: "56101", registrarCode: "950032", registrarName: `  ${SEED_PROP_REGISTRAR}  ` },
        ],
        requestRegistrars: [
          { requestCode: "54754", registrarCode: null, registrarName: SEED_REQ_REGISTRAR },
        ],
      }
    );
    // نام با trim می‌نشیند (فاصله‌های اطراف پاک می‌شوند)
    expect(rows[0].propertyRegistrarName).toBe(SEED_PROP_REGISTRAR);
    expect(rows[0].requestRegistrarName).toBe(SEED_REQ_REGISTRAR);
  });

  test("۱-ب) نام تهی/فاصله‌ای → null (نه رشتهٔ خالی — هم‌ارز دادهٔ ثبت‌نشده)", async () => {
    const { enrichTransactionRows } = await import("@/lib/melk-api/tx-enrichment");
    const rows = enrichTransactionRows(
      [
        {
          id: "tx-pn060-b", contractDate: new Date("2025-01-01T00:00:00Z"), propertyCode: "1",
          propertyCustomer: null, requestCode: "2", requestCustomer: null, contractHolo: null,
          suggestedPropertyCount: 0, eventsCount: 0,
        },
      ],
      {
        owners: [], requesters: [], contracts: [], agencies: [],
        propertyRegistrars: [{ propertyCode: "1", registrarCode: "9", registrarName: "   " }],
        requestRegistrars: [{ requestCode: "2", registrarCode: "9", registrarName: null }],
      }
    );
    expect(rows[0].propertyRegistrarName).toBeNull();
    expect(rows[0].requestRegistrarName).toBeNull();
  });

  test("۲-الف) سازگاری عقبه: بدون کلیدهای تازه، ستون‌ها null می‌مانند و سایر ستون‌ها دست‌نخورده‌اند", async () => {
    const { enrichTransactionRows } = await import("@/lib/melk-api/tx-enrichment");
    const rows = enrichTransactionRows(
      [
        {
          id: "tx-pn060-c", contractDate: new Date("2025-01-01T00:00:00Z"), propertyCode: "3",
          propertyCustomer: "فروشنده", requestCode: null, requestCustomer: null, contractHolo: null,
          suggestedPropertyCount: 0, eventsCount: 0,
        },
      ],
      { owners: [], requesters: [], contracts: [], agencies: [] }
    );
    expect(rows[0].propertyRegistrarName).toBeNull();
    expect(rows[0].requestRegistrarName).toBeNull();
    expect(rows[0].ownerName).toBe("فروشنده"); // غنی‌سازی قدیمی عین قبل کار می‌کند
  });
});

/* ==========================================================================
 * §۳ + §۴ — مخازن و روت زنده روی DB تست (بذر مستقل — upsert بر کلید طبیعی)
 * ========================================================================== */

let OWNER_TOKEN: string | null = null;

async function ownerToken(): Promise<string> {
  if (OWNER_TOKEN) return OWNER_TOKEN;
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode: "950060", displayName: "تست PN-060", role: "OWNER" },
    { ip: "127.0.0.1" },
    null
  );
  OWNER_TOKEN = token;
  return token;
}

async function callRoute(query: string): Promise<{ status: number; body: any }> {
  const route = await import("@/app/api/crm/transactions/route");
  const { NextRequest } = await import("next/server");
  const token = await ownerToken();
  const req = new NextRequest(`http://localhost${query}`, { headers: { authorization: `Bearer ${token}` } });
  const res = await route.GET(req);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

describe("PN-060 §۳/§۴ — مخازن و روت زنده (DB تست)", () => {
  beforeAll(async () => {
    const { db } = await import("@/lib/db");
    // آگهی: ownerName = کارشناس ثبت‌کننده (relatedRealtor) · rawOwnerName = مالک واقعی
    await db.propertyRecord.upsert({
      where: { propertyCode: SEED_PROP_CODE },
      create: {
        id: "pn060-seed-prop", propertyCode: SEED_PROP_CODE, title: "بذر PN-060",
        ownerCode: "950032", ownerName: SEED_PROP_REGISTRAR, rawOwnerName: SEED_REAL_OWNER,
        ownerMobile: "09140000001", status: "سرنخ",
      },
      update: {
        ownerCode: "950032", ownerName: SEED_PROP_REGISTRAR, rawOwnerName: SEED_REAL_OWNER,
        ownerMobile: "09140000001",
      },
    });
    // درخواست ARM: actorName = کارشناس ثبت‌کننده درخواست
    await db.requestRecord.upsert({
      where: { requestCode: SEED_REQ_CODE },
      create: {
        id: "pn060-seed-req", source: "arm", requestCode: SEED_REQ_CODE, status: "ready",
        actorCode: "950011", actorName: SEED_REQ_REGISTRAR, customerName: "متقاضی تستی",
      },
      update: { source: "arm", actorCode: "950011", actorName: SEED_REQ_REGISTRAR },
    });
    // معاملهٔ پیوند‌دهندهٔ دو طرف
    await db.transactionRecord.upsert({
      where: { id: "pn060-seed-tx" },
      create: {
        id: "pn060-seed-tx", contractDate: new Date("2026-01-10T00:00:00Z"),
        propertyCode: SEED_PROP_CODE, requestCode: SEED_REQ_CODE, contractHolo: "PN060-H1",
        suggestedPropertyCount: 1, eventsCount: 0,
      },
      update: {
        contractDate: new Date("2026-01-10T00:00:00Z"),
        propertyCode: SEED_PROP_CODE, requestCode: SEED_REQ_CODE,
      },
    });
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    // پاک‌سازی بذرهای خودمان (فقط DB تست — preload-guard مسیر را تضمین می‌کند)
    await db.transactionRecord.deleteMany({ where: { id: "pn060-seed-tx" } }).catch(() => {});
    await db.propertyRecord.deleteMany({ where: { propertyCode: SEED_PROP_CODE } }).catch(() => {});
    await db.requestRecord.deleteMany({ where: { requestCode: SEED_REQ_CODE } }).catch(() => {});
    await db.$disconnect();
  });

  test("۳-الف) findRegistrarNamesByCodes: کارشناس ثبت‌کنندهٔ آگهی (نه مالک واقعی)", async () => {
    const { getPropertyRecordRepository } = await import("@/core/repositories");
    const lookups = await getPropertyRecordRepository().findRegistrarNamesByCodes([SEED_PROP_CODE, "missing-code"]);
    const hit = lookups.find((l) => l.propertyCode === SEED_PROP_CODE);
    expect(hit).toBeDefined();
    expect(hit!.registrarName).toBe(SEED_PROP_REGISTRAR); // ownerName = relatedRealtor
    expect(hit!.registrarName).not.toBe(SEED_REAL_OWNER); // rawOwnerName = مالک واقعی — هرگز
    expect(hit!.registrarCode).toBe("950032");
    expect(lookups.find((l) => l.propertyCode === "missing-code")).toBeUndefined();
  });

  test("۳-ب) findRegistrarNamesByCodes: ورودی تهی → آرایهٔ خالی (بدون کوئری)", async () => {
    const { getPropertyRecordRepository } = await import("@/core/repositories");
    expect(await getPropertyRecordRepository().findRegistrarNamesByCodes([])).toEqual([]);
  });

  test("۳-ج) findArmRegistrarNamesByCodes: کارشناس ثبت‌کنندهٔ درخواست (source=arm)", async () => {
    const { getRequestRepository } = await import("@/core/repositories");
    const lookups = await getRequestRepository().findArmRegistrarNamesByCodes([SEED_REQ_CODE]);
    expect(lookups).toHaveLength(1);
    expect(lookups[0].registrarName).toBe(SEED_REQ_REGISTRAR);
    expect(lookups[0].registrarCode).toBe("950011");
  });

  test("۴-الف) روت زنده: ردیف معامله هر دو نام کارشناس ثبت‌کننده را می‌دهد", async () => {
    const r = await callRoute(`/api/crm/transactions?propertyCode=${SEED_PROP_CODE}&limit=10`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    const rows = r.body.rows as Array<{ propertyCode: string; propertyRegistrarName: string | null; requestRegistrarName: string | null }>;
    const hit = rows.find((x) => x.propertyCode === SEED_PROP_CODE);
    expect(hit).toBeDefined();
    expect(hit!.propertyRegistrarName).toBe(SEED_PROP_REGISTRAR);
    expect(hit!.requestRegistrarName).toBe(SEED_REQ_REGISTRAR);
  });

  test("۴-ب) روت زنده: ردیف بدون کاتالوگ → نام‌های null (فهرست هرگز نمی‌شکند)", async () => {
    const r = await callRoute("/api/crm/transactions?limit=25000");
    expect(r.status).toBe(200);
    const rows = r.body.rows as Array<{ propertyRegistrarName: string | null }>;
    // ستون تازه روی «همهٔ» ردیف‌ها حاضر است (null برای کدهای بدون کاتالوگ)
    for (const row of rows) {
      expect(row.propertyRegistrarName === null || typeof row.propertyRegistrarName === "string").toBe(true);
    }
  });
});

/* ==========================================================================
 * §۵ + §۶ — گاردهای سورس: UI فهرست + اکسل
 * ========================================================================== */

describe("PN-060 §۵/§۶ — گاردهای سورس UI و اکسل", () => {
  test("۵-الف) TxRow: هر دو فیلد تایپ‌دار در قرارداد ردیف", () => {
    expect(M3_SRC).toContain("propertyRegistrarName: string | null;");
    expect(M3_SRC).toContain("requestRegistrarName: string | null;");
  });

  test("۵-ب) ستون کد ملک: کد بالا + نام کارشناس ثبت‌کنندهٔ آگهی زیر آن (flex-col)", () => {
    expect(M3_SRC).toContain("کارشناس ثبت‌کنندهٔ آگهی");
    expect(M3_SRC).toMatch(/faDigits\(t\.propertyCode\)[\s\S]{0,400}t\.propertyRegistrarName/);
  });

  test("۵-ج) ستون کد درخواست: کد بالا + نام کارشناس ثبت‌کنندهٔ درخواست زیر آن", () => {
    expect(M3_SRC).toContain("کارشناس ثبت‌کنندهٔ درخواست");
    expect(M3_SRC).toMatch(/faDigits\(t\.requestCode\)[\s\S]{0,400}t\.requestRegistrarName/);
  });

  test("۵-د) حالت تهی: جای نام خالی خط‌تیرهٔ محو — نه جای خالی بی‌علامت", () => {
    expect(M3_SRC).toContain("کارشناس ثبت‌کنندهٔ آگهی در کاتالوگ موجود نیست");
    expect(M3_SRC).toContain("کارشناس ثبت‌کنندهٔ درخواست در کاتالوگ موجود نیست");
  });

  test("۶-الف) روت فهرست: هر دو lookup به enrichTransactionRows گذر می‌کنند", () => {
    expect(ROUTE_SRC).toContain("findRegistrarNamesByCodes");
    expect(ROUTE_SRC).toContain("findArmRegistrarNamesByCodes");
    expect(ROUTE_SRC).toContain("propertyRegistrars,");
    expect(ROUTE_SRC).toContain("requestRegistrars,");
  });

  test("۶-ب) اکسل فهرست معاملات: دو ستون کارشناس ثبت‌کننده در کنار کد مربوط", () => {
    expect(EXPORT_SRC).toContain("کارشناس ثبت‌کننده آگهی");
    expect(EXPORT_SRC).toContain("کارشناس ثبت‌کننده درخواست");
    expect(EXPORT_SRC).toContain("propRegistrarByCode");
    expect(EXPORT_SRC).toContain("reqRegistrarByCode");
  });
});
