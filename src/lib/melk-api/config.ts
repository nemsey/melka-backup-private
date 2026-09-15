/**
 * پیکربندی لایه اتصال به سامانه‌های واقعی ملک تبریز
 * ------------------------------------------------------
 * تصمیم مهندسی: الگوی BFF (Backend-for-Frontend).
 * کلاینت هرگز مستقیماً به arus-api / pm-api متصل نمی‌شود؛
 * تمام درخواست‌ها از طریق مسیرهای API همین اپلیکیشن پروکسی می‌شوند.
 * با این کار: CORS کنترل می‌شود، توکن فقط سمت سرور می‌ماند،
 * و با تغییر سامانه‌ی ملک تبریز فقط همین لایه تغییر می‌کند.
 *
 * ⚠️ مقادیر پیش‌فرض از کشف واقعی (تحلیل باندل + تست زنده) آمده‌اند:
 *   ARM: https://arus-api.melketabriz.ir/api/apm/   (فرانت: arm.melketabriz.ir)
 *   PM:  https://pm-api.melketabriz.ir/api/          (فرانت: pm.melketabriz.ir)
 */

export type ApiMode = "real";

export interface MelkApiConfig {
  mode: ApiMode;
  /** آدرس فرانت سامانه ARM (اطلاعاتی/نمایشی) */
  armFrontUrl: string;
  /** آدرس فرانت سامانه PM (اطلاعاتی/نمایشی) */
  pmFrontUrl: string;
  /** پایه API سامانه ARM — کشف واقعی */
  armApiBase: string;
  /** پایه API عمومی ARM (بدون توکن) */
  armPublicApiBase: string;
  /** پایه API سامانه PM — کشف واقعی */
  pmApiBase: string;
  /** پایه API سامانه مالی (حسابداری fm) — کشف واقعی از platformsBaseUrl.acc */
  accApiBase: string;
  /** مهلت پاسخ درخواست (میلی‌ثانیه) */
  timeoutMs: number;
  /** تعداد تلاش مجدد خودکار برای خطاهای شبکه/5xx */
  maxRetries: number;
  /** کد ورود مدیر (مالک) — فقط سمت سرور استفاده می‌شود */
  masterCode: string;
  /** عمر نشست بر حسب ساعت */
  sessionTtlHours: number;
  /** حداکثر درخواست OTP برای هر کد پرسنلی در پنجره ۱۰ دقیقه‌ای */
  otpRequestWindowMinutes: number;
  otpRequestMax: number;
  /** حداکثر تلاش تأیید کد پیامکی در پنجره ۱۵ دقیقه‌ای */
  otpVerifyWindowMinutes: number;
  otpVerifyMax: number;
  /** مدت قفل شدن پس از شکست متوالی (دقیقه) */
  lockoutMinutes: number;
  /** فاصله همگام‌سازی خودکار پس‌زمینه (دقیقه) */
  syncIntervalMinutes: number;
}

function env(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v.trim() : fallback;
}

/**
 * اعتبارسنجی رازهای اجباری (fail-fast) — HOTFIX-01 / SEC-1
 * ------------------------------------------------------
 * در production، غیبت هر یک از رازهای زیر باید «در بوت» شکست بخورد،
 * نه در اولین فراخوانی سردِ مسیر حساس. fallback سورس‌نشسته ممنوع.
 */
export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return; // dev/test: کلید dev از .env.local یا اسکریپت dev-secrets
  const missing: string[] = [];
  if (!process.env.MASTER_ACCESS_CODE?.trim()) missing.push("MASTER_ACCESS_CODE");
  if (!process.env.MELK_TOKEN_KEY?.trim()) missing.push("MELK_TOKEN_KEY");
  if (missing.length > 0) {
    // پیام عمداً به stdout می‌رود تا در لاگ کانتینر دیده شود؛ رازی افشا نمی‌شود.
    throw new Error(
      `[boot:fail-fast] رازهای اجباری تنظیم نشده‌اند: ${missing.join(", ")}. ` +
        `بدون این مقادیر سرور بالا نمی‌آید (SEC-1/SEC-2 — حذف fallback). ` +
        `راهنما: .env.example را ببینید و سپس scripts/dev-secrets.ts برای محیط توسعه.`
    );
  }
}

export function getMelkApiConfig(): MelkApiConfig {
  return {
    mode: "real" as ApiMode,
    armFrontUrl: env("MELK_ARM_FRONT_URL", "https://arm.melketabriz.ir"),
    pmFrontUrl: env("MELK_PM_FRONT_URL", "https://pm.melketabriz.ir"),
    armApiBase: env("MELK_ARM_API_BASE", "https://arus-api.melketabriz.ir/api/apm/"),
    armPublicApiBase: env("MELK_ARM_PUBLIC_API_BASE", "https://arus-api.melketabriz.ir/api/public/"),
    pmApiBase: env("MELK_PM_API_BASE", "https://pm-api.melketabriz.ir/api/"),
    accApiBase: env("MELK_ACC_API_BASE", "https://fm-api.melketabriz.ir/"),
    timeoutMs: Number(env("MELK_API_TIMEOUT_MS", "25000")),
    maxRetries: Number(env("MELK_API_MAX_RETRIES", "2")),
    masterCode: env("MASTER_ACCESS_CODE", ""), // SEC-1: بدون fallback — در production با assertProductionSecrets اجباری می‌شود
    sessionTtlHours: Number(env("SESSION_TTL_HOURS", "12")),
    otpRequestWindowMinutes: 10,
    otpRequestMax: 3,
    otpVerifyWindowMinutes: 15,
    otpVerifyMax: 5,
    lockoutMinutes: 15,
    syncIntervalMinutes: Number(env("MELK_SYNC_INTERVAL_MINUTES", "5")),
  };
}
