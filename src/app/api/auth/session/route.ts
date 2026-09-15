/**
 * /api/auth/session — مدیریت چرخه عمر نشست
 * GET    → اعتبارسنجی نشست جاری
 * PATCH  → تمدید نشست (چرخش توکن)
 * DELETE → خروج (ابطال نشست)
 *
 * HOTFIX-04 (B1): هر سه متد با try/catch و پاکت خطای فارسی استاندارد —
 * خطای DB هرگز به‌صورت 500 خام/انگلیسی به کاربر نمی‌رسد.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { refreshSession, revokeSession, audit, extractBearer } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const guard = await requireSessionAsync(request);
    if (guard instanceof MelkApiError) return errorResponse(guard);
    return Response.json({ ok: true, user: guard });
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در خواندن نشست. لطفاً دوباره تلاش کنید.", 500, false));
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const guard = await requireSessionAsync(request);
    if (guard instanceof MelkApiError) return errorResponse(guard);

    const token = extractBearer(request.headers.get("authorization"));
    if (!token) return errorResponse(new MelkApiError("UNAUTHORIZED", "توکن یافت نشد.", 401, false));

    const refreshed = await refreshSession(token);
    if (!refreshed) {
      return errorResponse(new MelkApiError("UNAUTHORIZED", "تمدید نشست ممکن نشد؛ دوباره وارد شوید.", 401, false));
    }
    await audit("SESSION_REFRESHED", guard.personnelCode);
    return Response.json({ ok: true, token: refreshed.token, user: refreshed.context });
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "تمدید نشست ناموفق بود. چند لحظه بعد دوباره تلاش کنید یا دوباره وارد شوید.", 500, false));
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = extractBearer(request.headers.get("authorization"));
    if (!token) return errorResponse(new MelkApiError("UNAUTHORIZED", "توکن یافت نشد.", 401, false));

    const revoked = await revokeSession(token, "USER_LOGOUT");
    await audit("LOGOUT", undefined);
    return Response.json({ ok: true, revoked });
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "خروج ناموفق بود. لطفاً دوباره تلاش کنید.", 500, false));
  }
}
