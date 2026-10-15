/**
 * POST /api/auth/guest-login — PN-016 مسیر ۳ (بند ۵.۲.۳)
 * ---------------------------------------------------------------------------
 * ورود مهمان با موبایل + OTP یک‌بارمصرف:
 *   · تأیید از هش درون‌حافظه (TTL ۵ دقیقه · حداکثر ۵ تلاش)
 *   · User با role=GUEST (فقط خانه — بند ۵.۲.۲)
 *   · نشست: personnelCode = guest:<mobile> (هرگز با کد پرسنلی واقعی تصادم نمی‌کند)
 *   · UserActivity + UserSession ثبت می‌شود (عین مسیر پرسنلی)
 * نرخ‌سنج: سبد GUEST_LOGIN (۵/۱۵ دقیقه).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse } from "@/lib/auth/guard";
import { audit, createSession } from "@/lib/auth/session";
import { hashToken } from "@/lib/auth/crypto";
import { checkRate, recordAttempt } from "@/lib/auth/rate-limiter";
import { clientIp } from "@/lib/auth/client-ip";
import { logAuth } from "@/lib/logger";
import { verifyGuestOtp, isValidGuestMobile } from "@/lib/auth/guest-otp";
import { resolveGuestLoginUser, recordLoginSession } from "@/lib/services/users-service";
import { recordUserActivity } from "@/lib/users/user-model";

export async function POST(request: NextRequest) {
  let mobile = "";
  try {
    const body = (await request.json().catch(() => null)) as { mobile?: string; otp?: string } | null;
    mobile = body?.mobile?.trim() ?? "";
    const otp = body?.otp?.trim() ?? "";

    if (!isValidGuestMobile(mobile)) {
      throw new MelkApiError("INVALID_MOBILE", "قالب موبایل نامعتبر است (09xxxxxxxxx).", 400, false);
    }
    if (!/^\d{4}$/.test(otp)) {
      throw new MelkApiError("OTP_INVALID", "کد پیامکی باید ۴ رقم باشد.", 400, false);
    }

    const ip = clientIp(request);
    const rate = await checkRate(mobile, "GUEST_LOGIN", ip);
    if (!rate.allowed) {
      throw new MelkApiError("RATE_LIMITED", rate.reason ?? "تلاش بیش از حد مجاز.", 429, false);
    }

    // ✅ تأیید OTP مهمان (هش درون‌حافظه — یک‌بارمصرف)
    const verdict = verifyGuestOtp(mobile, otp);
    if (!verdict.ok) {
      await recordAttempt(mobile, "GUEST_LOGIN", false, ip);
      logAuth("otp-failed", { userId: `guest:${mobile.slice(-4)}`, status: "fail", errorCode: "OTP_INVALID" });
      throw new MelkApiError("OTP_INVALID", verdict.reason ?? "کد پیامکی نادرست یا منقضی است.", 401, false);
    }
    await recordAttempt(mobile, "GUEST_LOGIN", true, ip);

    // رجیستری کاربران — مهمان همیشه GUEST (بند ۵.۲.۳ مسیر ۳)
    const resolution = await resolveGuestLoginUser(mobile);
    if (!resolution.user.isActive) {
      await audit("GUEST_LOGIN_BLOCKED", `guest:${mobile.slice(-4)}`, "user-deactivated");
      throw new MelkApiError("FORBIDDEN", "حساب کاربری شما غیرفعال شده است. با مدیر سامانه تماس بگیرید.", 403, false);
    }

    const sessionKey = `guest:${mobile}`; // هرگز با کد پرسنلی تصادم نمی‌کند
    const { token, context } = await createSession(
      { personnelCode: sessionKey, displayName: resolution.user.fullName, role: "CONSULTANT" }, // نقش قدیمی: مشاورِ بدون کاشی
      { ip, userAgent: request.headers.get("user-agent") ?? undefined },
      null // مهمان توکن ARM ندارد
    );

    // نقشهٔ نشست + سیاههٔ فعالیت + آخرین ورود (PN-016)
    await recordLoginSession({
      userId: resolution.user.id,
      tokenHash: hashToken(token),
      ip,
      userAgent: request.headers.get("user-agent") ?? undefined,
      expiresAt: new Date(context.expiresAt),
    });
    await recordUserActivity({
      userId: resolution.user.id,
      action: "login",
      details: JSON.stringify({ path: "guest-login", effectiveRole: "GUEST", newlyProvisioned: resolution.isNewlyProvisioned }),
      ip,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    await audit("GUEST_LOGIN_SUCCESS", `guest:${mobile.slice(-4)}`, "role=CONSULTANT; effectiveRole=GUEST");

    return Response.json({
      ok: true,
      token,
      user: {
        sessionId: context.sessionId,
        personnelCode: context.personnelCode,
        displayName: context.displayName,
        role: context.role,
        effectiveRole: "GUEST",
        expiresAt: context.expiresAt,
      },
    });
  } catch (err) {
    if (mobile && !(err instanceof MelkApiError && (err.code === "RATE_LIMITED" || err.code === "OTP_INVALID"))) {
      await recordAttempt(mobile, "GUEST_LOGIN", false).catch(() => {});
    }
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در ورود مهمان.", 500, false));
  }
}
