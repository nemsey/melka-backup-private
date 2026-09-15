/**
 * POST /api/auth/master-login
 * ورود مدیر (مالک سامانه) با کد یکتای مدیر — بدون نیاز به پیامک.
 * امنیت: مقایسه زمان-ثابت + محدودسازی نرخ (۵ تلاش / ۱۵ دقیقه) + قفل خودکار.
 * کد پیش‌فرض از MASTER_ACCESS_CODE خوانده می‌شود.
 */

import { NextRequest } from "next/server";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { isValidMasterCodeFormat, safeEqual } from "@/lib/auth/crypto";
import { checkRate, recordAttempt } from "@/lib/auth/rate-limiter";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse } from "@/lib/auth/guard";
import { audit, createSession, OWNER_DISPLAY_NAME } from "@/lib/auth/session";

const MASTER_PERSONNEL = "000000000";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { masterCode?: string } | null;
    const masterCode = body?.masterCode?.trim() ?? "";

    if (!isValidMasterCodeFormat(masterCode)) {
      throw new MelkApiError("OTP_INVALID", "کد مدیر باید ۸ رقم باشد.", 400, false);
    }

    const ip = request.headers.get("x-forwarded-for") ?? undefined;
    const rate = await checkRate(MASTER_PERSONNEL, "MASTER_LOGIN", ip);
    if (!rate.allowed) {
      throw new MelkApiError("RATE_LIMITED", rate.reason ?? "تلاش بیش از حد مجاز.", 429, false);
    }

    const cfg = getMelkApiConfig();
    // HOTFIX-01 (SEC-1): بدون MASTER_ACCESS_CODE ورود مدیر کاملاً غیرفعال است —
    // نه fallback، نه عبور با رشته خالی (فرمت ۸ رقمی از قبل رد شده، این گارد عمق دوم است).
    if (!cfg.masterCode || !isValidMasterCodeFormat(cfg.masterCode)) {
      await audit("MASTER_LOGIN_UNCONFIGURED", undefined, ip);
      throw new MelkApiError(
        "PRECONDITION_FAILED",
        "کد مدیر روی سرور تنظیم نشده است (MASTER_ACCESS_CODE). با مسیر کد پرسنلی + پیامک وارد شوید یا متغیر محیطی را تنظیم کنید.",
        503,
        false
      );
    }
    if (!safeEqual(masterCode, cfg.masterCode)) {
      await recordAttempt(MASTER_PERSONNEL, "MASTER_LOGIN", false, ip);
      await audit("MASTER_LOGIN_FAILED", undefined, ip);
      throw new MelkApiError("OTP_INVALID", "کد مدیر نادرست است.", 401, false);
    }

    await recordAttempt(MASTER_PERSONNEL, "MASTER_LOGIN", true, ip);
    const { token, context } = await createSession(
      { personnelCode: "OWNER", displayName: OWNER_DISPLAY_NAME, role: "OWNER" },
      { ip, userAgent: request.headers.get("user-agent") ?? undefined }
    );
    await audit("MASTER_LOGIN_SUCCESS", "OWNER");

    return Response.json({ ok: true, token, user: context });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در ورود مدیر.", 500, false));
  }
}
