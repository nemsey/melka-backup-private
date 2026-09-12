/**
 * POST /api/auth/request-otp
 * مرحله ۱ ورود: دریافت کد پرسنلی، صدور کد پیامکی از سامانه ملک تبریز.
 * محدودسازی نرخ: حداکثر ۳ درخواست در ۱۰ دقیقه برای هر کد پرسنلی.
 */

import { NextRequest } from "next/server";
import { getMelkProvider } from "@/lib/melk-api/provider";
import { isValidPersonnelCodeFormat } from "@/lib/auth/crypto";
import { checkRate, recordAttempt } from "@/lib/auth/rate-limiter";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  let personnelCode = "";
  try {
    const body = (await request.json().catch(() => null)) as { personnelCode?: string } | null;
    personnelCode = body?.personnelCode?.trim() ?? "";

    if (!isValidPersonnelCodeFormat(personnelCode)) {
      throw new MelkApiError("INVALID_PERSONNEL_CODE", "قالب کد پرسنلی نامعتبر است (۶ تا ۱۲ رقم).", 400, false);
    }

    const ip = request.headers.get("x-forwarded-for") ?? undefined;
    const rate = await checkRate(personnelCode, "REQUEST_OTP", ip);
    if (!rate.allowed) {
      throw new MelkApiError("RATE_LIMITED", rate.reason ?? "درخواست بیش از حد مجاز.", 429, false);
    }

    const provider = getMelkProvider();
    const result = await provider.requestOtp(personnelCode, ip);

    await recordAttempt(personnelCode, "REQUEST_OTP", true, ip);
    await audit("OTP_REQUESTED", personnelCode);

    return Response.json({
      ok: true,
      expiresInSeconds: result.expiresInSeconds,
      // در حالت Mock کد برای دمو برگردانده می‌شود؛ در حالت Real هرگز
      demoOtp: result.demoOtp,
    });
  } catch (err) {
    if (personnelCode) {
      await recordAttempt(personnelCode, "REQUEST_OTP", false).catch(() => {});
    }
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در صدور کد پیامکی.", 500, false));
  }
}
