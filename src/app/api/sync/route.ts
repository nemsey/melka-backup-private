/**
 * POST /api/sync
 * همگام‌سازی دستی داده واقعی از سامانه ARM (arus-api.melketabriz.ir).
 * توکن ARM از نشست جاری استفاده می‌شود؛ در صورت انقضا با refreshToken تمدید می‌شود.
 * OWNER (ورود با کد مدیر): اگر نشست توکن ARM نداشته باشد، فقط توکن ذخیره‌شده
 * آخرین همگام‌سازی موفق (رمزنگاری‌شده) استفاده می‌شود.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { syncWithRefresh, getSyncState } from "@/lib/melk-api/sync";
import { updateSessionArmTokens, audit } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/auth/crypto";

/** توکن ARM نشست؛ در صورت نبود، از SyncState (آخرین موفق) */
async function resolveArmTokens(sessionArmTokens: { accessToken: string; refreshToken: string } | null): Promise<{ accessToken: string; refreshToken: string }> {
  if (sessionArmTokens?.accessToken) return sessionArmTokens;
  const state = await db.syncState.findUnique({ where: { id: "singleton" } });
  const stored = decryptSecret(state?.armTokenEnc);
  if (stored) return { accessToken: stored, refreshToken: "" };
  return { accessToken: "", refreshToken: "" };
}

export async function POST(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const tokens = await resolveArmTokens(guard.armTokens);
    if (!tokens.accessToken) {
      // 412 (نه 401) — نشست داشبورد معتبر است؛ فقط توکن ARM موجود نیست
      // و نباید باعث خروج خودکار کاربر شود.
      throw new MelkApiError(
        "PRECONDITION_FAILED",
        "توکن سامانه ARM در دسترس نیست. لطفاً با کد پرسنلی و کد پیامکی (مسیر OTP) وارد شوید تا استخراج داده واقعی ممکن شود.",
        412,
        false
      );
    }

    const { sync, newArmToken } = await syncWithRefresh(tokens.accessToken, tokens.refreshToken);

    // ذخیره توکن تمدیدشده در نشست
    if (newArmToken && guard.armTokens) {
      await updateSessionArmTokens(guard.sessionId, { ...guard.armTokens, accessToken: newArmToken });
    }
    // ذخیره رمزنگاری‌شده توکن موفق برای همگام‌سازی پس‌زمینه
    if (sync.ok) {
      const enc = newArmToken ?? tokens.accessToken;
      await db.syncState.update({
        where: { id: "singleton" },
        data: { armTokenEnc: encryptSecret(enc) },
      });
    }

    await audit("DATA_SYNC", guard.personnelCode, sync.ok ? `tx=${sync.transactions}; ex=${sync.experts}` : `error=${sync.errorCode}`);
    return Response.json({ ok: sync.ok, sync, state: await getSyncState() });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در همگام‌سازی داده.", 500, false));
  }
}
