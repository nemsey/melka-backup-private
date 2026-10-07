/**
 * guest-otp.ts — PN-016: OTP مسیر مهمان (بند ۵.۲.۳ مسیر ۳)
 * ---------------------------------------------------------------------------
 * صدور/تأیید کد یک‌بارمصرف برای مهمان‌های موبایلی:
 *   · کد ۴ رقمی (عین سامانه ملک تبریز) · TTL ۵ دقیقه · حداکثر ۵ تلاش تأیید
 *   · فقط هش SHA-256 در حافظه — کد خام هرگز ذخیره/ثبت نمی‌شود
 *   · پاکسازی تنبل رکوردهای منقضی در هر دسترسی
 *
 * قید مستند: ذخیره در حافظهٔ فرایند = معماری تک‌نمونه‌ای مستند پروژه
 * (یک سرور Web + یک Worker). در توسعهٔ چندشهری → جدول DB یا Redis.
 */

import { createHash, randomInt } from "node:crypto";

interface GuestOtpEntry {
  hash: string;
  expiresAt: number;
  attempts: number;
}

const TTL_MS = 5 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

const globalForOtp = globalThis as unknown as {
  melkaGuestOtpStore: Map<string, GuestOtpEntry> | undefined;
};

const store: Map<string, GuestOtpEntry> =
  globalForOtp.melkaGuestOtpStore ?? new Map<string, GuestOtpEntry>();
globalForOtp.melkaGuestOtpStore = store;

function key(mobile: string): string {
  return mobile.trim();
}

function hash(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

function sweep(): void {
  const now = Date.now();
  for (const [k, v] of store) if (v.expiresAt < now) store.delete(k);
}

export function isValidGuestMobile(mobile: string): boolean {
  return /^09\d{9}$/.test(mobile.trim());
}

/** صدور OTP تازه برای موبایل — کد خام فقط یک‌بار به فراخواننده برمی‌گردد (برای کانال ارسال) */
export function issueGuestOtp(mobile: string): { code: string; expiresInSeconds: number } {
  sweep();
  const code = String(randomInt(1000, 10000)); // ۴ رقم — عین ملک تبریز
  store.set(key(mobile), { hash: hash(code), expiresAt: Date.now() + TTL_MS, attempts: 0 });
  return { code, expiresInSeconds: TTL_MS / 1000 };
}

/** تأیید OTP — یک‌بارمصرف: رکورد پس از تأیید موفق حذف می‌شود */
export function verifyGuestOtp(mobile: string, code: string): { ok: boolean; reason?: string } {
  sweep();
  const k = key(mobile);
  const entry = store.get(k);
  if (!entry) return { ok: false, reason: "کدی برای این شماره صادر نشده یا منقضی شده است." };
  if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
    store.delete(k);
    return { ok: false, reason: "تلاش بیش از حد مجاز — کد تازه بگیرید." };
  }
  entry.attempts += 1;
  if (entry.hash !== hash(code)) {
    if (entry.attempts >= MAX_VERIFY_ATTEMPTS) store.delete(k);
    return { ok: false, reason: "کد پیامکی نادرست است." };
  }
  store.delete(k); // یک‌بارمصرف
  return { ok: true };
}

/** آیا کد فعال برای موبایل وجود دارد؟ (برای پاسخ صادقانهٔ درخواست تکراری) */
export function hasActiveGuestOtp(mobile: string): boolean {
  sweep();
  const e = store.get(key(mobile));
  return Boolean(e && e.expiresAt > Date.now());
}
