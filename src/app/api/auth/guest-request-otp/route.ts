/**
 * POST /api/auth/guest-request-otp — PN-016 مسیر ۳ (بند ۵.۲.۳)
 * ---------------------------------------------------------------------------
 * درخواست کد یک‌بارمصرف برای ورود مهمان با موبایل.
 * امنیت: نرخ‌سنج ۳/۱۰ دقیقه · فقط هش · TTL ۵ دقیقه · یک‌بارمصرف.
 *
 * کانال ارسال (صادقانه): درگاه پیامک مستقل برای شماره‌های آزاد هنوز
 * متصل نیست (سامانه ARM فقط به کدهای پرسنی ثبت‌شده پیامک می‌فرستد).
 * کد در لاگ سرور ثبت می‌شود (GUEST_OTP) تا مالک در فاز اتصال درگاه،
 * مکانیزم را کامل بیازماید. متصل‌سازی درگاه = بلیط فاز ۶ ملی.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { checkRate, recordAttempt } from "@/lib/auth/rate-limiter";
import { clientIp } from "@/lib/auth/client-ip";
import { issueGuestOtp, isValidGuestMobile, hasActiveGuestOtp } from "@/lib/auth/guest-otp";
import { logAuth } from "@/lib/logger";

export async function POST(request: NextRequest) {
  let mobile = "";
  try {
    const body = (await request.json().catch(() => null)) as { mobile?: string } | null;
    mobile = body?.mobile?.trim() ?? "";

    if (!isValidGuestMobile(mobile)) {
      throw new MelkApiError("INVALID_MOBILE", "قالب موبایل نامعتبر است (09xxxxxxxxx).", 400, false);
    }

    const ip = clientIp(request);
    const rate = await checkRate(mobile, "GUEST_REQUEST_OTP", ip);
    if (!rate.allowed) {
      throw new MelkApiError("RATE_LIMITED", rate.reason ?? "درخواست بیش از حد مجاز.", 429, false);
    }

    if (hasActiveGuestOtp(mobile)) {
      await recordAttempt(mobile, "GUEST_REQUEST_OTP", false, ip);
      throw new MelkApiError("OTP_ALREADY_SENT", "کد فعال برای این شماره صادر شده است؛ چند لحظه صبر کنید.", 429, false);
    }

    const { expiresInSeconds } = issueGuestOtp(mobile);
    // کانال ارسال فعلی: لاگ ساختارمندِ لایهٔ logger (ماسک موبایل) — کد خام در هیچ DB/AuditLog نمی‌نشیند
    logAuth("otp-failed", { userId: `guest:${mobile.slice(-4)}`, status: "ok", detail: { phase: "issued", channel: "server-log", expiresInSeconds } });

    await recordAttempt(mobile, "GUEST_REQUEST_OTP", true, ip);
    await audit("GUEST_OTP_REQUESTED", `guest:${mobile.slice(-4)}`, "channel=server-log");

    return Response.json({
      ok: true,
      expiresInSeconds,
      delivery: "server-log",
      note: "درگاه پیامک مستقل هنوز متصل نیست — کد در لاگ سرور ثبت می‌شود (توسعهٔ فاز ۶ ملی).",
    });
  } catch (err) {
    if (mobile && !(err instanceof MelkApiError && (err.code === "RATE_LIMITED" || err.code === "OTP_ALREADY_SENT"))) {
      await recordAttempt(mobile, "GUEST_REQUEST_OTP", false).catch(() => {});
    }
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در صدور کد مهمان.", 500, false));
  }
}
