/**
 * بوت‌استرپ Worker (PN-010 / BLOCK 3-4)
 * ---------------------------------------------------------------------------
 * فرایند دومِ معماری «یک Web + یک Worker»:
 *   ۱) env جایگزین پلتفرم (همان الگوی instrumentation — بقا در برابر دیپلوی)
 *   ۲) قفل runtime:worker (TTL ۹۰ ثانیه) — اگر Worker دیگری زنده بود، فوراً خروج
 *   ۳) راه‌اندازی صف کار با رجیستری jobs (Intelligence/Catalog/Mirror/LogRotator/Backup)
 *   ۴) ضربان قفل + فایل وضعیت هر ۳۰ ثانیه
 *   ۵) توقف تدریجی روی SIGTERM/SIGINT (کار جاری تمام شود سپس خروج)
 *
 * ورودی رسمی: scripts/runtime/worker.ts (bun) — بدون منطق دامنه در این فایل.
 */

import type { PrismaClient } from "@prisma/client";
import { LOCK_TTL_MS_DEFAULT, HEARTBEAT_INTERVAL_MS_DEFAULT, JobLockService, generateInstanceId } from "./joblock";
import { startJobQueue, stopJobQueue, STOP_REQUEST_ID } from "./job-queue";
import { buildWorkerJobs } from "./jobs";
import { writeWorkerStatus, readWorkerStatus, type WorkerStatus } from "./worker-status";

export const RUNTIME_WORKER_LOCK_ID = "runtime:worker";

export interface WorkerRuntimeResult {
  started: boolean;
  reason?: string;
  jobs: string[];
}

/**
 * راه‌اندازی کامل Worker — قابل تست (db و ورودی‌ها تزریقی؛ بدون فرایند واقعی).
 * این تابع تا سیگنال توقف منتظر می‌ماند (resolve نمی‌شود مگر توقف تدریجی).
 */
export async function startWorkerRuntime(db: PrismaClient): Promise<WorkerRuntimeResult> {
  const instanceId = generateInstanceId("worker");
  const lock = new JobLockService(db, instanceId);

  // ۱) انحصار فرایندی — Worker دوم فوراً و بی‌صدا خارج می‌شود
  const acq = await lock.acquire(RUNTIME_WORKER_LOCK_ID, {
    ttlMs: LOCK_TTL_MS_DEFAULT,
    metadata: { pid: process.pid, startedAt: new Date().toISOString(), architecture: "1-web-1-worker" },
  });
  if (!acq.acquired) {
    return { started: false, reason: `runtime lock held (${acq.reason})`, jobs: [] };
  }

  // ۲) صف کار + رجیستری (منطق دامنه فقط در jobs.ts)
  const defs = buildWorkerJobs(db);
  const state = startJobQueue(db, defs);

  // ۳) ضربان: قفل runtime + فایل وضعیت — هر ۳۰ ثانیه (بند ۲.۳)
  const hb = setInterval(() => {
    void lock.heartbeat(RUNTIME_WORKER_LOCK_ID).catch(() => undefined);
    const status = readWorkerStatus();
    if (status) {
      status.worker.lastHeartbeatAt = new Date().toISOString();
      status.dispatcher.ticks = state.ticks;
      writeWorkerStatus(status);
    }
  }, HEARTBEAT_INTERVAL_MS_DEFAULT);
  hb.unref?.();

  // ۴) نوشتن وضعیت اولیه
  writeWorkerStatus({
    version: 1,
    worker: { pid: process.pid, instanceId, startedAt: state.startedAt, lastHeartbeatAt: new Date().toISOString() },
    dispatcher: { ticks: 0, startedAt: state.startedAt },
    jobs: Object.fromEntries(defs.map((d) => [d.id, { running: false, runs: 0, lastRunAt: null, lastDurationMs: null, lastError: null }])),
    updatedAt: new Date().toISOString(),
  } satisfies WorkerStatus);

  // ۵) توقف تدریجی روی سیگنال‌ها — کار جاری تمام شود سپس رهاسازی و خروج
  const shutdown = (signal: string) => {
    stopJobQueue(0);
    void lock.release(RUNTIME_WORKER_LOCK_ID).catch(() => undefined);
    clearInterval(hb);
    const status = readWorkerStatus();
    if (status) {
      status.worker.stopping = true;
      writeWorkerStatus(status);
    }
    process.exit(0);
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

  // ۶) نگه‌دارندهٔ رویداد-لوپ — تایمر ضربان ۳۰ ثانیه‌ای unref دارد؛ بدون این
  // لنگر، فرایند پس از خالی‌شدن صف رویداد بی‌سروصدا خارج می‌شد (درس cutover).
  const keepAlive = setInterval(() => undefined, 60_000);
  keepAlive.ref?.();

  return { started: true, jobs: defs.map((d) => d.id) };
}

/** اصلاح قفل runtime (بعد از خروج صف، قفل هم باید آزاد شود — برای تست) */
export async function releaseRuntimeLock(db: PrismaClient, instanceId: string): Promise<void> {
  const lock = new JobLockService(db, instanceId);
  await lock.release(RUNTIME_WORKER_LOCK_ID).catch(() => undefined);
  await lock.release(STOP_REQUEST_ID).catch(() => undefined);
}
