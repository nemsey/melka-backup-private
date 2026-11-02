/**
 * /api/indicators — هفت نشانگر اتصال بالای صفحه خانه
 * ------------------------------------------------------
 * سبز = متصل | قرمز = قطع
 * ۱. حساب شخصی ARM  ۲. API ARM  ۳. حساب شخصی PM  ۴. API PM
 * ۵. API دیوار  ۶. حساب شخصی دیوار  ۷. حساب اینستاگرام
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { computeIndicators } from "@/lib/indicators";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const indicators = await computeIndicators(Boolean(guard.armTokens?.accessToken), guard.armTokens?.userType ?? null);
    return Response.json({ ok: true, indicators });
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای محاسبه نشانگرها", 500, false);
    return errorResponse(e);
  }
}
