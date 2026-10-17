/**
 * گاردهای بدهی مالک‌سو — PN-014 (مرحله‌های ۳ و ۴)
 * ---------------------------------------------------------------------------
 * D3 (بستن با احترام): تصمیم مالک — کد مستر در تاریخچهٔ کامیت باقی می‌ماند
 *   («کد تغییر نمی‌کند»)؛ ریسک پذیرفته شد با سه قید: مخزن خصوصی + رمزنگاری
 *   scrypt در escrow + پایش دسترسی. پایش = همین گارد.
 *
 * D4 (تعویق + پایش): تصمیم LFS/حجم به تعویق افتاد؛ محرک‌های عددی تعیین شدند
 *   (DB>500MB · بستهٔ بقا>1GB · فضای آزاد دیسک<۱۵٪) و همین گارد هر ساعت
 *   می‌سنجد و در عبور از آستانه، هشدار خودکار در AuditLog ثبت می‌کند.
 *
 * اصول:
 *   · گارد هرگز Worker را نمی‌اندازد — نتیجه همیشه برگردانده می‌شود؛
 *     خطای زیرساختی = وضعیت error نه استثنا.
 *   · هشدار = رد AuditLog (append-only) با action=INFRA_ALERT — قابل
 *     کوئری توسط مالک؛ تکرار هشدار هر اجرای گارد تا رفع (طبیعی است).
 *   · هر دو گارد قابل تست‌اند: مسیرها/آستانه‌ها/واکشونندهٔ fetch تزریقی.
 */

import { existsSync, statSync, readdirSync, statfsSync, unlinkSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { REPO_ROOT } from "./jobs";

/** واکنش‌گرای شبکهٔ تزریقی (تست می‌تواند بدل بگذارد) */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface PrivacyGuardResult {
  job: "privacy-guard";
  repo: string;
  probeHttpCode: number | null;
  status: "PASS" | "ALERT" | "ERROR";
  message: string;
  checkedAt: string;
}

export interface SizeGuardItem {
  label: string;
  path: string;
  sizeMB: number;
  thresholdMB: number;
  breached: boolean;
}

export interface SizeGuardResult {
  job: "size-guard";
  status: "PASS" | "ALERT" | "ERROR";
  items: SizeGuardItem[];
  diskFreePercent: number | null;
  diskFreeBreached: boolean;
  message: string;
  checkedAt: string;
}

/** نام مخزن آینه — قابل override با env (پیش‌فرض: مخزن رسمی ملکا) */
export function githubRepoName(): string {
  return process.env.MELKA_GITHUB_REPO ?? "nemsey/melka-backup-private";
}

/** ثبت رد حسابرسی زیرساختی — غیرمسدودکننده (الگوی audit.ts) */
async function writeAlert(
  db: PrismaClient,
  actor: string,
  detail: string,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action: "INFRA_ALERT",
        actor,
        detail,
        operation: "READ",
        entityType: "infra",
        recordCount: 1,
        accessScope: "OWNER",
      },
    });
  } catch {
    // AuditLog از دسترس خارج بود — گارد نباید متوقف شود؛ خطا در نتیجه می‌ماند
  }
}

/**
 * گارد D3 — پایش دسترسی به مخزن آینهٔ GitHub.
 * مخزن باید برای کاربر ناشناس «خصوصی» بماند: api.github.com بدون توکن باید
 * ۴۰۳ (یا 404 در صورت تغییر نام) بدهد. اگر روزی ۲۰۰ برگرداند یعنی مخزن
 * عمومی شده — هشدار فوری در AuditLog (شرط مالک در بستن D3 نقض شده).
 */
export async function runPrivacyGuard(
  db: PrismaClient,
  options?: { fetcher?: FetchLike; repo?: string },
): Promise<PrivacyGuardResult> {
  const repo = options?.repo ?? githubRepoName();
  const fetcher = options?.fetcher ?? ((u: string, i?: RequestInit) => fetch(u, i));
  const checkedAt = new Date().toISOString();
  const url = `https://api.github.com/repos/${repo}`;
  let code: number | null = null;
  try {
    const res = await fetcher(url, {
      // بدون احراز (توکن عمداً ارسال نمی‌شود) — شبیه‌سازی چشم غریبه
      headers: { Accept: "application/vnd.github+json", "User-Agent": "melka-privacy-guard" },
      signal: AbortSignal.timeout(15_000),
    });
    code = res.status;
    if (code === 200) {
      const message = `مخزن آینهٔ GitHub عمومی شده است! ${repo} بدون احراز هویت ۲۰۰ می‌دهد — شرط بستن D3 (خصوصی) نقض شد. اقدام فوری مالک: خصوصی‌سازی مجدد از تنظیمات مخزن.`;
      await writeAlert(db, "worker:privacy-guard", message);
      return { job: "privacy-guard", repo, probeHttpCode: code, status: "ALERT", message, checkedAt };
    }
    // ۴۰۳ = خصوصی (یا محدودیت نرخ — هر دو یعنی محتوای مخزن فاش نشده)
    // ۴۰۴ = خصوصی/حذف‌شده از دید ناشناس (GitHub مخازن خصوصی را 404 می‌دهد وقتی نام درست باشد)
    if (code === 403 || code === 404) {
      return {
        job: "privacy-guard", repo, probeHttpCode: code, status: "PASS",
        message: `مخزن خصوصی است — پروب ناشناس ${code} گرفت (مورد انتظار).`,
        checkedAt,
      };
    }
    const message = `پاسخ غیرمنتظرهٔ GitHub: ${code} — قضاوت قطعی ممکن نیست؛ دوباره در چرخهٔ بعد.`;
    await writeAlert(db, "worker:privacy-guard", message);
    return { job: "privacy-guard", repo, probeHttpCode: code, status: "ERROR", message, checkedAt };
  } catch (e) {
    const message = `شکست شبکهٔ گارد محرمانگی: ${e instanceof Error ? e.message : String(e)} — بی‌طرف (قطعی != افشا).`;
    return { job: "privacy-guard", repo, probeHttpCode: null, status: "ERROR", message, checkedAt };
  }
}

/** حجم یک مسیر به مگابایت (فایل یا درخت) — نبود = صفر */
export function pathSizeMB(p: string): number {
  try {
    if (!existsSync(p)) return 0;
    const st = statSync(p);
    if (st.isFile()) return st.size / (1024 * 1024);
    let total = 0;
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const s = statSync(full);
        if (s.isDirectory()) walk(full);
        else total += s.size;
      }
    };
    walk(p);
    return total / (1024 * 1024);
  } catch {
    return 0;
  }
}

/** فهرست پکیج‌های بقا — بزرگ‌ترین مؤلفهٔ حجم سرد */
function survivalRoots(): string[] {
  try {
    return readdirSync(join(REPO_ROOT, "upload/.survival"))
      .filter((f) => !f.startsWith("."))
      .map((f) => join(REPO_ROOT, "upload/.survival", f));
  } catch {
    return [];
  }
}

export function sizeGuardThresholds(): { dbMB: number; survivalMB: number; diskFreePercent: number } {
  return {
    dbMB: Number.parseFloat(process.env.MELKA_SIZE_GUARD_DB_MB ?? "500"),
    survivalMB: Number.parseFloat(process.env.MELKA_SIZE_GUARD_SURVIVAL_MB ?? "1024"),
    diskFreePercent: Number.parseFloat(process.env.MELKA_SIZE_GUARD_DISK_FREE_PERCENT ?? "15"),
  };
}

/**
 * گارد D4 — پایش رشد حجم (تعویق تصمیم LFS/ارتقا با محرک‌های عددی).
 * محرک‌ها (مصوب PN-014): db/custom.db > 500MB · مجموع بستهٔ بقا > 1GB ·
 * فضای آزاد دیسک < ۱۵٪. عبور از هر آستانه = هشدار خودکار AuditLog.
 */
export async function runSizeGuard(
  db: PrismaClient,
  options?: { dbPath?: string; survivalDirs?: string[]; diskFreeFn?: () => number | null },
): Promise<SizeGuardResult> {
  const checkedAt = new Date().toISOString();
  const th = sizeGuardThresholds();
  const dbPath = options?.dbPath ?? join(REPO_ROOT, "db/custom.db");
  const survivalDirs = options?.survivalDirs ?? survivalRoots();
  const items: SizeGuardItem[] = [];

  try {
    items.push({
      label: "پایگاه دادهٔ تولید (db/custom.db)",
      path: dbPath,
      sizeMB: pathSizeMB(dbPath),
      thresholdMB: th.dbMB,
      breached: false,
    });
    const survivalTotal = survivalDirs.reduce((sum, d) => sum + pathSizeMB(d), 0);
    items.push({
      label: "بسته‌های بقا (upload/.survival)",
      path: join(REPO_ROOT, "upload/.survival"),
      sizeMB: survivalTotal,
      thresholdMB: th.survivalMB,
      breached: false,
    });
    for (const it of items) it.breached = it.sizeMB > it.thresholdMB;

    const diskFreePercent = options?.diskFreeFn ? options.diskFreeFn() : null;
    const diskFreeBreached = diskFreePercent !== null && diskFreePercent < th.diskFreePercent;

    const breachedItems = items.filter((i) => i.breached);
    const status: SizeGuardResult["status"] = breachedItems.length > 0 || diskFreeBreached ? "ALERT" : "PASS";

    if (status === "ALERT") {
      const parts = [
        ...breachedItems.map((i) => `${i.label}: ${i.sizeMB.toFixed(1)}MB > آستانهٔ ${i.thresholdMB}MB`),
        ...(diskFreeBreached && diskFreePercent !== null
          ? [`فضای آزاد دیسک: ${diskFreePercent.toFixed(1)}٪ < آستانهٔ ${th.diskFreePercent}٪`]
          : []),
      ];
      const message = `محرک‌های D4 فعال شدند — ${parts.join(" · ")}. اقدام مالک: تصمیم LFS/ارتقای ظرفیت دیگر قابل تعویق نیست (اسناد: docs/DEBT-DECISIONS.md).`;
      await writeAlert(db, "worker:size-guard", message);
      return { job: "size-guard", status, items, diskFreePercent, diskFreeBreached, message, checkedAt };
    }
    return {
      job: "size-guard", status, items, diskFreePercent, diskFreeBreached,
      message: `همه زیر آستانه — DB ${items[0].sizeMB.toFixed(1)}MB/${th.dbMB} · بقا ${items[1].sizeMB.toFixed(1)}MB/${th.survivalMB}` +
        (diskFreePercent !== null ? ` · دیسک آزاد ${diskFreePercent.toFixed(1)}٪` : ""),
      checkedAt,
    };
  } catch (e) {
    return {
      job: "size-guard", status: "ERROR", items, diskFreePercent: null, diskFreeBreached: false,
      message: `خطای گارد حجم: ${e instanceof Error ? e.message : String(e)}`,
      checkedAt,
    };
  }
}

/** ─── PN-015 · K2 — گارد تازگی نسخهٔ دامنهٔ preview ───
 * «Preview Stale»: دامنه ممکن است 200ِ سالم بدهد اما کامیتِ کهنه سرو کند —
 * فقط مقایسهٔ هویت نسخه آن را می‌بیند. هر ۱۵ دقیقه در Worker می‌سنجد؛
 * STALE/DOWN = هشدار INFRA_ALERT (عین الگوی D3/D4).
 */
export interface PreviewGuardResult {
  job: "preview-guard";
  previewUrl: string;
  localHead: string;
  remoteGitSha: string | null;
  remoteBuildId: string | null;
  http: number | null;
  status: "PASS" | "STALE" | "ERROR";
  message: string;
  checkedAt: string;
}

/** دامنهٔ preview — قابل override با env (پیش‌فرض: دامنهٔ مستند پروژه) */
export function previewUrl(): string {
  return (process.env.MELKA_PREVIEW_URL ?? "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai").replace(/\/$/, "");
}

/** HEAD محلی — تزریقی برای آزمون */
export function localGitHead(execFn: (cmd: string, cwd: string) => string = (c, w) => execSync(c, { cwd: w, encoding: "utf8" }).trim()): string {
  try {
    return execFn("git rev-parse --short HEAD", REPO_ROOT);
  } catch {
    return "";
  }
}

export async function runPreviewGuard(
  db: PrismaClient,
  options?: { fetcher?: FetchLike; url?: string; head?: string },
): Promise<PreviewGuardResult> {
  const url = options?.url ?? previewUrl();
  const fetcher = options?.fetcher ?? ((u: string, i?: RequestInit) => fetch(u, i));
  const localHead = options?.head ?? localGitHead();
  const checkedAt = new Date().toISOString();
  const base: Omit<PreviewGuardResult, "status" | "message"> = {
    job: "preview-guard", previewUrl: url, localHead,
    remoteGitSha: null, remoteBuildId: null, http: null, checkedAt,
  };
  try {
    const res = await fetcher(`${url}/api/version`, { signal: AbortSignal.timeout(20_000) });
    if (res.status !== 200) {
      const message = `دامنهٔ preview پاسخ ${res.status} داد (انتظار ۲۰۰) — preview از دسترس خارج یا ناقص.`;
      await writeAlert(db, "worker:preview-guard", message);
      return { ...base, http: res.status, status: "ERROR", message, checkedAt };
    }
    const d = (await res.json()) as { buildId?: string; fingerprint?: { gitShortSha?: string } };
    const remoteGitSha = d.fingerprint?.gitShortSha ?? null;
    const remoteBuildId = d.buildId ?? null;
    if (!remoteGitSha) {
      const message = "پاسخ /api/version فاقد هویت نسخه است — بدنهٔ غیرمنتظره.";
      await writeAlert(db, "worker:preview-guard", message);
      return { ...base, http: 200, remoteGitSha, remoteBuildId, status: "ERROR", message, checkedAt };
    }
    if (remoteGitSha === localHead) {
      return {
        ...base, http: 200, remoteGitSha, remoteBuildId, status: "PASS",
        message: `preview تازه است — دامنه = HEAD محلی (${localHead}).`, checkedAt,
      };
    }
    const message = `preview کهنه است: دامنه ${remoteGitSha} سرو می‌کند اما HEAD محلی ${localHead || "?"} است — بازانتشار/بازبینی لازم (مسئلهٔ «Preview Stale» سفارش PN-015).`;
    await writeAlert(db, "worker:preview-guard", message);
    return { ...base, http: 200, remoteGitSha, remoteBuildId, status: "STALE", message, checkedAt };
  } catch (e) {
    const message = `شبکهٔ گارد preview شکست خورد: ${e instanceof Error ? e.message : String(e)} — قضاوت به چرخهٔ بعد.`;
    return { ...base, status: "ERROR", message, checkedAt };
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 * PN-020 · H2 — گارد فضای دیسک + هرس خودکار نسل‌ها (راه‌حل ساختاری ENOSPC)
 * ---------------------------------------------------------------------------
 * چهار حادثهٔ زندهٔ ENOSPC (PN-014 · 016 · 017 · 019) — مصوبهٔ شورا (جلسهٔ ۰۲۴):
 *   · آستانهٔ هشدار: فضای آزاد < ۲۰٪ · بحرانی: < ۱۰٪
 *   · هرس خودکارِ «بستهٔ بقا»: نگه‌داشت ۵ نسل آخر (هر دو مکان: پوشهٔ کار
 *     upload/.survival + قطعات تحویل deliver-store — هر دو gitignored و
 *     برگشت‌پذیر از تاریخچهٔ ساخت؛ فراداده‌های سبک — ALL.zip/SHA256SUMS/
 *     REJOIN/REPORT/MANIFEST — همیشه می‌مانند)
 *   · هرس خودکار download/: نگه‌داشت ۳ نسل آخر (فقط فایل‌های ردیابی‌نشدهٔ
 *     git — شواهد ردیابی‌شده هرگز حذف نمی‌شوند: صفر شکست تاریخچه)
 * حذف هر چیز در AuditLog با action=DISK_PRUNE ثبت می‌شود (رد قابل بازرسی).
 * ═══════════════════════════════════════════════════════════════════════ */

export interface DiskGuardPruneResult {
  /** پوشه‌های کار بقا هرس‌شده (upload/.survival) */
  survivalStagingDirs: string[];
  /** فایل‌های قطعهٔ .bin هرس‌شده (deliver-store) */
  deliverPartFiles: string[];
  /** پوشه‌های download/pnXXX هرس‌شده (فقط ردیابی‌نشده) */
  downloadDirs: string[];
  freedBytes: number;
  /** شواهدی که به دلیل ردیابی git دست نخوردند */
  keptTrackedNote: string | null;
}

export interface DiskGuardResult {
  job: "disk-guard";
  checkedAt: string;
  diskFreePercent: number | null;
  status: "PASS" | "WARN" | "CRITICAL" | "ERROR";
  thresholds: { warnPercent: number; criticalPercent: number; keepSurvivalGens: number; keepDownloadGens: number };
  pruned: DiskGuardPruneResult;
  message: string;
}

/** آستانه‌های مصوب شورا — قابل override با env */
export function diskGuardThresholds(): { warnPercent: number; criticalPercent: number; keepSurvivalGens: number; keepDownloadGens: number } {
  return {
    warnPercent: Number.parseFloat(process.env.MELK_DISK_GUARD_WARN_PERCENT ?? "20"),
    criticalPercent: Number.parseFloat(process.env.MELK_DISK_GUARD_CRITICAL_PERCENT ?? "10"),
    keepSurvivalGens: Math.max(2, Number.parseInt(process.env.MELK_DISK_GUARD_KEEP_SURVIVAL_GENS ?? "5", 10) || 5),
    keepDownloadGens: Math.max(1, Number.parseInt(process.env.MELK_DISK_GUARD_KEEP_DOWNLOAD_GENS ?? "3", 10) || 3),
  };
}

/** درصد فضای آزاد — statfs با fallback به df (تست می‌تواند تزریق کند) */
export function readDiskFreePercent(path: string = REPO_ROOT): number | null {
  try {
    const st = statfsSync(path);
    if (st.blocks > 0) {
      return Math.round(((st.bavail / st.blocks) * 100) * 10) / 10;
    }
  } catch {
    /* fallback زیر */
  }
  try {
    const out = execSync(`df -P "${path}" | tail -1`, { encoding: "utf8", timeout: 5_000 });
    const parts = out.trim().split(/\s+/);
    const use = Number.parseFloat(parts[4]?.replace("%", "") ?? "NaN");
    if (Number.isFinite(use)) return Math.round((100 - use) * 10) / 10;
  } catch {
    /* بدون قضاوت */
  }
  return null;
}

/** شمارهٔ نسل از نام (PN-017-20261008 / pn017-survival-part00.bin → 17) */
function generationNumberOf(name: string): number | null {
  const m = /pn[-_]?(\d{2,3})/i.exec(name);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/** اندازهٔ بازگشت‌پذیر یک مسیر (بایت) — برای شمارش فضای آزادشده */
function pathSizeBytes(p: string): number {
  try {
    const st = statSync(p);
    if (st.isFile()) return st.size;
    let total = 0;
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const full = join(dir, e);
        const s = statSync(full);
        if (s.isDirectory()) walk(full);
        else total += s.size;
      }
    };
    walk(p);
    return total;
  } catch {
    return 0;
  }
}

export async function runDiskGuard(
  db: PrismaClient,
  options?: {
    repoRoot?: string;
    diskFreeFn?: () => number | null;
    /** پیش‌فرض true — در حالت dry فقط گزارش (تست/بازرسی) */
    apply?: boolean;
  },
): Promise<DiskGuardResult> {
  const root = options?.repoRoot ?? REPO_ROOT;
  const th = diskGuardThresholds();
  const checkedAt = new Date().toISOString();
  const pruned: DiskGuardPruneResult = { survivalStagingDirs: [], deliverPartFiles: [], downloadDirs: [], freedBytes: 0, keptTrackedNote: null };
  const apply = options?.apply !== false;

  try {
    // ---- هرس ۱: پوشه‌های کار بقا (upload/.survival) — نگه‌داشت ۵ نسل آخر ----
    const survivalDir = join(root, "upload/.survival");
    if (existsSync(survivalDir)) {
      const gens = readdirSync(survivalDir)
        .filter((f) => generationNumberOf(f) !== null && statSync(join(survivalDir, f)).isDirectory())
        .sort((a, b) => (generationNumberOf(b) ?? 0) - (generationNumberOf(a) ?? 0)); // جدید → قدیم
      for (const g of gens.slice(th.keepSurvivalGens)) {
        const target = join(survivalDir, g);
        pruned.freedBytes += pathSizeBytes(target);
        pruned.survivalStagingDirs.push(g);
        if (apply) rmSync(target, { recursive: true, force: true });
      }
    }

    // ---- هرس ۲: قطعات تحویل بقا (deliver-store/*-survival-part*.bin) — ۵ نسل آخر ----
    // فراداده‌های سبک (ALL.zip · SHA256SUMS · REJOIN · REPORT · MANIFEST · پوشه‌های شاهد) همیشه می‌مانند
    const storeDir = join(root, "deliver-store");
    if (existsSync(storeDir)) {
      const partFiles = readdirSync(storeDir).filter((f) => /survival-part\d+\.bin$/i.test(f));
      const genIds = [...new Set(partFiles.map((f) => generationNumberOf(f)).filter((n): n is number => n !== null))].sort((a, b) => b - a);
      const keepGens = new Set(genIds.slice(0, th.keepSurvivalGens));
      for (const f of partFiles) {
        const g = generationNumberOf(f);
        if (g !== null && !keepGens.has(g)) {
          const target = join(storeDir, f);
          pruned.freedBytes += pathSizeBytes(target);
          pruned.deliverPartFiles.push(f);
          if (apply) unlinkSync(target);
        }
      }
    }

    // ---- هرس ۳: download/ — ۳ نسل آخر؛ فقط فایل‌های ردیابی‌نشدهٔ git ----
    const downloadDir = join(root, "download");
    if (existsSync(downloadDir)) {
      const gens = readdirSync(downloadDir)
        .filter((f) => /^pn\d{2,3}$/i.test(f) && statSync(join(downloadDir, f)).isDirectory())
        .sort((a, b) => (generationNumberOf(b) ?? 0) - (generationNumberOf(a) ?? 0));
      for (const g of gens.slice(th.keepDownloadGens)) {
        const target = join(downloadDir, g);
        // قید صفر-شکست تاریخچه: اگر git ردیابی کرده، فقط گزارش — حذف نیست
        try {
          const tracked = execSync(`git ls-files -- "${target.replace(/"/g, '\\"')}"`, { cwd: root, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] }).trim();
          if (tracked) {
            pruned.keptTrackedNote = `پوشه‌های download قدیمی‌تر از ${th.keepDownloadGens} نسل که git ردیابی کرده هرگز حذف نمی‌شوند (قید صفر-شکست تاریخچه) — آخرین: ${g}`;
            continue;
          }
        } catch {
          /* git نبود = ناشناخته؛ محافظه‌کار: حذف نکن */
          continue;
        }
        pruned.freedBytes += pathSizeBytes(target);
        pruned.downloadDirs.push(g);
        if (apply) rmSync(target, { recursive: true, force: true });
      }
    }

    // ---- سنجش و وضعیت ----
    const diskFreePercent = options?.diskFreeFn ? options.diskFreeFn() : readDiskFreePercent(root);
    let status: DiskGuardResult["status"] = "PASS";
    if (diskFreePercent === null) status = "ERROR";
    else if (diskFreePercent < th.criticalPercent) status = "CRITICAL";
    else if (diskFreePercent < th.warnPercent) status = "WARN";

    const freedMB = Math.round((pruned.freedBytes / (1024 * 1024)) * 10) / 10;
    const message =
      `فضای آزاد: ${diskFreePercent !== null ? `${diskFreePercent}٪` : "نامشخص"} · ` +
      `هرس: ${pruned.survivalStagingDirs.length} پوشهٔ کار + ${pruned.deliverPartFiles.length} قطعهٔ تحویل + ${pruned.downloadDirs.length} پوشهٔ download (${freedMB}MB آزاد شد)` +
      (pruned.keptTrackedNote ? ` · ${pruned.keptTrackedNote}` : "");

    // ثبت رخداد هرس در AuditLog (append-only — رد قابل بازرسی)
    if (apply && (pruned.survivalStagingDirs.length > 0 || pruned.deliverPartFiles.length > 0 || pruned.downloadDirs.length > 0)) {
      try {
        await db.auditLog.create({
          data: {
            action: "DISK_PRUNE",
            actor: "worker:disk-guard",
            detail: message,
            operation: "DELETE",
            entityType: "infra",
            recordCount: pruned.survivalStagingDirs.length + pruned.deliverPartFiles.length + pruned.downloadDirs.length,
            accessScope: "OWNER",
          },
        });
      } catch {
        /* هشدار بهترین-تلاش */
      }
    }
    // هشدار آستانه (تکرار تا رفع — طبیعی)
    if (status === "WARN" || status === "CRITICAL") {
      await writeAlert(
        db,
        "worker:disk-guard",
        status === "CRITICAL"
          ? `فضای دیسک بحرانی است: ${diskFreePercent}٪ آزاد (< ${th.criticalPercent}٪) — هرس خودکار انجام شد؛ اگر همچنان بحرانی است، پاک‌سازی دستی یا ارتقای ظرفیت لازم است (تیکت D1).`
          : `فضای دیسک زیر آستانهٔ هشدار است: ${diskFreePercent}٪ آزاد (< ${th.warnPercent}٪) — هرس خودکار انجام شد.`
      );
    }
    return { job: "disk-guard", checkedAt, diskFreePercent, status, thresholds: th, pruned, message };
  } catch (e) {
    return {
      job: "disk-guard", checkedAt, diskFreePercent: null, status: "ERROR", thresholds: th, pruned,
      message: `خطای گارد دیسک: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
