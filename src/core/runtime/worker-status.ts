/**
 * کانال وضعیت مشترک Web ↔ Worker (PN-010)
 * ---------------------------------------------------------------------------
 * Worker وضعیت زندهٔ خود را در upload/.runtime/runtime-status.json می‌نویسد
 * (ذخیره‌ساز پایدار + gitignored + عبورکننده از ریست) و فرایند Web آن را
 * می‌خواند (خواندن همگام — همان قرارداد سبکِ همیشگی).
 *
 * جداسازی نقش‌ها:
 *   • قفل و انحصار اجرا → جدول JobLock (DB — منبع حقیقت تراکنشی)
 *   • وضعیت و مشاهده‌پذیری → همین فایل (سبک، بدون وابستگی DB برای خواندن)
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** ریشهٔ ذخیره‌ساز پایدار — عبورکننده از ریست پلتفرم (upload/ در .gitignore) */
export const RUNTIME_STATUS_DIR = "/home/z/my-project/upload/.runtime";
export const RUNTIME_STATUS_FILE = join(RUNTIME_STATUS_DIR, "runtime-status.json");

/** اگر فرایند درون مخزن دیگری اجرا شود (کلون بازیابی)، مسیر نسبتی می‌شود */
function resolveStatusFile(): string {
  // در سرور standalone مقدار cwd ممکن است ریشهٔ مخزن نباشد؛ MELKA_REPO_DIR
  // همان لنگر رسمی خوددرمانی است (instrumentation — PN-005).
  const repo = process.env.MELKA_REPO_DIR ?? "/home/z/my-project";
  if (repo === "/home/z/my-project") return RUNTIME_STATUS_FILE;
  return join(repo, "upload/.runtime/runtime-status.json");
}

/** وضعیت یک کار در صف داخلی Worker */
export interface WorkerJobStatusEntry {
  running: boolean;
  runs: number;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  /** آخرین نتیجهٔ دامنه‌ای (اختیاری — مثلاً CatalogDaemonStatus) */
  domain?: Record<string, unknown>;
}

/** ساختار کامل فایل وضعیت */
export interface WorkerStatus {
  version: 1;
  worker: {
    pid: number;
    instanceId: string;
    startedAt: string;
    lastHeartbeatAt: string;
    /** exitCode در حالت توقف تدریجی */
    stopping?: boolean;
  };
  dispatcher: { ticks: number; startedAt: string };
  jobs: Record<string, WorkerJobStatusEntry>;
  updatedAt: string;
}

/** سن فایل وضعیت بر حسب میلی‌ثانیه — Infinity اگر نبود */
export function workerStatusAgeMs(now: number = Date.now()): number {
  const file = resolveStatusFile();
  if (!existsSync(file)) return Number.POSITIVE_INFINITY;
  try {
    const st = readFileSync(file, "utf-8");
    const parsed = JSON.parse(st) as WorkerStatus;
    if (!parsed?.worker?.lastHeartbeatAt) return Number.POSITIVE_INFINITY;
    return now - new Date(parsed.worker.lastHeartbeatAt).getTime();
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** خواندن وضعیت — null اگر نبود/خراب بود */
export function readWorkerStatus(): WorkerStatus | null {
  const file = resolveStatusFile();
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as WorkerStatus;
  } catch {
    return null;
  }
}

/** Worker زنده است؟ (ضربان تازه — پنجرهٔ سخاوتمندانه: ۵ ضربان) */
export function isWorkerAlive(staleAfterMs = 5 * 30_000): boolean {
  return workerStatusAgeMs() < staleAfterMs;
}

/** نوشتن اتمی-ساده (نوشتن موقت + rename در همان پوشه) — فقط Worker می‌نویسد */
export function writeWorkerStatus(status: WorkerStatus): void {
  const file = resolveStatusFile();
  mkdirSync(RUNTIME_STATUS_DIR, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(status, null, 2), "utf-8");
  try {
    renameSync(tmp, file); // rename هم‌پوشه عملاً اتمی است
  } catch {
    // در بدترین حالت نوشتن مستقیم
    writeFileSync(file, JSON.stringify(status, null, 2), "utf-8");
  }
}
