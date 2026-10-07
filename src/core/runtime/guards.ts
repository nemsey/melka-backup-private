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

import { existsSync, statSync, readdirSync } from "node:fs";
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
