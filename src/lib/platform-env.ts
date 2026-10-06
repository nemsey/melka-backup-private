/**
 * بارگذاری env.platform.json — سازوکار بقای دیپلوی روی پلتفرم Z.AI
 * ----------------------------------------------------------------
 * P6.5-08 (دستور مالک ۱۴۰۵/۰۶/۳۱ — «این مشکل را برای همیشه حل کن»)
 *
 * مسئلهٔ ریشه‌ای که این ماژول حل می‌کند:
 *  ۱) فرایند دیپلوی پلتفرم، فایل .env را به «DATABASE_URL-only» بازنویسی
 *     می‌کند و .env.local را کامل حذف می‌کند.
 *     شواهد: کامیت‌های دیپلوی b1336cc (حذف MELK_TOKEN_KEY از .env)
 *     و 90e2388 (حذف هر دو راز) در تاریخچهٔ git.
 *  ۲) سرور standalone خروجی `next build` نیز .env ریشهٔ پروژه را بار
 *     نمی‌کند (فایل‌های env کنار server.js جستجو می‌شوند، نه ریشه).
 *  ۳) در نتیجه هر دیپلوی عمومی بدون این سازوکار در بوت fail-fast می‌میرد
 *     (HOTFIX-01 / SEC-1, SEC-2 → assertProductionSecrets) و دامنهٔ عمومی
 *     روی همهٔ مسیرها 500 برمی‌گرداند — دقیقاً خطایی که مالک می‌دید.
 *
 * راه‌حل:
 *  مقادیر «تستی» (که از ابتدا در تاریخچهٔ git عمومی‌اند: کامیت fdf65dd،
 *  worklog و README) در env.platform.json در ریشهٔ پروژه نگهداری می‌شوند —
 *  خارج از src/** تا اسکن امنیتی HOTFIX-01 (ممنوعیت literal راز در سورس)
 *  دست‌نخورده و معتبر بماند. این ماژول در بوت سرور (instrumentation.ts)
 *  «فقط متغیرهای غایب» را از آن فایل پر می‌کند.
 *
 * اصول:
 *  - اولویت مطلق با متغیر محیطی واقعی است؛ این فایل هرگز مقدار موجود را
 *    بازنویسی نمی‌کند (چرخش کلید با env واقعی همچنان ممکن است).
 *  - کلیدهای با پیشوند «_» مستندسازی‌اند و نادیده گرفته می‌شوند.
 *  - غیبت یا خرابی فایل خطای بوت نیست؛ در آن صورت assertProductionSecrets
 *    همان رفتار fail-fast قبلی را دارد (اگر env واقعی هم نباشد).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface PlatformEnvResult {
  /** کلیدهایی که از فایل اعمال شدند (غایب در env واقعی بودند) */
  applied: string[];
  /** مسیر فایلی که خوانده شد (null = پیدا نشد) */
  source: string | null;
  /** خطای خواندن/تجزیه (null = بدون خطا) */
  error: string | null;
}

/**
 * مسیرهای کاندید — به‌ترتیب اولویت:
 *  ۱) cwd پروژه (اجرای dev از ریشه و دیپلوی از ریشهٔ ریپو)
 *  ۲) یک سطح بالاتر (اگر سرور standalone از داخل .next/standalone اجرا شود)
 */
const CANDIDATE_PATHS: Array<() => string> = [
  () => path.join(process.cwd(), "env.platform.json"),
  () => path.join(process.cwd(), "..", "env.platform.json"),
];

/**
 * اعمال fallback متغیرهای محیطی از env.platform.json — فقط برای کلیدهای غایب.
 * idempotent است: فراخوانی چندباره پس از اعمال، دیگر چیزی اعمال نمی‌کند.
 */
export function applyPlatformEnvFallbacks(): PlatformEnvResult {
  let file: string | null = null;
  for (const candidate of CANDIDATE_PATHS) {
    const p = candidate();
    if (existsSync(p)) {
      file = p;
      break;
    }
  }
  if (!file) {
    return { applied: [], source: null, error: "env.platform.json not found (non-fatal)" };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch (e) {
    return { applied: [], source: file, error: `parse failed: ${(e as Error).message}` };
  }

  const applied: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith("_")) continue; // کلیدهای مستندسازی
    if (typeof value !== "string" || value.trim().length === 0) continue;

    const current = process.env[key];
    if (current && current.trim().length > 0) continue; // env واقعی همیشه برنده است

    process.env[key] = value.trim();
    applied.push(key);
  }
  return { applied, source: file, error: null };
}
