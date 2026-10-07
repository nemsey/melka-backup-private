/**
 * JobQueue — صف کار داخلی Worker (PN-010 / BLOCK 2-3)
 * ---------------------------------------------------------------------------
 * یک صف سبک با زمان‌بندی فاصله‌ای، بدون وابستگی بیرونی:
 *   • هر کار با شناسهٔ ثابت + فاصلهٔ اجرا (intervalMs) + تاخیر نخستین اجرا
 *   • منحصربه‌فرد بودن اجرا در برابر نمونه‌های موازی → JobLock (با ضربان)
 *   • درخواست اجرای فوری (run-request) → مصرف توسط دیسپچر (restart از Supervisor)
 *   • درخواست توقف (stop-request) → توقف تدریجی پس از اتمام کار جاری
 *
 * قید شورا: «حداکثر دو فرایند» — این صف «درون» همان یک Worker اجرا می‌شود؛
 * خودش هیچ فرایند/دیمن تازه‌ای نمی‌سازد. منطق دامنه در adapters (jobs.ts)؛
 * این ماژول فقط زیرساخت زمان‌بندی/قفل/وضعیت است.
 */

import type { PrismaClient } from "@prisma/client";
import { HEARTBEAT_INTERVAL_MS_DEFAULT, LOCK_TTL_MS_DEFAULT, JobLockService, generateInstanceId } from "./joblock";
import { ensureJobLockTable } from "./joblock";
import { readWorkerStatus, writeWorkerStatus, type WorkerJobStatusEntry, type WorkerStatus } from "./worker-status";

/** پیشوند شناسهٔ قفل کارها در جدول JobLock */
export const JOB_LOCK_PREFIX = "job:";

export interface WorkerJobDef {
  /** شناسهٔ پایدار — «job:<id>» در جدول قفل */
  id: string;
  title: string;
  /** فاصلهٔ اجرا */
  intervalMs: number;
  /** نخستین اجرا پس از این تاخیر (پیش‌فرض ۵ ثانیه) */
  firstRunDelayMs?: number;
  /** اجرا در نخستین بوت (پیش‌فرض true — با firstRunDelayMs) */
  runOnStart?: boolean;
  /** بدنهٔ کار (منطق دامنه در jobs.ts) */
  run: (db: PrismaClient) => Promise<unknown>;
  /** تبدیل نتیجهٔ دامنه به بخش domain وضعیت (اختیاری) */
  toDomain?: (result: unknown) => Record<string, unknown>;
}

/** شناسهٔ درخواست اجرای فوری — restart(jobId) این ردیف را می‌نویسد */
export function runRequestId(jobId: string): string {
  return `run-request:${jobId}`;
}

/** شناسهٔ درخواست توقف تدریجی */
export const STOP_REQUEST_ID = "runtime:stop-request";

export interface DispatcherState {
  jobs: Map<string, { def: WorkerJobDef; entry: WorkerJobStatusEntry; lastCompletedAt: number; firstRunAt: number | null }>;
  lockService: JobLockService;
  timers: NodeJS.Timeout[];
  running: boolean;
  stopping: boolean;
  ticks: number;
  startedAt: string;
}

const g = globalThis as unknown as { __melkJobQueue?: DispatcherState };

/** وضعیت صف برای مشاهده (تست/سلامت) */
export function peekDispatcher(): DispatcherState | null {
  return g.__melkJobQueue ?? null;
}

/** ساعت تزریق‌پذیر — تست‌ها می‌توانند زمان را جلو ببرند */
export interface QueueOptions {
  /** فاصلهٔ تیک دیسپچر (پیش‌فرض ۵ ثانیه) */
  tickMs?: number;
  /** ضربان قفل کار (بند ۲.۳: ۳۰ ثانیه) */
  heartbeatMs?: number;
}

/**
 * راه‌اندازی صف — فقط یک صف در هر فرایند (Worker).
 */
export function startJobQueue(db: PrismaClient, defs: WorkerJobDef[], options?: QueueOptions): DispatcherState {
  if (g.__melkJobQueue) return g.__melkJobQueue; // یک صف در هر فرایند

  const tickMs = options?.tickMs ?? 5_000;
  const state: DispatcherState = {
    jobs: new Map(),
    lockService: new JobLockService(db, generateInstanceId("worker")),
    timers: [],
    running: false,
    stopping: false,
    ticks: 0,
    startedAt: new Date().toISOString(),
  };

  for (const def of defs) {
    state.jobs.set(def.id, {
      def,
      entry: { running: false, runs: 0, lastRunAt: null, lastDurationMs: null, lastError: null },
      lastCompletedAt: 0,
      firstRunAt: def.runOnStart === false ? null : Date.now() + (def.firstRunDelayMs ?? 5_000),
    });
  }

  const flush = () => {
    const prev = readWorkerStatus();
    const status: WorkerStatus = {
      version: 1,
      worker: prev?.worker ?? {
        pid: process.pid,
        instanceId: state.lockService.id,
        startedAt: state.startedAt,
        lastHeartbeatAt: new Date().toISOString(),
      },
      dispatcher: { ticks: state.ticks, startedAt: state.startedAt },
      jobs: Object.fromEntries([...state.jobs.values()].map((j) => [j.def.id, j.entry])),
      updatedAt: new Date().toISOString(),
    };
    writeWorkerStatus(status);
  };

  const runJob = async (j: { def: WorkerJobDef; entry: WorkerJobStatusEntry; lastCompletedAt: number; firstRunAt: number | null }) => {
    if (j.entry.running || state.stopping) return; // هم‌پوشانی ممنوع (همان قرارداد کاتالوگ)
    j.entry.running = true;
    j.entry.runs += 1;
    j.entry.lastRunAt = new Date().toISOString();
    flush();
    const t0 = Date.now();
    try {
      const result = await j.def.run(db);
      j.entry.lastError = null;
      j.entry.lastDurationMs = Date.now() - t0;
      if (j.def.toDomain) {
        try {
          j.entry.domain = j.def.toDomain(result);
        } catch {
          j.entry.domain = undefined;
        }
      }
    } catch (e) {
      j.entry.lastError = String((e as Error)?.message ?? e);
      j.entry.lastDurationMs = Date.now() - t0;
    } finally {
      j.entry.running = false;
      j.lastCompletedAt = Date.now();
      flush();
    }
  };

  /** اجرای یک کار با قفل توزیع‌شده — اگر نمونهٔ دیگری دارد، رد می‌شود */
  const runJobLocked = async (j: { def: WorkerJobDef; entry: WorkerJobStatusEntry; lastCompletedAt: number; firstRunAt: number | null }) => {
    const lockId = `${JOB_LOCK_PREFIX}${j.def.id}`;
    const svc = state.lockService;
    const acq = await svc.acquire(lockId, { ttlMs: LOCK_TTL_MS_DEFAULT, metadata: { pid: process.pid } });
    if (!acq.acquired) return; // نمونهٔ دیگر در حال اجرا (بند ۲.۴)
    const hb = setInterval(() => void svc.heartbeat(lockId).catch(() => undefined), options?.heartbeatMs ?? HEARTBEAT_INTERVAL_MS_DEFAULT);
    try {
      await runJob(j);
    } finally {
      clearInterval(hb);
      await svc.release(lockId).catch(() => undefined);
    }
  };

  const tick = async () => {
    state.ticks += 1;
    // ۱) درخواست توقف تدریجی؟
    if (!state.stopping) {
      try {
        const stopReq = await db.jobLock.findUnique({ where: { jobId: STOP_REQUEST_ID } });
        if (stopReq && stopReq.expiresAt.getTime() > Date.now()) state.stopping = true;
      } catch { /* جدول/DB موقتاً ناپیدا — بی‌صدا */ }
    }
    if (state.stopping) {
      const anyRunning = [...state.jobs.values()].some((j) => j.entry.running);
      if (!anyRunning) {
        stopJobQueue(0);
        return;
      }
    }
    // ۲) درخواست‌های اجرای فوری (restart) — مصرف در همین تیک
    const requests: string[] = [];
    try {
      const rows = await db.jobLock.findMany({ where: { jobId: { startsWith: "run-request:" } } });
      for (const r of rows) {
        if (r.expiresAt.getTime() > Date.now()) requests.push(r.jobId.slice("run-request:".length));
        await db.jobLock.deleteMany({ where: { jobId: r.jobId } }).catch(() => undefined);
      }
    } catch { /* بی‌صدا */ }
    // ۳) کارهای سررسیدشده + درخواستی‌ها
    for (const j of state.jobs.values()) {
      if (state.stopping) break;
      const requested = requests.includes(j.def.id);
      const dueByTime = j.lastCompletedAt === 0
        ? j.firstRunAt !== null && Date.now() >= j.firstRunAt
        : Date.now() - j.lastCompletedAt >= j.def.intervalMs;
      if (requested || dueByTime) void runJobLocked(j);
    }
    // ۴) جاروی دوره‌ای قفل‌های متروکه (هر ~۲۴ تیک ≈ ۲ دقیقه)
    if (state.ticks % 24 === 0) {
      void state.lockService.cleanup().catch(() => undefined);
    }
    flush();
  };

  state.running = true;
  flush();
  // تایمر دیسپچر ref دار است: در فرایند اختصاصی Worker رویداد-لوپ را زنده نگه
  // می‌دارد (درس زندهٔ cutover: unref → خروج بی‌سروصدا بلافاصله پس از بوت).
  const timer = setInterval(() => void tick(), tickMs);
  state.timers.push(timer);
  g.__melkJobQueue = state;
  return state;
}

/** توقف صف — تایمرها را می‌بندد؛ وضعیت stopping را ثبت می‌کند */
export function stopJobQueue(exitCode = 0): void {
  const state = g.__melkJobQueue;
  if (!state) return;
  state.running = false;
  for (const t of state.timers) clearInterval(t);
  state.timers = [];
  g.__melkJobQueue = undefined;
  const status = readWorkerStatus();
  if (status) {
    status.worker.stopping = true;
    writeWorkerStatus(status);
  }
  if (exitCode > 0) process.exitCode = exitCode;
}

/** شمارش کل اجراهای موفق (برای شاهد) */
export function totalRuns(state: DispatcherState): number {
  return [...state.jobs.values()].reduce((a, j) => a + j.entry.runs, 0);
}

/** فهرست شناسه‌های کارهای ثبت‌شده (برای restart معتبرسازی) */
export function registeredJobIds(state: DispatcherState): string[] {
  return [...state.jobs.keys()];
}

export { ensureJobLockTable };
