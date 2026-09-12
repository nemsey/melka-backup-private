/**
 * محدودساز نرخ (Rate Limiter) — مبتنی بر پایگاه داده
 * ------------------------------------------------------
 * هدف: جلوگیری از حدس متوالی کد پیامکی و کد مدیر.
 * پنجره لغزان (Sliding Window) بر اساس رکوردهای OtpAttempt.
 * حالت خاص: قفل‌شدن (Lockout) پس از شکست‌های متوالی.
 */

import { db } from "@/lib/db";
import { getMelkApiConfig } from "@/lib/melk-api/config";

export type RateKind = "REQUEST_OTP" | "VERIFY_OTP" | "MASTER_LOGIN";

export interface RateVerdict {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  reason?: string;
}

function windowMs(kind: RateKind, minutes: number): number {
  return minutes * 60 * 1000;
}

export async function checkRate(personnelCode: string, kind: RateKind, ip?: string): Promise<RateVerdict> {
  const cfg = getMelkApiConfig();
  const isRequest = kind === "REQUEST_OTP";
  const windowMinutes = isRequest ? cfg.otpRequestWindowMinutes : cfg.otpVerifyWindowMinutes;
  const max = isRequest ? cfg.otpRequestMax : cfg.otpVerifyMax;
  const since = new Date(Date.now() - windowMs(kind, windowMinutes));

  const attempts = await db.otpAttempt.count({
    where: { personnelCode, kind, createdAt: { gte: since } },
  });

  // بررسی قفل فعال (شکست‌های متوالی)
  const lockWindow = new Date(Date.now() - cfg.lockoutMinutes * 60 * 1000);
  if (!isRequest) {
    const recentFails = await db.otpAttempt.count({
      where: { personnelCode, kind, success: false, createdAt: { gte: lockWindow } },
    });
    if (recentFails >= max) {
      const oldestFail = await db.otpAttempt.findFirst({
        where: { personnelCode, kind, success: false, createdAt: { gte: lockWindow } },
        orderBy: { createdAt: "asc" },
      });
      const elapsed = oldestFail ? Date.now() - oldestFail.createdAt.getTime() : 0;
      const retryAfter = Math.max(0, Math.ceil((cfg.lockoutMinutes * 60 * 1000 - elapsed) / 1000));
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
