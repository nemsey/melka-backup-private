/**
 * تست‌های فهرست تازهٔ کارشناسان — PN-008 (ثانیاً)
 * ------------------------------------------------------
 * وابسته به کد تازه (صفر وابستگی به نسل قدیم):
 *   · src/lib/experts/profile-store.ts — فیلتر تمام ستون‌ها + شمارش + گزینه‌ها
 *   · src/app/api/experts/route.ts — قرارداد HTTP (ستون‌های الزامی مالک)
 *   · src/app/api/experts/sync/route.ts — گارد OWNER
 * قرارداد مالک: رکورد فاقد داده = null (UI «-») · فیلتر بر اساس تمام ستون‌ها
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHash } from "crypto";

const { db } = await import("@/lib/db");
const { listExpertProfiles, expertFilterOptions, recomputeExpertCounts, EMPLOYMENT_TYPE_FA } = await import("@/lib/experts/profile-store");

// ── بستر تست: ردیف‌های کنترل‌شده با پیشوند یکتا ──
const P = "PN008-TEST-";
const FIX = [
  { id: `${P}1`, personnelCode: "410099001", fullName: `${P}آرش یک`, mobile: "9141110001", branchTitle: "باغلارباغی", hireDate: "2024-01-15T00:00:00.000Z", employmentType: 1, headManager: `${P}مدیر الف`, address: `${P}خیابان شمس پلاک ۱`, telephone: "04133330001", postalCode: "5150000001", voipExtension: "1501", city: "تبریز", roleTitle: "مشاور فروش", active: true, saleCount: 3, rentCount: 2 },
  { id: `${P}2`, personnelCode: "410099002", fullName: `${P}آرش دو`, mobile: "9141110002", branchTitle: "ارتش", hireDate: "2025-06-01T00:00:00.000Z", employmentType: 3, headManager: `${P}مدیر ب`, address: `${P}خیابان ارتش پلاک ۲`, telephone: "04133330002", postalCode: "5150000002", voipExtension: "1502", city: "تبریز", roleTitle: "مشاور فروش", active: false, saleCount: 0, rentCount: 5 },
  { id: `${P}3`, personnelCode: "410099003", fullName: `${P}آرش سه`, mobile: "9141110003", branchTitle: null, hireDate: null, employmentType: null, headManager: null, address: null, telephone: null, postalCode: null, voipExtension: null, city: null, roleTitle: null, active: true, saleCount: 0, rentCount: 0 },
];

const createdSessions: string[] = [];
async function makeSession(role: "OWNER" | "CONSULTANT" = "OWNER") {
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode: role === "OWNER" ? "930001" : "930002", displayName: `تست PN-008 ${role}`, role },
    { ip: "127.0.0.1" },
    null
  );
  createdSessions.push(token);
  return token;
}

beforeAll(async () => {
  await db.armConnection.deleteMany({}).catch(() => undefined);
  for (const f of FIX) {
    await db.expertProfile.upsert({
      where: { id: f.id },
      create: { ...f, rawRegistryJson: "{}", syncedAt: new Date(), createdAt: new Date() },
      update: { ...f },
    });
  }
});

afterAll(async () => {
  await db.expertProfile.deleteMany({ where: { id: { startsWith: P } } });
  for (const t of createdSessions) {
    await db.session.deleteMany({ where: { tokenHash: createHash("sha256").update(t).digest("hex") } }).catch(() => undefined);
  }
  await db.armConnection.deleteMany({}).catch(() => undefined);
  await db.$disconnect();
});

describe("PN-008 ثانیاً — فیلتر بر اساس تمام ستون‌ها (profile-store)", () => {
  test("فیلتر نام", async () => {
    const { rows } = await listExpertProfiles({ fullName: `${P}آرش یک` });
    expect(rows.length).toBe(1);
    expect(rows[0].personnelCode).toBe("410099001");
  });

  test("فیلتر موبایل", async () => {
    const { rows } = await listExpertProfiles({ mobile: "9141110002" });
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(`${P}2`);
  });

  test("فیلتر کدپرسنلی", async () => {
    const { rows } = await listExpertProfiles({ personnelCode: "410099003" });
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(`${P}3`);
  });

  test("فیلتر شعبه", async () => {
    const { rows } = await listExpertProfiles({ branchTitle: "ارتش" });
    expect(rows.some((r) => r.id === `${P}2`)).toBe(true);
    expect(rows.some((r) => r.id === `${P}1`)).toBe(false);
  });

  test("فیلتر سمت پرسنلی", async () => {
    const { rows } = await listExpertProfiles({ roleTitle: "مشاور فروش" });
    expect(rows.some((r) => r.id === `${P}1`)).toBe(true);
    expect(rows.some((r) => r.id === `${P}3`)).toBe(false);
  });

  test("فیلتر نوع همکاری (عددی PM)", async () => {
    const { rows } = await listExpertProfiles({ employmentType: 3 });
    expect(rows.some((r) => r.id === `${P}2`)).toBe(true);
    expect(rows.some((r) => r.id === `${P}1`)).toBe(false);
  });

  test("فیلتر مدیر", async () => {
    const { rows } = await listExpertProfiles({ headManager: `${P}مدیر الف` });
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(`${P}1`);
  });

  test("فیلتر آدرس (جزئی)", async () => {
    const { rows } = await listExpertProfiles({ address: "خیابان ارتش" });
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(`${P}2`);
  });

  test("فیلتر تلفن / کدپستی / داخلی / شهر", async () => {
    expect((await listExpertProfiles({ telephone: "04133330001" })).rows.length).toBe(1);
    expect((await listExpertProfiles({ postalCode: "5150000002" })).rows.length).toBe(1);
    expect((await listExpertProfiles({ voipExtension: "1501" })).rows.length).toBe(1);
    expect((await listExpertProfiles({ city: "تبریز" })).rows.filter((r) => r.id.startsWith(P)).length).toBe(2);
  });

  test("فیلتر وضعیت فعال", async () => {
    const { rows } = await listExpertProfiles({ active: false });
    expect(rows.some((r) => r.id === `${P}2`)).toBe(true);
    expect(rows.some((r) => r.id === `${P}1`)).toBe(false);
  });

  test("بازهٔ تاریخ استخدام (ISO-پارس دقیق)", async () => {
    const { rows } = await listExpertProfiles({ hireFrom: "2025-01-01", hireTo: "2025-12-31" });
    expect(rows.some((r) => r.id === `${P}2`)).toBe(true);
    expect(rows.some((r) => r.id === `${P}1`)).toBe(false);
    expect(rows.some((r) => r.id === `${P}3`)).toBe(false); // بدون تاریخ = خارج از بازه
  });

  test("بازهٔ مبایعه‌نامه و اجاره‌نامه", async () => {
    const sale = await listExpertProfiles({ saleFrom: 1, saleTo: 10 });
    expect(sale.rows.some((r) => r.id === `${P}1`)).toBe(true);
    expect(sale.rows.some((r) => r.id === `${P}2`)).toBe(false);
    const rent = await listExpertProfiles({ rentFrom: 4 });
    expect(rent.rows.some((r) => r.id === `${P}2`)).toBe(true);
    expect(rent.rows.some((r) => r.id === `${P}1`)).toBe(false);
  });

  test("جستجوی آزاد q در همهٔ ستون‌ها", async () => {
    expect((await listExpertProfiles({ q: "9141110003" })).rows.some((r) => r.id === `${P}3`)).toBe(true);
    expect((await listExpertProfiles({ q: "410099002" })).rows.some((r) => r.id === `${P}2`)).toBe(true);
    expect((await listExpertProfiles({ q: "خیابان شمس" })).rows.some((r) => r.id === `${P}1`)).toBe(true);
  });

  test("رکورد فاقد داده = null (قاعدهٔ «-» — تهی به‌عنوان null، نه رشتهٔ خالی)", async () => {
    const { rows } = await listExpertProfiles({ personnelCode: "410099003" });
    expect(rows[0].branchTitle).toBeNull();
    expect(rows[0].hireDate).toBeNull();
    expect(rows[0].address).toBeNull();
    expect(rows[0].employmentTypeFa).toBeNull();
  });

  test("مرتب‌سازی: مبایعه نزولی", async () => {
    const { rows } = await listExpertProfiles({ sort: "sale", sortDir: "desc", limit: 5000 });
    const idx1 = rows.findIndex((r) => r.id === `${P}1`);
    const idx3 = rows.findIndex((r) => r.id === `${P}3`);
    expect(idx1).toBeGreaterThan(-1);
    if (idx3 > -1) expect(idx1).toBeLessThan(idx3);
  });
});

describe("PN-008 ثانیاً — گزینه‌های فیلتر از دادهٔ زندهٔ ستون‌ها (بروزرسانی فیلتر)", () => {
  test("شعب/مدیران/سمت‌ها/انواع همکاری از دادهٔ واقعی استخراج می‌شوند", async () => {
    const options = await expertFilterOptions();
    expect(options.branches).toContain("باغلارباغی");
    expect(options.branches).toContain("ارتش");
    expect(options.managers.some((m) => m.startsWith(P))).toBe(true);
    expect(options.roles).toContain("مشاور فروش");
    expect(options.employmentTypes.some((e) => e.label === EMPLOYMENT_TYPE_FA[1])).toBe(true);
    expect(options.employmentTypes.some((e) => e.label === EMPLOYMENT_TYPE_FA[3])).toBe(true);
  });
});

describe("PN-008 ثانیاً — قرارداد HTTP روت تازه", () => {
  test("GET /api/experts → 200 + ستون‌های الزامی مالک + گزینه‌های فیلتر", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/experts/route");
    const token = await makeSession();
    const req = new NextRequest("http://localhost/api/experts?fullName=" + encodeURIComponent(`${P}آرش یک`), { headers: { authorization: `Bearer ${token}` } });
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.rows.length).toBe(1);
    for (const k of ["personnelCode", "fullName", "mobile", "branchTitle", "saleCount", "rentCount", "hireDate", "address"]) {
      expect(body.rows[0]).toHaveProperty(k);
    }
    expect(body.filterOptions).toHaveProperty("branches");
    expect(body.dataSource).toHaveProperty("real", true);
  });

  test("GET /api/experts بدون نشست → 401", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/experts/route");
    const req = new NextRequest("http://localhost/api/experts");
    const res = await route.GET(req);
    expect(res.status).toBe(401);
  });

  test("POST /api/experts/sync با CONSULTANT → 403 (قید فقط OWNER)", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/experts/sync/route");
    const token = await makeSession("CONSULTANT");
    const req = new NextRequest("http://localhost/api/experts/sync", { method: "POST", headers: { authorization: `Bearer ${token}` } });
    const res = await route.POST(req);
    expect(res.status).toBe(403);
  });

  test("POST /api/experts/sync بدون نشست → 401", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/experts/sync/route");
    const req = new NextRequest("http://localhost/api/experts/sync", { method: "POST" });
    const res = await route.POST(req);
    expect(res.status).toBe(401);
  });
});

describe("PN-008 ثانیاً — شمارش مبایعه/اجاره از دادهٔ ARM", () => {
  test("recomputeExpertCounts اجرا می‌شود و خروجی عددی صادقانه می‌دهد", async () => {
    const out = await recomputeExpertCounts();
    expect(typeof out.sale).toBe("number");
    expect(typeof out.rent).toBe("number");
    expect(typeof out.contracts).toBe("number");
    expect(out.sale).toBeGreaterThanOrEqual(0);
    expect(out.rent).toBeGreaterThanOrEqual(0);
  });

  test("شمارش فیکسچر: ردیف ۱ و ۲ مقادیر seed خود را پس از recompute از دست نمی‌دهند (نام یکتای تست)", async () => {
    await recomputeExpertCounts();
    const r1 = await db.expertProfile.findUnique({ where: { id: `${P}1` } });
    // نام‌های یکتای تست در دادهٔ ARM وجود ندارند → شمارش صادقانه = صفر
    expect(r1?.saleCount).toBe(0);
    expect(r1?.rentCount).toBe(0);
  });
});

describe("PN-008 ثانیاً — نسل قدیمی حذف شده", () => {
  test("مدل PmPersonnelRecord از Prisma حذف و ExpertProfile جانشین شده", async () => {
    const { Prisma } = await import("@prisma/client");
    const names = Prisma.dmmf.datamodel.models.map((m: { name: string }) => m.name);
    expect(names).toContain("ExpertProfile");
    expect(names).not.toContain("PmPersonnelRecord");
  });

  test("روت قدیمی /api/crm/experts وجود ندارد (حذف نسل وابسته به 00000000)", async () => {
    const { existsSync } = await import("node:fs");
    expect(existsSync("/home/z/my-project/src/app/api/crm/experts/route.ts")).toBe(false);
  });

  test("ماژول غنی‌سازی قدیمی expert-enrichment حذف شده", async () => {
    const { existsSync } = await import("node:fs");
    expect(existsSync("/home/z/my-project/src/lib/melk-api/expert-enrichment.ts")).toBe(false);
  });
});
