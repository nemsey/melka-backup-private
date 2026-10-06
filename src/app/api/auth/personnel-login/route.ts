/**
 * POST /api/auth/personnel-login — PN-008 BLOCK 6 (بند ۶.۲)
 * ---------------------------------------------------------------------------
 * مسیر ورود با کد پرسنلی + کد پیامکی (عین verify-otp، با قرارداد نام‌گذاری شورا):
 *   ورودی: {personnelCode, otp}
 *   · personnelCode ∈ OWNER_PERSONNEL_CODES ⇒ نقش OWNER — دسترسی کامل بی‌محدودیت
 *   · سایر کدها ⇒ نقش CONSULTANT — دسترسی طبق PersonnelAccess (BLOCK 7)
 * نرخ‌سنج: همان سبد VERIFY_OTP (هر دو مسیر ورود پرسنلی سهمیهٔ واحد دارند — ضد بروت‌فورس).
 */

import { NextRequest } from "next/server";
import { getMelkProvider } from "@/lib/melk-api/provider";
import { isValidOtpFormat, isValidPersonnelCodeFormat } from "@/lib/auth/crypto";
import { checkRate, recordAttempt } from "@/lib/auth/rate-limiter";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse } from "@/lib/auth/guard";
import { createSession, audit } from "@/lib/auth/session";
import { logAuth } from "@/lib/logger";
import { clientIp } from "@/lib/auth/client-ip";
import { isOwnerPersonnelCode } from "@/lib/access/owner-codes";

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

    const ip = clientIp(request); // PN-008 BLOCK 3 — Trusted Proxy
    const rate = await checkRate(personnelCode, "VERIFY_OTP", ip);
    if (!rate.allowed) {
      throw new MelkApiError("RATE_LIMITED", rate.reason ?? "تلاش بیش از حد مجاز.", 429, false);
    }

    // ✅ تأیید در سامانه واقعی ARM (عین verify-otp)
    const provider = getMelkProvider();
    const result = await provider.verifyOtp(personnelCode, otp);
    await recordAttempt(personnelCode, "VERIFY_OTP", true, ip);

    // قانون هویت دوگانهٔ مالک — تضمین نهایی سمت روت (حتی اگر لایه provider عوض شد):
    // کد پرسنلی مالک از این مسیر هم ⇒ OWNER با دسترسی کامل.
    const user = isOwnerPersonnelCode(personnelCode)
      ? { ...result.user, role: "OWNER" as const, displayName: result.user.displayName || "مالک سامانه" }
      : { ...result.user, role: "CONSULTANT" as const };

    const { token, context } = await createSession(
      user,
      { ip, userAgent: request.headers.get("user-agent") ?? undefined },
      result.armTokens
    );
    await audit("PERSONNEL_LOGIN_SUCCESS", personnelCode, `role=${user.role}; path=personnel-login; armUserType=${result.armTokens.userType ?? "-"}`);

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
    if (personnelCode && !(err instanceof MelkApiError && err.code === "RATE_LIMITED")) {
      await recordAttempt(personnelCode, "VERIFY_OTP", false).catch(() => {});
      logAuth("otp-failed", {
        userId: personnelCode,
        status: "fail",
        errorCode: err instanceof MelkApiError ? err.code : "UNKNOWN",
      });
    }
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در ورود با کد پرسنلی.", 500, false));
  }
}
