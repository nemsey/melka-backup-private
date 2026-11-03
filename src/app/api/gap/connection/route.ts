/**
 * /api/gap/connection — بخش «اتصال به سامانه GAP» در تنظیمات عمومی (P6546/گام صفر)
 * ------------------------------------------------------
 * GET  — وضعیت اتصال GAP (سامانه گفت‌وگوی آنلاین ملک تبریز — gap.melketabriz.ir)
 * POST — عملیات: start-otp (ارسال پیامک) | verify (تأیید کد + ذخیره توکن) | reset
 *
 * کشف P6546 (شاهد: download/p6546/systems-discovery-*.json):
 *   فرانت: gap.melketabriz.ir (سامانه گفت‌وگوی آنلاین - مِلک تبریز)
 *   بک‌اند: gap-api.melketabriz.ir/api/ (Express زنده)
 *   احراز هویت: الگوی خانوادهٔ ملک تبریز (authentication/otp/{code} + otp/login)
 *   پایهٔ آدرس با MELK_GAP_API_BASE قابل تنظیم است.
 * همانند روت‌های pm/connection و arm/connection — گارد نرخ مستقل + رمزنگاری توکن.
 */

import { NextRequest } from "next/server";
import { getIntegrationRepository } from "@/core/repositories";
import { errorResponse, requireRole, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/auth/crypto";
import { recordAttempt } from "@/lib/auth/rate-limiter";
import { classifySmsSendFailure } from "@/lib/melk-api/sms";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { MELK_ENDPOINTS } from "@/lib/melk-api/endpoints";
import { clientIp } from "@/lib/auth/client-ip";

/** وضعیت اتصال GAP + آدرس‌های سامانه */
async function getStatus() {
  const row = await getIntegrationRepository().getGapConnection();
  const cfg = getMelkApiConfig();
  return {
    status: (row?.status as "connected" | "disconnected" | "pending" | "error") ?? "disconnected",
    personnelCode: row?.personnelCode ?? null,
    displayName: row?.displayName ?? null,
    hasToken: Boolean(row?.tokenEnc),
    lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
    lastError: row?.lastError ?? null,
    apiBase: cfg.gapApiBase,
    frontUrl: cfg.gapFrontUrl,
  };
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  return Response.json({ ok: true, connection: await getStatus() });
}

export async function POST(request: NextRequest) {
  // اتصال حساب GAP — فقط OWNER (همانند PM)
  const role = await requireRole(request, "OWNER", "POST /api/gap/connection");
  if (role instanceof MelkApiError) return errorResponse(role);
  const guard = role.ctx;

  let body: { action?: "start-otp" | "verify" | "reset"; personnelCode?: string; code?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  const cfg = getMelkApiConfig();
  const ip = clientIp(request); // PN-008 BLOCK 3 — Trusted Proxy (تک‌نقطه تصمیم)

  switch (body.action) {
    // ---------- شروع: ارسال پیامک GAP ----------
    case "start-otp": {
      const code = String(body.personnelCode ?? "").trim();
      if (!code || code.length < 3) {
        return errorResponse(new MelkApiError("UNKNOWN", "کد پرسنلی معتبر وارد کنید.", 400, false));
      }
      // PN-034 (شورا-ن۰۵۵ · قانون مالک: صفر محدودیت اتصال) — گارد نرخ محلی
      // جریان GAP برافتاد؛ recordAttempt تنها رد حسابرسی می‌ماند.
      try {
        await armCall<unknown>({
          method: "GET",
          path: MELK_ENDPOINTS.gap.requestOtp(code),
          baseUrl: cfg.gapApiBase,
          timeoutMs: Math.min(cfg.timeoutMs, 20000),
          maxRetries: 1,
        });
        await recordAttempt(code, "REQUEST_OTP_GAP", true, ip);
        await getIntegrationRepository().upsertGapConnection({
          status: "pending",
          personnelCode: code,
          lastError: null,
        });
        await audit("GAP_OTP_REQUEST", guard.personnelCode, `code=${code}`);
        return Response.json({ ok: true, message: "کد پیامکی سامانه گفت‌وگو (GAP) ارسال شد — گام تأیید کد را انجام دهید." });
      } catch (err) {
        const e = err as MelkApiError;
        // «پیامک قبلاً ارسال شده» ⇒ نرم‌موفق (همان الگوی P6.5-09)
        const sms = classifySmsSendFailure(e.message);
        if (sms.kind === "ALREADY_SENT") {
          await getIntegrationRepository()
            .upsertGapConnection({ status: "pending", personnelCode: code, lastError: null })
            .catch(() => undefined);
          await audit("GAP_OTP_ALREADY_SENT", guard.personnelCode, `code=${code}`);
          return Response.json({ ok: true, alreadySent: true, message: sms.userMessage });
        }
        if (sms.kind === "LIMIT_REACHED") {
          return errorResponse(new MelkApiError("SMS_LIMIT_REMOTE", sms.userMessage, 429, false));
        }
        await getIntegrationRepository()
          .upsertGapConnection({
            status: "error",
            personnelCode: code,
            lastError: e.message,
          })
          .catch(() => undefined);
        return errorResponse(
          new MelkApiError(
            "UNKNOWN",
            `ارسال پیامک GAP ناموفق بود: ${e.message} — پایهٔ API سامانه (${cfg.gapApiBase}) با MELK_GAP_API_BASE قابل تنظیم است.`,
            502,
            false
          )
        );
      }
    }

    // ---------- تأیید کد ----------
    case "verify": {
      const code = String(body.personnelCode ?? "").trim();
      const otp = String(body.code ?? "")
        .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
        .replace(/\D/g, "");
      if (!code) return errorResponse(new MelkApiError("UNKNOWN", "کد پرسنلی لازم است.", 400, false));
      if (otp.length < 4 || otp.length > 8) {
        return errorResponse(new MelkApiError("UNKNOWN", "کد پیامکی باید ۴ تا ۸ رقم باشد.", 400, false));
      }
      // PN-034 (شورا-ن۰۵۵ · قانون مالک: صفر محدودیت اتصال) — گارد نرخ تأیید
      // جریان GAP برافتاد؛ recordAttempt تنها رد حسابرسی می‌ماند.
      try {
        const res = await armCall<{
          token?: string;
          refreshToken?: string;
          user?: { fullName?: string; name?: string; firstName?: string; lastName?: string; username?: string; type?: string };
        }>({
          method: "POST",
          path: MELK_ENDPOINTS.gap.verifyOtp,
          baseUrl: cfg.gapApiBase,
          body: { code, otpCode: otp },
          timeoutMs: Math.min(cfg.timeoutMs, 20000),
          maxRetries: 1,
        });
        const data = res.data;
        if (!data?.token) {
          throw new MelkApiError("OTP_INVALID", "پاسخ ورود GAP فاقد توکن است.", 401, false);
        }
        const displayName =
          data.user?.fullName ?? data.user?.name ?? [data.user?.firstName, data.user?.lastName].filter(Boolean).join(" ") ?? data.user?.username ?? code;
        await recordAttempt(code, "VERIFY_OTP_GAP", true, ip);
        await getIntegrationRepository().upsertGapConnection({
          status: "connected",
          personnelCode: code,
          displayName: displayName || code,
          tokenEnc: encryptSecret(data.token),
          refreshTokenEnc: data.refreshToken ? encryptSecret(data.refreshToken) : null,
          lastCheckedAt: new Date(),
          lastError: null,
        });
        await audit("GAP_CONNECT", guard.personnelCode, `code=${code}`);
        return Response.json({ ok: true, message: `اتصال سامانه گفت‌وگو (GAP) برقرار شد${displayName ? ` — «${displayName}»` : ""}.` });
      } catch (err) {
        const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error).message, 502, false);
        await recordAttempt(code, "VERIFY_OTP_GAP", false, ip).catch(() => undefined);
        await getIntegrationRepository()
          .upsertGapConnection({
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
      await getIntegrationRepository().deleteGapConnection();
      await audit("GAP_RESET", guard.personnelCode);
      return Response.json({ ok: true, message: "اتصال سامانه گفت‌وگو (GAP) بازنشانی شد — چراغ نشانگر قرمز می‌شود." });
    }

    default:
      return errorResponse(new MelkApiError("UNKNOWN", "عملیات نامعتبر است.", 400, false));
  }
}
