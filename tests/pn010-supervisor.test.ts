/**
 * تست‌های RuntimeSupervisor — PN-010 / BLOCK 3
 * ------------------------------------------------------
 * پوشش: singleton · start (spawn تزریقی) · idempotency بر اساس ضربان ·
 * health (web/worker/jobQueue) · restart (run-request) · stop (stop-request) ·
 * سازوکار کانال وضعیت (فایل). بدون spawn واقعی — تزریق تابع جعلی.
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// PN-011 اولاً — ایزولاسیون کامل از Worker زندهٔ تولیدی:
// این تست قبلاً فایل وضعیت «واقعی» (upload/.runtime) را پشتیبان/بازنویسی می‌کرد و
// در اجرای کامل، Worker زندهٔ تولیدی وسط پنجرهٔ تست آن را بازنویسی می‌کرد (ریس
// مستند: شکست تناوبی ۳-۸). با MELKA_REPO_DIR موقت، همهٔ خواندن/نوشتن به دایرکتوری
// ایزوله می‌رود — فایل تولیدی هرگز لمس نمی‌شود.
const ISOLATED_REPO = mkdtempSync(join(tmpdir(), "pn010-supervisor-"));
process.env.MELKA_REPO_DIR = ISOLATED_REPO;

const { db } = await import("@/lib/db");
const { RuntimeSupervisor, __resetSupervisorForTests } = await import("@/core/runtime/supervisor");
const { readWorkerStatus, writeWorkerStatus, isWorkerAlive } = await import("@/core/runtime/worker-status");
const RUNTIME_STATUS_DIR = join(ISOLATED_REPO, "upload/.runtime");
const { STOP_REQUEST_ID, runRequestId } = await import("@/core/runtime/job-queue");

/** مسیر فایل وضعیت در دایرکتوری ایزوله — بدون تماس با محیط تولیدی */
const STATUS_FILE = `${RUNTIME_STATUS_DIR}/runtime-status.json`;
const BACKUP = `${RUNTIME_STATUS_DIR}/runtime-status.json.pn010-test-bak`;
let hadOriginal = false;

function fakeStatusFile(jobs: Record<string, { running?: boolean; runs?: number; lastRunAt?: string | null; lastError?: string | null; lastDurationMs?: number | null; domain?: Record<string, unknown> }>, heartbeatMsAgo = 0) {
  const hb = new Date(Date.now() - heartbeatMsAgo).toISOString();
  writeWorkerStatus({
    version: 1,
    worker: { pid: 424242, instanceId: "worker:test", startedAt: new Date().toISOString(), lastHeartbeatAt: hb },
    dispatcher: { ticks: 7, startedAt: new Date().toISOString() },
    jobs: Object.fromEntries(Object.entries(jobs).map(([id, j]) => [id, { running: false, runs: j.runs ?? 0, lastRunAt: j.lastRunAt ?? null, lastDurationMs: j.lastDurationMs ?? null, lastError: j.lastError ?? null, domain: j.domain }])),
    updatedAt: new Date().toISOString(),
  });
}

beforeAll(async () => {
  mkdirSync(RUNTIME_STATUS_DIR, { recursive: true });
  hadOriginal = existsSync(STATUS_FILE);
  if (hadOriginal) copyFileSync(STATUS_FILE, BACKUP);
  await db.jobLock.deleteMany({ where: { OR: [{ jobId: { startsWith: "run-request:" } }, { jobId: STOP_REQUEST_ID }] } });
});

afterAll(async () => {
  // بازگردانی محیط ایزوله — فایل تولیدی هرگز لمس نشده است
  if (existsSync(STATUS_FILE)) rmSync(STATUS_FILE);
  if (existsSync(BACKUP)) rmSync(BACKUP);
  rmSync(ISOLATED_REPO, { recursive: true, force: true });
  delete process.env.MELKA_REPO_DIR;
  await db.jobLock.deleteMany({ where: { OR: [{ jobId: { startsWith: "run-request:" } }, { jobId: STOP_REQUEST_ID }] } });
  await db.$disconnect();
});

/** spawn جعلی — شمارش فراخوانی بدون فرایند واقعی */
function makeFakeSpawner() {
  const calls: string[] = [];
  const fake = (entry: string) => {
    calls.push(entry);
    return { unref: () => undefined, on: () => undefined, kill: () => true } as unknown as ReturnType<typeof import("node:child_process").spawn>;
  };
  return { calls, fake };
}

beforeEach(() => {
  __resetSupervisorForTests();
});

describe("PN-010 BLOCK 3 — RuntimeSupervisor سبک", () => {
  test("۳-۱ getInstance: نمونهٔ یگانه در فرایند", () => {
    const a = RuntimeSupervisor.getInstance(db);
    const b = RuntimeSupervisor.getInstance();
    expect(a).toBe(b);
    __resetSupervisorForTests();
    const c = RuntimeSupervisor.getInstance(db);
    expect(c).not.toBe(a);
  });

  test("۳-۲ start با MELK_WORKER=disabled: بدون spawn (معماری تک‌فرایندی اختیاری)", () => {
    const prev = process.env.MELK_WORKER;
    process.env.MELK_WORKER = "disabled";
    try {
      const { calls, fake } = makeFakeSpawner();
      const sup = RuntimeSupervisor.getInstance(db);
      const r = sup.start({ spawnFn: fake, livenessIntervalMs: 0 });
      expect(r.ok).toBe(true);
      expect(r.action).toBe("no-op");
      expect(calls.length).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.MELK_WORKER; else process.env.MELK_WORKER = prev;
    }
  });

  test("۳-۳ start: Worker را spawn می‌کند (detached از طریق تابع تزریقی)", () => {
    if (existsSync(STATUS_FILE)) rmSync(STATUS_FILE);
    const { calls, fake } = makeFakeSpawner();
    const sup = RuntimeSupervisor.getInstance(db);
    const r = sup.start({ spawnFn: fake, livenessIntervalMs: 0 });
    expect(r.ok).toBe(true);
    expect(r.action).toBe("spawned");
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("scripts/runtime/worker.ts");
  });

  test("۳-۴ start idempotent: Worker زنده → دوباره spawn نمی‌شود", () => {
    fakeStatusFile({ "catalog-cycle": { runs: 3 } }, 0); // ضربان تازه = زنده
    const { calls, fake } = makeFakeSpawner();
    const sup = RuntimeSupervisor.getInstance(db);
    const r = sup.start({ spawnFn: fake, livenessIntervalMs: 0 });
    expect(r.action).toBe("already-alive");
    expect(calls.length).toBe(0);
  });

  test("۳-۵ start دوباره پس از مرگ Worker (ضربان کهنه) → respawn", () => {
    fakeStatusFile({ "catalog-cycle": {} }, 10 * 60_000); // ۱۰ دقیقه پیش = مرده
    const { calls, fake } = makeFakeSpawner();
    const sup = RuntimeSupervisor.getInstance(db);
    const r = sup.start({ spawnFn: fake, livenessIntervalMs: 0 });
    expect(r.action).toBe("spawned");
    expect(calls.length).toBe(1);
  });

  test("۳-۶ health: ساختار کامل web/worker/jobQueue", () => {
    if (existsSync(STATUS_FILE)) rmSync(STATUS_FILE);
    const sup = RuntimeSupervisor.getInstance(db);
    const h = sup.health();
    expect(h.ok).toBe(true);
    expect(h.architecture).toBe("1-web-1-worker");
    expect(h.web.pid).toBe(process.pid);
    expect(typeof h.web.uptimeSec).toBe("number");
    expect(typeof h.web.memoryMB).toBe("number");
    expect(Array.isArray(h.jobQueue.jobs)).toBe(true);
  });

  test("۳-۷ health بدون فایل وضعیت: worker مرده", () => {
    if (existsSync(STATUS_FILE)) rmSync(STATUS_FILE);
    const sup = RuntimeSupervisor.getInstance(db);
    const h = sup.health();
    expect(h.worker.alive).toBe(false);
    expect(h.worker.pid).toBeNull();
  });

  test("۳-۸ health با ضربان تازه: worker زنده + کارها دیده می‌شوند", () => {
    fakeStatusFile({ "intelligence-cycle": { runs: 5, lastRunAt: "2026-10-06T10:00:00Z" }, "catalog-cycle": { runs: 42 } }, 5_000);
    const sup = RuntimeSupervisor.getInstance(db);
    const h = sup.health();
    expect(h.worker.alive).toBe(true);
    expect(h.worker.pid).toBe(424242);
    expect(h.jobQueue.jobs.map((j) => j.id)).toContain("intelligence-cycle");
    expect(h.jobQueue.jobs.find((j) => j.id === "catalog-cycle")?.runs).toBe(42);
  });

  test("۳-۹ isWorkerAlive: پنجرهٔ کهنگی ضربان (۵ ضربان = ۱۵۰ ثانیه)", () => {
    fakeStatusFile({}, 10_000);
    expect(isWorkerAlive()).toBe(true);
    fakeStatusFile({}, 4 * 30_000); // ۱۲۰ ثانیه — هنوز داخل پنجرهٔ ۱۵۰
    expect(isWorkerAlive()).toBe(true);
    fakeStatusFile({}, 6 * 30_000); // ۱۸۰ ثانیه — خارج از پنجره = مرده
    expect(isWorkerAlive()).toBe(false);
  });

  test("۳-۱۰ restart: درخواست run-request در DB نوشته می‌شود", async () => {
    const sup = RuntimeSupervisor.getInstance(db);
    const r = await sup.restart("catalog-cycle", { knownJobs: ["catalog-cycle", "intelligence-cycle"] });
    expect(r.ok).toBe(true);
    expect(r.action).toBe("restart-requested");
    const row = await db.jobLock.findUnique({ where: { jobId: runRequestId("catalog-cycle") } });
    expect(row).not.toBeNull();
    expect((JSON.parse(row!.metadata!) as { jobId?: string }).jobId).toBe("catalog-cycle");
  });

  test("۳-۱۱ restart کار ناشناخته: رد", async () => {
    const sup = RuntimeSupervisor.getInstance(db);
    const r = await sup.restart("does-not-exist", { knownJobs: ["catalog-cycle"] });
    expect(r.ok).toBe(false);
    expect(r.action).toBe("unknown-job");
  });

  test("۳-۱۲ stop بدون Worker زنده: no-op بدون درخواست توقف (توقف بی‌مورد ممنوع)", async () => {
    if (existsSync(STATUS_FILE)) rmSync(STATUS_FILE);
    const sup = RuntimeSupervisor.getInstance(db);
    const r = await sup.stop();
    expect(r.ok).toBe(true);
    expect(r.action).toBe("no-op");
    expect(await db.jobLock.findUnique({ where: { jobId: STOP_REQUEST_ID } })).toBeNull();
  });

  test("۳-۱۳ stop با Worker زنده: درخواست توقف تدریجی ثبت می‌شود", async () => {
    fakeStatusFile({}, 0); // زنده
    const sup = RuntimeSupervisor.getInstance(db);
    sup.start({ spawnFn: makeFakeSpawner().fake, livenessIntervalMs: 0 });
    const r = await sup.stop();
    expect(r.action).toBe("stop-requested");
    const row = await db.jobLock.findUnique({ where: { jobId: STOP_REQUEST_ID } });
    expect(row).not.toBeNull();
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now()); // هنوز معتبر برای Worker
  });

  test("۳-۱۴ stop با Worker مرده: no-op بدون درخواست", async () => {
    fakeStatusFile({}, 60 * 60_000); // یک ساعت پیش = مرده
    const sup = RuntimeSupervisor.getInstance(db);
    sup.start({ spawnFn: makeFakeSpawner().fake, livenessIntervalMs: 0 });
    const r = await sup.stop();
    expect(r.action).toBe("no-op");
  });

  test("۳-۱۵ stats: شمارش spawn و تایمر بازرسی", () => {
    if (existsSync(STATUS_FILE)) rmSync(STATUS_FILE);
    const { fake } = makeFakeSpawner();
    const sup = RuntimeSupervisor.getInstance(db);
    sup.start({ spawnFn: fake, livenessIntervalMs: 0 });
    expect(sup.stats().spawns).toBe(1);
    expect(sup.stats().livenessActive).toBe(false); // livenessIntervalMs=0 → بدون تایمر (سبک)
    // readWorkerStatus/writeWorkerStatus رفت‌وبرگشت کامل
    fakeStatusFile({ x: { runs: 1 } });
    const st = readWorkerStatus();
    expect(st?.jobs.x.runs).toBe(1);
    expect(typeof readFileSync(STATUS_FILE, "utf-8")).toBe("string");
  });
});
