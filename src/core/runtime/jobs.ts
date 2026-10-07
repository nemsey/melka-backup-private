/**
 * رجیستری کارهای Worker (PN-010 / BLOCK 4 — جدول مهاجرت دیمن‌ها)
 * ---------------------------------------------------------------------------
 * مصوبهٔ شورا (جلسهٔ ۰۱۰، بند ۴.۲):
 *   Intelligence   → Worker  (چرخهٔ ۶۰ دقیقه — عین تایمر قبلی)
 *   Catalog        → Worker  (چرخهٔ ۱ دقیقه — عین تایمر قبلی)
 *   Auto-Recovery → Boot Hook (می‌ماند در instrumentation — خارج از Worker)
 *   Mirror         → Worker  (چرخهٔ ۶ ساعت — اسکریپت چرخهٔ واحد)
 *   Log Rotator    → Worker  (چرخهٔ ۳۰ دقیقه — اسکریپت یک‌بارهٔ موجود)
 *   + Backup Rotation → Worker (تازه — ترمیم پایدار DIAG-DATA-005، بند ۱.۳)
 *
 * این فایل تنها نقطهٔ اتصال زیرساخت runtime به منطق دامنه است؛ خودِ runtime
 * (joblock/job-queue/supervisor) صفر منطق دامنه دارد (قید شورا).
 */

import { spawn } from "node:child_process";
import { mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { WorkerJobDef } from "./job-queue";

/** ریشهٔ مخزن — همان لنگر رسمی (instrumentation / auto-recovery) */
export const REPO_ROOT = process.env.MELKA_REPO_DIR ?? "/home/z/my-project";

/** اجرای یک اسکریپت shell و انتظار برای پایان — خروجی { code } */
function runShell(script: string, args: string[] = [], timeoutMs = 15 * 60_000): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn("bash", [script, ...args], { cwd: REPO_ROOT, stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      const timer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* قبلاً خارج شده */ }
      }, timeoutMs);
      child.stderr?.on("data", (d) => { stderr += String(d); });
      child.on("error", (e) => { clearTimeout(timer); resolve({ code: -1, stderr: String(e) }); });
      child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stderr }); });
    } catch (e) {
      resolve({ code: -1, stderr: String(e) });
    }
  });
}

/** شناسه‌های کارها — منبع یگانه (تست‌ها همین را می‌خوانند) */
export const WORKER_JOB_IDS = {
  intelligenceCycle: "intelligence-cycle",
  catalogCycle: "catalog-cycle",
  mirrorCycle: "mirror-cycle",
  logRotate: "log-rotate",
  backupRotation: "backup-rotation",
  privacyGuard: "privacy-guard",
  sizeGuard: "size-guard",
} as const;

/** فاصله‌ها از همان env های قبلی دیمن‌ها خوانده می‌شوند — سلوک حفظ می‌شود */
function envInt(name: string, def: number, min: number): number {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  if (Number.isFinite(raw) && raw >= min) return raw;
  return def;
}

/** چرخهٔ آینهٔ برون‌پلتفرمی — اسکریپت چرخهٔ واحد (استخراج‌شده از دیمن ۶ساعته) */
async function runMirrorCycle(): Promise<unknown> {
  const r = await runShell(join(REPO_ROOT, "scripts/mirror/mirror-cycle.sh"), [], 10 * 60_000);
  if (r.code !== 0) throw new Error(`mirror-cycle exited ${r.code}: ${r.stderr.slice(0, 200)}`);
  return { code: r.code };
}

/** چرخش لاگ‌ها — همان اسکریپت یک‌بارهٔ ن۰۰۶ (BLOCK 7) */
async function runLogRotate(): Promise<unknown> {
  const r = await runShell(join(REPO_ROOT, "scripts/log-rotate.sh"), [], 60_000);
  if (r.code !== 0) throw new Error(`log-rotate exited ${r.code}: ${r.stderr.slice(0, 200)}`);
  return { code: r.code };
}

/**
 * چرخش بکاپ — ترمیم پایدار DIAG-DATA-005 (بند ۱.۳):
 * VACUUM INTO تازه + نگهداری N نسل آخر در backups/ (پیش‌فرض ۳؛ حداقل ۲ = سبز)
 */
export async function runBackupRotation(db: PrismaClient, options?: { keep?: number; backupsDir?: string }): Promise<{ created: string; kept: string[]; pruned: string[]; integrity: string }> {
  const envKeep = Number.parseInt(process.env.MELK_BACKUP_KEEP ?? "3", 10);
  const keep = Math.max(2, options?.keep ?? (Number.isFinite(envKeep) ? envKeep : 3));
  const dir = options?.backupsDir ?? join(REPO_ROOT, "backups");
  mkdirSync(dir, { recursive: true });
  // نام یکتا با دقت میلی‌ثانیه (VACUUM INTO روی فایل موجود خطا می‌دهد) + گارد شمارنده
  const tsBase = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
  let target = join(dir, `backup-${tsBase}.db`);
  for (let i = 1; existsSync(target); i++) target = join(dir, `backup-${tsBase}-${i}.db`);
  await db.$queryRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  // سلامت: integrity_check روی فایل تازه (بازکردن مستقیم — بدون ردِ Prisma اضافی)
  const probe = new (await import("@prisma/client")).PrismaClient({ datasources: { db: { url: `file:${target}` } } });
  let integrity = "unknown";
  try {
    const r = await probe.$queryRawUnsafe("PRAGMA integrity_check") as { integrity_check: string }[];
    integrity = r[0]?.integrity_check ?? "unknown";
  } finally {
    await probe.$disconnect();
  }
  // هرس: نگهداری N فایل .db آخر (بر اساس mtime) — فایلِ همین چرخش همیشه می‌ماند
  // (در تساوی میلی‌ثانیه، ترتیب حذف نباید فایل تازه‌ساخته را قربانی کند — کشف آزمون ۱-۱۰)
  const createdName = target.split("/").pop()!;
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".db") && !f.endsWith("-shm") && !f.endsWith("-wal")).map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs })).sort((a, b) => (b.m - a.m) || (b.f === createdName ? 1 : a.f === createdName ? -1 : 0))
    : [];
  const kept: string[] = [];
  const pruned: string[] = [];
  for (let i = 0; i < files.length; i++) {
    if (i < keep || files[i].f === createdName) kept.push(files[i].f);
    else { unlinkSync(join(dir, files[i].f)); pruned.push(files[i].f); }
  }
  return { created: target, kept, pruned, integrity };
}

/**
 * تعریف کارهای Worker — با همان زمان‌بندی و رفتار دیمن‌های قبلی
 * (صفر قطع خدمت: اولین اجراها دقیقاً مثل قبل ۴۵s/۶۰s بعد از بوت).
 */
export function buildWorkerJobs(db: PrismaClient): WorkerJobDef[] {
  const jobs: WorkerJobDef[] = [];

  // ── Intelligence → Worker (فاصله و کلید خاموشی عین قبل) ──
  if (process.env.MELK_INTELLIGENCE_DAEMON !== "disabled") {
    const intervalMinutes = envInt("MELK_INTELLIGENCE_INTERVAL_MINUTES", 60, 5);
    jobs.push({
      id: WORKER_JOB_IDS.intelligenceCycle,
      title: "چرخهٔ مغز هوشمند (دیمن قبلی → Worker)",
      intervalMs: intervalMinutes * 60_000,
      firstRunDelayMs: 45_000, // عین تایمر قبلی instrumentation
      run: async (database) => {
        const { runIntelligenceDaemonTick } = await import("@/lib/intelligence/daemon");
        return runIntelligenceDaemonTick(database);
      },
    });
  }

  // ── Catalog → Worker (فاصله و کلید خاموشی عین قبل) ──
  if (process.env.MELK_CATALOG_DAEMON !== "disabled") {
    const intervalMinutes = envInt("MELK_CATALOG_DAEMON_INTERVAL_MINUTES", 1, 1);
    jobs.push({
      id: WORKER_JOB_IDS.catalogCycle,
      title: "پایدارساز بروزرسانی (دیمن قبلی → Worker)",
      intervalMs: intervalMinutes * 60_000,
      firstRunDelayMs: 60_000, // عین تایمر قبلی instrumentation
      run: async (database) => {
        const { catalogDaemonTick } = await import("@/lib/melk-api/catalog-daemon");
        return catalogDaemonTick(database);
      },
      toDomain: (result) => {
        if (result && typeof result === "object") return result as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── Mirror → Worker (۶ ساعت — الگوی دیمن قبلی) ──
  if (process.env.MELK_MIRROR_JOB !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.mirrorCycle,
      title: "آینهٔ برون‌پلتفرمی GitHub (دیمن قبلی → Worker)",
      intervalMs: 6 * 60 * 60_000,
      firstRunDelayMs: 5 * 60_000, // نخستین پوش ۵ دقیقه پس از بوت
      run: async () => runMirrorCycle(),
    });
  }

  // ── Log Rotator → Worker (۳۰ دقیقه — سقف ۱۰MB همان ن۰۰۶) ──
  jobs.push({
    id: WORKER_JOB_IDS.logRotate,
    title: "چرخش لاگ‌ها (پایشگر قبلی → Worker)",
    intervalMs: 30 * 60_000,
    firstRunDelayMs: 10 * 60_000,
    run: async () => runLogRotate(),
  });

  // ── Backup Rotation → Worker (تازه — DIAG-DATA-005 پایدار) ──
  if (process.env.MELK_BACKUP_ROTATION !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.backupRotation,
      title: "چرخش بکاپ VACUUM (ترمیم DIAG-DATA-005)",
      intervalMs: 6 * 60 * 60_000,
      firstRunDelayMs: 90_000, // نخستین بکاپِ چرخشی زودهنگام
      run: async (database) => runBackupRotation(database),
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── Privacy Guard → Worker (تازه — PN-014/D3: بستن با احترام + پایش) ──
  // شرط مالک در نگه‌داشتن کد مستر در تاریخچه: مخزن باید خصوصی بماند.
  // هر ۶ ساعت پروب ناشناس — ۲۰۰ یعنی افشا: هشدار فوری در AuditLog.
  if (process.env.MELK_PRIVACY_GUARD !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.privacyGuard,
      title: "گارد محرمانگی مخزن آینه (PN-014/D3)",
      intervalMs: 6 * 60 * 60_000,
      firstRunDelayMs: 2 * 60_000,
      run: async (database) => {
        const { runPrivacyGuard } = await import("@/core/runtime/guards");
        return runPrivacyGuard(database);
      },
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── Size Guard → Worker (تازه — PN-014/D4: تعویق + پایش) ──
  // محرک‌های عددی تصمیم LFS/ارتقا: DB>500MB · بقا>1GB · دیسک آزاد<۱۵٪
  // هر ساعت سنجش — عبور از آستانه = هشدار خودکار AuditLog.
  if (process.env.MELK_SIZE_GUARD !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.sizeGuard,
      title: "گارد رشد حجم (PN-014/D4)",
      intervalMs: 60 * 60_000,
      firstRunDelayMs: 3 * 60_000,
      run: async (database) => {
        const { runSizeGuard } = await import("@/core/runtime/guards");
        return runSizeGuard(database);
      },
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  return jobs;
}
