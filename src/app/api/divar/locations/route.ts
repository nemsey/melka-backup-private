/**
 * /api/divar/locations — منطقه‌بندی کامل تبریز (عین سامانه ARM) برای انتخابگر مکان
 * GET — ۱۳۰ منطقه با همه محله‌هایشان (شناسه + نام) + ۱۷ منطقه پیش‌فرض مالک
 * فقط با نشست معتبر؛ تغییر تنظیمات از مسیر settings (مالک) انجام می‌شود.
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import {
  TABRIZ_AREAS,
  ALL_LINES,
  DEFAULT_LOCATION_AREA_IDS,
  DEFAULT_LOCATION_AREA_NAMES,
} from "@/lib/divar/tabriz-locations";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  return Response.json({
    ok: true,
    totalAreas: TABRIZ_AREAS.length,
    totalLines: ALL_LINES.length,
    areas: TABRIZ_AREAS.map((a) => ({
      id: a.id,
      name: a.n.trim(),
      lines: a.l.map((l) => ({ id: l.id, name: l.n.trim() })),
    })),
    defaults: {
      areaIds: DEFAULT_LOCATION_AREA_IDS,
      areaNames: DEFAULT_LOCATION_AREA_NAMES,
    },
  });
}
