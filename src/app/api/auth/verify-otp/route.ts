/**
 * POST /api/auth/verify-otp
 * مرحله ۲ ورود: تأیید کد پیامکی، صدور نشست رمزنگاری‌شده.
 * محدودسازی: حداکثر ۵ تلاش در ۱۵ دقیقه + قفل ۱۵ دقیقه‌ای پس از شکست متوالی.
 */

import { NextRequest } from "next/server";
import { getMelkProvider } from "@/lib/melk-api/provider";
import { isValidOtpFormat, isValidPersonnelCodeFormat } from "@/lib/auth/crypto";
import { checkRate, recordAttempt } from "@/lib/auth/rate-limiter";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse } from "@/lib/auth/guard";
import { createSession, audit } from "@/lib/auth/session";

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
      throw new MelkApiError("OTP_INVALID", "کد پیامکی باید ۶ رقم باشد.", 400, false);
    }

    const ip = request.headers.get("x-forwarded-for") ?? undefined;
    const rate = await checkRate(personnelCode, "VERIFY_OTP", ip);
    if (!rate.allowed) {
      throw new MelkApiError("RATE_LIMITED", rate.reason ?? "تلاش بیش از حد مجاز.", 429, false);
    }

    const provider = getMelkProvider();
    const result = await provider.verifyOtp(personnelCode, otp);

    await recordAttempt(personnelCode, "VERIFY_OTP", true, ip);

    // صدور نشست محلی (توکن فقط هش‌شده ذخیره می‌شود)
    const { token, context } = await createSession(result.user, {
      ip,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    await audit("LOGIN_SUCCESS", personnelCode, `role=${result.user.role}`);

    return Response.json({
      ok: true,
      token,
      user: context,
    });
  } catch (err) {
    if (personnelCode) {
      await recordAttempt(personnelCode, "VERIFY_OTP", false).catch(() => {});
    }
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در تأیید کد پیامکی.", 500, false));
  }
}
