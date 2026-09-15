/**
 * تست‌های HOTFIX-03 — OWNER-gate برای روت‌های حساس (SEC-6)
 * ------------------------------------------------------
 * روت‌های هدف:
 *   ۱) POST /api/connection/reset
 *   ۲) POST /api/pm/connection
 *   ۳) POST /api/instagram/connection
 *   ۴) POST /api/divar/scan
 *   ۵) POST /api/listings/[id]/instagram
 *   (+) POST /api/divar/connection — یکسان‌سازی با گارد استاندارد
 * پوشش:
 *  A) نقش CONSULTANT → 403 استاندارد (code=FORBIDDEN) روی همه روت‌ها
 *  B) نقش OWNER → عبور از گارد (تا مرز منطق کسب‌وکار — بدون اجرای شبکه)
 *  C) بدون نشست → 401 (قبل از بررسی نقش)
 *  D) AuditLog: رد دسترسی با personnelCode و مسیر ثبت می‌شود
 */

import { describe, expect, test, afterAll } from "bun:test";
import { createHash } from "crypto";

const { db } = await import("@/lib/db");

const created: string[] = [];
async function makeSession(role: "OWNER" | "CONSULTANT") {
  const { createSession } = await import("@/lib/auth/session");
  const code = role === "OWNER" ? "920001" : "920002";
  const { token } = await createSession(
    { personnelCode: code, displayName: `تست ${role}`, role },
    { ip: "127.0.0.1" },
    null
  );
  created.push(token);
  return { token, code };
}

function post(token: string, url: string) {
  return new Request(url, { method: "POST", headers: { authorization: `Bearer ${token}` } });
}

afterAll(async () => {
  for (const t of created) {
    await db.session.deleteMany({ where: { tokenHash: createHash("sha256").update(t).digest("hex") } }).catch(() => undefined);
  }
  await db.auditLog.deleteMany({ where: { actor: { in: ["920001", "920002"] } } }).catch(() => undefined);
  await db.$disconnect();
});

const ROUTES: { name: string; url: string; importPath: string; ownerHitsLogic: (res: Response) => Promise<void> }[] = [
  {
    name: "POST /api/connection/reset",
    url: "http://localhost/api/connection/reset",
    importPath: "@/app/api/connection/reset/route",
    // OWNER با withData=false → فقط revoke + provider reset (بدون شبکه)
    ownerHitsLogic: async (res) => {
      expect(res.status).toBe(200);
    },
  },
  {
    name: "POST /api/pm/connection",
    url: "http://localhost/api/pm/connection",
    importPath: "@/app/api/pm/connection/route",
    // OWNER با action نامعتبر → 400 از منطق (یعنی از گارد عبور کرده)
    ownerHitsLogic: async (res) => {
      expect(res.status).toBe(400);
    },
  },
  {
    name: "POST /api/instagram/connection",
    url: "http://localhost/api/instagram/connection",
    importPath: "@/app/api/instagram/connection/route",
    ownerHitsLogic: async (res) => {
      expect(res.status).toBe(400); // action نامعتبر
    },
  },
  {
    name: "POST /api/divar/connection",
    url: "http://localhost/api/divar/connection",
    importPath: "@/app/api/divar/connection/route",
    ownerHitsLogic: async (res) => {
      expect(res.status).toBe(400); // action نامعتبر
    },
  },
  {
    name: "POST /api/listings/[id]/instagram",
    url: "http://localhost/api/listings/test-id/instagram",
    importPath: "@/app/api/listings/[id]/instagram/route",
    ownerHitsLogic: async (res) => {
      // OWNER عبور می‌کند؛ فایل test-id وجود ندارد → 404 (نه 403)
      expect(res.status).toBe(404);
    },
  },
];

describe("HOTFIX-03 — OWNER-gate روت‌های حساس", () => {
  for (const r of ROUTES) {
    test(`CONSULTANT → 403 روی ${r.name}`, async () => {
      const { NextRequest } = await import("next/server");
      const c = await makeSession("CONSULTANT");
      const route = await import(r.importPath);
      const req = new NextRequest(post(c.token, r.url));
      const res = await route.POST(req, { params: Promise.resolve({ id: "test-id", token: "t" }) } as never);
      expect(res.status).toBe(403);
      const body = (await res.json()) as { ok: boolean; code: string; message: string };
      expect(body.ok).toBe(false);
      expect(body.code).toBe("FORBIDDEN");
      expect(body.message).toContain("OWNER");
    });

    test(`OWNER → عبور از گارد روی ${r.name}`, async () => {
      const { NextRequest } = await import("next/server");
      const o = await makeSession("OWNER");
      const route = await import(r.importPath);
      const body = r.name.includes("connection/reset") ? JSON.stringify({ withData: false }) : JSON.stringify({ action: "invalid-action" });
      const req = new NextRequest(post(o.token, r.url), { body } as never);
      const res = await route.POST(req, { params: Promise.resolve({ id: "test-id", token: "t" }) } as never);
      await r.ownerHitsLogic(res);
    });
  }

  test("بدون نشست → 401 (قبل از بررسی نقش)", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/pm/connection/route");
    const req = new NextRequest(post("nonexistent-token-0000000000000000", "http://localhost/api/pm/connection"));
    const res = await route.POST(req);
    expect(res.status).toBe(401);
  });

  test("AuditLog: رد دسترسی CONSULTANT با personnelCode و مسیر ثبت شد", async () => {
    const denials = await db.auditLog.findMany({
      where: { action: "ACCESS_DENIED", actor: "920002" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    expect(denials.length).toBeGreaterThanOrEqual(5);
    const routes = denials.map((d) => d.detail ?? "");
    for (const expected of [
      "POST /api/connection/reset",
      "POST /api/pm/connection",
      "POST /api/instagram/connection",
      "POST /api/divar/connection",
      "POST /api/listings/[id]/instagram",
    ]) {
      expect(routes.some((x) => x.includes(expected))).toBe(true);
    }
  });

  test(" divar/scan POST: CONSULTANT → 403 بدون اجرای اسکن (بدون رکورد DivarScanLog جدید)", async () => {
    const { NextRequest } = await import("next/server");
    const before = await db.divarScanLog.count();
    const c = await makeSession("CONSULTANT");
    const route = await import("@/app/api/divar/scan/route");
    const req = new NextRequest(post(c.token, "http://localhost/api/divar/scan"));
    const res = await route.POST(req);
    expect(res.status).toBe(403);
    const after = await db.divarScanLog.count();
    expect(after).toBe(before); // اسکن اجرا نشد
  });
});
