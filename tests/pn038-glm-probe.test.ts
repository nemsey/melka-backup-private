/**
 * تست حالت پروب GLM (PN-038 · فاز ۳ — شورا-ن۰۶۳)
 * ------------------------------------------------------
 * پوشش:
 *   A) مدل GlmProbe — جدول + شاخص‌ها + اسکیمای متوازن
 *   B) runGlmProbe — چرخهٔ queued→running→done/failed + شاهد AuditLog + راز×۰
 *   C) روت /api/glm/probe — مرز OWNER (۴۰۱ بدون نشست · ۲۰۰ با مالک) + GET فهرست
 *   D) CLI melka-debug — probe/status (خروجی ساختاری)
 *   E) پشتیبان کش رله — گزارش تازگی وقتی مسیر مستقیم مسدود است
 */

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..");
const { db } = await import("@/lib/db");

const createdProbes: string[] = [];
const createdSessions: string[] = [];

beforeAll(async () => {
  await db.glmProbe.deleteMany({ where: { label: { startsWith: "pn038-test" } } }).catch(() => undefined);
});

afterAll(async () => {
  await db.glmProbe.deleteMany({ where: { id: { in: createdProbes } } }).catch(() => undefined);
  const { createHash } = await import("node:crypto");
  for (const t of createdSessions) {
    await db.session.deleteMany({ where: { tokenHash: createHash("sha256").update(t).digest("hex") } }).catch(() => undefined);
  }
  await db.$disconnect();
});

describe("PN-038/A — مدل GlmProbe", () => {
  test("A-1 جدول + ستون‌های عقدی در اسکیما", () => {
    const schema = readFileSync(join(REPO, "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model GlmProbe");
    expect(schema).toMatch(/label\s+String/);
    expect(schema).toMatch(/status\s+String\s+@default\("queued"\)/);
    expect(schema).toContain("PN-038/فاز ۳");
  });

  test("A-2 جدول در DB تست واقعاً وجود دارد (push شده)", async () => {
    const rows = await db.glmProbe.findMany({ take: 1 });
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe("PN-038/B — runGlmProbe: چرخهٔ شاهددار", () => {
  test("B-1 health: done در چند میلی‌ثانیه + ردیف کامل", async () => {
    const { runGlmProbe } = await import("@/lib/glm/probe");
    const r = await runGlmProbe("pn038-test-health", "health");
    createdProbes.push(r.probeId);
    expect(r.status).toBe("done");
    expect(r.result.ok).toBe(true);
    expect(r.result.via).toBe("local-health");
    const row = await db.glmProbe.findUnique({ where: { id: r.probeId } });
    expect(row?.status).toBe("done");
    expect(row?.durationMs).toBeLessThan(5_000);
    expect(row?.resultJson).toContain("\"via\"");
  });

  test("B-2 شکست مستقیم = ردیف failed + گزارش relayCache (enums-persian)", async () => {
    const { runGlmProbe } = await import("@/lib/glm/probe");
    const r = await runGlmProbe("pn038-test-enums", "enums-persian");
    createdProbes.push(r.probeId);
    // مسیر مستقیم در محیط تست معمولاً مسدود است — شکستِ صادقانه هم شاهد است
    expect(["done", "failed"]).toContain(r.status);
    if (r.status === "failed") {
      expect(r.result.error).toBeTruthy();
      // پشتیبان کش رله گزارش می‌شود (حتی تهی اگر کش خالی باشد)
      expect(r.result).toHaveProperty("relayCache");
    }
    const row = await db.glmProbe.findUnique({ where: { id: r.probeId } });
    expect(row?.status).toBe(r.status);
  });

  test("B-3 شاهد AuditLog ثبت می‌شود + صفر راز", async () => {
    const last = await db.auditLog.findFirst({ where: { action: "GLM_PROBE", detail: { contains: "pn038-test-health" } }, orderBy: { createdAt: "desc" } });
    expect(last).not.toBeNull();
    // قانون لاگ: نه توکن، نه راز — فقط برچسب/هدف/وضعیت
    const d = last!.detail ?? "";
    expect(d).not.toMatch(/token|secret|bearer/i);
  });
});

describe("PN-038/C — روت /api/glm/probe", () => {
  test("C-1 بدون نشست → 401", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/glm/probe/route");
    const res = await route.POST(new NextRequest("http://localhost/api/glm/probe", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  test("C-2 با نشست مالک → 200 + probeId + ردیف", async () => {
    const { NextRequest } = await import("next/server");
    const { createSession } = await import("@/lib/auth/session");
    const route = await import("@/app/api/glm/probe/route");
    const { token } = await createSession({ personnelCode: "410031320", displayName: "مالک تست", role: "OWNER" }, { ip: "127.0.0.1" }, null);
    createdSessions.push(token);
    const res = await route.POST(
      new NextRequest("http://localhost/api/glm/probe", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: "pn038-test-route", target: "health" }),
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; probeId: string; status: string };
    expect(body.ok).toBe(true);
    expect(body.probeId).toBeTruthy();
    expect(body.status).toBe("done");
    createdProbes.push(body.probeId);
  });

  test("C-3 GET → فهرست پروب‌های اخیر + اهداف مجاز", async () => {
    const { NextRequest } = await import("next/server");
    const { createSession } = await import("@/lib/auth/session");
    const route = await import("@/app/api/glm/probe/route");
    const { token } = await createSession({ personnelCode: "410031320", displayName: "مالک تست", role: "OWNER" }, { ip: "127.0.0.1" }, null);
    createdSessions.push(token);
    const res = await route.GET(new NextRequest("http://localhost/api/glm/probe?limit=5", { headers: { authorization: `Bearer ${token}` } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; targets: string[]; probes: Array<{ id: string }> };
    expect(body.ok).toBe(true);
    expect(body.targets).toContain("enums-persian");
    expect(body.probes.length).toBeGreaterThanOrEqual(1);
  });

  test("C-4 سورس روت — مرز OWNER + بدون راز", async () => {
    const src = readFileSync(join(REPO, "src/app/api/glm/probe/route.ts"), "utf8");
    expect(src).toContain('requireRole(request, "OWNER"');
    expect(src).not.toMatch(/MELK_PROXY_SECRET|TOKEN_KEY/);
  });
});

describe("PN-038/D — CLI melka-debug", () => {
  test("D-1 فایل CLI موجود + دستورات probe/probes/status", () => {
    const src = readFileSync(join(REPO, "scripts/melka-debug.ts"), "utf8");
    expect(src).toContain('"probe"');
    expect(src).toContain('"probes"');
    expect(src).toContain('"status"');
    expect(src).toContain("melka-debug probe");
  });

  test("D-2 اجرای status — خروجی JSON ساختاری", () => {
    const p = Bun.spawnSync(["bun", join(REPO, "scripts/melka-debug.ts"), "status"], { stdout: "pipe", stderr: "pipe" });
    expect(p.exitCode).toBe(0);
    const j = JSON.parse(p.stdout.toString()) as { ok: boolean; health: { alive: boolean }; relay: { devices: number }; counts: Record<string, number> };
    expect(j.ok).toBe(true);
    expect(j.health.alive).toBe(true);
    expect(j.counts.property).toBeGreaterThanOrEqual(0);
  });
});

describe("PN-038/E — پشتیبان کش رله", () => {
  test("E-1 relayCacheFallback: تازگی کش مرجع گزارش می‌شود (خواندن از RefListCache)", async () => {
    // فراخوانی مستقیم تابع داخلی از مسیر عمومی — از executeGlmProbe با هدف enums
    const { executeGlmProbe } = await import("@/lib/glm/probe");
    const r = await executeGlmProbe("enums-persian");
    expect(r.target).toBe("enums-persian");
    // هر نتیجه‌ای که باشد، ساختار پشتیبان گزارش شده یا مسیر مستقیم موفق بوده
    if (!r.ok) {
      expect(r.via).toBe("relay-cache");
      expect(r.relayCache).toBeDefined();
    } else {
      expect(r.via).toBe("direct-arm");
    }
  });
});
