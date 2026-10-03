/**
 * /api/pm/connection — بخش «اتصال به حساب شخصی سامانه PM» در تنظیمات عمومی
 * ------------------------------------------------------
 * GET  — وضعیت اتصال PM
 * POST — عملیات: start-otp (ارسال پیامک PM) | verify (تأیید کد + ذخیره توکن) | reset
 * عین جریان ورود خود سامانه پرسنلی (pm.melketabriz.ir):
 *   GET  authentication/otp/{code} → POST authentication/otp/login {code, otpCode}
 *
 * P6.5-09 (دستور مالک — رفع باگ سهمیهٔ مشترک پیامک PM/ARM):
 *   · گارد نرخ محلی «مستقل» برای جریان PM (REQUEST_OTP_PM / VERIFY_OTP_PM) —
 *     قبلاً این روت هیچ گارد محلی نداشت و جریان ARM با صفحهٔ ورود سهمیهٔ
 *     واحد داشت؛ اکنون هر سه جریان سبد جدا دارند.
 *   · خطای سمت سرور «پیامک قبلاً ارسال شده» (اتصال قبلی ARM و سپس PM — یا
 *     بالعکس) ⇒ نرم‌موفق: کدِ همین حالا ارسال‌شده هنوز معتبر است؛ همان
 *     وارد شود. صفر پیامک جدید، صفر ثبت تلاش ناموفق.
 *   · خطای «سقف پیامک سمت ملک تبریز» ⇒ پیام شفاف با راهنمایی انتظار.
 */

import { NextRequest } from "next/server";
import { getIntegrationRepository } from "@/core/repositories";
import { errorResponse, requireRole, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { encryptSecret, decryptSecret } from "@/lib/auth/crypto";
import { checkRate, recordAttempt } from "@/lib/auth/rate-limiter";
import { classifySmsSendFailure } from "@/lib/melk-api/sms";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { MELK_ENDPOINTS } from "@/lib/melk-api/endpoints";

/** وضعیت اتصال PM */
async function getStatus() {
  const row = await getIntegrationRepository().getPmConnection();
  return {
    status: (row?.status as "connected" | "disconnected" | "pending" | "error") ?? "disconnected",
    personnelCode: row?.personnelCode ?? null,
    displayName: row?.displayName ?? null,
    hasToken: Boolean(row?.tokenEnc),
    lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
    lastError: row?.lastError ?? null,
  };
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  return Response.json({ ok: true, connection: await getStatus() });
}

export async function POST(request: NextRequest) {
  // HOTFIX-03 (SEC-6): اتصال حساب PM — فقط OWNER
  const role = await requireRole(request, "OWNER", "POST /api/pm/connection");
  if (role instanceof MelkApiError) return errorResponse(role);
  const guard = role.ctx;

  let body: { action?: "start-otp" | "verify" | "reset"; personnelCode?: string; code?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  const cfg = getMelkApiConfig();
  const ip = request.headers.get("x-forwarded-for") ?? undefined;

  switch (body.action) {
    // ---------- شروع: ارسال پیامک PM ----------
    case "start-otp": {
      const code = String(body.personnelCode ?? "").trim();
      if (!code || code.length < 3) {
        return errorResponse(new MelkApiError("UNKNOWN", "کد پرسنلی معتبر وارد کنید.", 400, false));
      }
      // P6.5-09 — گارد نرخ محلی «مستقل» جریان PM (۳ پیامک/۱۰ دقیقه؛ جدا از ورود و ARM)
      const rate = await checkRate(code, "REQUEST_OTP_PM", ip);
      if (!rate.allowed) {
        return errorResponse(new MelkApiError("RATE_LIMITED", rate.reason ?? "درخواست بیش از حد مجاز.", 429, false));
      }
      try {
        await armCall<unknown>({
          method: "GET",
          path: MELK_ENDPOINTS.pm.requestOtp(code),
          baseUrl: cfg.pmApiBase,
          timeoutMs: Math.min(cfg.timeoutMs, 20000),
          maxRetries: 1,
        });
        await recordAttempt(code, "REQUEST_OTP_PM", true, ip);
        await getIntegrationRepository().upsertPmConnection({
          status: "pending",
          personnelCode: code,
          lastError: null,
        });
        await audit("PM_OTP_REQUEST", guard.personnelCode, `code=${code}`);
        return Response.json({ ok: true, message: "کد پیامکی سامانه پرسنلی (PM) ارسال شد — گام تأیید کد را انجام دهید." });
      } catch (err) {
        const e = err as MelkApiError;

        // P6.5-09 — «پیامک قبلاً ارسال شده» (مثلاً اتصال ARM همین حالا) ⇒ نرم‌موفق
        const sms = classifySmsSendFailure(e.message);
        if (sms.kind === "ALREADY_SENT") {
          await getIntegrationRepository()
            .upsertPmConnection({ status: "pending", personnelCode: code, lastError: null })
            .catch(() => undefined);
          await audit("PM_OTP_ALREADY_SENT", guard.personnelCode, `code=${code}`);
          return Response.json({ ok: true, alreadySent: true, message: sms.userMessage });
        }
        // «سقف پیامک سمت ملک تبریز» ⇒ پیام شفاف؛ ثبت تلاش نمی‌کنیم (قفل خود-تمدیدشونده نمی‌سازیم)
        if (sms.kind === "LIMIT_REACHED") {
          return errorResponse(new MelkApiError("SMS_LIMIT_REMOTE", sms.userMessage, 429, false));
        }

        await getIntegrationRepository()
          .upsertPmConnection({
            status: "error",
            personnelCode: code,
            lastError: e.message,
          })
          .catch(() => undefined);
        return errorResponse(new MelkApiError("UNKNOWN", `ارسال پیامک PM ناموفق بود: ${e.message}`, 502, false));
      }
    }

    // ---------- تأیید کد ----------
    case "verify": {
      const code = String(body.personnelCode ?? "").trim();
      const otp = String(body.code ?? "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");
      if (!code) return errorResponse(new MelkApiError("UNKNOWN", "کد پرسنلی لازم است.", 400, false));
      if (otp.length < 4 || otp.length > 8) {
        return errorResponse(new MelkApiError("UNKNOWN", "کد پیامکی باید ۴ تا ۸ رقم باشد.", 400, false));
      }
      // P6.5-09 — گارد نرخ تأیید «مستقل» جریان PM (۵ تأیید/۱۵ دقیقه + قفل)
      const rate = await checkRate(code, "VERIFY_OTP_PM", ip);
      if (!rate.allowed) {
        return errorResponse(new MelkApiError("RATE_LIMITED", rate.reason ?? "تلاش بیش از حد مجاز.", 429, false));
      }
      try {
        const res = await armCall<{
          token?: string;
          refreshToken?: string;
          user?: { fullName?: string; name?: string; firstName?: string; lastName?: string; username?: string; type?: string };
        }>({
          method: "POST",
          path: MELK_ENDPOINTS.pm.verifyOtp,
          baseUrl: cfg.pmApiBase,
          body: { code, otpCode: otp },
          timeoutMs: Math.min(cfg.timeoutMs, 20000),
          maxRetries: 1,
        });
        const data = res.data;
        if (!data?.token) {
          throw new MelkApiError("OTP_INVALID", "پاسخ ورود PM فاقد توکن است.", 401, false);
        }
        const displayName =
          data.user?.fullName ?? data.user?.name ?? [data.user?.firstName, data.user?.lastName].filter(Boolean).join(" ") ?? data.user?.username ?? code;
        await recordAttempt(code, "VERIFY_OTP_PM", true, ip);
        await getIntegrationRepository().upsertPmConnection({
          status: "connected",
          personnelCode: code,
          displayName: displayName || code,
          tokenEnc: encryptSecret(data.token),
          refreshTokenEnc: data.refreshToken ? encryptSecret(data.refreshToken) : null,
          lastCheckedAt: new Date(),
          lastError: null,
        });
        await audit("PM_CONNECT", guard.personnelCode, `code=${code}`);
        return Response.json({ ok: true, message: `اتصال حساب شخصی PM برقرار شد${displayName ? ` — «${displayName}»` : ""}.` });
      } catch (err) {
        const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error).message, 502, false);
        // P6.5-09 — تأیید ناموفق در سبد مستقل PM ثبت می‌شود (قفل ۱۵ دقیقه‌ای پس از ۵ شکست)
        await recordAttempt(code, "VERIFY_OTP_PM", false, ip).catch(() => undefined);
        await getIntegrationRepository()
          .upsertPmConnection({
            status: "error",
            personnelCode: code,
            lastError: e.message,
          })
          .catch(() => undefined);
        return errorResponse(e);
      }
    }

    // ---------- ریست ----------
    case "reset": {
      await getIntegrationRepository().deletePmConnection();
      await audit("PM_RESET", guard.personnelCode);
      return Response.json({ ok: true, message: "اتصال حساب شخصی PM بازنشانی شد — چراغ نشانگر قرمز می‌شود." });
    }

    default:
      return errorResponse(new MelkApiError("UNKNOWN", "عملیات نامعتبر است.", 400, false));
  }
}

/** خواندن توکن PM برای نشانگر (داخلی) */
export async function readPmToken(): Promise<string | null> {
  const row = await getIntegrationRepository().getPmConnection();
  return decryptSecret(row?.tokenEnc ?? null);
}
