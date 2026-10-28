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
import { mkdirSync, existsSync, readFileSync, readdirSync, statSync, statfsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { WorkerJobDef } from "./job-queue";

/** ریشهٔ مخزن — همان لنگر رسمی (instrumentation / auto-recovery) */
export const REPO_ROOT = process.env.MELKA_REPO_DIR ?? "/home/z/my-project";


/** PN-041-R (شورا-ن۰۶۸ · فاز ۴): مسیر دیتابیس زنده از env (پارامترها پوستکنده) */
function liveDbPath(): string {
  const envUrl = process.env.DATABASE_URL ?? "";
  if (envUrl.startsWith("file:")) {
    const bare = envUrl.slice(5).split("?")[0];
    if (bare && !bare.includes("test")) return bare;
  }
  return join(REPO_ROOT, "db/custom.db");
}

/**
 * PN-041-R (شورا-ن۰۶۸ · فاز ۴): VACUUM زیرپروسه‌ای — هرگز اتصال اصلی را بلاک نمی‌کند.
 * با connection_limit=1، VACUUM روی اتصال یگانه کل سرور را ۱۶-۹۰ث بلاک می‌کرد؛
 * اکنون زیرپروسهٔ bun scripts/pn041/vacuum-copy.ts (busy_timeout=10s خودش) کار
 * می‌کند و فرایند اصلی بی‌وقفه سرو می‌دهد. خروجی: خواندن JSON شاهد زیرپروسه.
 */
async function runVacuumSubprocess(source: string, target: string, timeoutMs: number): Promise<{ ok: boolean; counts?: Record<string, number>; integrity?: string; stderr: string }> {
  // محیط تست: زیرپروسه چک‌پوینت منبع را تا ۱۰ث بلاک می‌کند (فرایند تست DB را نگه
  // دارد) — مسیر درون‌فرایندی قدیم (MELK_VACUUM_SUBPROCESS=disabled برای غیر-تست)
  if (process.env.NODE_ENV === "test" || process.env.MELK_VACUUM_SUBPROCESS === "disabled") {
    return { ok: false, stderr: "subprocess-disabled-in-test" };
  }
  const witnessTmp = join(REPO_ROOT, "upload/.runtime/vacuum-sub-last.json");
  return new Promise((resolve) => {
    let stderr = "";
    let child;
    try {
      child = spawn("bun", [join(REPO_ROOT, "scripts/pn041/vacuum-copy.ts"), source, target, "--json", witnessTmp], {
        cwd: REPO_ROOT,
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch (e) {
      resolve({ ok: false, stderr: String(e) });
      return;
    }
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* best effort */ }
    }, timeoutMs);
    child.stderr?.on("data", (d: Buffer) => { if (stderr.length < 2000) stderr += d.toString(); });
    child.on("error", (e: Error) => { clearTimeout(timer); resolve({ ok: false, stderr: String(e) }); });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (code !== 0) { resolve({ ok: false, stderr: stderr.slice(0, 300) }); return; }
      try {
        const w = JSON.parse(readFileSync(witnessTmp, "utf8")) as { counts?: Record<string, number>; integrity?: string };
        resolve({ ok: true, counts: w.counts, integrity: w.integrity, stderr });
      } catch {
        resolve({ ok: true, stderr });
      }
    });
  });
}

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
  previewGuard: "preview-guard",
  resetGuard: "reset-guard",
  driftGuard: "drift-guard",
  decisionShadow: "decision-shadow",
  policyEval: "policy-eval",
  diskGuard: "disk-guard",
  diagnosisCycle: "diagnosis-cycle",
  memoryConsolidation: "memory-consolidation",
  ipLog: "ip-log",
  headGuard: "head-guard",
  sacredBackup: "sacred-backup",
  rollingBackup: "rolling-backup", // PN-041 · شورا-ن۰۶۷ — لایهٔ ۲ قلعهٔ داده
  relayHealthCheck: "relay-health-check",
  dbHealthProbe: "db-health-probe", // PN-041-R · شورا-ن۰۶۸ — خوددرمانی DB قفل‌شده
  melketunSync: "melketun-sync", // PN-044 · شورا-ن۰۸۸ — هماهنگ‌سازی CRM ملکتون (۶ ساعت)
  lcppCycle: "lcpp-cycle", // PN-051 — خط‌لوله فهرست‌های List-Centric (۳۰ دقیقه)
  lcppWatch: "lcpp-watch", // PN-051 · فرمان ۷ — پاسخ ≤۶۰ث به «بروزرسانی دستی» مالک
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
  // ENGINE: sqlite-only (dbHealth شاخهٔ موتور — سوییچ PN-022-C)
  await db.$queryRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  // سلامت: integrity_check روی فایل تازه (بازکردن مستقیم — بدون ردِ Prisma اضافی)
  const probe = new (await import("@prisma/client")).PrismaClient({ datasources: { db: { url: `file:${target}` } } });
  let integrity = "unknown";
  try {
    // ENGINE: sqlite-only (dbHealth شاخهٔ موتور — سوییچ PN-022-C)
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
  // PN-022-A/مرحلهٔ۱ (I9 — ریشهٔ GOV-DATA-002): شاهد حسابرسی چرخش بکاپ.
  // کشف ریشه‌ای: بکاپ‌ها هر ۶ ساعت ساخته می‌شدند ولی هرگز در AuditLog ثبت
  // نمی‌شدند ⇒ قاعدهٔ GOV-DATA-002 (و DIAG-DATA-004) «آخرین BACKUP» را نمی‌دید
  // و همهٔ حذف‌های هفته را «بدون شاهد بکاپ» می‌شمرد — نقض بحرانی بازِ کاذب.
  await db.auditLog.create({
    data: {
      action: "BACKUP_ROTATION",
      actor: "worker:backup-rotation",
      detail: JSON.stringify({ created: createdName, kept: kept.length, pruned: pruned.length, integrity }),
    },
  }).catch(() => undefined); // ثبت شاهد بهترین-تلاش است — چرخش بکاپ هرگز به‌خاطر آن نمی‌شکند
  return { created: target, kept, pruned, integrity };
}

/**
 * بکاپ مقدس ۱۵دقیقه‌ای (PN-038 · فاز ۱ · بند ۱.۳ — شورا-ن۰۶۳):
 * چرخهٔ بکاپ اتمی (VACUUM INTO — بدون توقف سرویس) هر ۱۵ دقیقه + مانیفست
 * mtime/شمارش در upload/.runtime/sacred-backups.json (خوراک گارد مقدس).
 * نگهداری: پیش‌فرض ۵ نسل (PN-041/فاز ۳ · شورا-ن۰۶۷ — از ۴ به ۵) — env MELK_SACRED_BACKUP_KEEP.
 * محل (PN-041/فاز ۳): منطقهٔ پایدار upload/.data/sacred/ (قبلاً backups/ در منطقهٔ ریست).
 */
export async function runSacredBackup(db: PrismaClient, options?: { keep?: number; backupsDir?: string }): Promise<{ created: string; kept: string[]; pruned: string[]; integrity: string; mtimeIso: string; counts: Record<string, number> }> {
  const envKeep = Number.parseInt(process.env.MELK_SACRED_BACKUP_KEEP ?? "5", 10);
  const keep = Math.max(1, options?.keep ?? (Number.isFinite(envKeep) ? envKeep : 5));
  const dir = options?.backupsDir ?? join(REPO_ROOT, "upload/.data/sacred");
  mkdirSync(dir, { recursive: true });
  // PN-041 (درس دیسک): شیر دیسکِ همان چرخشی — بحرانی → پرش با شاهد (زنده هرگز در خطر نیست)
  const free0 = freeDiskBytes(dir);
  if (free0 < 1_000_000_000) {
    const detail = { skipped: "disk-low", freeBytes: free0, at: new Date().toISOString() };
    await db.auditLog.create({
      data: { action: "SACRED_BACKUP", actor: "worker:sacred-backup", detail: JSON.stringify(detail) },
    }).catch(() => undefined);
    return { created: "", kept: [], pruned: [], integrity: "skipped", mtimeIso: new Date().toISOString(), counts: {} };
  }
  const tsBase = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
  let target = join(dir, `sacred-${tsBase}.db`);
  for (let i = 1; existsSync(target); i++) target = join(dir, `sacred-${tsBase}-${i}.db`);
  // ENGINE: sqlite-only (VACUUM INTO اتمی — خواننده‌ها هرگز حالت نصفه نمی‌بینند)
  // PN-041-R: زیرپروسه — اتصال یگانهٔ اصلی هرگز بلاک نمی‌شود (فاز ۴)
  const vac = await runVacuumSubprocess(liveDbPath(), target, 10 * 60_000);
  if (!vac.ok && !existsSync(target)) {
    // زیرپروسه ناکام — fallback درون‌فرایندی (سلوک قبلی، هرگز بی‌بکاپ نمی‌مانیم)
    // ENGINE: sqlite-only (VACUUM INTO اتمی — سوییچ PN-022-C)
    await db.$queryRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  }
  // مانیفست مقدس: mtime + شمارش ردیف‌های شاهد — خوراک sacred-data-guard
  const manifest = { created: target.split("/").pop()!, mtimeIso: new Date().toISOString(), counts: {} as Record<string, number> };
  try {
    const probe = new (await import("@prisma/client")).PrismaClient({ datasources: { db: { url: `file:${target}` } } });
    try {
      // ENGINE: sqlite-only (dbHealth شاخهٔ موتور — سوییچ PN-022-C)
      const r = await probe.$queryRawUnsafe("PRAGMA integrity_check") as { integrity_check: string }[];
      manifest.counts["__integrity"] = r[0]?.integrity_check === "ok" ? 1 : 0;
      for (const t of ["PropertyRecord", "RequestRecord", "TransactionRecord", "ExpertRecord", "GraphNode"]) {
        try {
          const c = await probe.$queryRawUnsafe(`SELECT COUNT(*) as c FROM ${t}`) as { c: number | bigint }[];
          manifest.counts[t] = Number(c[0]?.c ?? 0);
        } catch { manifest.counts[t] = -1; }
      }
    } finally { await probe.$disconnect(); }
  } catch { /* مانیفست بهترین-تلاش */ }
  // هرس: فقط فایل‌های sacred-*.db (بکاپ‌های چرخشی دیگری را لمس نمی‌کند)
  const createdName = target.split("/").pop()!;
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.startsWith("sacred-") && f.endsWith(".db")).map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.m - a.m)
    : [];
  const kept: string[] = [];
  const pruned: string[] = [];
  for (let i = 0; i < files.length; i++) {
    if (i < keep || files[i].f === createdName) kept.push(files[i].f);
    else { unlinkSync(join(dir, files[i].f)); pruned.push(files[i].f); }
  }
  // شاهد پایدار برای گارد/آپ‌تایم — بهترین-تلاش
  try {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(REPO_ROOT, "upload/.runtime/sacred-backups.json"), JSON.stringify({ ...manifest, kept, pruned: pruned.length, at: manifest.mtimeIso }, null, 2));
  } catch { /* شاهد بهترین-تلاش */ }
  await db.auditLog.create({
    data: {
      action: "SACRED_BACKUP",
      actor: "worker:sacred-backup",
      detail: JSON.stringify({ created: createdName, kept: kept.length, pruned: pruned.length, counts: manifest.counts }),
    },
  }).catch(() => undefined);
  return { created: target, kept, pruned, integrity: String(manifest.counts["__integrity"] ?? "unknown"), mtimeIso: manifest.mtimeIso, counts: manifest.counts };
}

/**
 * بکاپ چرخشی ۵دقیقه‌ای (PN-041 · فاز ۲ · شورا-ن۰۶۷):
 * لایهٔ ۲ قلعهٔ داده — VACUUM INTO اتمی هر ۵ دقیقه در «منطقهٔ پایدار»
 * upload/.data/rolling/ (باقی‌مانده از ریست). هرس خودکار ۵ نسخه +
 * شیر دیسک (فضای آزاد < آستانه → هرس تهاجمی‌تر؛ بحرانی → پرش با شاهد).
 * مانیفست mtime/شمارش در upload/.runtime/rolling-backups.json (خوراک گارد قلعه).
 */
export async function runRollingBackup(db: PrismaClient, options?: { keep?: number; rollingDir?: string }): Promise<{ created: string; kept: string[]; pruned: string[]; integrity: string; skipped?: string; freeBytes?: number; counts: Record<string, number> }> {
  const envKeep = Number.parseInt(process.env.MELK_ROLLING_BACKUP_KEEP ?? "5", 10);
  const keep = Math.max(2, options?.keep ?? (Number.isFinite(envKeep) ? envKeep : 5));
  const dir = options?.rollingDir ?? join(REPO_ROOT, "upload/.data/rolling");
  mkdirSync(dir, { recursive: true });

  // ── شیر دیسک: پیش از نوشتنِ ~۴۰۰MB فضای آزاد را ببین ──
  // بحرانی (< ۱GB) → پرش با شاهد (بکاپ بعدی در چرخهٔ بعد؛ دادهٔ زنده هرگز در خطر نیست)
  // فشرده (< ۱.۶GB) → هرس تهاجمی به ۲ نسل پیش از ساختن
  const free0 = freeDiskBytes(dir);
  if (free0 < 1_000_000_000) {
    const detail = { skipped: "disk-low", freeBytes: free0, at: new Date().toISOString() };
    try {
      writeFileSync(join(REPO_ROOT, "upload/.runtime/rolling-backups.json"), JSON.stringify(detail, null, 2));
    } catch { /* بهترین-تلاش */ }
    await db.auditLog.create({
      data: { action: "ROLLING_BACKUP", actor: "worker:rolling-backup", detail: JSON.stringify(detail) },
    }).catch(() => undefined);
    return { created: "", kept: [], pruned: [], integrity: "skipped", counts: {}, skipped: "disk-low", freeBytes: free0 };
  }

  // نام یکتا (VACUUM INTO روی فایل موجود خطا می‌دهد)
  const tsBase = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
  let target = join(dir, `live-${tsBase}.db`);
  for (let i = 1; existsSync(target); i++) target = join(dir, `live-${tsBase}-${i}.db`);
  // ENGINE: sqlite-only (VACUUM INTO اتمی — خواننده‌ها حالت نصفه نمی‌بینند)
  // PN-041-R: زیرپروسه — اتصال یگانهٔ اصلی هرگز بلاک نمی‌شود (فاز ۴)
  const vac = await runVacuumSubprocess(liveDbPath(), target, 6 * 60_000);
  if (!vac.ok && !existsSync(target)) {
    // زیرپروسه ناکام — fallback درون‌فرایندی (سلوک قبلی، هرگز بی‌بکاپ نمی‌مانیم)
    // ENGINE: sqlite-only (VACUUM INTO اتمی — سوییچ PN-022-C)
    await db.$queryRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  }

  // مانیفست چرخشی: mtime + شمارش ردیف‌های شاهد — خوراک resurrect-ultimate (لایهٔ بازیابی داده · PN-042)
  const manifest = { created: target.split("/").pop()!, mtimeIso: new Date().toISOString(), counts: {} as Record<string, number> };
  try {
    const probe = new (await import("@prisma/client")).PrismaClient({ datasources: { db: { url: `file:${target}` } } });
    try {
      // ENGINE: sqlite-only (dbHealth شاخهٔ موتور — سوییچ PN-022-C)
      const r = await probe.$queryRawUnsafe("PRAGMA integrity_check") as { integrity_check: string }[];
      manifest.counts["__integrity"] = r[0]?.integrity_check === "ok" ? 1 : 0;
      for (const t of ["PropertyRecord", "RequestRecord", "TransactionRecord", "ExpertRecord", "GraphNode"]) {
        try {
          const c = await probe.$queryRawUnsafe(`SELECT COUNT(*) as c FROM ${t}`) as { c: number | bigint }[];
          manifest.counts[t] = Number(c[0]?.c ?? 0);
        } catch { manifest.counts[t] = -1; }
      }
    } finally { await probe.$disconnect(); }
  } catch { /* مانیفست بهترین-تلاش */ }

  // هرس: فقط فایل‌های live-*.db (بکاپ‌های sacred را لمس نمی‌کند)
  // حالت فشردهٔ دیسک → نگه‌داری ۲ نسل (به‌جای ۵) — شیر دیسک
  const effectiveKeep = freeDiskBytes(dir) < 1_600_000_000 ? Math.min(keep, 2) : keep;
  const createdName = target.split("/").pop()!;
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.startsWith("live-") && f.endsWith(".db")).map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.m - a.m)
    : [];
  const kept: string[] = [];
  const pruned: string[] = [];
  for (let i = 0; i < files.length; i++) {
    if (i < effectiveKeep || files[i].f === createdName) kept.push(files[i].f);
    else { unlinkSync(join(dir, files[i].f)); pruned.push(files[i].f); }
  }

  // شاهد پایدار برای گارد قلعه — بهترین-تلاش
  try {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(REPO_ROOT, "upload/.runtime/rolling-backups.json"), JSON.stringify({ ...manifest, kept, pruned: pruned.length, freeBytes: freeDiskBytes(dir), at: manifest.mtimeIso }, null, 2));
  } catch { /* شاهد بهترین-تلاش */ }
  await db.auditLog.create({
    data: {
      action: "ROLLING_BACKUP",
      actor: "worker:rolling-backup",
      detail: JSON.stringify({ created: createdName, kept: kept.length, pruned: pruned.length, counts: manifest.counts, freeBytes: freeDiskBytes(dir) }),
    },
  }).catch(() => undefined);
  return { created: target, kept, pruned, integrity: String(manifest.counts["__integrity"] ?? "unknown"), freeBytes: freeDiskBytes(dir), counts: manifest.counts };
}

/** فضای آزاد دیسکِ مسیر (بایت) — نامعلوم = بی‌نهایت (سد نکن)
 *  نکتهٔ PN-041: fuse/ossfs سهمیه گزارش نمی‌دهد (bavail=۰/منفی) →
 *  داوری از ریشهٔ کانتینر (overlayfs — همان دیسکی که پرمی‌شود). */
function freeDiskBytes(dir: string): number {
  try {
    const st = statfsSync(dir);
    const free = Number(st.bavail) * Number(st.bsize);
    if (free > 0) return free;
    const root = statfsSync(REPO_ROOT);
    const rootFree = Number(root.bavail) * Number(root.bsize);
    return rootFree > 0 ? rootFree : Number.MAX_SAFE_INTEGER;
  } catch { return Number.MAX_SAFE_INTEGER; }
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

  // ── PN-051 · DIR-PN051-SUPREME — خط‌لوله فهرست‌های List-Centric (LCPP) ──
  // فرمان ۳/۴/۵/۶: پنج ماژول مستقل + فاز A/B + Bulk upsert خام + Delta.
  // چرخهٔ منظم (پیش‌فرض ۳۰ دقیقه — MELK_LCPP_INTERVAL_MINUTES · حداقل ۵).
  if (process.env.MELK_LCPP !== "disabled") {
    const lcppIntervalMinutes = envInt("MELK_LCPP_INTERVAL_MINUTES", 30, 5);
    jobs.push({
      id: WORKER_JOB_IDS.lcppCycle,
      title: "خط‌لوله فهرست‌های LCPP (PN-051)",
      intervalMs: lcppIntervalMinutes * 60_000,
      firstRunDelayMs: 90_000,
      run: async (database) => {
        const { runLcppCycle } = await import("@/sync/lists");
        const result = await runLcppCycle(database);
        return (result ?? { skipped: true }) as unknown as Record<string, unknown>;
      },
      toDomain: (result) => {
        if (result && typeof result === "object") return result as Record<string, unknown>;
        return {};
      },
    });
    // فرمان ۷ — «بروزرسانی دستی» مالک: پاسخ ≤۶۰ثانیه (پرچم → اجرای فوری چرخه)
    jobs.push({
      id: WORKER_JOB_IDS.lcppWatch,
      title: "نگهبان درخواست فوری LCPP (فرمان ۷)",
      intervalMs: 60_000,
      firstRunDelayMs: 45_000,
      run: async (database) => {
        const { peekForceRefresh, runLcppCycle } = await import("@/sync/lists");
        if (!peekForceRefresh()) return { idle: true } as unknown as Record<string, unknown>;
        const result = await runLcppCycle(database);
        return (result ?? { skipped: true }) as unknown as Record<string, unknown>;
      },
      toDomain: (result) => {
        if (result && typeof result === "object") return result as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── Catalog → Worker — PN-029 → PN-038/۶.۱: گارد آفلینی حذف شد ──
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

  // ── Sacred Backup → Worker (PN-038/۱.۳ + PN-041/فاز ۳: بکاپ ۱۵دقیقه‌ای در منطقهٔ پایدار) ──
  // شورا-ن۰۶۳: «بکاپ پیوسته — هر ۱۵ دقیقه دیتابیس زنده را اتمی بکاپ بگیر».
  // شورا-ن۰۶۷ (PN-041): محل بکاپ → upload/.data/sacred/ (پایدار) · نگه‌داری ۵ نسل.
  if (process.env.MELK_SACRED_BACKUP !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.sacredBackup,
      title: "بکاپ مقدس ۱۵دقیقه‌ای (PN-038/۱.۳ + PN-041/۳)",
      intervalMs: envInt("MELK_SACRED_BACKUP_INTERVAL_MINUTES", 15, 5) * 60_000,
      firstRunDelayMs: 30_000, // نخستین بکاپ مقدس نیم دقیقه پس از بوت
      run: async (database) => runSacredBackup(database),
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── Rolling Backup → Worker (تازه — PN-041/فاز ۲: بکاپ چرخشی ۵دقیقه‌ای قلعه) ──
  // شورا-ن۰۶۷: «هیچ ریستی نمی‌تواند بیش از ۵ دقیقه دیتا را عقب ببرد».
  // VACUUM INTO اتمی در upload/.data/rolling/ (پایدار) · هرس ۵ نسل · شیر دیسک.
  if (process.env.MELK_ROLLING_BACKUP !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.rollingBackup,
      title: "بکاپ چرخشی ۵دقیقه‌ای قلعهٔ داده (PN-041/۲)",
      intervalMs: envInt("MELK_ROLLING_BACKUP_INTERVAL_MINUTES", 5, 5) * 60_000,
      firstRunDelayMs: 15_000, // نخستین بکاپ چرخشی ۱۵ ثانیه پس از بوت
      run: async (database) => runRollingBackup(database),
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

  // ── Preview Guard → Worker (تازه — PN-015/K2: Preview Stale) ──
  // «200 سالم» کافی نیست: دامنه ممکن است کامیتِ کهنه سرو کند.
  // هر ۱۵ دقیقه مقایسهٔ gitSha دامنه با HEAD محلی — ناهم‌خوانی = هشدار.
  if (process.env.MELK_PREVIEW_GUARD !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.previewGuard,
      title: "گارد تازگی نسخهٔ preview (PN-015/K2)",
      intervalMs: 15 * 60_000,
      firstRunDelayMs: 90_000,
      run: async (database) => {
        const { runPreviewGuard } = await import("@/core/runtime/guards");
        return runPreviewGuard(database);
      },
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── Reset Guard → Worker (تازه — PN-015/K3: بازنشانی پلتفرم) ──
  // درس بازنشانی هفتم: پلتفرم درخت را به اسنپ‌شات خودش برمی‌گرداند؛ داوری
  // با شاخهٔ main آینه (تبار مرجع) — جدِّ اکیدِ main = درخت برگشته.
  // تشخیص → recover نرخ‌محدود (بازگردانی + بیلد + ری‌استارت + مهر).
  if (process.env.MELK_RESET_GUARD !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.resetGuard,
      title: "گارد بازنشانی پلتفرم (PN-015/K3)",
      intervalMs: 15 * 60_000,
      firstRunDelayMs: 5 * 60_000,
      run: async () => {
        const check = await runShell(join(REPO_ROOT, "scripts/recovery/reset-guard.sh"), ["check"], 5 * 60_000);
        if (check.code === 2) {
          const rec = await runShell(join(REPO_ROOT, "scripts/recovery/reset-guard.sh"), ["recover"], 20 * 60_000);
          return { code: check.code, verdict: "RESET-DETECTED", recoveryCode: rec.code, recoveryStderr: rec.stderr.slice(0, 400) };
        }
        return { code: check.code, verdict: check.code === 0 ? "HEALTHY" : "ERROR" };
      },
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── Drift Guard → Worker (تازه — PN-018 فاز ۷: آشکارساز رانش سه‌گانه) ──
  // هر ۶ ساعت برای هر مدل قهرمان: رانش عملکرد/داده/مفهوم روی دادهٔ واقعی؛
  // کنش alert+ هشدار AuditLog می‌گیرد (روت drift-service). اگر مدل قهرمانی
  // نباشد، اجرا «بدون مدل» خاتمه می‌یابد (عین سایر گاردها — شکست = لاگ نه کرش).
  if (process.env.MELK_DRIFT_GUARD !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.driftGuard,
      title: "گارد رانش سه‌گانه (PN-018 فاز ۷)",
      intervalMs: Number(process.env.MELK_DRIFT_INTERVAL_H ?? 6) * 60 * 60_000,
      firstRunDelayMs: 60_000,
      run: async () => {
        const { driftGuardTick } = await import("@/lib/services/learning-loop-service");
        return driftGuardTick();
      },
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── Decision Shadow → Worker (تازه — PN-019 فاز ۸: تصمیم سایه + انقضا) ──
  // هر ۶ ساعت: از جفت‌های واقعی قهرمان تصمیم می‌سازد، ثبت می‌کند (صفر اجرا —
  // executedSteps=0 لفظی) + جاروب تصمیم‌های سرسشده (بدون حذف — دکترین دادهٔ مقدس).
  if (process.env.MELK_DECISION_SHADOW !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.decisionShadow,
      title: "تصمیم سایه + انقضای تصمیم (PN-019 فاز ۸)",
      intervalMs: Number(process.env.MELK_DECISION_SHADOW_INTERVAL_H ?? 6) * 60 * 60_000,
      firstRunDelayMs: 3 * 60_000,
      run: async () => {
        const { shadowDecisionTick } = await import("@/lib/services/decision-service");
        return shadowDecisionTick();
      },
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── Policy Evaluation → Worker (تازه — PN-019 فاز ۹: ارزیابی ۹۰روزهٔ سیاست‌ها) ──
  // هر ۹۰ روز: پنج سیاست فعال با ۴ متریک ارزیابی و حکم keep/adjust/retire
  // می‌گیرند + بررسی ۱۵قاعده‌ای حاکمیت؛ حکم فقط توصیه است — اعمال نیازمند شوراست.
  if (process.env.MELK_POLICY_EVAL !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.policyEval,
      title: "ارزیابی سیاست + حاکمیت (PN-019 فاز ۹)",
      intervalMs: Number(process.env.MELK_POLICY_EVAL_INTERVAL_DAYS ?? 90) * 24 * 60 * 60_000,
      firstRunDelayMs: 5 * 60_000,
      run: async () => {
        const { runPolicyEvaluation, runGovernanceCheck } = await import("@/lib/services/governance-service");
        const evaluations = await runPolicyEvaluation();
        const governance = await runGovernanceCheck("worker");
        return { policies: evaluations.length, verdicts: evaluations.map((e) => e.verdict), governanceFailed: governance.failed };
      },
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── Diagnosis Cycle → Worker (تازه — PN-020/فاز ۱۰: خودآگاهی ۲۵ بررسی) ──
  // هر ۶ ساعت: چرخهٔ کامل تشخیص (۲۵ بررسی در ۵ دسته) + نمرهٔ سلامت ۰-۱۰۰
  // + هشدارهای AuditLog + گزارش پایا در DiagnosticReport (DES10 §۵.۱).
  if (process.env.MELK_DIAGNOSIS !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.diagnosisCycle,
      title: "چرخهٔ خودآگاهی مغز (PN-020/فاز ۱۰)",
      intervalMs: Number(process.env.MELK_DIAGNOSIS_INTERVAL_H ?? 6) * 60 * 60_000,
      firstRunDelayMs: 4 * 60_000,
      run: async () => {
        const { runDiagnosisCycle } = await import("@/lib/services/self-diagnosis-service");
        return runDiagnosisCycle("worker");
      },
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── Disk Guard → Worker (تازه — PN-020/H2: راه‌حل ساختاری چهارمین ENOSPC) ──
  // هر ۱ ساعت: سنجش فضای آزاد (هشدار <۲۰٪ · بحرانی <۱۰٪) + هرس خودکار نسل‌ها
  // (بقا: ۵ نسل آخر در upload/.survival + deliver-store · download: ۳ نسل آخر
  // فقط ردیابی‌نشده) — هر حذف در AuditLog با action=DISK_PRUNE ثبت می‌شود.
  if (process.env.MELK_DISK_GUARD !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.diskGuard,
      title: "گارد فضای دیسک + هرس خودکار (PN-020/H2)",
      intervalMs: 60 * 60_000,
      firstRunDelayMs: 2 * 60_000,
      run: async (database) => {
        const { runDiskGuard } = await import("@/core/runtime/guards");
        return runDiskGuard(database);
      },
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── Memory Consolidation → Worker (تازه — PN-025/ستون ۱: تثبیت شبانهٔ حافظه) ──
  // هر شب: گذارهای hot→warm (عمر>۷روز و امتیاز≥۰٫۷) · warm→cold (عمر>۳۰روز و
  // امتیاز<۰٫۳) · بیداری cold→warm (دسترسی تازه) — شاهد ConsolidationRun + AuditLog.
  if (process.env.MELK_MEMORY_CONSOLIDATION !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.memoryConsolidation,
      title: "تثبیت شبانهٔ حافظهٔ بلندمدت (PN-025)",
      intervalMs: Number(process.env.MELK_MEMORY_CONSOLIDATION_INTERVAL_H ?? 24) * 60 * 60_000,
      firstRunDelayMs: 5 * 60_000,
      run: async (database) => {
        const { runConsolidation } = await import("@/lib/services/memory-lifecycle-service");
        void database;
        return runConsolidation();
      },
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── IP-Log → Worker (تازه — PN-029 مرحلهٔ ۷: گارد IP کانتینر) ──
  // هر ۶ ساعت: تشخیص IP عمومی کانتینر (ifconfig.me → api.ipify.org) + ثبت در
  // ContainerIpLog و AuditLog؛ تغییر IP پس از ریست پلتفرم = سرنخ ریشهٔ «الف».
  // ⚠ این کار در حالت آفلینی نیز فعال می‌ماند — میزبانهای سنجش IP، سامانه‌های
  // ملک تبریز نیستند و خود سند شورا آزمون ۵ را خواسته است.
  jobs.push({
    id: WORKER_JOB_IDS.ipLog,
    title: "گارد IP کانتینر (PN-029 مرحلهٔ ۷)",
    intervalMs: 6 * 60 * 60_000,
    firstRunDelayMs: 45_000, // نخستین ثبت، کمتر از یک دقیقه پس از بوت
    run: async (database) => {
      const { recordContainerIp } = await import("@/lib/melk-api/container-ip");
      return recordContainerIp(database);
    },
    toDomain: (r) => {
      if (r && typeof r === "object") return r as Record<string, unknown>;
      return {};
    },
  });

  // ── Head Guard → Worker (تازه — PN-031-B/جلسهٔ ۰۳۹: جبران خودکار بازنشانی پلتفرم) ──
  // درس بازنشانی‌های ۷-۸: درخت گیت سالم ماند اما بیلد زنده کهنه شد؛
  // reset-guard درخت گیت را می‌سنجید (HEALTHY دروغین) و preview-guard فقط
  // هشدار می‌داد. این گارد حلقهٔ بسته است: BUILD_ID زنده ≠ HEAD ⇒ بیلد +
  // ری‌استارت + تأیید + شاهد AuditLog(action=HEAD_GUARD_AUTOBUILD).
  // ⚠ نکتهٔ حیاتی: rebuild خودِ Worker را هم ری‌استارت می‌کند (بارگذاری
  // رجیستری تازه) — مقدار بازگشتی این تابع پس از آن تضمینی نیست؛ شاهد
  // نهایی از اسکریپت (witness + jsonl) و AuditLog می‌آید.
  // صفر auto_execute کسب‌وکاری — فقط بیلد زیرساختی (بند ۲.۴ سند ۰۳۹).
  if (process.env.MELK_HEAD_GUARD !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.headGuard,
      title: "گارد تازگی بیلد زنده — head-guard (PN-031-B)",
      intervalMs: envInt("MELK_HEAD_GUARD_INTERVAL_MINUTES", 10, 5) * 60_000,
      firstRunDelayMs: 90_000,
      run: async () => {
        const check = await runShell(join(REPO_ROOT, "scripts/recovery/audit-head-guard.sh"), ["check"], 3 * 60_000);
        if (check.code === 2) {
          const rec = await runShell(join(REPO_ROOT, "scripts/recovery/audit-head-guard.sh"), ["rebuild"], 30 * 60_000);
          return {
            verdict: "STALE-REBUILT",
            headAtCheck: "see-witness",
            rebuildCode: rec.code,
            rebuildStderr: rec.stderr.slice(0, 300),
          };
        }
        return { verdict: check.code === 0 ? "OK" : "ERROR", checkCode: check.code, stderr: check.stderr.slice(0, 300) };
      },
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── Relay Health Check → Worker (تازه — PN-038/۴.۱: پایش ۲۴ ساعتهٔ رله سه‌لایه) ──
  // شورا-ن۰۶۳: «Job relay-health-check (۳ لایه: Heartbeat، API Probe، Full Sync)»
  // هر ۵ دقیقه: محاسبهٔ سه لایه + حکم 🟢/🟡/🔴 + شاهد AuditLog + فایل شاهد.
  if (process.env.MELK_RELAY_HEALTH !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.relayHealthCheck,
      title: "پایش ۲۴ ساعتهٔ رله — سه لایه (PN-038/۴.۱)",
      intervalMs: envInt("MELK_RELAY_HEALTH_INTERVAL_MINUTES", 5, 2) * 60_000,
      firstRunDelayMs: 45_000, // نخستین سنجش زیر یک دقیقه پس از بوت
      run: async (_database) => {
        const { runRelayHealthCheckJob } = await import("@/lib/relay/health");
        return runRelayHealthCheckJob();
      },
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── Melketun Sync → Worker (تازه — PN-044/شورا-ن۰۸۸ · فاز ۳) ──
  // کش دادهٔ ملکتون از CRM (Laravel Inertia · نشست‌محور) → جداول مشترک با
  // tenantId='melketun'. الگوی ARM: چرخهٔ ۶ ساعت · فقط upsert (صفر حذف — قانون ۶).
  // استراتژی SESSION_HTML_ADAPTER — کشف فاز ۰: login-store + JSON اینرسیا.
  // خاموشی: MELK_MELKETUN_SYNC=disabled
  if (process.env.MELK_MELKETUN_SYNC !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.melketunSync,
      title: "هماهنگ‌سازی ملکتون (CRM → tenantId='melketun') — PN-044/۳",
      intervalMs: 6 * 60 * 60_000, // همان ARM/Mirror — ۶ ساعت (ریسک #۴: rate limit)
      firstRunDelayMs: 10 * 60_000, // نخستین sync ۱۰ دقیقه پس از بوت
      run: async (_database) => {
        const { syncMelketun } = await import("@/lib/integrations/melketun/sync");
        return syncMelketun();
      },
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── DB Health Probe → Worker (تازه — PN-041-R/شورا-ن۰۶۸ · فاز ۴) ──
  // خوددرمانی: اگر نوشتنِ آزمایشی ۳ بار پیاپی (۳ دقیقه) ناکام ماند ⇒ کل
  // فرایند با کد ۷۵ خارج می‌شود ⇒ نگهبان سرور در ۵ث دوباره اسپاون می‌کند ⇒
  // SQLite ژورنال داغ را rollback و مسیر باز می‌شود. بیمهٔ نهایی در برابر
  // هر قفل DB آینده — با WAL محلی این هرگز نباید شلیک کند (لایهٔ عمق).
  // خاموشی: MELK_DB_PROBE=disabled (تست‌ها)
  if (process.env.MELK_DB_PROBE !== "disabled") {
    const failures = { count: 0 };
    jobs.push({
      id: WORKER_JOB_IDS.dbHealthProbe,
      title: "پایش قفل دیتابیس + خوددرمانی ری‌استارت (PN-041-R/فاز ۴)",
      intervalMs: 60_000,
      firstRunDelayMs: 30_000,
      run: async (database) => {
        // پروب: قفل نوشتن واقعی — UPDATE بی‌اثر روی رکورد singleton (صفحهٔ
        // WAL می‌نویسد · قفل نوشتن می‌گیرد — دقیقاً همان چیزی که گیر می‌کند)
        const PROBE_SQL = "UPDATE AppMeta SET recordedAt=recordedAt WHERE id = 'singleton'";
        const PROBE_BUDGET_MS = 10_000;
        try {
          await Promise.race([
            database.$executeRawUnsafe(PROBE_SQL),
            new Promise((_, rej) => setTimeout(() => rej(new Error("probe-budget-exceeded")), PROBE_BUDGET_MS)),
          ]);
          failures.count = 0;
          return { verdict: "OK", consecutiveFailures: 0 };
        } catch (e) {
          failures.count += 1;
          const msg = String((e as Error)?.message ?? e).slice(0, 120);
          const critical = failures.count >= 3;
          try {
            database.auditLog.create({
              data: {
                action: critical ? "DB_PROBE_CRITICAL" : "DB_PROBE_FAIL",
                actor: "worker:db-health-probe",
                detail: JSON.stringify({ consecutiveFailures: failures.count, error: msg, at: new Date().toISOString() }),
              },
            }).catch(() => undefined);
          } catch { /* بهترین-تلاش */ }
          if (critical) {
            // قانون ۱۲ سند (صفر توقف): خروج ۷۵ = بازیابی — نگهبان در ۵ث بالا می‌آورد
            // ژورنال داغ محلی در باز شدن بعدی rollback می‌شود (اتمی · صفر گم‌شدن)
            try {
              const { logEvent } = await import("@/lib/logger");
              logEvent({
                level: "error",
                category: "system",
                operation: "db-health-probe",
                status: "fail",
                errorCode: "DB_STUCK_RESTARTING",
                detail: { consecutiveFailures: failures.count, error: msg, note: "خروج ۷۵ — نگهبان ۵ث بعد بالا می‌آورد" },
              });
            } catch { /* بهترین-تلاش */ }
            setTimeout(() => process.exit(75), 300);
            return { verdict: "CRITICAL-RESTARTING", consecutiveFailures: failures.count, error: msg };
          }
          return { verdict: "DEGRADED", consecutiveFailures: failures.count, error: msg };
        }
      },
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  return jobs;
}
