/**
 * POST /api/sync
 * همگام‌سازی دستی داده واقعی از سامانه ARM (arus-api.melketabriz.ir).
 *
 * HOTFIX-02 (SEC-3): توکن ARM فقط از «نشست جاری» خوانده می‌شود —
 * هیچ توکن مشترک/ذخیره‌شده‌ای بین کاربران وجود ندارد. اگر نشستِ کاربر
 * توکن ARM نداشته باشد (ورود با کد مدیر بدون OTP)، پاسخ 412 است؛
 * یعنی داده کاربر A هرگز با توکن کاربر B استخراج نمی‌شود.
 * هر اجرا با personnelCode بازیگر در AuditLog ثبت می‌شود.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { syncWithRefresh, getSyncState } from "@/lib/melk-api/sync";
import { updateSessionArmTokens, audit } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    // فقط توکن نشست صاحب درخواست (SEC-3) — بدون هیچ fallback سراسری
    if (!guard.armTokens?.accessToken) {
      // 412 (نه 401) — نشست داشبورد معتبر است؛ فقط توکن ARM موجود نیست
      // و نباید باعث خروج خودکار کاربر شود.
      throw new MelkApiError(
        "PRECONDITION_FAILED",
        "توکن سامانه ARM در نشست شما موجود نیست. لطفاً با کد پرسنلی و کد پیامکی (مسیر OTP) وارد شوید تا استخراج داده واقعی با توکن خودتان ممکن شود.",
        412,
        false
      );
    }

    const { sync, newArmToken } = await syncWithRefresh(guard.armTokens.accessToken, guard.armTokens.refreshToken);

    // ذخیره توکن تمدیدشده در نشست خود کاربر (نه هیچ singleton)
    if (newArmToken) {
      await updateSessionArmTokens(guard.sessionId, {
        accessToken: newArmToken,
        refreshToken: guard.armTokens.refreshToken,
        userType: guard.armTokens.userType,
      });
    }

    await audit(
      "DATA_SYNC",
      guard.personnelCode,
      sync.ok ? `tx=${sync.transactions}; ex=${sync.experts}; in=${sync.interactions}` : `error=${sync.errorCode}`
    );
    return Response.json({ ok: sync.ok, sync, state: await getSyncState() });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در همگام‌سازی داده.", 500, false));
  }
}
