/**
 * POST /api/auth/request-otp
 * مرحله ۱ ورود: دریافت کد پرسنلی → درخواست ارسال پیامک از سامانه واقعی
 * arm.melketabriz.ir (GET arus-api.melketabriz.ir/api/apm/authentication/otp/{code})
 * محدودسازی نرخ: حداکثر ۳ درخواست در ۱۰ دقیقه برای هر کد پرسنلی.
 *
 * PN-029 (مرحلهٔ ۸ — سند شورا-ن۰۳۳): مکانیزم OTP تک‌واره — هر تلاش،
 * صرف‌نظر از نتیجه، قفل ۶ ساعتهٔ همان کد پرسنلی و همان IP را فعال می‌کند
 * (جدول OtpRateLimit). دکترین: «یک OTP، یک بار» — هر تلاش بی‌برنامه بلاک را
 * عمیق‌تر می‌کند. مسیر عبورِ آگاهانه: API مخصوص مالک (/api/admin/otp-burn).
 */

import { NextRequest } from "next/server";
import { getMelkProvider } from "@/lib/melk-api/provider";
import { isValidPersonnelCodeFormat } from "@/lib/auth/crypto";
import { checkRate, recordAttempt } from "@/lib/auth/rate-limiter";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { clientIp } from "@/lib/auth/client-ip";
import { burnOtpAttemptForRequest as burnOtpAttempt, checkOtpLockForRequest as checkOtpLock, otpLockedError } from "@/lib/auth/otp-lock";

export async function POST(request: NextRequest) {
  let personnelCode = "";
  try {
    const body = (await request.json().catch(() => null)) as { personnelCode?: string } | null;
    personnelCode = body?.personnelCode?.trim() ?? "";

    if (!isValidPersonnelCodeFormat(personnelCode)) {
      throw new MelkApiError("INVALID_PERSONNEL_CODE", "قالب کد پرسنلی نامعتبر است (۶ تا ۱۲ رقم).", 400, false);
    }

    const ip = clientIp(request) ?? "unknown"; // PN-008 BLOCK 3 — Trusted Proxy (تک‌نقطه تصمیم) · PN-029: دامنهٔ قفل OTP
    const rate = await checkRate(personnelCode, "REQUEST_OTP", ip);
    if (!rate.allowed) {
      throw new MelkApiError("RATE_LIMITED", rate.reason ?? "درخواست بیش از حد مجاز.", 429, false);
    }

    // PN-029/مرحلهٔ ۸ — مکانیزم OTP تک‌واره: پیش از هر تلاش، قفل ۶ ساعتهٔ
    // دو دامنه (کد پرسنلی + IP) بررسی می‌شود؛ خودِ تلاش، قفل را می‌سوزاند.
    const otpLock = await checkOtpLock(personnelCode, ip);
    if (!otpLock.allowed) throw otpLockedError(otpLock.blocked);
    await burnOtpAttempt(personnelCode, ip);

    // ✅ فراخوانی واقعی سامانه ARM — پیامک از سمت ملک تبریز ارسال می‌شود
    const provider = getMelkProvider();
    const result = await provider.requestOtp(personnelCode, ip);

    await recordAttempt(personnelCode, "REQUEST_OTP", true, ip);
    await audit("OTP_REQUESTED", personnelCode, "arm.melketabriz.ir SMS dispatched");

    return Response.json({
      ok: true,
      expiresInSeconds: result.expiresInSeconds,
      source: "arm.melketabriz.ir",
    });
  } catch (err) {
    // HOTFIX-04 (B2): اگر خطای فعلی خود RATE_LIMITED است، تلاش «ردشده» ثبت نمی‌شود —
    // وگرنه هر تلاش در حالت قفل، یک رکورد شکست جدید می‌سازد و پنجره لغزان را
    // بی‌پایان تمدید می‌کرد (قفل خود-تمدیدشونده).
    if (personnelCode && !(err instanceof MelkApiError && (err.code === "RATE_LIMITED" || err.code === "OTP_LOCKED"))) {
      await recordAttempt(personnelCode, "REQUEST_OTP", false).catch(() => {});
    }
    if (err instanceof MelkApiError) return errorResponse(err);
    // خطای خام fetch به سامانه واقعی — پیام شفاف برای کاربر
    const msg = (err as Error)?.message?.includes("fetch")
      ? "ارتباط با سامانه ملک تبریز برقرار نشد. لطفاً اتصال شبکه و وضعیت سرورهای ملک تبریز را بررسی کنید."
      : "خطای غیرمنتظره در صدور کد پیامکی.";
    return errorResponse(new MelkApiError("UNKNOWN", msg, 500, false));
  }
}
