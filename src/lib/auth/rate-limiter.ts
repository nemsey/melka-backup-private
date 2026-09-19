/**
 * محدودساز نرخ (Rate Limiter) — مبتنی بر پایگاه داده
 * ------------------------------------------------------
 * هدف: جلوگیری از حدس متوالی کد پیامکی و کد مدیر.
 * پنجره لغزان (Sliding Window) بر اساس رکوردهای OtpAttempt.
 * حالت خاص: قفل‌شدن (Lockout) پس از شکست‌های متوالی.
 *
 * P6.5-09 (دستور مالک — رفع باگ سهمیهٔ مشترک پیامک PM/ARM):
 * سهمیه‌ها از این پس «به تفکیک جریان» شمرده می‌شوند — ارسال پیامک برای
 * اتصال PM، اتصال ARM و صفحهٔ ورود، هر کدام سهمیهٔ مستقل خود را دارند:
 *   REQUEST_OTP        → صفحهٔ ورود (کد پرسنلی + پیامک)
 *   REQUEST_OTP_PM     → اتصال حساب PM از تنظیمات عمومی
 *   REQUEST_OTP_ARM    → اتصال سامانه ARM از تنظیمات عمومی
 *   (+ همان تفکیک برای VERIFY_* و قفل‌ها)
 * ریشهٔ باگ: درخواست پیامک PM و بلافاصله ARM (یا بالعکس) روی سهمیهٔ
 * «واحد» شمرده می‌شد و کاربر با خطای «سقف پیامک / قبلاً ارسال شده»
 * بی‌درنگ می‌بست — در حالی که هر سامانه ملک تبریز پیامک مستقل می‌فرستد.
 */

import { db } from "@/lib/db";
import { getMelkApiConfig } from "@/lib/melk-api/config";

/**
 * جریان‌های شمارش‌شده — ستون kind در OtpAttempt (رشتهٔ آزاد؛ بدون مهاجرت).
 * انواع *_PM / *_ARM از نظر پنجره/سقف عین نوع پایهٔ خود عمل می‌کنند؛
 * فقط «سبد شمارش» جدا است.
 */
export type RateKind =
  | "REQUEST_OTP"
  | "VERIFY_OTP"
  | "MASTER_LOGIN"
  | "REQUEST_OTP_PM"
  | "VERIFY_OTP_PM"
  | "REQUEST_OTP_ARM"
  | "VERIFY_OTP_ARM";

export interface RateVerdict {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  reason?: string;
}

function windowMs(minutes: number): number {
  return minutes * 60 * 1000;
}

/** پیکربندی پنجره/سقف هر جریان — انواع *_PM / *_ARM عین نوع پایه (پیامک واقعی هزینه دارد) */
function quotaFor(kind: RateKind): { isRequest: boolean; windowMinutes: number; max: number; lockoutMinutes: number } {
  const cfg = getMelkApiConfig();
  const isRequest = kind.startsWith("REQUEST_OTP");
  return {
    isRequest,
    windowMinutes: isRequest ? cfg.otpRequestWindowMinutes : cfg.otpVerifyWindowMinutes,
    max: isRequest ? cfg.otpRequestMax : cfg.otpVerifyMax,
    lockoutMinutes: cfg.lockoutMinutes,
  };
}

export async function checkRate(personnelCode: string, kind: RateKind, ip?: string): Promise<RateVerdict> {
  const { isRequest, windowMinutes, max, lockoutMinutes } = quotaFor(kind);
  const since = new Date(Date.now() - windowMs(windowMinutes));

  const attempts = await db.otpAttempt.count({
    where: { personnelCode, kind, createdAt: { gte: since } },
  });

  // بررسی قفل فعال (شکست‌های متوالی) — فقط برای جریان‌های تأیید
  if (!isRequest) {
    const lockWindow = new Date(Date.now() - lockoutMinutes * 60 * 1000);
    const recentFails = await db.otpAttempt.count({
      where: { personnelCode, kind, success: false, createdAt: { gte: lockWindow } },
    });
    if (recentFails >= max) {
      const oldestFail = await db.otpAttempt.findFirst({
        where: { personnelCode, kind, success: false, createdAt: { gte: lockWindow } },
        orderBy: { createdAt: "asc" },
      });
      const elapsed = oldestFail ? Date.now() - oldestFail.createdAt.getTime() : 0;
      const retryAfter = Math.max(0, Math.ceil((lockoutMinutes * 60 * 1000 - elapsed) / 1000));
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: retryAfter,
        reason: "به دلیل تلاش‌های ناموفق متوالی، این کد پرسنلی موقتاً قفل شده است.",
      };
    }
  }

  if (attempts >= max) {
    const retryAfter = Math.max(30, windowMinutes * 60);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: retryAfter,
      reason: isRequest
        ? "تعداد درخواست کد پیامکی بیش از حد مجاز است. کمی بعد دوباره تلاش کنید."
        : "تعداد تلاش تأیید بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.",
    };
  }

  return { allowed: true, remaining: max - attempts, retryAfterSeconds: 0 };
}

export async function recordAttempt(
  personnelCode: string,
  kind: RateKind,
  success: boolean,
  ip?: string
): Promise<void> {
  await db.otpAttempt.create({ data: { personnelCode, kind, success, ip } });
}
