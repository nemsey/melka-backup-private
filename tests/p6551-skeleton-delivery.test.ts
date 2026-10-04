/**
 * تست‌های P6551 — بستهٔ انتقال ملکا: GET /api/skeleton/download (جلسهٔ ۰۳۹ / BLOCK 2)
 * ------------------------------------------------------
 * پوشش:
 *  A) بدون نشست → 401
 *  B) CONSULTANT → 403 استاندارد (code=FORBIDDEN)
 *  C) OWNER بدون file → فرادادهٔ بسته: ۴ فایل + md5 + حجم
 *  D) OWNER + هر چهار کلید → 200 · attachment · md5 بدنه و هدر X-Checksum-Md5 مطابق
 *  E) کلید نامعتبر و path-traversal → 400 (فهرست سفید مطلق)
 *  F) AuditLog: هر دانلود OWNER با فایل و بایت ثبت می‌شود
 */

import { describe, expect, test, afterAll } from "bun:test";
import { createHash } from "crypto";

const { db } = await import("@/lib/db");

const created: string[] = [];
async function makeSession(role: "OWNER" | "CONSULTANT") {
  const { createSession } = await import("@/lib/auth/session");
  const code = role === "OWNER" ? "920011" : "920012";
  const { token } = await createSession(
    { personnelCode: code, displayName: `تست P6551 ${role}`, role },
    { ip: "127.0.0.1" },
    null
  );
  created.push(token);
  return { token, code };
}

function get(token: string | null, url: string) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(url, { headers });
}

/** md5 مورد انتظار سه‌گانهٔ P6550 + مانیفست P6551 (شاهد مانیفست ساخت ۰۹:۳۱ امروز) */
const EXPECTED_MD5: Record<string, string> = {
  manifest: "1757c1e9f1316a39f9260921605325fc",
  skeleton: "0d01f54fc39bc3910cb9a3a2ee6f617d",
  source: "c505c50e9c22343cbcaa9c746a99405e",
  letter: "c046e0e015042c7e19fd0f3c0ce304ca",
};

afterAll(async () => {
  for (const t of created) {
    await db.session.deleteMany({ where: { tokenHash: createHash("sha256").update(t).digest("hex") } }).catch(() => undefined);
  }
  await db.auditLog.deleteMany({ where: { actor: { in: ["920011", "920012"] } } }).catch(() => undefined);
  await db.$disconnect();
});

describe("P6551 — /api/skeleton/download (بستهٔ انتقال ملکا)", () => {
  test("بدون نشست → 401", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/skeleton/download/route");
    const res = await route.GET(new NextRequest(get(null, "http://localhost/api/skeleton/download")));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("UNAUTHORIZED");
  });

  test("CONSULTANT → 403 استاندارد", async () => {
    const { NextRequest } = await import("next/server");
    const c = await makeSession("CONSULTANT");
    const route = await import("@/app/api/skeleton/download/route");
    const res = await route.GET(new NextRequest(get(c.token, "http://localhost/api/skeleton/download?file=letter")));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; code: string; message: string };
    expect(body.code).toBe("FORBIDDEN");
    expect(body.message).toContain("OWNER");
  });

  test("OWNER بدون file → فرادادهٔ ۴ فایل با md5", async () => {
    const { NextRequest } = await import("next/server");
    const o = await makeSession("OWNER");
    const route = await import("@/app/api/skeleton/download/route");
    const res = await route.GET(new NextRequest(get(o.token, "http://localhost/api/skeleton/download")));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      package: { title: string; policy: string };
      files: { key: string; size: number; md5: string; builtAt: string }[];
    };
    expect(body.ok).toBe(true);
    expect(body.package.title).toContain("بستهٔ انتقال ملکا");
    expect(body.files).toHaveLength(4);
    for (const f of body.files) {
      expect(f.md5).toBe(EXPECTED_MD5[f.key]);
      expect(f.size).toBeGreaterThan(0);
      expect(f.builtAt).toBeTruthy();
    }
  });

  for (const key of ["manifest", "skeleton", "source", "letter"] as const) {
    test(`OWNER + file=${key} → 200 · attachment · md5 مطابق`, async () => {
      const { NextRequest } = await import("next/server");
      const o = await makeSession("OWNER");
      const route = await import("@/app/api/skeleton/download/route");
      const res = await route.GET(new NextRequest(get(o.token, `http://localhost/api/skeleton/download?file=${key}`)));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/octet-stream");
      expect(res.headers.get("content-disposition")).toContain("attachment;");
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.length).toBeGreaterThan(0);
      const md5 = createHash("md5").update(buf).digest("hex");
      expect(md5).toBe(EXPECTED_MD5[key]);
      expect(res.headers.get("x-checksum-md5")).toBe(EXPECTED_MD5[key]);
      expect(res.headers.get("content-length")).toBe(String(buf.length));
    });
  }

  test("کلید نامعتبر → 400", async () => {
    const { NextRequest } = await import("next/server");
    const o = await makeSession("OWNER");
    const route = await import("@/app/api/skeleton/download/route");
    const res = await route.GET(new NextRequest(get(o.token, "http://localhost/api/skeleton/download?file=nope")));
    expect(res.status).toBe(400);
  });

  test("path-traversal → 400 (فهرست سفید مطلق)", async () => {
    const { NextRequest } = await import("next/server");
    const o = await makeSession("OWNER");
    const route = await import("@/app/api/skeleton/download/route");
    const res = await route.GET(
      new NextRequest(get(o.token, "http://localhost/api/skeleton/download?file=../../db/custom.db"))
    );
    expect(res.status).toBe(400);
  });

  test("AuditLog: دانلود OWNER ثبت می‌شود", async () => {
    const { NextRequest } = await import("next/server");
    const o = await makeSession("OWNER");
    const route = await import("@/app/api/skeleton/download/route");
    await route.GET(new NextRequest(get(o.token, "http://localhost/api/skeleton/download?file=letter")));
    const rows = await db.auditLog.findMany({
      where: { action: "SKELETON_DOWNLOAD", actor: o.code },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(rows.length).toBe(1);
    expect(rows[0].detail).toContain("file=letter");
  });
});
