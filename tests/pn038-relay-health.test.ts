/**
 * تست پایش ۲۴ ساعتهٔ رله (PN-038 · فاز ۴ — شورا-ن۰۶۳)
 * ------------------------------------------------------
 * پوشش:
 *   A) computeRelayHealth — سه لایه + حکم‌ها (سناریوهای سبز/زرد/قرمز)
 *   B) کار Worker relay-health-check — رجیستری + فاصلهٔ ۵ دقیقه + شاهد AuditLog
 *   C) روت GET /api/relay/health — مرز نشست
 *   D) RelayStatusCard — سورس + قرارگیری در هوم
 */

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..");
const { db } = await import("@/lib/db");

const S = "pn038rh";
const createdSessions: string[] = [];

beforeAll(async () => {
  await db.relayQueue.deleteMany({ where: { source: S } }).catch(() => undefined);
  await db.auditLog.deleteMany({ where: { actor: "worker:relay-health-check", detail: { contains: S } } }).catch(() => undefined);
});

afterAll(async () => {
  await db.relayQueue.deleteMany({ where: { source: S } }).catch(() => undefined);
  const { createHash } = await import("node:crypto");
  for (const t of createdSessions) {
    await db.session.deleteMany({ where: { tokenHash: createHash("sha256").update(t).digest("hex") } }).catch(() => undefined);
  }
  await db.$disconnect();
});

describe("PN-038/A — computeRelayHealth سه‌لایه", () => {
  test("A-1 ساختار: سه لایه با کلیدهای عقدی + حکم معتبر", async () => {
    const { computeRelayHealth } = await import("@/lib/relay/health");
    const r = await computeRelayHealth();
    expect(r.layers.map((l) => l.key)).toEqual(["heartbeat", "api-probe", "full-sync"]);
    for (const l of r.layers) {
      expect(["green", "yellow", "red"]).toContain(l.state);
      expect(l.detail.length).toBeGreaterThan(0);
    }
    expect(["green", "yellow", "red"]).toContain(r.verdict);
    expect(r.verdictFa.length).toBeGreaterThan(0);
  });

  test("A-2 سناریو: کار موفق تازه → لایهٔ فعالیت سبز", async () => {
    await db.relayQueue.create({
      data: {
        method: "GET", url: `https://x.example/${S}`, status: "done", fingerprint: `fp-${S}-1`,
        enqueuedAt: new Date(), dispatchedAt: new Date(), completedAt: new Date(), source: S,
      },
    });
    const { computeRelayHealth } = await import("@/lib/relay/health");
    const r = await computeRelayHealth();
    const activity = r.layers.find((l) => l.key === "api-probe")!;
    expect(activity.state).toBe("green");
    expect(activity.detail).toContain("کار موفق"); // عدد فارسی/لاتین بسته به شمارش
    // نبض هم با completedAt تازه سبز می‌شود (سرچشمهٔ نبض = فعالیت صف)
    const heartbeat = r.layers.find((l) => l.key === "heartbeat")!;
    expect(heartbeat.state).toBe("green");
  });

  test("A-3 حکم قرمز فقط وقتی نبض مرده + صف ساکت — سورس عقدی", async () => {
    const src = readFileSync(join(REPO, "src/lib/relay/health.ts"), "utf8");
    expect(src).toContain('heartbeat.state === "red" && activity.state === "red"');
    expect(src).toContain("HEARTBEAT_WINDOW_MS");
    expect(src).toContain("ACTIVITY_WINDOW_MS");
  });
});

describe("PN-038/B — کار Worker relay-health-check", () => {
  test("B-1 رجیستری: شناسه + فاصلهٔ ۵ دقیقه + نخستین اجرا < ۱ دقیقه", async () => {
    const { buildWorkerJobs, WORKER_JOB_IDS } = await import("@/core/runtime/jobs");
    const jobs = buildWorkerJobs(null as never);
    const j = jobs.find((x) => x.id === WORKER_JOB_IDS.relayHealthCheck);
    expect(j).toBeDefined();
    expect(j!.intervalMs).toBe(5 * 60_000);
    expect(j!.firstRunDelayMs).toBeLessThan(60_000);
  });

  test("B-2 اجرای کار: گزارش + شاهد AuditLog(action=RELAY_HEALTH) + فایل شاهد", async () => {
    const { runRelayHealthCheckJob } = await import("@/lib/relay/health");
    const r = await runRelayHealthCheckJob();
    expect(r).toBeDefined();
    expect(r!.verdict).toBeTruthy();
    const last = await db.auditLog.findFirst({ where: { action: "RELAY_HEALTH", actor: "worker:relay-health-check" }, orderBy: { createdAt: "desc" } });
    expect(last).not.toBeNull();
    expect(existsSync(join(REPO, "upload/.runtime/relay-health.json"))).toBe(true);
  });
});

describe("PN-038/C — روت GET /api/relay/health", () => {
  test("C-1 بدون نشست → 401", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/relay/health/route");
    const res = await route.GET(new NextRequest("http://localhost/api/relay/health"));
    expect(res.status).toBe(401);
  });

  test("C-2 با نشست → 200 + سه لایه", async () => {
    const { NextRequest } = await import("next/server");
    const { createSession } = await import("@/lib/auth/session");
    const route = await import("@/app/api/relay/health/route");
    const { token } = await createSession({ personnelCode: "410031320", displayName: "مالک تست", role: "OWNER" }, { ip: "127.0.0.1" }, null);
    createdSessions.push(token);
    const res = await route.GET(new NextRequest("http://localhost/api/relay/health", { headers: { authorization: `Bearer ${token}` } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; verdict: string; layers: Array<{ key: string }> };
    expect(body.ok).toBe(true);
    expect(body.layers.map((l) => l.key)).toEqual(["heartbeat", "api-probe", "full-sync"]);
  });
});

describe("PN-038/D — RelayStatusCard در UI", () => {
  test("D-1 سورس کارت — سه‌نقطه + حکم + سنجش دوره‌ای", () => {
    const src = readFileSync(join(REPO, "src/components/app/RelayStatusCard.tsx"), "utf8");
    expect(src).toContain("relay-status-card");
    expect(src).toContain("🟢");
    expect(src).toContain("🟡");
    expect(src).toContain("🔴");
    expect(src).toContain("/api/relay/health");
    expect(src).toContain("60_000");
  });

  test("D-2 قرارگیری در هوم — زیر نشانگرهای اتصال", () => {
    const src = readFileSync(join(REPO, "src/components/app/DashboardHome.tsx"), "utf8");
    expect(src).toContain("<ConnectionIndicators />");
    expect(src).toContain("<RelayStatusCard />");
    expect(src.indexOf("<RelayStatusCard />")).toBeGreaterThan(src.indexOf("<ConnectionIndicators />"));
  });
});
