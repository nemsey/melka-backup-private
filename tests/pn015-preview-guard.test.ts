// ============================================================
// PN-015 / K2 — گارد تازگی نسخهٔ preview (Preview Stale)
// سه سناریو با واکشوندهٔ تزریقی: تازه / کهنه / قطع — بدون شبکهٔ واقعی.
// ============================================================
import { describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { runPreviewGuard, previewUrl } from "@/core/runtime/guards";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/test-repository.db" } } });

function fakeFetch(status: number, body?: unknown) {
  return async (): Promise<Response> =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }) as Response;
}

describe("PN-015/K2 — runPreviewGuard", () => {
  test("۱: preview تازه (دامنه = HEAD محلی) — PASS بدون هشدار", async () => {
    const r = await runPreviewGuard(db, { fetcher: fakeFetch(200, { buildId: "b-1", fingerprint: { gitShortSha: "abc1234" } }), head: "abc1234" });
    expect(r.status).toBe("PASS");
    expect(r.remoteGitSha).toBe("abc1234");
    expect(r.http).toBe(200);
  });

  test("۲: preview کهنه (دامنه ≠ HEAD) — STALE + رد INFRA_ALERT در AuditLog", async () => {
    const before = await db.auditLog.count({ where: { action: "INFRA_ALERT", actor: "worker:preview-guard" } });
    const r = await runPreviewGuard(db, { fetcher: fakeFetch(200, { buildId: "old-1", fingerprint: { gitShortSha: "old0000" } }), head: "new1111" });
    expect(r.status).toBe("STALE");
    expect(r.message).toContain("old0000");
    expect(r.message).toContain("new1111");
    const after = await db.auditLog.count({ where: { action: "INFRA_ALERT", actor: "worker:preview-guard" } });
    expect(after).toBe(before + 1);
  });

  test("۳: دامنه پایین (500) — ERROR + هشدار (نه استثنا)", async () => {
    const r = await runPreviewGuard(db, { fetcher: fakeFetch(503), head: "abc1234" });
    expect(r.status).toBe("ERROR");
    expect(r.http).toBe(503);
  });

  test("۴: شکست شبکه — ERROR بی‌استثنا (قضاوت به چرخهٔ بعد)", async () => {
    const r = await runPreviewGuard(db, {
      fetcher: async () => { throw new Error("network down"); },
      head: "abc1234",
    });
    expect(r.status).toBe("ERROR");
    expect(r.message).toContain("network down");
  });

  test("۵: ثبت در رجیستری Worker با شناسه و فاصلهٔ درست + خاموشی با env", async () => {
    const { buildWorkerJobs, WORKER_JOB_IDS } = await import("@/core/runtime/jobs");
    const jobs = buildWorkerJobs(null as never);
    const pg = jobs.find((j) => j.id === WORKER_JOB_IDS.previewGuard);
    expect(pg).toBeDefined();
    expect(pg!.intervalMs).toBe(15 * 60_000);
    const p = process.env.MELK_PREVIEW_GUARD;
    process.env.MELK_PREVIEW_GUARD = "disabled";
    try {
      const off = buildWorkerJobs(null as never);
      expect(off.find((j) => j.id === WORKER_JOB_IDS.previewGuard)).toBeUndefined();
    } finally {
      delete process.env.MELK_PREVIEW_GUARD;
      if (p !== undefined) process.env.MELK_PREVIEW_GUARD = p;
    }
  });

  test("۶: URL پیش‌فرض دامنهٔ مستند پروژه است و env آن را override می‌کند", () => {
    expect(previewUrl()).toContain("space-z.ai");
    const prev = process.env.MELKA_PREVIEW_URL;
    process.env.MELKA_PREVIEW_URL = "https://example.org/x/";
    try {
      expect(previewUrl()).toBe("https://example.org/x");
    } finally {
      delete process.env.MELKA_PREVIEW_URL;
      if (prev !== undefined) process.env.MELKA_PREVIEW_URL = prev;
    }
  });
});
