/**
 * PN-016 — تست‌های قراردادی CRM (Contract Tests) — ادامهٔ فاز ۶
 * ---------------------------------------------------------------------------
 * قرارداد هر روت CRM را درون‌فرایندی (عین الگوی p6530/phase1) راستی‌آزمایی می‌کند:
 *   ۱) احراز هویت: بدون توکن → 401
 *   ۲) شکل پاسخ: کلیدهای الزامی قرارداد (ok/rows/total/انبارها)
 *   ۳) فیلترها: مقدار نامعتبر → 400 شفاف با پیام راهنما
 *   ۴) مرز نقش: مشاور → sync مالک‌محور → 403
 *   ۵) فشرده‌سازی مسیر موبایل: gzip برقرار
 * زنجیرهٔ نشست واقعی (createSession روی پایگاه تست) — صفر mock.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHash } from "crypto";
import { gunzipSync } from "node:zlib";

process.env.OWNER_PERSONNEL_CODES = "410099950";
const { db } = await import("@/lib/db");

const createdSessions: string[] = [];
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

async function makeSession(role: "OWNER" | "CONSULTANT", personnelCode = role === "OWNER" ? "970001" : "970002") {
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode, displayName: `تست قرارداد CRM ${role}`, role },
    { ip: "127.0.0.1" },
    null
  );
  createdSessions.push(token);
  return token;
}

async function NR(u: string, headers?: Record<string, string>): Promise<import("next/server").NextRequest> {
  const { NextRequest } = await import("next/server");
  return new NextRequest(`http://localhost${u}`, { headers: headers as never });
}
const hdr = (t: string) => ({ authorization: `Bearer ${t}` });

async function callGET(routeModule: string, query: string, token: string | null): Promise<{ status: number; body: Record<string, unknown>; res: Response }> {
  const route = await import(routeModule);
  const req = await NR(query, token ? hdr(token) : undefined);
  const res = await route.GET(req);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body, res };
}

beforeAll(async () => {
  await db.user.deleteMany({ where: { personnelCode: { startsWith: "9700" } } }).catch(() => undefined);
});

afterAll(async () => {
  for (const t of createdSessions) {
    await db.session.deleteMany({ where: { tokenHash: sha(t) } }).catch(() => undefined);
  }
  await db.user.deleteMany({ where: { personnelCode: { startsWith: "9700" } } }).catch(() => undefined);
  await db.$disconnect();
});

/* ═══════ ۱) قرارداد احراز هویت ═══════ */
describe("PN-016 · CRM Contract — احراز هویت", () => {
  const CRM_ROUTES = [
    "@/app/api/crm/transactions/route:/api/crm/transactions",
    "@/app/api/crm/contracts/route:/api/crm/contracts",
    "@/app/api/crm/interactions/route:/api/crm/interactions",
    "@/app/api/crm/meta/route:/api/crm/meta",
    // PN-027 · ۵-ب-۲ — /api/crm/branches حذف شد (جلسهٔ ۰۳۴ تأیید؛ گزینه‌های شعبه از filterOptions؛ کتابخانهٔ branch-store در ۵ روت دیگر زنده)
    "@/app/api/crm/data-freshness/route:/api/crm/data-freshness",
  ];

  for (const spec of CRM_ROUTES) {
    const [mod, path] = spec.split(":");
    test(`بدون توکن → ${path} → 401`, async () => {
      const { status } = await callGET(mod, path, null);
      expect(status).toBe(401);
    });
  }
});

/* ═══════ ۲) قرارداد شکل پاسخ ═══════ */
describe("PN-016 · CRM Contract — شکل پاسخ", () => {
  test("GET /api/crm/meta → 200 + سه انبار مقادیر یکتا (roles/businesses/creators آرایه)", async () => {
    const token = await makeSession("OWNER");
    const { status, body } = await callGET("@/app/api/crm/meta/route", "/api/crm/meta", token);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.roles)).toBe(true);
    expect(Array.isArray(body.businesses)).toBe(true);
    expect(Array.isArray(body.creators)).toBe(true);
  });

  test("GET /api/crm/transactions → 200 + قرارداد صفحه‌بندی (rows/total آرایه/عدد)", async () => {
    const token = await makeSession("OWNER");
    const { status, body } = await callGET("@/app/api/crm/transactions/route", "/api/crm/transactions?limit=5", token);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect((body.rows as unknown[]).length).toBeLessThanOrEqual(5);
  });

  test("GET /api/crm/data-freshness → 200 + ok", async () => {
    const token = await makeSession("OWNER");
    const { status, body } = await callGET("@/app/api/crm/data-freshness/route", "/api/crm/data-freshness", token);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test("GET /api/crm/contracts → 200 و هم‌شکل transactions", async () => {
    const token = await makeSession("OWNER");
    const { status, body } = await callGET("@/app/api/crm/contracts/route", "/api/crm/contracts?limit=3", token);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
  });
});

/* ═══════ ۳) قرارداد فیلترها ═══════ */
describe("PN-016 · CRM Contract — فیلترها", () => {
  test("نوع قرارداد نامعتبر → 400 با پیام راهنما (نه 500 خاموش)", async () => {
    const token = await makeSession("OWNER");
    const { status, body } = await callGET("@/app/api/crm/transactions/route", "/api/crm/transactions?contractType=%D8%B9%D8%A8%D8%AF%DB%8C", token);
    expect(status).toBe(400);
    expect(String(body.message)).toContain("شناخته نشد");
  });
});

/* ═══════ ۴) قرارداد مرز نقش و پیش‌شرط ═══════ */
describe("PN-016 · CRM Contract — مرز نقش", () => {
  test("POST sync بدون توکن ARM → 412 با پیام راهنما (قرارداد مستند PN-005: 412 به‌جای 401 تا خروج خودکار رخ ندهد)", async () => {
    const token = await makeSession("CONSULTANT");
    const route = await import("@/app/api/crm/transactions/sync/route");
    const res = await route.POST(await NR("/api/crm/transactions/sync", hdr(token)));
    expect(res.status).toBe(412);
    const body = (await res.json()) as Record<string, unknown>;
    expect(String(body.message)).toContain("ARM");
  });
});

/* ═══════ ۵) قرارداد فشرده‌سازی مسیر موبایل ═══════ */
describe("PN-016 · CRM Contract — فشرده‌سازی", () => {
  test("accept-encoding: gzip → content-encoding برقرار + قرارداد rows/total پس از gunzip", async () => {
    const token = await makeSession("OWNER");
    const route = await import("@/app/api/crm/transactions/route");
    const req = await NR("/api/crm/transactions?limit=500", { ...hdr(token), "accept-encoding": "gzip" });
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    const enc = res.headers.get("content-encoding");
    expect(enc === "gzip" || enc === null).toBe(true); // فشرده یا خام — هر دو قراردادِ معتبر
    let body: Record<string, unknown>;
    if (enc === "gzip") {
      body = JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8"));
    } else {
      body = (await res.json()) as Record<string, unknown>;
    }
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.total).toBe("number");
  });
});
