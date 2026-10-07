/**
 * RuntimeSupervisor (PN-010 / BLOCK 3) — src/core/runtime/supervisor.ts
 * ---------------------------------------------------------------------------
 * ساختار مصوب شورا (بند ۳.۱ — قید کمیسیون متخصص: «خودش Daemon Monster نشود»):
 *
 *   RuntimeSupervisor
 *   ├── Web Process Health      ← این فرایند (Web/Next)
 *   └── Worker Process Health  ← فرایند Worker (صف کار داخلی)
 *
 *   حداکثر دو فرایند — نه بیشتر.
 *
 * مسئولیت‌ها (بند ۳.۲): start() · stop() · health() · restart(jobId)
 * قید مطلق (بند ۳.۳): بدون منطق دامنه — فقط مدیریت فرایند.
 *
 * چرخهٔ حیات:
 *   • Web بوت می‌شود → instrumentation → supervisor.start()
 *   • اگر Worker زنده نیست → spawn مستقل (detached + unref — بقای دون‌والد)
 *   • تایمر بازرسی سبک (۶۰ ثانیه): اگر ضربان Worker کهنه شد → احیا
 *   • stop(): درخواست توقف تدریجی (ردیف DB) → کار جاری تمام می‌شود → خروج
 *   • restart(jobId): درخواست اجرای فوری (ردیف DB) → دیسپچر Worker مصرف می‌کند
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { readWorkerStatus, isWorkerAlive, workerStatusAgeMs } from "./worker-status";
import { runRequestId, STOP_REQUEST_ID } from "./job-queue";
import { ensureJobLockTable, JobLockService } from "./joblock";
import type { PrismaClient } from "@prisma/client";

export const REPO_ROOT = process.env.MELKA_REPO_DIR ?? "/home/z/my-project";
/** مسیر ورودی Worker — فرایند مستقل با bun (منبع همان مخزن) */
export const WORKER_ENTRY = join(REPO_ROOT, "scripts/runtime/worker.ts");

/** فاصلهٔ بازرسی سبک — پیش‌فرض ۶۰ ثانیه (قابل تنظیم/خاموشی) */
const LIVENESS_INTERVAL_MS_DEFAULT = 60_000;

export interface SupervisorHealth {
  ok: boolean;
  architecture: "1-web-1-worker";
  web: {
    pid: number;
    startedAt: string;
    uptimeSec: number;
    memoryMB: number;
    env: string;
    buildId: string | null;
  };
  worker: {
    alive: boolean;
    pid: number | null;
    instanceId: string | null;
    startedAt: string | null;
    lastHeartbeatAgeSec: number | null;
    stopping: boolean;
  };
  jobQueue: {
    dispatcherTicks: number | null;
    jobs: Array<{ id: string; running: boolean; runs: number; lastRunAt: string | null; lastError: string | null; lastDurationMs: number | null }>;
  };
  generatedAt: string;
}

/** نتیجهٔ عملیات spawn/stop */
export interface SupervisionResult {
  ok: boolean;
  action: "spawned" | "already-alive" | "stop-requested" | "not-started" | "no-op" | "restart-requested" | "unknown-job";
  detail?: string;
}

interface WebInfo { pid: number; startedAt: string; buildId: string | null }

const g = globalThis as unknown as {
  __melkSupervisor?: {
    web: WebInfo;
    child?: ChildProcess;
    livenessTimer?: NodeJS.Timeout;
    spawns: number;
  };
};

function webInfo(): WebInfo {
  if (!g.__melkSupervisor) {
    g.__melkSupervisor = {
      web: {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        buildId: readBuildId(),
      },
      spawns: 0,
    };
  }
  return g.__melkSupervisor.web;
}

function readBuildId(): string | null {
  try {
    // از شاهد بیلد پخته‌شده (globals نستج) — بدون وابستگی به fs ریشه
    const proc = globalThis as unknown as { __MELK_BUILD_ID__?: string };
    if (proc.__MELK_BUILD_ID__) return proc.__MELK_BUILD_ID__;
    return process.env.NEXT_BUILD_ID ?? null;
  } catch {
    return null;
  }
}

/** مسیر باینری bun — در فرایند تحت bun همان execPath */
function bunBinary(): string {
  return process.execPath.includes("bun") ? process.execPath : "bun";
}

/** نمونهٔ یگانه (_singleton در هر فرایند Web) */
export class RuntimeSupervisor {
  private static instance: RuntimeSupervisor | null = null;

  static getInstance(db?: PrismaClient): RuntimeSupervisor {
    if (!RuntimeSupervisor.instance) RuntimeSupervisor.instance = new RuntimeSupervisor(db);
    return RuntimeSupervisor.instance;
  }

  private constructor(private readonly db?: PrismaClient) {
    webInfo();
  }

  /** بند ۳.۲ — راه‌اندازی: Worker را می‌فروشد اگر زنده نیست + بازرسی سبک */
  start(options?: { spawnFn?: (entry: string) => ChildProcess; livenessIntervalMs?: number; quiet?: boolean }): SupervisionResult {
    webInfo();
    if (process.env.MELK_WORKER === "disabled") {
      return { ok: true, action: "no-op", detail: "MELK_WORKER=disabled — معماری تک‌فرایندی (Web)" };
    }
    // ── نصب بازرسی دوره‌ای — PN-014: همیشه، حتی وقتی Worker همین حالا زنده است.
    // درس زندهٔ این پرونده: boot سرور در حالِ «already-alive» با return زودهنگان
    // تایمر احیا را نصب نمی‌کرد → مرگ خاموش Worker بعدها هیچ‌کس را وادار به
    // احیا نمی‌کرد (worker ساعت‌ها مرده می‌ماند بدون کسی که ببیند).
    if (!g.__melkSupervisor?.livenessTimer && options?.livenessIntervalMs !== 0 && process.env.MELK_SUPERVISOR_RESPAWN !== "disabled") {
      const intervalMs = options?.livenessIntervalMs ?? LIVENESS_INTERVAL_MS_DEFAULT;
      const t = setInterval(() => {
        if (process.env.MELK_WORKER === "disabled") return;
        if (!isWorkerAlive()) {
          try {
            const child = spawn(bunBinary(), [WORKER_ENTRY], {
              cwd: REPO_ROOT,
              detached: true,
              stdio: "ignore",
              env: { ...process.env, MELKA_REPO_DIR: REPO_ROOT, MELK_ROLE: "worker" },
            });
            child.unref?.();
            if (g.__melkSupervisor) g.__melkSupervisor.spawns += 1;
          } catch {
            // بازتاب در تیک بعدی
          }
        }
      }, intervalMs);
      t.unref?.();
      if (g.__melkSupervisor) g.__melkSupervisor.livenessTimer = t;
    }
    // ۱) Worker زنده است؟ (ضربان تازه) — idempotent
    if (isWorkerAlive()) {
      return { ok: true, action: "already-alive" };
    }
    // ۲) فروش Worker — مستقل + بدون نگهداشتن والد (بقای دون‌والد؛ درس PN-004)
    const spawnFn = options?.spawnFn ?? ((entry: string) =>
      spawn(bunBinary(), [entry], {
        cwd: REPO_ROOT,
        detached: true,
        stdio: "ignore",
        env: { ...process.env, MELKA_REPO_DIR: REPO_ROOT, MELK_ROLE: "worker" },
      }));
    try {
      const child = spawnFn(WORKER_ENTRY);
      child.unref?.();
      if (g.__melkSupervisor) {
        g.__melkSupervisor.child = child;
        g.__melkSupervisor.spawns += 1;
      }
    } catch (e) {
      return { ok: false, action: "no-op", detail: `spawn failed: ${String(e)}` };
    }
    return { ok: true, action: "spawned" };
  }

  /** بند ۳.۲ — توقف: تدریجی (درخواست DB) → کار جاری تمام شود → Worker خارج شود */
  async stop(options?: { graceSec?: number }): Promise<SupervisionResult> {
    const s = g.__melkSupervisor;
    if (!s) return { ok: false, action: "not-started" };
    if (!isWorkerAlive()) return { ok: true, action: "no-op", detail: "worker not alive" };
    // ۱) درخواست توقف تدریجی — Worker در تیک بعدی دیسپچر می‌بیند و خارج می‌شود
    if (this.db) {
      try {
        await ensureJobLockTable(this.db);
        const svc = new JobLockService(this.db, "supervisor:web");
        const now = new Date();
        await this.db.jobLock.upsert({
          where: { jobId: STOP_REQUEST_ID },
          create: { jobId: STOP_REQUEST_ID, instanceId: "supervisor:web", acquiredAt: now, lastHeartbeat: now, expiresAt: new Date(now.getTime() + (options?.graceSec ?? 120) * 1000), metadata: JSON.stringify({ requestedBy: "supervisor" }) },
          update: { lastHeartbeat: now, expiresAt: new Date(now.getTime() + (options?.graceSec ?? 120) * 1000) },
        });
      } catch (e) {
        return { ok: false, action: "stop-requested", detail: `DB write failed: ${String(e)}` };
      }
    }
    // ۲) تایمر بازرسی را ببند (تا Worker را دوباره نفراخیزد)
    if (s.livenessTimer) {
      clearInterval(s.livenessTimer);
      s.livenessTimer = undefined;
    }
    return { ok: true, action: "stop-requested" };
  }

  /** بند ۳.۲ — سلامت: Web + Worker + صف کار داخلی */
  health(): SupervisorHealth {
    const s = g.__melkSupervisor;
    const web = s?.web ?? webInfo();
    const status = readWorkerStatus();
    const ageMs = workerStatusAgeMs();
    const jobs = status
      ? Object.entries(status.jobs).map(([id, j]) => ({ id, running: j.running, runs: j.runs, lastRunAt: j.lastRunAt, lastError: j.lastError, lastDurationMs: j.lastDurationMs }))
      : [];
    return {
      ok: true,
      architecture: "1-web-1-worker",
      web: {
        pid: web.pid,
        startedAt: web.startedAt,
        uptimeSec: Math.round((Date.now() - new Date(web.startedAt).getTime()) / 1000),
        memoryMB: Math.round((process.memoryUsage().rss) / 1048576),
        env: process.env.NODE_ENV ?? "development",
        buildId: web.buildId,
      },
      worker: {
        alive: isWorkerAlive(),
        pid: status?.worker.pid ?? null,
        instanceId: status?.worker.instanceId ?? null,
        startedAt: status?.worker.startedAt ?? null,
        lastHeartbeatAgeSec: Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : null,
        stopping: status?.worker.stopping ?? false,
      },
      jobQueue: {
        dispatcherTicks: status?.dispatcher.ticks ?? null,
        jobs,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /** بند ۳.۲ — ری‌استارت یک کار خاص Worker: درخواست اجرای فوری */
  async restart(jobId: string, options?: { knownJobs?: string[]; ttlMs?: number }): Promise<SupervisionResult> {
    if (!this.db) return { ok: false, action: "no-op", detail: "db not wired" };
    const known = options?.knownJobs;
    if (known && !known.includes(jobId)) {
      return { ok: false, action: "unknown-job", detail: `job ${jobId} not in registry` };
    }
    try {
      await ensureJobLockTable(this.db);
      const now = new Date();
      const reqId = runRequestId(jobId);
      await this.db.jobLock.upsert({
        where: { jobId: reqId },
        create: { jobId: reqId, instanceId: "supervisor:web", acquiredAt: now, lastHeartbeat: now, expiresAt: new Date(now.getTime() + (options?.ttlMs ?? 300_000)), metadata: JSON.stringify({ requestedBy: "supervisor", jobId }) },
        update: { lastHeartbeat: now, expiresAt: new Date(now.getTime() + (options?.ttlMs ?? 300_000)) },
      });
      return { ok: true, action: "restart-requested", detail: `run-request queued for ${jobId}` };
    } catch (e) {
      return { ok: false, action: "no-op", detail: String(e) };
    }
  }

  /** آمار درون‌حافظه‌ای برای شاهد تست */
  stats(): { spawns: number; livenessActive: boolean } {
    const s = g.__melkSupervisor;
    return { spawns: s?.spawns ?? 0, livenessActive: Boolean(s?.livenessTimer) };
  }
}

/** پاک‌سازی مرتب برای تست‌ها (بازگرداندن globalThis) */
export function __resetSupervisorForTests(): void {
  const s = g.__melkSupervisor;
  if (s?.livenessTimer) clearInterval(s.livenessTimer);
  delete g.__melkSupervisor;
  (RuntimeSupervisor as unknown as { instance: RuntimeSupervisor | null }).instance = null;
}

/** mkdir نگه‌دارنده — برای تست مسیر وضعیت */
export function ensureRuntimeDir(): string {
  const dir = join(REPO_ROOT, "upload/.runtime");
  mkdirSync(dir, { recursive: true });
  return dir;
}
