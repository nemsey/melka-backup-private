/**
 * تست‌های integration مسیر P2-03 — ۵ روت کلیدی پس از مهاجرت Repository
 * ------------------------------------------------------
 * قرارداد: URL/method/response روت‌ها پس از حذف db.* مستقیم،
 * دقیقاً همان ساختار قبلی را برمی‌گردانند (اثبات عددی جداگانه:
 * scripts/verify-p2-03.ts — ۳۳ مقایسه قبل/بعد یکسان).
 * این‌جا زنجیره کامل HTTP (گارد نشست → انبار → پاسخ) اجرا می‌شود.
 *
 * روت‌های کلیدی (طبق دستور P2-03):
 *   ۱) auth/session        ۲) crm/transactions      ۳) crm/experts
 *   ۴) agent/insight       ۵) divar/scan
 */

import { describe, expect, test, afterAll } from "bun:test";
import { createHash } from "crypto";

const { db } = await import("@/lib/db");

const createdSessions: string[] = [];
// P6.5-11 (بند ث) — صندوقچهٔ اتصال ماندگار باید در تست‌ها خالی باشد تا
// نشست‌های بدون توکن، استخراج زندهٔ شبکه‌ای (ensureSeeded) اجرا نکنند
await db.armConnection.deleteMany({}).catch(() => undefined);
async function makeSession(role: "OWNER" | "CONSULTANT" = "OWNER") {
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode: role === "OWNER" ? "920001" : "920002", displayName: `تست P2-03 ${role}`, role },
    { ip: "127.0.0.1" },
    null
  );
  createdSessions.push(token);
  return token;
}

function authHeader(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

afterAll(async () => {
  for (const t of createdSessions) {
    await db.session.deleteMany({ where: { tokenHash: createHash("sha256").update(t).digest("hex") } }).catch(() => undefined);
  }
  await db.armConnection.deleteMany({}).catch(() => undefined);
  await db.$disconnect();
});

// ==========================================================================
// ۱) auth/session — چرخه نشست (روت بدون db.* مستقیم از قبل — قرارداد پایدار)
// ==========================================================================

describe("P2-03 integration — auth/session", () => {
  test("GET با نشست معتبر → 200 + ساختار context", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/auth/session/route");
    const token = await makeSession();

    const req = new NextRequest("http://localhost/api/auth/session", { headers: authHeader(token) });
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user.personnelCode).toBe("920001");
    expect(body.user.role).toBe("OWNER");
  });

  test("GET بدون نشست → 401", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/auth/session/route");
    const req = new NextRequest("http://localhost/api/auth/session");
    const res = await route.GET(req);
    expect(res.status).toBe(401);
  });
});

// ==========================================================================
// ۲) crm/transactions — فیلتر + خلاصه چهارگانه از انبار
// ==========================================================================

describe("P2-03 integration — crm/transactions", () => {
  test("GET بدون فیلتر → 200 + شکل قرارداد (rows/total/summary/dataSource)", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/crm/transactions/route");
    const token = await makeSession();

    const req = new NextRequest("http://localhost/api/crm/transactions?limit=10", { headers: authHeader(token) });
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(body.summary).toHaveProperty("totalCount");
    expect(body.summary).toHaveProperty("hasRequestEvent");
    expect(body.summary).toHaveProperty("hasBoth");
    expect(body.summary).toHaveProperty("withHolo");
    expect(body.summary).toHaveProperty("withRequest");
    expect(body.dataSource).toHaveProperty("real", true);
    expect(body.dataSource).toHaveProperty("cached");
    expect(body.limit).toBe(10);
  });

  test("GET با فیلتر بازه + matchKind → همان قرارداد، ردیف‌ها فیلترشده", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/crm/transactions/route");
    const token = await makeSession();

    const req = new NextRequest(
      "http://localhost/api/crm/transactions?dateFrom=2020-01-01&dateTo=2030-12-31&matchKind=event",
      { headers: authHeader(token) }
    );
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // هر ردیف در بازه و رویداددار است
    for (const row of body.rows) {
      expect(new Date(row.contractDate).getTime()).toBeGreaterThanOrEqual(new Date("2020-01-01T00:00:00").getTime());
      expect(new Date(row.contractDate).getTime()).toBeLessThanOrEqual(new Date("2030-12-31T23:59:59.999").getTime());
      expect(row.eventsCount).toBeGreaterThan(0);
    }
    expect(body.summary.hasRequestEvent).toBe(body.summary.totalCount);
  });

  test("GET بدون نشست → 401", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/crm/transactions/route");
    const req = new NextRequest("http://localhost/api/crm/transactions");
    const res = await route.GET(req);
    expect(res.status).toBe(401);
  });
});

// ==========================================================================
// ۳) /api/experts — فهرست تازهٔ کارشناسان (PN-008 ثانیاً)
// ==========================================================================

describe("P2-03 integration — /api/experts", () => {
  test("GET → 200 + ردیف‌های پروفایل PM با ستون‌های الزامی", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/experts/route");
    const token = await makeSession();

    const req = new NextRequest("http://localhost/api/experts?limit=5", { headers: authHeader(token) });
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(body.filterOptions).toHaveProperty("branches");
    for (const row of body.rows) {
      // ستون‌های الزامی مالک همیشه در قرارداد پاسخ حاضرند (تهی = null → UI «-»)
      for (const k of ["personnelCode", "fullName", "mobile", "branchTitle", "saleCount", "rentCount", "hireDate", "address"]) {
        expect(row).toHaveProperty(k);
      }
    }
    expect(body.dataSource).toHaveProperty("real", true);
  });
});

// ==========================================================================
// ۴) agent/insight — چرخه کامل یادگیری از مسیر HTTP
// ==========================================================================

describe("P2-03 integration — agent/insight", () => {
  test("GET بینش ایجنت معتبر → 200 + insights/policyVersion/agentName", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/agent/[tileId]/insight/route");
    const token = await makeSession();

    const req = new NextRequest("http://localhost/api/agent/transactions/insight", { headers: authHeader(token) });
    const res = await route.GET(req, { params: Promise.resolve({ tileId: "transactions" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.insights)).toBe(true);
    expect(typeof body.policyVersion).toBe("number");
    expect(typeof body.memoryHits).toBe("number");
    expect(typeof body.agentName).toBe("string");
    for (const ins of body.insights) {
      expect(ins).toHaveProperty("key");
      expect(ins).toHaveProperty("domain");
      expect(ins).toHaveProperty("finalWeight");
      expect(ins).toHaveProperty("weightSource");
    }
  });

  test("GET کاشی ناموجود → 404", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/agent/[tileId]/insight/route");
    const token = await makeSession();

    const req = new NextRequest("http://localhost/api/agent/__no_tile__/insight", { headers: authHeader(token) });
    const res = await route.GET(req, { params: Promise.resolve({ tileId: "__no_tile__" }) });
    expect(res.status).toBe(404);
  });
});

// ==========================================================================
// ۵) divar/scan — گزارش‌های اسکن از انبار
// ==========================================================================

describe("P2-03 integration — divar/scan", () => {
  test("GET → 200 + آرایه logs (حداکثر ۱۰، نزولی)", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/divar/scan/route");
    const token = await makeSession();

    const req = new NextRequest("http://localhost/api/divar/scan", { headers: authHeader(token) });
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.logs)).toBe(true);
    expect(body.logs.length).toBeLessThanOrEqual(10);
    // نزولی بودن startedAt
    for (let i = 1; i < body.logs.length; i++) {
      expect(new Date(body.logs[i - 1].startedAt).getTime()).toBeGreaterThanOrEqual(new Date(body.logs[i].startedAt).getTime());
    }
  });

  test("GET بدون نشست → 401", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/divar/scan/route");
    const req = new NextRequest("http://localhost/api/divar/scan");
    const res = await route.GET(req);
    expect(res.status).toBe(401);
  });
});

// ==========================================================================
// خلوص — هیچ فایل روتی db را مستقیم import نمی‌کند (سطح سورس)
// ==========================================================================

describe("P2-03 — خلوص import روت‌ها", () => {
  test("هیچ route.ts در src/app/api از @/lib/db یا @prisma/client import نمی‌کند", async () => {
    const { readdir } = await import("fs/promises");
    const { join } = await import("path");

    async function* walk(dir: string): AsyncGenerator<string> {
      for (const ent of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) yield* walk(p);
        else if (ent.name === "route.ts") yield p;
      }
    }

    let violations = 0;
    let checked = 0;
    for await (const file of walk("src/app/api")) {
      checked++;
      const src = await Bun.file(file).text();
      if (/from\s+['"]@\/lib\/db['"]/.test(src) || /from\s+['"]@prisma\/client['"]/.test(src)) {
        console.error(`نقض: ${file}`);
        violations++;
      }
    }
    expect(checked).toBeGreaterThan(20); // پوشش واقعی، نه خالی
    expect(violations).toBe(0);
  });
});
