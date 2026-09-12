/**
 * زیرساخت رمزنگاری احراز هویت (سمت سرور)
 * ------------------------------------------------------
 * اصول:
 * 1) توکن نشست فقط به‌صورت «هش SHA-256» ذخیره می‌شود — سرقت دیتابیس ≠ سرقت توکن.
 * 2) کد ورود مدیر (Master Code) با مقایسه زمان-ثابت بررسی می‌شود تا
 *    حملات Timing Attack ممکن نباشد.
 * 3) تولید همه مقادیر تصادفی با crypto ایمن (نه Math.random).
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";

/** تولید توکن نشست با ۳۲ بایت آنتروپی */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/** هش امن توکن برای ذخیره‌سازی در پایگاه داده */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** مقایسه زمان-ثابت رشته‌ها (ضد Timing Attack) */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** اعتبارسنجی ساختار کد پرسنلی: رقمی بین ۶ تا ۱۲ رقم */
export function isValidPersonnelCodeFormat(code: string): boolean {
  return /^\d{6,12}$/.test(code.trim());
}

/** اعتبارسنجی ساختار کد پیامکی: ۶ رقم */
export function isValidOtpFormat(otp: string): boolean {
  return /^\d{6}$/.test(otp.trim());
}

/** اعتبارسنجی ساختار کد ورود مدیر: ۸ رقم */
export function isValidMasterCodeFormat(code: string): boolean {
  return /^\d{8}$/.test(code.trim());
}
