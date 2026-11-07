/**
 * BuildFreshness — تازگی بیلد زنده نسبت به HEAD گیت (PN-031-B · جلسهٔ ۰۳۹)
 * ---------------------------------------------------------------------------
 * درس بازنشانی‌های هفتم و هشتم: درخت گیت سالم ماند اما سرور زنده از کش
 * پلتفرم بیلد کهنه سرو می‌کرد. این ماژول «حکم تازگی» را به‌صورت خالص
 * (تزریقی و آزمون‌پذیر) محاسبه می‌کند و شاهد گارد head-guard را می‌خواند.
 *
 * مصرف‌کنندگان:
 *   • GET /api/runtime/build-freshness — بنر تنظیمات (OWNER)
 *   • tests/pn031b-head-guard.test.ts   — آزمون خالص حکم
 *
 * اصل: مقایسهٔ SHA کامل (نه کوتاه) — هر دو طرف از منبع قطعی.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** ریشهٔ مخزن — همان لنگر رسمی پروژه (instrumentation / watchdog) */
export const FRESHNESS_REPO_ROOT = process.env.MELKA_REPO_DIR ?? "/home/z/my-project";

/** ورودی محاسبه — همهٔ فیلدها تزریقی برای آزمون؛ در تولید از دادهٔ واقعی */
export interface FreshnessInput {
  /** SHA کاملِ بیلدِ زنده (fingerprint.gitSha) */
  liveGitSha?: string | null;
  liveBuildId?: string | null;
  liveBuiltAt?: string | null;
  liveSource?: string | null;
  /** SHA کاملِ HEAD گیت */
  gitHead?: string | null;
  checkedAt?: string;
}

export type FreshnessVerdict = "FRESH" | "STALE" | "UNKNOWN";

export interface FreshnessResult {
  fresh: boolean;
  verdict: FreshnessVerdict;
  live: {
    gitSha: string | null;
    buildId: string | null;
    builtAt: string | null;
    source: string | null;
  };
  gitHead: string | null;
  checkedAt: string;
  /** پیام فارسی آمادهٔ نمایش در بنر تنظیمات */
  message: string;
}

/** حکم تازگی — خالص و بدون I/O */
export function computeBuildFreshness(input: FreshnessInput): FreshnessResult {
  const live = {
    gitSha: input.liveGitSha ?? null,
    buildId: input.liveBuildId ?? null,
    builtAt: input.liveBuiltAt ?? null,
    source: input.liveSource ?? null,
  };
  const gitHead = input.gitHead ?? null;
  const checkedAt = input.checkedAt ?? new Date().toISOString();

  const base = { live, gitHead, checkedAt };

  // هر طرف نامشخص ⇒ حکم نامشخص (صادقانه — نه سبز کاذب نه قرمز کاذب)
  if (!live.gitSha || !gitHead) {
    return {
      ...base,
      fresh: false,
      verdict: "UNKNOWN",
      message: "وضعیت تازگی سرور نامشخص است — هویت بیلد زنده یا HEAD گیت خوانده نشد.",
    };
  }
  if (live.gitSha === gitHead) {
    return {
      ...base,
      fresh: true,
      verdict: "FRESH",
      message: "سرور روی HEAD است — بیلد زنده با آخرین کد مخزن یکسان است.",
    };
  }
  return {
    ...base,
    fresh: false,
    verdict: "STALE",
    message: "سرور بروز نیست — بیلد کهنه سرو می‌شود؛ جبران خودکار head-guard در راه است (بررسی هر ۱۰ دقیقه).",
  };
}

/** HEAD کامل گیت — خواندن زنده از مخزن (تزریقی برای آزمون) */
export function gitHeadFull(
  execFn: (cmd: string, opts: { cwd: string; encoding: "utf8"; timeout: number }) => string = (c, o) => String(execSync(c, o)),
): string | null {
  try {
    const out = execFn("git rev-parse HEAD", { cwd: FRESHNESS_REPO_ROOT, encoding: "utf8", timeout: 5000 });
    const sha = String(out).trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/** شاهد آخرین اجرای head-guard — بهترین-تلاش (نبود فایل = null) */
export interface HeadGuardWitness {
  at: string;
  verdict: string;
  action?: string;
  head?: string;
}

export function readHeadGuardWitness(repoRoot: string = FRESHNESS_REPO_ROOT): HeadGuardWitness | null {
  try {
    const p = join(repoRoot, "upload", ".runtime", "head-guard.json");
    if (!existsSync(p)) return null;
    const d = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    if (typeof d.at !== "string" || typeof d.verdict !== "string") return null;
    return {
      at: d.at,
      verdict: d.verdict,
      action: typeof d.action === "string" ? d.action : undefined,
      head: typeof d.head === "string" ? d.head : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * شمار جبران‌های خودکار head-guard در ماه جاری (شاهد AuditLog).
 * DB به‌صورت تنبل import می‌شود تا این ماژول برای آزمون‌های خالص سبک بماند
 * و روت‌ها نیز مرز Repository را نقض نکنند (قانون P2: روت بدون db.*).
 */
export async function countAutoRebuildsThisMonth(now: Date = new Date()): Promise<number> {
  try {
    const { db } = await import("@/lib/db");
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return await db.auditLog.count({
      where: { action: "HEAD_GUARD_AUTOBUILD", createdAt: { gte: monthStart } },
    });
  } catch {
    return 0; // بهترین-تلاش — بنر هرگز به‌خاطر آمار نمی‌شکند
  }
}
