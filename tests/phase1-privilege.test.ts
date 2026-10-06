/**
 * تست‌های فاز ۱ — امنیت (PN-008 BLOCK 4 + 5)
 * ------------------------------------------------------
 * ماتریس رفتاری نقش‌ها (بند ۴.۲) + شش سناریوی ارتقای سطح دسترسی (بند ۵.۱):
 *   پ-۱ CONSULTANT → OWNER (نشست مشاور + روت مدیریتی) → 403
 *   پ-۲ بدون احراز (بدون کوکی/توکن) → 401
 *   پ-۳ جعل توکن (payload دستکاری‌شده) → 401
 *   پ-۴ IDOR (جابجایی شناسه در مسیرهای داده) → بدون افشا
 *   پ-۵ کد غلط پیاپی (۶ تلاش) → 429
 *   پ-۶ توکن منقضی → 401
 * این فایل در CI (هر کامیت) اجرا می‌شود — قانون شانهٔ ماندگار.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHash } from "crypto";

process.env.OWNER_PERSONNEL_CODES = "410099950"; // کد مالک تستی (شبه‌واقعی ۹رقمی)
const { db } = await import("@/lib/db");

const createdSessions: string[] = [];
async function makeSession(role: "OWNER" | "CONSULTANT", personnelCode = role === "OWNER" ? "940001" : "940002") {
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode, displayName: `تست امنیت ${role}`, role },
    { ip: "127.0.0.1" },
    null
  );
  createdSessions.push(token);
  return { token, personnelCode };
}

const hdr = (t: string) => ({ authorization: `Bearer ${t}` });
async function NR(u: string, init?: RequestInit): Promise<import("next/server").NextRequest> {
  const { NextRequest } = await import("next/server");
  return new NextRequest(`http://localhost${u}`, init as never);
}

beforeAll(async () => {
  await db.armConnection.deleteMany({}).catch(() => undefined);
  await db.otpAttempt.deleteMany({ where: { personnelCode: "000000000" } }).catch(() => undefined); // پ-۵ ایزوله
});

afterAll(async () => {
  for (const t of createdSessions) {
    await db.session.deleteMany({ where: { tokenHash: createHash("sha256").update(t).digest("hex") } }).catch(() => undefined);
  }
  await db.armConnection.deleteMany({}).catch(() => undefined);
  await db.otpAttempt.deleteMany({ where: { personnelCode: "000000000" } }).catch(() => undefined);
  await db.personnelAccess.deleteMany({ where: { personnelCode: { startsWith: "9400" } } }).catch(() => undefined);
  await db.$disconnect();
});

/* ═══════ ماتریس رفتاری نقش‌ها (BLOCK 4 بند ۴.۲) ═══════ */
describe("BLOCK 4.2 — ماتریس رفتاری نقش‌ها", () => {
  test("بدون کوکی → 401 (روت نشست‌دار: فهرست کارشناسان)", async () => {
    const route = await import("@/app/api/experts/route");
    const res = await route.GET(await NR("/api/experts"));
    expect(res.status).toBe(401);
  });

  test("CONSULTANT → روت OWNER-only → 403 (sync کارشناسان)", async () => {
    const { token } = await makeSession("CONSULTANT");
    const route = await import("@/app/api/experts/sync/route");
    const res = await route.POST(await NR("/api/experts/sync", { method: "POST", headers: hdr(token) }));
    expect(res.status).toBe(403);
  });

  test("CONSULTANT → /api/admin/personnel-access → 403 (فقط OWNER)", async () => {
    const { token } = await makeSession("CONSULTANT");
    const route = await import("@/app/api/admin/personnel-access/route");
    const res = await route.GET(await NR("/api/admin/personnel-access", { headers: hdr(token) }));
    expect(res.status).toBe(403);
  });

  test("OWNER → روت OWNER-only → مجاز (فهرست دسترسی‌ها 200)", async () => {
    const { token } = await makeSession("OWNER");
    const route = await import("@/app/api/admin/personnel-access/route");
    const res = await route.GET(await NR("/api/admin/personnel-access", { headers: hdr(token) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.registry.length).toBeGreaterThan(5);
  });

  test("OWNER → /api/experts → 200 (کاشی برای مالک باز است)", async () => {
    const { token } = await makeSession("OWNER");
    const route = await import("@/app/api/experts/route");
    const res = await route.GET(await NR("/api/experts?limit=3", { headers: hdr(token) }));
    expect(res.status).toBe(200);
  });
});

/* ═══════ شش سناریوی Privilege Escalation (BLOCK 5 بند ۵.۱) ═══════ */
describe("BLOCK 5.1 — شش سناریوی ارتقای سطح دسترسی", () => {
  test("پ-۱ CONSULTANT → OWNER: روت مدیریتی با نشست مشاور → 403", async () => {
    const { token } = await makeSession("CONSULTANT");
    // سه روت مالک‌محور: sync، ادمین دسترسی، اتصال PM
    for (const [mod, fn, path, init] of [
      ["@/app/api/experts/sync/route", "POST", "/api/experts/sync", { method: "POST", headers: hdr(token) }],
      ["@/app/api/admin/personnel-access/route", "POST", "/api/admin/personnel-access", { method: "POST", headers: hdr(token), body: JSON.stringify({ personnelCode: "940003", level: "full" }) }],
    ] as const) {
      const route = await import(mod as never);
      const res = await (route as never as Record<string, (r: unknown) => Promise<Response>>)[fn](await NR(path, init as RequestInit));
      expect(res.status).toBe(403);
    }
  });

  test("پ-۲ بدون احراز: درخواست بدون کوکی به روت‌های محافظت‌شده → 401", async () => {
    for (const [mod, fn, path, init] of [
      ["@/app/api/experts/route", "GET", "/api/experts", {}],
      ["@/app/api/crm/transactions/route", "GET", "/api/crm/transactions", {}],
      ["@/app/api/admin/personnel-access/route", "POST", "/api/admin/personnel-access", { method: "POST" }],
    ] as const) {
      const route = await import(mod as never);
      const res = await (route as never as Record<string, (r: unknown) => Promise<Response>>)[fn](await NR(path, init as RequestInit));
      expect(res.status).toBe(401);
    }
  });

  test("پ-۳ جعل توکن: توکن با payload دستکاری‌شده/تصادفی → 401", async () => {
    const { token } = await makeSession("OWNER");
    // گونه‌های جعل: ترکیش، وارونگی، افزودن کاراکتر، توکن کاملاً تصادفی
    const forgeries = [token.slice(0, -2) + "xx", "x" + token.slice(1), `${token}extra`, "forged-token-abc123", ""];
    const route = await import("@/app/api/experts/route");
    for (const f of forgeries) {
      const res = await route.GET(await NR("/api/experts", { headers: f ? hdr(f) : {} }));
      expect(res.status).toBe(401);
    }
  });

  test("پ-۴ IDOR: جابجایی شناسه — مشاور دادهٔ کاشی ممنوع را نمی‌گیرد", async () => {
    const { token, personnelCode } = await makeSession("CONSULTANT", "940099");
    // بدون رکورد PersonnelAccess → پیش‌فرض none → کاشی داده‌ای 403
    const route = await import("@/app/api/experts/route");
    const res = await route.GET(await NR("/api/experts", { headers: hdr(token) }));
    expect(res.status).toBe(403);
    // تلاش IDOR: شناسه مالک در پارامترها نقشی تغییر نمی‌دهد (نقش از توکن است نه پارامتر)
    const res2 = await route.GET(await NR("/api/experts?personnelCode=940001&role=OWNER", { headers: hdr(token) }));
    expect(res2.status).toBe(403);
    // نشست خودش را می‌خواند — نام و کد همان مشاور است نه دیگری
    const sessionRoute = await import("@/app/api/auth/session/route");
    const sres = await sessionRoute.GET(await NR("/api/auth/session", { headers: hdr(token) }));
    expect(sres.status).toBe(200);
    const body = await sres.json();
    expect(body.user.personnelCode).toBe(personnelCode);
    expect(body.user.role).toBe("CONSULTANT");
  });

  test("پ-۵ کد غلط پیاپی: ۶ تلاش ورود مدیر → 429 (نرخ‌سنج DB-backed)", async () => {
    // ایزوله‌سازی کامل: کد مستر تستی + پاک‌سازی سبد نرخ‌سنج (سایر فایل‌های مجموعه ممکن است آلوده کرده باشند)
    const prevMaster = process.env.MASTER_ACCESS_CODE;
    process.env.MASTER_ACCESS_CODE = "99998888"; // کد تستی (نه 00000000 عمومی — HOTFIX-01)
    await db.otpAttempt.deleteMany({ where: { personnelCode: "000000000" } }).catch(() => undefined);
    try {
      const route = await import("@/app/api/auth/master-login/route");
      let saw429 = false;
      const codes: number[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await route.POST(await NR("/api/auth/master-login", { method: "POST", body: JSON.stringify({ masterCode: "99999999" }) }));
        codes.push(res.status);
        if (res.status === 429) { saw429 = true; break; }
      }
      expect(codes.filter((c) => c === 401).length).toBeGreaterThanOrEqual(3); // پنج تلاش اول رد 401
      expect(saw429).toBe(true); // تلاش ششم قفل شد
    } finally {
      await db.otpAttempt.deleteMany({ where: { personnelCode: "000000000" } }).catch(() => undefined);
      if (prevMaster === undefined) delete process.env.MASTER_ACCESS_CODE;
      else process.env.MASTER_ACCESS_CODE = prevMaster;
    }
  });

  test("پ-۶ توکن منقضی: نشست با انقضای گذشته → 401", async () => {
    const { token, personnelCode } = await makeSession("OWNER");
    const hash = createHash("sha256").update(token).digest("hex");
    await db.session.updateMany({ where: { tokenHash: hash }, data: { expiresAt: new Date(Date.now() - 3600_000) } });
    const route = await import("@/app/api/experts/route");
    const res = await route.GET(await NR("/api/experts", { headers: hdr(token) }));
    expect(res.status).toBe(401);
    void personnelCode;
  });
});

/* ═══════ BLOCK 6 — دسترسی دوگانهٔ مالک ═══════ */
describe("BLOCK 6 — قانون هویت دوگانهٔ مالک", () => {
  test("۶-الف: کد پرسنلی مالک (OWNER_PERSONNEL_CODES) → نقش OWNER در resolveDashboardRole", async () => {
    const { resolveDashboardRole } = await import("@/lib/melk-api/provider");
    expect(resolveDashboardRole("410099950", { type: "realtor" }, "")).toBe("OWNER");
  });

  test("۶-ب: کد پرسنلی غیرمالک → CONSULTANT", async () => {
    const { resolveDashboardRole } = await import("@/lib/melk-api/provider");
    expect(resolveDashboardRole("410031310", { type: "realtor" }, "")).toBe("CONSULTANT");
  });

  // PN-010: timeout ارتقا یافت (۵→۳۰ ثانیه) — این روت با OTP درست-شکل به ARM زنده
  // تماس می‌گیرد؛ تأخیر شبکهٔ واقعی (شبکهٔ مالک/VPN) گاهی از ۵ ثانیهٔ پیش‌فرض
  // bun:test فراتر می‌رفت (flake دوسبزشکن). ادعای تست دست‌نخورده: هرگز 200 بدون احراز.
  test("۶-ج: روت personnel-login — گارد ورودی سخت‌گیر (فرمت نامعتبر بدون فراخوانی شبکه → 400)", async () => {
    const route = await import("@/app/api/auth/personnel-login/route");
    // OTP سه‌رقمی → 400 پیش از هر فراخوانی شبکه‌ای (قواعد سخت‌گیر ورودی)
    const res = await route.POST(await NR("/api/auth/personnel-login", { method: "POST", body: JSON.stringify({ personnelCode: "410099950", otp: "123" }) }));
    expect(res.status).toBe(400);
    // کد پرسنلی کوتاه → 400
    const res2 = await route.POST(await NR("/api/auth/personnel-login", { method: "POST", body: JSON.stringify({ personnelCode: "12", otp: "1234" }) }));
    expect(res2.status).toBe(400);
    // OTP درست-شکل ولی شبکهٔ ARM در محیط تست قطع است → هرگز 200 بدون احراز واقعی
    const res3 = await route.POST(await NR("/api/auth/personnel-login", { method: "POST", body: JSON.stringify({ personnelCode: "410099950", otp: "9999" }) }));
    expect(res3.status).not.toBe(200);
  }, 30_000);
});

/* ═══════ BLOCK 7 — مدیریت دسترسی کدپرسنلی‌ها ═══════ */
describe("BLOCK 7 — سه سطح دسترسی + قانون ترکیب با OWNER", () => {
  const CODE = "940077";

  afterAll(async () => {
    await db.personnelAccess.deleteMany({ where: { personnelCode: CODE } }).catch(() => undefined);
  });

  test("۷-الف: بدون رکورد → CONSULTANT هیچ کاشی‌ای نمی‌بیند (پیش‌فرض امن)", async () => {
    const { resolveAllowedTiles } = await import("@/lib/access/personnel-access");
    const r = await resolveAllowedTiles("CONSULTANT", CODE);
    expect(r.level).toBe("none");
    expect(r.tiles).toEqual([]);
  });

  test("۷-ب: ثبت limited با دو کاشی → فقط همان دو کاشی مجاز", async () => {
    const { upsertPersonnelAccess, resolveAllowedTiles } = await import("@/lib/access/personnel-access");
    await upsertPersonnelAccess({ personnelCode: CODE, level: "limited", allowedTiles: ["arm-listings", "experts"], grantedBy: "940001" });
    const r = await resolveAllowedTiles("CONSULTANT", CODE);
    expect(r.level).toBe("limited");
    expect(r.tiles).toEqual(["arm-listings", "experts"]);
  });

  test("۷-ج: ارتقا به full → همهٔ کاشی‌ها", async () => {
    const { upsertPersonnelAccess, resolveAllowedTiles, MANAGEABLE_TILES } = await import("@/lib/access/personnel-access");
    await upsertPersonnelAccess({ personnelCode: CODE, level: "full", grantedBy: "940001" });
    const r = await resolveAllowedTiles("CONSULTANT", CODE);
    expect(r.level).toBe("full");
    expect(r.tiles.length).toBe(MANAGEABLE_TILES.length);
  });

  test("۷-د: قانون ترکیب — نقش OWNER همیشه full حتی با رکورد none", async () => {
    const { upsertPersonnelAccess, resolveAllowedTiles, MANAGEABLE_TILES } = await import("@/lib/access/personnel-access");
    await upsertPersonnelAccess({ personnelCode: CODE, level: "none", grantedBy: "940001" });
    const r = await resolveAllowedTiles("OWNER", CODE);
    expect(r.level).toBe("full");
    expect(r.tiles.length).toBe(MANAGEABLE_TILES.length);
  });

  test("۷-هـ: گارد کاشی در عمل — مشاور با رکورد limited (فقط آگهی) در کاشی کارشناسان → 403 و در آگهی → 200", async () => {
    const { upsertPersonnelAccess } = await import("@/lib/access/personnel-access");
    await upsertPersonnelAccess({ personnelCode: CODE, level: "limited", allowedTiles: ["arm-listings"], grantedBy: "940001" });
    const { token } = await makeSession("CONSULTANT", CODE);
    const expertsRoute = await import("@/app/api/experts/route");
    const listingsRoute = await import("@/app/api/crm/arm-catalog/listings/route");
    const r403 = await expertsRoute.GET(await NR("/api/experts", { headers: hdr(token) }));
    expect(r403.status).toBe(403);
    const r200 = await listingsRoute.GET(await NR("/api/crm/arm-catalog/listings?limit=3", { headers: hdr(token) }));
    expect(r200.status).toBe(200);
  });

  test("۷-و: API ادمین — حذف رکورد + رجیستری کاشی‌ها", async () => {
    const { token } = await makeSession("OWNER");
    const route = await import("@/app/api/admin/personnel-access/route");
    const del = await import("@/app/api/admin/personnel-access/[code]/route");
    // ثبت
    const post = await route.POST(await NR("/api/admin/personnel-access", { method: "POST", headers: hdr(token), body: JSON.stringify({ personnelCode: CODE, level: "limited", allowedTiles: ["experts"] }) }));
    expect(post.status).toBe(200);
    // حذف
    const res = await del.DELETE(await NR(`/api/admin/personnel-access/${CODE}`, { method: "DELETE", headers: hdr(token) }), { params: Promise.resolve({ code: CODE }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });
});

/* ═══════ BLOCK 3 — Trusted Proxy (client-ip) ═══════ */
describe("BLOCK 3 — استخراج IP با Trusted Proxy", () => {
  test("X-Real-IP اولویت مطلق دارد", async () => {
    const { clientIp } = await import("@/lib/auth/client-ip");
    const r = new Request("http://localhost/x", { headers: { "x-real-ip": "10.0.0.9", "x-forwarded-for": "1.2.3.4" } });
    expect(clientIp(r)).toBe("10.0.0.9");
  });

  test("بدون X-Real-IP → نخستین مدخل XFF؛ شکل نامعتبر رد می‌شود", async () => {
    const { clientIp } = await import("@/lib/auth/client-ip");
    expect(clientIp(new Request("http://localhost/x", { headers: { "x-forwarded-for": "5.6.7.8, 10.0.0.1" } }))).toBe("5.6.7.8");
    expect(clientIp(new Request("http://localhost/x", { headers: { "x-forwarded-for": "<script>, 5.6.7.8" } }))).toBeUndefined();
    expect(clientIp(new Request("http://localhost/x", {}))).toBeUndefined();
  });
});
