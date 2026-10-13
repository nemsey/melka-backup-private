/**
 * مکانیزم OTP تک‌باره — PN-029 (مرحلهٔ ۸ سند شورا-ن۰۳۳)
 * ---------------------------------------------------------------------------
 * «قفل ۶ ساعته پس از هر تلاش OTP؛ جدول OtpRateLimit؛ API مخصوص برای
 * Owner که OTP را می‌سوزاند.»
 *
 * دکترین: پس از هفت ریست پلتفرم و انقضای همهٔ توکن‌ها، تنها راه بازیابی،
 * OTP است — ولی سقف سمت ملک تبریز (۵ تلاش در ۱۵ دقیقه به ازای کد پرسنلی +
 * سقف نامعلوم به ازای IP) یعنی هر تلاش بی‌برنامه، بلاک را عمیق‌تر می‌کند.
 * این ماژول هر تلاش را «سوزاندنی» می‌کند: یک تلاش = یک قفل ۶ ساعته،
 * در دو دامنه (کد پرسنلی + IP) — همیشه با پیام دقیق زمان باقی‌مانده (L6).
 */

import type { PrismaClient } from "@prisma/client";
import { MelkApiError } from "@/lib/melk-api/types";

/** مدت قفل پس از هر تلاش (ساعت) — مصوب مرحلهٔ ۸ */
export const OTP_LOCK_HOURS = 6;

/** دامنهٔ قفل برای کد پرسنلی */
export function otpScopeForCode(personnelCode: string): string {
  return `code:${personnelCode}`;
}

/** دامنهٔ قفل برای IP */
export function otpScopeForIp(ip: string): string {
  return `ip:${ip}`;
}

export interface OtpLockState {
  scope: string;
  allowed: boolean;
  /** میلی‌ثانیه تا بازشدن قفل (منفی = باز) */
  retryInMs: number;
  attempts: number;
}

/** قفل در حال حاضر — صددرصد محاسباتی روی رکورد DB */
export function judgeOtpLock(
  scope: string,
  row: { attempts: number; lockedUntil: Date | null } | null,
  now: Date = new Date()
): OtpLockState {
  if (!row || !row.lockedUntil || row.lockedUntil <= now) {
    return { scope, allowed: true, retryInMs: -1, attempts: row?.attempts ?? 0 };
  }
  return {
    scope,
    allowed: false,
    retryInMs: row.lockedUntil.getTime() - now.getTime(),
    attempts: row.attempts,
  };
}

/** بررسی دو دامنه (کد پرسنلی + IP) — اگر هریک بسته باشد، رد */
export async function checkOtpLock(
  db: PrismaClient,
  personnelCode: string,
  ip: string
): Promise<{ allowed: true } | { allowed: false; blocked: OtpLockState }> {
  try {
    const scopes = [otpScopeForCode(personnelCode), otpScopeForIp(ip)];
    const rows = await Promise.all(
      scopes.map((scope) =>
        db.otpRateLimit.findUnique({ where: { scope } }).catch(() => null)
      )
    );
    for (let i = 0; i < scopes.length; i++) {
      const state = judgeOtpLock(scopes[i], rows[i]);
      if (!state.allowed) return { allowed: false, blocked: state };
    }
    return { allowed: true };
  } catch {
    return { allowed: true }; // fail-open — خطای DB هرگز ورود را نمی‌بندد
  }
}

/** سوزاندن تلاش: attempts++ و قفل ۶ ساعتهٔ هر دو دامنه (مستقل از نتیجهٔ تلاش) */
export async function burnOtpAttempt(db: PrismaClient, personnelCode: string, ip: string): Promise<void> {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + OTP_LOCK_HOURS * 60 * 60 * 1000);
  const scopes = [otpScopeForCode(personnelCode), otpScopeForIp(ip)];
  for (const scope of scopes) {
    try {
      await db.otpRateLimit.upsert({
        where: { scope },
        create: { scope, attempts: 1, lastAttemptAt: now, lockedUntil },
        update: { attempts: { increment: 1 } as unknown as number, lastAttemptAt: now, lockedUntil },
      });
    } catch {
      // بهترین-تلاش
    }
  }
}

/** پیام فارسی دقیق برای ردِ قفل — با زمان باقی‌مانده (L6) */
export function otpLockedError(blocked: OtpLockState): MelkApiError {
  const ms = blocked.retryInMs;
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const fa = (n: number): string => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  const wait = h > 0 ? `${fa(h)} ساعت${m > 0 ? ` و ${fa(m)} دقیقه` : ""}` : `${fa(m)} دقیقه`;
  const domain = blocked.scope.startsWith("code:") ? "این کد پرسنلی" : "این نشانی شبکه";
  return new MelkApiError(
    "OTP_LOCKED",
    `مکانیزم OTP تک‌باره (PN-029): ${domain} تا ${wait} دیگر قفل است — تلاش بعدی پس از پایان مهلت مجاز است.`,
    429,
    false
  );
}

// ──────────── پوشش‌های روت (P2-03: روت‌ها از @/lib/db خالص می‌مانند) ────────────

/** بررسی قفل OTP برای درخواست ورودی — db داخلی (فقط در لایهٔ lib) */
export async function checkOtpLockForRequest(
  personnelCode: string,
  ip: string
): Promise<{ allowed: true } | { allowed: false; blocked: OtpLockState }> {
  const { db } = await import("@/lib/db");
  return checkOtpLock(db, personnelCode, ip);
}

/** سوزاندن تلاش OTP برای درخواست ورودی — db داخلی (فقط در لایهٔ lib) */
export async function burnOtpAttemptForRequest(personnelCode: string, ip: string): Promise<void> {
  const { db } = await import("@/lib/db");
  return burnOtpAttempt(db, personnelCode, ip);
}
