/**
 * POST /api/auth/verify-otp
 * مرحله ۲ ورود: تأیید کد پیامکی ۴ رقمی در سامانه واقعی ARM
 * (POST arus-api.melketabriz.ir/api/apm/authentication/otp/login {code, otpCode})
 * سپس صدور نشست محلی + نگهداری رمزنگاری‌شده توکن‌های ARM.
 * محدودسازی: حداکثر ۵ تلاش در ۱۵ دقیقه + قفل ۱۵ دقیقه‌ای پس از شکست متوالی.
 */

import { NextRequest } from "next/server";
import { getMelkProvider } from "@/lib/melk-api/provider";
import { isValidOtpFormat, isValidPersonnelCodeFormat } from "@/lib/auth/crypto";
import { checkRate, recordAttempt } from "@/lib/auth/rate-limiter";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse } from "@/lib/auth/guard";
import { createSession, audit } from "@/lib/auth/session";
import { logAuth } from "@/lib/logger";

export async function POST(request: NextRequest) {
  let personnelCode = "";
  try {
    const body = (await request.json().catch(() => null)) as { personnelCode?: string; otp?: string } | null;
    personnelCode = body?.personnelCode?.trim() ?? "";
    const otp = body?.otp?.trim() ?? "";

    if (!isValidPersonnelCodeFormat(personnelCode)) {
      throw new MelkApiError("INVALID_PERSONNEL_CODE", "قالب کد پرسنلی نامعتبر است.", 400, false);
    }
    if (!isValidOtpFormat(otp)) {
      throw new MelkApiError("OTP_INVALID", "کد پیامکی باید ۴ رقم باشد (مطابق سامانه ملک تبریز).", 400, false);
    }

    const ip = request.headers.get("x-forwarded-for") ?? undefined;
    const rate = await checkRate(personnelCode, "VERIFY_OTP", ip);
    if (!rate.allowed) {
      throw new MelkApiError("RATE_LIMITED", rate.reason ?? "تلاش بیش از حد مجاز.", 429, false);
    }

    // ✅ تأیید در سامانه واقعی ARM
    const provider = getMelkProvider();
    const result = await provider.verifyOtp(personnelCode, otp);

    await recordAttempt(personnelCode, "VERIFY_OTP", true, ip);

    // صدور نشست محلی + نگهداری رمزنگاری‌شده توکن‌های ARM برای داده‌های واقعی
    const { token, context } = await createSession(
      result.user,
      { ip, userAgent: request.headers.get("user-agent") ?? undefined },
      result.armTokens
    );
    await audit("LOGIN_SUCCESS", personnelCode, `role=${result.user.role}; armUserType=${result.armTokens.userType ?? "-"}`);

    return Response.json({
      ok: true,
      token,
      user: {
        sessionId: context.sessionId,
        personnelCode: context.personnelCode,
        displayName: context.displayName,
        role: context.role,
        expiresAt: context.expiresAt,
      },
    });
  } catch (err) {
    // HOTFIX-04 (B2): خطای RATE_LIMITED خودش تلاش شکست محسوب نمی‌شود —
    // ثبت آن پنجره قفل را تمدید می‌کرد (قفل خود-تمدیدشونده).
    if (personnelCode && !(err instanceof MelkApiError && err.code === "RATE_LIMITED")) {
      await recordAttempt(personnelCode, "VERIFY_OTP", false).catch(() => {});
      // P2-05 — رویداد الزامی شکست OTP (بدون خودِ کد/موبایل)
      logAuth("otp-failed", {
        userId: personnelCode,
        status: "fail",
        errorCode: err instanceof MelkApiError ? err.code : "UNKNOWN",
      });
    }
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در تأیید کد پیامکی.", 500, false));
  }
}
