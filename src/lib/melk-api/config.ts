/**
 * پیکربندی لایه اتصال به سامانه‌های ملک تبریز
 * ------------------------------------------------------
 * تصمیم مهندسی: الگوی BFF (Backend-for-Frontend).
 * کلاینت هرگز مستقیماً به arm.melketabriz.ir متصل نمی‌شود؛
 * تمام درخواست‌ها از طریق مسیرهای API همین اپلیکیشن پروکسی می‌شوند.
 * با این کار: CORS کنترل می‌شود، توکن فقط سمت سرور می‌ماند،
 * و با تغییر سامانه‌ی ملک تبریز فقط همین لایه تغییر می‌کند.
 */

export type ApiMode = "mock" | "real";

export interface MelkApiConfig {
  mode: ApiMode;
  /** پایه سامانه CRM ملک تبریز */
  armBaseUrl: string;
  /** پایه سامانه مدیریت پروژه ملک تبریز */
  pmBaseUrl: string;
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
}

function env(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v.trim() : fallback;
}

export function getMelkApiConfig(): MelkApiConfig {
  const mode = (env("MELK_API_MODE", "mock").toLowerCase() === "real" ? "real" : "mock") as ApiMode;
  return {
    mode,
    armBaseUrl: env("MELK_ARM_BASE_URL", "https://arm.melketabriz.ir"),
    pmBaseUrl: env("MELK_PM_BASE_URL", "https://pm.melketabriz.ir"),
    timeoutMs: Number(env("MELK_API_TIMEOUT_MS", "15000")),
    maxRetries: Number(env("MELK_API_MAX_RETRIES", "2")),
    masterCode: env("MASTER_ACCESS_CODE", "41372895"),
    sessionTtlHours: Number(env("SESSION_TTL_HOURS", "12")),
    otpRequestWindowMinutes: 10,
    otpRequestMax: 3,
    otpVerifyWindowMinutes: 15,
    otpVerifyMax: 5,
    lockoutMinutes: 15,
  };
}
