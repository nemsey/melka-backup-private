/**
 * /api/divar/settings — تنظیمات اختصاصی ایجنت فایل‌یابی (سمت سرور — مبنای موتور اسکن)
 * GET — تنظیمات فعلی + منطقه‌بندی تبریز (برای انتخابگر محله)
 * PUT — اعمال تغییرات با اعتبارسنجی منطقی
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { loadDivarSettings, saveDivarSettings } from "@/lib/divar/store";
import {
  TABRIZ_AREAS,
  ALL_LINES,
  DEFAULT_LOCATION_AREA_IDS,
  DEFAULT_LOCATION_AREA_NAMES,
  validateLocationSelection,
} from "@/lib/divar/tabriz-locations";
import { DIVAR_REAL_ESTATE_CATEGORIES, DIVAR_TIME_WINDOWS } from "@/lib/divar/config";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const settings = await loadDivarSettings();
  return Response.json({
    ok: true,
    settings,
    meta: {
      categories: DIVAR_REAL_ESTATE_CATEGORIES,
      timeWindows: DIVAR_TIME_WINDOWS,
      areas: TABRIZ_AREAS.map((a) => ({ id: a.id, name: a.n, lineCount: a.l.length })),
      totalLines: ALL_LINES.length,
      locationDefaults: {
        areaIds: DEFAULT_LOCATION_AREA_IDS,
        areaNames: DEFAULT_LOCATION_AREA_NAMES,
      },
    },
  });
}

export async function PUT(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  if (guard.role !== "OWNER") {
    return errorResponse(
      new MelkApiError("UNAUTHORIZED", "تغییر تنظیمات ایجنت فقط برای مالک سامانه مجاز است.", 403, false)
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  const patch: Record<string, unknown> = {};
  if ("timeWindow" in body) patch.timeWindow = String(body.timeWindow);
  if (Array.isArray(body.categories)) patch.categories = body.categories.map(String).slice(0, 20);

  // فیلتر مکان — اعتبارسنجی شناسه‌ها روی رجیستری رسمی آرم
  if (Array.isArray(body.areaIds) || Array.isArray(body.lineIds)) {
    const currentSettings = await loadDivarSettings();
    const areaIds = Array.isArray(body.areaIds) ? body.areaIds.map(String).slice(0, TABRIZ_AREAS.length) : currentSettings.areaIds;
    const lineIds = Array.isArray(body.lineIds) ? body.lineIds.map(String).slice(0, ALL_LINES.length) : currentSettings.lineIds;
    const v = validateLocationSelection(areaIds, lineIds);
    if (!v.ok) {
      return errorResponse(new MelkApiError("UNKNOWN", v.message ?? "انتخاب مکان نامعتبر است.", 400, false));
    }
    if (Array.isArray(body.areaIds)) patch.areaIds = areaIds;
    if (Array.isArray(body.lineIds)) patch.lineIds = lineIds;
  }

  for (const k of ["weightPersonal", "weightUnderprice", "weightLocation", "huntThreshold", "followThreshold", "autoScanMinutes", "maxScanPages", "minMarketSample", "armPriceWeight"]) {
    if (k in body) {
      const n = Number(body[k]);
      if (isFinite(n)) patch[k] = n;
    }
  }

  // اعتبارسنجی بازه زمانی
  if (patch.timeWindow && !DIVAR_TIME_WINDOWS.some((w) => w.value === patch.timeWindow)) {
    return errorResponse(new MelkApiError("UNKNOWN", "بازه زمانی نامعتبر است.", 400, false));
  }
  // اعتبارسنجی دسته‌ها
  if (Array.isArray(patch.categories)) {
    const valid = (patch.categories as string[]).filter((c) => DIVAR_REAL_ESTATE_CATEGORIES.some((d) => d.value === c));
    if (valid.length === 0) {
      return errorResponse(new MelkApiError("UNKNOWN", "حداقل یک دسته باید فعال باشد.", 400, false));
    }
    patch.categories = valid;
  }

  const settings = await saveDivarSettings(patch);
  return Response.json({ ok: true, settings, message: "تنظیمات ایجنت فایل‌یابی ذخیره شد." });
}
