/**
 * /api/divar/ads — فهرست فایل‌ها بر اساس پنجره (شکار/پیگیری/بررسی)
 * GET ?bucket=hunt|follow|review|all&category=&line=&limit=&offset=
 * اسکن خودکار فرصت‌طلبانه: اگر زمانش رسیده باشد در پس‌زمینه اجرا می‌شود.
 * فیلتر مکان (مناطق/محله‌های انتخابی مالک — منطبق با آرم) روی هر دو خروجی
 * ردیف‌ها و شمارنده‌ها اعمال می‌شود؛ آگهی‌های بیرون از انتخاب نمایش داده نمی‌شوند.
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
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

  const whereBase: Record<string, unknown> = { status: "active" };
  // فیلتر مکان: اجتماع محله‌های مناطق انتخابی + محله‌های خاص (null = همه تبریز)
  if (allowedLineIds) whereBase.matchedLineId = { in: allowedLineIds };

  const where: Record<string, unknown> = { ...whereBase };
  if (bucket !== "all") where.bucket = bucket;
  if (category) where.category = category;
  if (lineId) where.matchedLineId = lineId;

  const [rows, counts] = await Promise.all([
    db.divarAd.findMany({
      where,
      orderBy: { totalScore: "desc" },
      take: limit,
      skip: offset,
      select: {
        token: true, category: true, title: true, price: true, priceText: true, pricePerMeter: true,
        meterage: true, rooms: true, floor: true, buildYear: true, publishedAt: true, bumpedAt: true,
        locationText: true, matchedAreaName: true, matchedLineName: true,
        personalScore: true, underpriceScore: true, locationScore: true, totalScore: true, bucket: true,
        imagesJson: true,
      },
    }),
    db.divarAd.groupBy({ by: ["bucket"], where: whereBase, _count: { _all: true } }),
  ]);

  const bucketCounts = { hunt: 0, follow: 0, review: 0 };
  for (const g of counts) {
    if (g.bucket in bucketCounts) bucketCounts[g.bucket as keyof typeof bucketCounts] = g._count._all;
  }

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
    weights: { personal: settings.weightPersonal, underprice: settings.weightUnderprice, location: settings.weightLocation },
  });
}
