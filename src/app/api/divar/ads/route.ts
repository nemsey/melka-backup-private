/**
 * /api/divar/ads — فهرست فایل‌ها بر اساس پنجره (شکار/پیگیری/بررسی)
 * GET ?bucket=hunt|follow|review|all&category=&line=&limit=&offset=
 * اسکن خودکار فرصت‌طلبانه: اگر زمانش رسیده باشد در پس‌زمینه اجرا می‌شود.
 * فیلتر مکان (مناطق/محله‌های انتخابی مالک — منطبق با آرم) روی هر دو خروجی
 * ردیف‌ها و شمارنده‌ها اعمال می‌شود؛ آگهی‌های بیرون از انتخاب نمایش داده نمی‌شوند.
 */

import { NextRequest } from "next/server";
import { getMarketRepository, type AdWindowFilter } from "@/core/repositories";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { triggerBackgroundScan, autoScanDue } from "@/lib/divar/scan";
import { loadDivarSettings } from "@/lib/divar/store";
import { allowedLineIdsForSelection } from "@/lib/divar/tabriz-locations";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  // اسکن خودکار دوره‌ای (فرصت‌طلبانه در نخستین بازدید)
  if (await autoScanDue().catch(() => false)) {
    triggerBackgroundScan();
  }

  const params = request.nextUrl.searchParams;
  const bucketParam = params.get("bucket") ?? "all";
  const category = params.get("category");
  const lineId = params.get("line");
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 60), 1), 200);
  const offset = Math.max(Number(params.get("offset") ?? 0), 0);

  const bucket = ["hunt", "follow", "review", "all"].includes(bucketParam) ? bucketParam : "all";

  const settings = await loadDivarSettings();
  const allowedLineIds = allowedLineIdsForSelection(settings);

  // پنجره فایل‌یابی + شمارنده دسته‌ها — عین where/groupBy قبلی از انبار
  const { rows, bucketCounts } = await getMarketRepository().listAdsWithBucketCounts({
    filter: {
      bucket,
      category: category ?? undefined,
      lineId: lineId ?? undefined,
      allowedLineIds,
    } as AdWindowFilter,
    limit,
    offset,
  });

  return Response.json({
    ok: true,
    rows: rows.map((r) => ({
      ...r,
      images: (() => {
        try { return JSON.parse(r.imagesJson ?? "[]") as string[]; } catch { return []; }
      })(),
      imagesJson: undefined,
    })),
    bucketCounts,
    locationFilter: {
      active: Boolean(allowedLineIds),
      areaCount: settings.areaIds.length,
      lineCount: settings.lineIds.length,
    },
    thresholds: { hunt: settings.huntThreshold, follow: settings.followThreshold },
    weights: { personal: settings.weightPersonal, underprice: settings.weightUnderprice, other: settings.weightOther, location: settings.weightLocation },
  });
}
