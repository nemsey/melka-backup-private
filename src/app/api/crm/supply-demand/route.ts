/**
 * GET /api/crm/supply-demand
 * گزارش عرضه و تقاضا — عین گزارش «realtor-reports/supply-demand» خود سامانه ARM:
 * بازه × تعداد آگهی × درصد درخواست × وضعیت + شاخص‌های تحلیلی (تعادل بازار).
 * خوانده‌شده از کش محلی که فقط با داده واقعی استخراج‌شده از arus-api پر می‌شود.
 */

import { NextRequest } from "next/server";
import { getMarketRepository } from "@/core/repositories";
import { ensureSeeded, getSyncState } from "@/lib/melk-api/sync";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    // تلاش برای استخراج زنده در صورت خالی‌بودن کش (فقط داده واقعی)
    const seed = await ensureSeeded(guard.armTokens?.accessToken);
    const syncState = await getSyncState();

    const rows = await getMarketRepository().listSupplyDemandOrderByPropertyCountDesc();

    // شاخص‌های تحلیلی — تعادل بازار
    const totalAds = rows.reduce((a, r) => a + r.propertyCount, 0);
    const avgRequestPercent = rows.length > 0 ? Math.round((rows.reduce((a, r) => a + r.requestPercent, 0) / rows.length) * 10) / 10 : 0;
    // بازه‌های با فشار تقاضا بالا (درصد درخواست >= ۶۰) و پایین (<= ۲۵)
    const highDemand = rows.filter((r) => r.requestPercent >= 60);
    const lowDemand = rows.filter((r) => r.requestPercent > 0 && r.requestPercent <= 25);
    const topDemand = [...rows].sort((a, b) => b.requestPercent - a.requestPercent)[0] ?? null;
    const topSupply = rows[0] ?? null;

    return Response.json({
      ok: true,
      rows,
      total: rows.length,
      summary: {
        rangeCount: rows.length,
        totalAds,
        avgRequestPercent,
        highDemandCount: highDemand.length,
        lowDemandCount: lowDemand.length,
        topDemand: topDemand ? { rangeTitle: topDemand.rangeTitle, requestPercent: topDemand.requestPercent, propertyCount: topDemand.propertyCount } : null,
        topSupply: topSupply ? { rangeTitle: topSupply.rangeTitle, propertyCount: topSupply.propertyCount, requestPercent: topSupply.requestPercent } : null,
      },
      dataSource: {
        real: true,
        cached: syncState.lastSuccessAt !== null,
        lastSuccessAt: syncState.lastSuccessAt,
        lastSyncedAt: syncState.lastSyncedAt,
        liveError: seed.liveError ?? syncState.lastError,
        syncAttempts: syncState.attempts,
      },
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در دریافت گزارش عرضه و تقاضا.", 500, false));
  }
}
