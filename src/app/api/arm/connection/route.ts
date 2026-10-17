/**
 * /api/arm/connection — بخش «اتصال به سامانه ARM با کد پیامکی» در تنظیمات عمومی
 * ------------------------------------------------------
 * GET  — وضعیت اتصال ARM «نشست جاری» (فقط خواندن DB — بدون تماس شبکه)
 * POST — عملیات: start-otp | verify | disconnect | reset
 *
 * هدف (دستور مالک ۱۴۰۵/۰۶/۳۰): اگر مالک با «کد مستر» وارد شده باشد
 * (نشستِ بدون توکن ARM)، بتواند از همین کاشی با کد پرسنلی + پیامک،
 * اتصال سامانه ARM را به «نشست جاری خودش» متصل کند — بدون خروج و
 * ورود مجدد. این همان جریان عین صفحه ورود است:
 *   GET  authentication/otp/{code}  → پیامک واقعی از سمت ARM
 *   POST authentication/otp/login   → توکن نشست ARM
 *
 * P6.5-09 (دستور مالک — رفع باگ سهمیهٔ مشترک پیامک PM/ARM + کلید ریست):
 *   · سهمیهٔ پیامک/تأیید این جریان از این پس «مستقل» از صفحهٔ ورود و
 *     مستقل از اتصال PM شمرده می‌شود (REQUEST_OTP_ARM / VERIFY_OTP_ARM)
 *     — علت باگ: PM سپس ARM (یا بالعکس) روی یک سهمیهٔ واحد شمرده
 *     می‌شد و کاربر بی‌درنگ «سقف پیامک / قبلاً ارسال شده» می‌گرفت.
 *   · خطای سمت سرور «پیامک قبلاً ارسال شده» ⇒ نرم‌موفق: کدِ همین
 *     حالا ارسال‌شده (از PM یا ARM) هنوز معتبر است؛ همان وارد شود.
 *     تلاش ناموفق ثبت نمی‌شود و سهمیه مصرف نمی‌شود (صفر پیامک جدید).
 *   · خطای «سقف پیامک سمت ملک تبریز» ⇒ پیام شفاف با راهنمایی انتظار؛
 *     به‌عنوان تلاش شمرده نمی‌شود (قفل خود-تمدیدشونده نمی‌سازیم).
 *   · اکشن «reset» جدید: پاک‌کردن توکن‌های ARM نشست جاری + بازگشت
 *     به وضعیت قطعِ تمیز برای اتصال تازه (عین ریست PM).
 *
 * امنیت:
 *  - توکن‌ها فقط به «نشست خودِ درخواست‌کننده» متصل می‌شوند (SEC-3 — هیچ توکن مشترک/singleton)
 *  - سهمیهٔ مستقل جریان: ۳ پیامک/۱۰ دقیقه، ۵ تأیید/۱۵ دقیقه + قفل ۱۵ دقیقه‌ای
 *  - تأیید نهایی کد در خودِ سامانه واقعی ARM انجام می‌شود؛ این روت هیچ کدی محلی نمی‌سنجد
 *  - پس از اتصال موفق، استخراج داده واقعی در پس‌زمینه آغاز می‌شود (fire-and-forget)
 */

import { NextRequest } from "next/server";
import { getMelkProvider } from "@/lib/melk-api/provider";
import { isValidOtpFormat, isValidPersonnelCodeFormat } from "@/lib/auth/crypto";
import { checkRate, recordAttempt } from "@/lib/auth/rate-limiter";
import { classifySmsSendFailure } from "@/lib/melk-api/sms";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { audit, clearSessionArmTokens, updateSessionArmTokens } from "@/lib/auth/session";
import { getArmVaultStatus, vaultKeyForSession } from "@/lib/auth/arm-vault";
import { getSyncState } from "@/lib/melk-api/sync";
import { clientIp } from "@/lib/auth/client-ip";

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
  // P6.5-11 (بند ث) — وضعیت صندوقچهٔ ماندگار (بدون افشای توکن):
  // آیا اتصال در ورودهای بعدی خودکار بازیابی می‌شود؟
  const vault = await getArmVaultStatus(guard.personnelCode, guard.role);
  return Response.json({
    ok: true,
    connection: {
      status: hasToken ? "connected" : "disconnected",
      hasToken,
      userType: guard.armTokens?.userType ?? null,
      role: guard.role,
      sessionExpiresAt: guard.expiresAt,
    },
    vault: {
      durable: vault.exists,
      status: vault.status,
      displayName: vault.displayName,
      personnelCode: vault.personnelCode,
      lastRefreshedAt: vault.lastRefreshedAt,
      lastRestoredAt: vault.lastRestoredAt,
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

  let body: { action?: "start-otp" | "verify" | "disconnect" | "reset"; personnelCode?: string; otp?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  const ip = clientIp(request); // PN-008 BLOCK 3 — Trusted Proxy (تک‌نقطه تصمیم)

  switch (body.action) {
    // ---------- ۱) ارسال پیامک ARM (عین GET authentication/otp/{code}) ----------
    case "start-otp": {
      const code = String(body.personnelCode ?? "").trim();
      if (!isValidPersonnelCodeFormat(code)) {
        return errorResponse(
          new MelkApiError("INVALID_PERSONNEL_CODE", "قالب کد پرسنلی نامعتبر است (۶ تا ۱۲ رقم).", 400, false)
        );
      }
      // P6.5-09 — سهمیهٔ «مستقل» جریان اتصال ARM (بدون اشتراک با ورود/PM)
      const rate = await checkRate(code, "REQUEST_OTP_ARM", ip);
      if (!rate.allowed) {
        return errorResponse(new MelkApiError("RATE_LIMITED", rate.reason ?? "درخواست بیش از حد مجاز.", 429, false));
      }
      try {
        const provider = getMelkProvider();
        const result = await provider.requestOtp(code, ip);
        await recordAttempt(code, "REQUEST_OTP_ARM", true, ip);
        await audit("ARM_OTP_REQUEST", guard.personnelCode, `armCode=${code}`);
        return Response.json({
          ok: true,
          message: `کد پیامکی سامانه ARM به موبایل کد پرسنلی ${code} ارسال شد.`,
          expiresInSeconds: result.expiresInSeconds,
        });
      } catch (err) {
        const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error).message, 502, false);

        // P6.5-09 — «پیامک قبلاً ارسال شده» ⇒ نرم‌موفق: کدِ فعلی هنوز معتبر است
        const sms = classifySmsSendFailure(e.message);
        if (sms.kind === "ALREADY_SENT") {
          await audit("ARM_OTP_ALREADY_SENT", guard.personnelCode, `armCode=${code}`);
          return Response.json({
            ok: true,
            alreadySent: true,
            message: sms.userMessage,
            expiresInSeconds: 180,
          });
        }
        // «سقف پیامک سمت ملک تبریز» ⇒ پیام شفاف؛ ثبت تلاش نمی‌کنیم (قفل خود-تمدیدشونده نمی‌سازیم)
        if (sms.kind === "LIMIT_REACHED") {
          return errorResponse(new MelkApiError("SMS_LIMIT_REMOTE", sms.userMessage, 429, false));
        }

        // سایر خطاها — عین رفتار قبلی (HOTFIX-04: خطای RATE_LIMITED خودش تلاشِ ردشده ثبت نمی‌کند)
        if (e.code !== "RATE_LIMITED") {
          await recordAttempt(code, "REQUEST_OTP_ARM", false, ip).catch(() => undefined);
        }
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
      // P6.5-09 — سهمیهٔ تأیید «مستقل» جریان اتصال ARM
      const rate = await checkRate(code, "VERIFY_OTP_ARM", ip);
      if (!rate.allowed) {
        return errorResponse(new MelkApiError("RATE_LIMITED", rate.reason ?? "تلاش بیش از حد مجاز.", 429, false));
      }
      try {
        // ✅ تأیید در سامانه واقعی ARM — کد پیامکی واقعی سنجیده می‌شود
        const provider = getMelkProvider();
        const result = await provider.verifyOtp(code, otp);
        await recordAttempt(code, "VERIFY_OTP_ARM", true, ip);

        // توکن‌ها فقط به «نشست خودِ درخواست‌کننده» (SEC-3) + صندوقچهٔ ماندگار (بند ث P6.5-11):
        // اتصال مالک از این پس در ورودهای بعدی خودکار بازیابی می‌شود — بدون پیامک مجدد
        await updateSessionArmTokens(guard.sessionId, result.armTokens, {
          ownerKey: vaultKeyForSession(guard.personnelCode, guard.role),
          personnelCode: code,
          displayName: result.user.displayName,
        });
        await audit(
          "ARM_CONNECT",
          guard.personnelCode,
          `armCode=${code}; userType=${result.armTokens.userType ?? "-"}; role=${guard.role}; vault=${vaultKeyForSession(guard.personnelCode, guard.role)}`
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
        await recordAttempt(code, "VERIFY_OTP_ARM", false, ip).catch(() => undefined);
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

    // ---------- ۴) ریست اتصال ARM (دستور مالک P6.5-09 — عین ریست PM) ----------
    case "reset": {
      await clearSessionArmTokens(guard.sessionId);
      // P6.5-11: ریست = چراغ قرمزِ تمیز — توکن صندوقچهٔ ماندگار هم پاک می‌شود
      // (خواستهٔ صریح مالک: «از گام اول از نو وصل شود»)؛ ریست نشست را ابطال نمی‌کند
      const { getIntegrationRepository } = await import("@/core/repositories");
      await getIntegrationRepository()
        .clearArmConnectionTokens(vaultKeyForSession(guard.personnelCode, guard.role))
        .catch(() => undefined);
      await audit("ARM_RESET", guard.personnelCode, `role=${guard.role}; vaultCleared=true`);
      return Response.json({
        ok: true,
        message: "اتصال ARM بازنشانی شد — چراغ نشانگر قرمز می‌شود. از گام اول (کد پرسنلی + پیامک) دوباره وصل شوید.",
      });
    }

    default:
      return errorResponse(new MelkApiError("UNKNOWN", "عملیات نامعتبر است.", 400, false));
  }
}
