/**
 * زیرساخت رمزنگاری احراز هویت (سمت سرور)
 * ------------------------------------------------------
 * اصول:
 * 1) توکن نشست فقط به‌صورت «هش SHA-256» ذخیره می‌شود — سرقت دیتابیس ≠ سرقت توکن.
 * 2) کد ورود مدیر (Master Code) با مقایسه زمان-ثابت بررسی می‌شود تا
 *    حملات Timing Attack ممکن نباشد.
 * 3) تولید همه مقادیر تصادفی با crypto ایمن (نه Math.random).
 * 4) توکن‌های سامانه ARM (دریافت‌شده از arus-api.melketabriz.ir) با
 *    AES-256-GCM رمزنگاری می‌شوند — کلید از متغیر محیطی MELK_TOKEN_KEY.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";

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

// ==========================================================================
// رمزنگاری توکن‌های ARM (AES-256-GCM)
// ==========================================================================

/**
 * راز رمزنگاری — HOTFIX-01 / SEC-2
 * الزام: MELK_TOKEN_KEY مستقل (نه کد مدیر، نه fallback سورس‌نشسته).
 * اگر تعریف نشده باشد null برمی‌گرداند تا فراخواننده fail-fast کند؛
 * در محیط production اعتبارسنجی بوت (assertProductionSecrets) مسدود می‌کند.
 */
export function melkTokenSecret(): string | null {
  return process.env.MELK_TOKEN_KEY?.trim() || null;
}

function armKey(): Buffer {
  const secret = melkTokenSecret();
  if (!secret) {
    // Fail-fast بدون fallback: فراخواننده باید خطای شفاف بدهد.
    throw new Error(
      "[crypto:fail-fast] MELK_TOKEN_KEY تنظیم نشده است — رمزنگاری/رمزگشایی توکن‌ها ممکن نیست (SEC-2). " +
        "برای محیط توسعه: scripts/dev-secrets.ts یا .env.local؛ برای production: متغیر محیطی سرور."
    );
  }
  // کلید ۳۲ بایتی پایدار از راز (بدون ذخیره راز خام)
  return createHash("sha256").update(`arm-token-enc:${secret}`, "utf8").digest();
}

/** رمزنگاری متن با AES-256-GCM — خروجی: base64(iv + tag + ciphertext) */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", armKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** رمزگشایی خروجی encryptSecret — در صورت نامعتبربودن null برمی‌گرداند */
export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const buf = Buffer.from(payload, "base64");
    if (buf.length < 29) return null; // 12 iv + 16 tag + حداقل 1 بایت
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", armKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

// ==========================================================================
// اعتبارسنجی ساختارها
// ==========================================================================

/** اعتبارسنجی ساختار کد پرسنلی: رقمی بین ۶ تا ۱۲ رقم */
export function isValidPersonnelCodeFormat(code: string): boolean {
  return /^\d{6,12}$/.test(code.trim());
}

/**
 * اعتبارسنجی ساختار کد پیامکی سامانه ARM: ۴ رقم
 * (کشف واقعی: فیلد ورود کد تأیید در arm.melketabriz.ir با numInputs:4 است)
 */
export function isValidOtpFormat(otp: string): boolean {
  return /^\d{4}$/.test(otp.trim());
}

/** اعتبارسنجی ساختار کد ورود مدیر: ۸ رقم */
export function isValidMasterCodeFormat(code: string): boolean {
  return /^\d{8}$/.test(code.trim());
}
