/**
 * GET /api/crm/meta
 * گزینه‌های فیلتر برای پرکردن دراپ‌داون کاشی‌ها:
 *   نقش‌های کاربران، کسب‌وکارها (شعبه‌ها)، ثبت‌کنندگان —
 *   همگی از داده واقعی استخراج‌شده کش می‌شوند.
 */

import { NextRequest } from "next/server";
import { getExpertRepository } from "@/core/repositories";
import { ensureSeeded } from "@/lib/melk-api/sync";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    // کش فقط با داده واقعی سامانه ملک تبریز پر می‌شود
    await ensureSeeded(guard.armTokens?.accessToken);
    const { roles, businesses, creators } = await getExpertRepository().distinctFilterFields();

    return Response.json({
      ok: true,
      // انبار مقادیر یکتا را از پیش باز کرده (string[]) — عین خروجی قبلی
      roles: [...roles].filter(Boolean).sort((a, b) => a.localeCompare(b, "fa")),
      businesses: [...businesses].filter(Boolean).sort((a, b) => a.localeCompare(b, "fa")),
      creators: [...creators].filter((c): c is string => Boolean(c)).sort((a, b) => a.localeCompare(b, "fa")),
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در دریافت فراداده.", 500, false));
  }
}
