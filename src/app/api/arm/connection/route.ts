/**
 * /api/arm/connection — بخش «اتصال به سامانه ARM با کد پیامکی» در تنظیمات عمومی
 * ------------------------------------------------------
 * GET  — وضعیت اتصال ARM «نشست جاری» (فقط خواندن DB — بدون تماس شبکه)
 * POST — عملیات: start-otp | verify | disconnect
 *
 * هدف (دستور مالک ۱۴۰۵/۰۶/۳۰): اگر مالک با «کد مستر» وارد شده باشد
 * (نشستِ بدون توکن ARM)، بتواند از همین کاشی با کد پرسنلی + پیامک،
 * اتصال سامانه ARM را به «نشست جاری خودش» متصل کند — بدون خروج و
 * ورود مجدد. این همان جریان عین صفحه ورود است:
 *   GET  authentication/otp/{code}  → پیامک واقعی از سمت ARM
 *   POST authentication/otp/login   → توکن نشست ARM
 *
 * امنیت:
 *  - توکن‌ها فقط به «نشست خودِ درخواست‌کننده» متصل می‌شوند (SEC-3 — هیچ توکن مشترک/singleton)
 *  - همان محدودساز نرخ صفحه ورود: ۳ پیامک/۱۰ دقیقه، ۵ تأیید/۱۵ دقیقه + قفل ۱۵ دقیقه‌ای
 *    (سهمیه با صفحه ورود مشترک است — پیامک واقعی هزینه دارد)
 *  - تأیید نهایی کد در خودِ سامانه واقعی ARM انجام می‌شود؛ این روت هیچ کدی محلی نمی‌سنجد
 *  - پس از اتصال موفق، استخراج داده واقعی در پس‌زمینه آغاز می‌شود (fire-and-forget)
 */

import { NextRequest } from "next/server";
import { getMelkProvider } from "@/lib/melk-api/provider";
import { isValidOtpFormat, isValidPersonnelCodeFormat } from "@/lib/auth/crypto";
import { checkRate, recordAttempt } from "@/lib/auth/rate-limiter";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { audit, clearSessionArmTokens, updateSessionArmTokens } from "@/lib/auth/session";
import { getSyncState } from "@/lib/melk-api/sync";

/** نرمال‌سازی ارقام فارسی/عربی به لاتین */
function toLatinDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const hasToken = Boolean(guard.armTokens?.accessToken);
  const sync = await getSyncState();
  return Response.json({
    ok: true,
    connection: {
      status: hasToken ? "connected" : "disconnected",
      hasToken,
      userType: guard.armTokens?.userType ?? null,
      role: guard.role,
      sessionExpiresAt: guard.expiresAt,
    },
    sync: {
      lastSuccessAt: sync.lastSuccessAt,
      lastError: sync.lastError,
      transactionCount: sync.transactionCount,
      expertCount: sync.expertCount,
    },
  });
}

export async function POST(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  let body: { action?: "start-otp" | "verify" | "disconnect"; personnelCode?: string; otp?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  const ip = request.headers.get("x-forwarded-for") ?? undefined;

  switch (body.action) {
    // ---------- ۱) ارسال پیامک ARM (عین GET authentication/otp/{code}) ----------
    case "start-otp": {
      const code = String(body.personnelCode ?? "").trim();
      if (!isValidPersonnelCodeFormat(code)) {
        return errorResponse(
          new MelkApiError("INVALID_PERSONNEL_CODE", "قالب کد پرسنلی نامعتبر است (۶ تا ۱۲ رقم).", 400, false)
        );
      }
      // سهمیه مشترک با صفحه ورود — پیامک واقعی است
      const rate = await checkRate(code, "REQUEST_OTP", ip);
      if (!rate.allowed) {
        return errorResponse(new MelkApiError("RATE_LIMITED", rate.reason ?? "درخواست بیش از حد مجاز.", 429, false));
      }
      try {
        const provider = getMelkProvider();
        const result = await provider.requestOtp(code, ip);
        await recordAttempt(code, "REQUEST_OTP", true, ip);
        await audit("ARM_OTP_REQUEST", guard.personnelCode, `armCode=${code}`);
        return Response.json({
          ok: true,
          message: `کد پیامکی سامانه ARM به موبایل کد پرسنلی ${code} ارسال شد.`,
          expiresInSeconds: result.expiresInSeconds,
        });
      } catch (err) {
        // HOTFIX-04: خطای RATE_LIMITED خودش تلاشِ ردشده ثبت نمی‌کند (قفل خود-تمدیدشونده)
        await recordAttempt(code, "REQUEST_OTP", false, ip).catch(() => undefined);
        const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error).message, 502, false);
        return errorResponse(
          new MelkApiError(
            e.code,
            `ارسال پیامک ARM ناموفق بود: ${e.message}`,
            e.httpStatus >= 400 && e.httpStatus < 600 ? e.httpStatus : 502,
            false
          )
        );
      }
    }

    // ---------- ۲) تأیید کد + اتصال توکن ARM به نشست جاری ----------
    case "verify": {
      const code = String(body.personnelCode ?? "").trim();
      const otp = toLatinDigits(String(body.otp ?? "")).replace(/\D/g, "");
      if (!isValidPersonnelCodeFormat(code)) {
        return errorResponse(new MelkApiError("INVALID_PERSONNEL_CODE", "قالب کد پرسنلی نامعتبر است.", 400, false));
      }
      if (!isValidOtpFormat(otp)) {
        return errorResponse(
          new MelkApiError("OTP_INVALID", "کد پیامکی باید ۴ رقم باشد (مطابق سامانه ملک تبریز).", 400, false)
        );
      }
      const rate = await checkRate(code, "VERIFY_OTP", ip);
      if (!rate.allowed) {
        return errorResponse(new MelkApiError("RATE_LIMITED", rate.reason ?? "تلاش بیش از حد مجاز.", 429, false));
      }
      try {
        // ✅ تأیید در سامانه واقعی ARM — کد پیامکی واقعی سنجیده می‌شود
        const provider = getMelkProvider();
        const result = await provider.verifyOtp(code, otp);
        await recordAttempt(code, "VERIFY_OTP", true, ip);

        // توکن‌ها فقط به «نشست خودِ درخواست‌کننده» (SEC-3)
        await updateSessionArmTokens(guard.sessionId, result.armTokens);
        await audit(
          "ARM_CONNECT",
          guard.personnelCode,
          `armCode=${code}; userType=${result.armTokens.userType ?? "-"}; role=${guard.role}`
        );

        // استخراج داده واقعی در پس‌زمینه — مسدودکننده پاسخ نیست؛ خطایش فقط لاگ می‌شود
        void (async () => {
          try {
            const { syncFromArm } = await import("@/lib/melk-api/sync");
            const sync = await syncFromArm(result.armTokens.accessToken);
            await audit(
              "ARM_CONNECT_SYNC",
              guard.personnelCode,
              `ok=${sync.ok}; tx=${sync.transactions}; ex=${sync.experts}${sync.errorCode ? `; err=${sync.errorCode}` : ""}`
            );
          } catch (e) {
            const { logEvent } = await import("@/lib/logger");
            logEvent({
              level: "error",
              category: "sync",
              operation: "arm-connect-auto-sync",
              status: "fail",
              errorCode: "AUTO_SYNC_ERROR",
              detail: { error: e instanceof Error ? e.message : String(e) },
            });
          }
        })();

        return Response.json({
          ok: true,
          message: `اتصال سامانه ARM برقرار شد${result.user.displayName ? ` — «${result.user.displayName}»` : ""}. استخراج داده واقعی در پس‌زمینه آغاز شد.`,
          user: { displayName: result.user.displayName, userType: result.armTokens.userType ?? null },
        });
      } catch (err) {
        await recordAttempt(code, "VERIFY_OTP", false, ip).catch(() => undefined);
        const { logAuth } = await import("@/lib/logger");
        logAuth("otp-failed", {
          userId: guard.personnelCode,
          status: "fail",
          errorCode: err instanceof MelkApiError ? err.code : "UNKNOWN",
          detail: { flow: "arm-connection" },
        });
        const e =
          err instanceof MelkApiError
            ? err
            : new MelkApiError("UNKNOWN", "خطای غیرمنتظره در تأیید کد پیامکی.", 502, false);
        return errorResponse(e);
      }
    }

    // ---------- ۳) قطع اتصال ARM از نشست جاری (نشست زنده می‌ماند) ----------
    case "disconnect": {
      await clearSessionArmTokens(guard.sessionId);
      await audit("ARM_DISCONNECT", guard.personnelCode, `role=${guard.role}`);
      return Response.json({ ok: true, message: "اتصال ARM از این نشست قطع شد — نشست شما همچنان معتبر است." });
    }

    default:
      return errorResponse(new MelkApiError("UNKNOWN", "عملیات نامعتبر است.", 400, false));
  }
}
