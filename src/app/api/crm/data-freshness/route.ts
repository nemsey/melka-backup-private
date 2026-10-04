/**
 * GET /api/crm/data-freshness — بند ت (P6.5-11)
 * ------------------------------------------------------
 * «در بالای هر کاشی تاریخ آخرین بروزرسانی اطلاعات دقیقاً مشخص باشد»
 *
 * محاسبه در لایهٔ lib (گارد خلوص روت‌ها — روت‌ها هرگز @/lib/db را import نمی‌کنند).
 * خواندن تجمیعی بدون هیچ نوشتنی (قانون دادهٔ خام بند الف).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { witnessScopedRead } from "@/lib/audit";
import { resolveEntityAccess, ownerLoginPath } from "@/lib/access/scope";
import { computeTilesFreshness } from "@/lib/melk-api/data-freshness";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    // بند ت برای همهٔ کاشی‌ها — خواندن تجمیعی (بدون تغییر داده)؛ شاهد مالک
    const access = resolveEntityAccess(guard, "transaction");
    await witnessScopedRead(guard, "transaction", 0, access.isOwnerRead, ownerLoginPath(guard));

    const freshness = await computeTilesFreshness();
    return Response.json({ ok: true, freshness, computedAt: new Date().toISOString() });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در محاسبهٔ تازگی دادهٔ کاشی‌ها.", 500, false));
  }
}
