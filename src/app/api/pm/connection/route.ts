/**
 * /api/pm/connection — بخش «اتصال به حساب شخصی سامانه PM» در تنظیمات عمومی
 * ------------------------------------------------------
 * GET  — وضعیت اتصال PM
 * POST — عملیات: start-otp (ارسال پیامک PM) | verify (تأیید کد + ذخیره توکن) | reset
 * عین جریان ورود خود سامانه پرسنلی (pm.melketabriz.ir):
 *   GET  authentication/otp/{code} → POST authentication/otp/login {code, otpCode}
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { encryptSecret, decryptSecret } from "@/lib/auth/crypto";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { MELK_ENDPOINTS } from "@/lib/melk-api/endpoints";

/** وضعیت اتصال PM */
async function getStatus() {
  const row = await db.pmConnection.findFirst();
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
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  let body: { action?: "start-otp" | "verify" | "reset"; personnelCode?: string; code?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  const cfg = getMelkApiConfig();

  switch (body.action) {
    // ---------- شروع: ارسال پیامک PM ----------
    case "start-otp": {
      const code = String(body.personnelCode ?? "").trim();
      if (!code || code.length < 3) {
        return errorResponse(new MelkApiError("UNKNOWN", "کد پرسنلی معتبر وارد کنید.", 400, false));
      }
      try {
        await armCall<unknown>({
          method: "GET",
          path: MELK_ENDPOINTS.pm.requestOtp(code),
          baseUrl: cfg.pmApiBase,
          timeoutMs: Math.min(cfg.timeoutMs, 20000),
          maxRetries: 1,
        });
        await db.pmConnection.upsert({
          where: { id: "singleton" },
          create: { id: "singleton", status: "pending", personnelCode: code, lastError: null },
          update: { status: "pending", personnelCode: code, lastError: null },
        });
        await audit("PM_OTP_REQUEST", guard.personnelCode, `code=${code}`);
        return Response.json({ ok: true, message: "کد پیامکی سامانه پرسنلی (PM) ارسال شد — گام تأیید کد را انجام دهید." });
      } catch (err) {
        const e = err as MelkApiError;
        await db.pmConnection.upsert({
          where: { id: "singleton" },
          create: { id: "singleton", status: "error", personnelCode: code, lastError: e.message },
          update: { status: "error", personnelCode: code, lastError: e.message },
        }).catch(() => undefined);
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
        await db.pmConnection.upsert({
          where: { id: "singleton" },
          create: {
            id: "singleton",
            status: "connected",
            personnelCode: code,
            displayName: displayName || code,
            tokenEnc: encryptSecret(data.token),
            refreshTokenEnc: data.refreshToken ? encryptSecret(data.refreshToken) : null,
            lastCheckedAt: new Date(),
            lastError: null,
          },
          update: {
            status: "connected",
            personnelCode: code,
            displayName: displayName || code,
            tokenEnc: encryptSecret(data.token),
            refreshTokenEnc: data.refreshToken ? encryptSecret(data.refreshToken) : null,
            lastCheckedAt: new Date(),
            lastError: null,
          },
        });
        await audit("PM_CONNECT", guard.personnelCode, `code=${code}`);
        return Response.json({ ok: true, message: `اتصال حساب شخصی PM برقرار شد${displayName ? ` — «${displayName}»` : ""}.` });
      } catch (err) {
        const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error).message, 502, false);
        await db.pmConnection.upsert({
          where: { id: "singleton" },
          create: { id: "singleton", status: "error", personnelCode: code, lastError: e.message },
          update: { status: "error", personnelCode: code, lastError: e.message },
        }).catch(() => undefined);
        return errorResponse(e);
      }
    }

    // ---------- ریست ----------
    case "reset": {
      await db.pmConnection.deleteMany({});
      await audit("PM_RESET", guard.personnelCode);
      return Response.json({ ok: true, message: "اتصال حساب شخصی PM بازنشانی شد — چراغ نشانگر قرمز می‌شود." });
    }

    default:
      return errorResponse(new MelkApiError("UNKNOWN", "عملیات نامعتبر است.", 400, false));
  }
}

/** خواندن توکن PM برای نشانگر (داخلی) */
export async function readPmToken(): Promise<string | null> {
  const row = await db.pmConnection.findFirst();
  return decryptSecret(row?.tokenEnc ?? null);
}
