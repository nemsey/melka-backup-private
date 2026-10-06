/**
 * POST /api/experts/sync — بروزرسانی فهرست کارشناسان (PN-008 ثانیاً)
 * ---------------------------------------------------------------------------
 * زنجیرهٔ سه‌مرحله‌ای (همهٔ ستون‌ها):
 *   ۱) رجیستری PM — realtors/list همهٔ صفحات (کدپرسنلی/نام/موبایل/داخلی/وضعیت)
 *   ۲) عمق PM — personnelInfo (استخدام/شعبه/مدیر/سمت) + contactInfo (آدرس/تلفن/کدپستی)
 *   ۳) شمارش ARM محلی — مبایعه‌نامه (+پیش‌فروش) و اجاره‌نامه (+تمدید) هر کارشناس
 * هر مرحله صادقانه گزارش می‌شود؛ شکست مرحله، مراحل دیگر را نمی‌شکند.
 * قید: فقط OWNER (توکن خزانهٔ PM مالک).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { syncExpertProfiles } from "@/lib/experts/profile-store";
import { getPmSyncToken } from "@/lib/melk-api/pm-acc-sync";

export async function POST(request: NextRequest) {
  const role = await requireRole(request, "OWNER", "POST /api/experts/sync");
  if (role instanceof MelkApiError) return errorResponse(role);
  const guard = role.ctx;

  try {
    const pmToken = await getPmSyncToken();
    const stage = await syncExpertProfiles(pmToken, { deepRows: 20 });
    await audit("EXPERTS_SYNC_RUN", guard.personnelCode, JSON.stringify({ registry: stage.registryRows, deep: stage.deepEnriched }));
    return Response.json({ ok: true, stage });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در بروزرسانی فهرست کارشناسان.", 500, false));
  }
}
