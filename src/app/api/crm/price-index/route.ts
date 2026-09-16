/**
 * GET /api/crm/price-index
 * شاخص قیمت روز مناطق — سه لایه داده واقعی:
 *   ۱) پیکربندی رسمی شاخص‌های سامانه ARM (configs/current-prices — عمومی)
 *   ۲) آمار واقعی بازار از آگهی‌های زنده (دیوار: قیمت هر متر × منطقه)
 *   ۳) تاریخچه شاخص (PriceIndexHistory — فقط افزودنی) برای روند و جهش
 * + پایش سلامت قیمت‌گذاری: آگهی‌های منحرف از شاخص منطقه.
 */

import { NextRequest } from "next/server";
import { getMarketRepository, getPredictionRepository } from "@/core/repositories";
import { getPriceIndexConfigs } from "@/lib/melk-api/sync";
import {
  attachChangePercent,
  computeAreaStats,
  detectJump,
  findDeviatingAds,
  overallIndex,
  type PriceSample,
} from "@/lib/melk-api/price-index";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";

/** ثبت تاریخچه شاخص — حداکثر یک ثبت در هر منطقه در هر روز */
async function recordHistory(areaStats: ReturnType<typeof computeAreaStats>): Promise<void> {
  const dayKey = new Date().toISOString().slice(0, 10);
  const existing = await getPredictionRepository().listHistorySince(new Date(`${dayKey}T00:00:00`));
  const seenKeys = new Set(existing.map((r) => `${r.areaName}::${r.category}`));
  const pending = areaStats.filter((s) => s.reliable && !seenKeys.has(`${s.areaName}::${s.category}`));
  const prediction = getPredictionRepository();
  await Promise.all(
    pending.map((s) =>
      prediction.createHistoryEntry({
        areaName: s.areaName,
        category: s.category,
        medianPerMeter: s.medianPerMeter,
        p25PerMeter: s.p25PerMeter,
        p75PerMeter: s.p75PerMeter,
        minPerMeter: s.minPerMeter,
        maxPerMeter: s.maxPerMeter,
        sampleCount: s.sampleCount,
      })
    )
  );
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const sp = request.nextUrl.searchParams;
    const category = sp.get("category");

    // ۱) پیکربندی رسمی شاخص‌های سامانه ARM (عمومی + کش)
    const { indices, liveError: indexError } = await getPriceIndexConfigs();

    // ۲) نمونه‌های واقعی بازار — آگهی‌های زنده با قیمت و منطقه تطبیق‌شده
    const ads = await getMarketRepository().listPriceSamples(category ?? undefined);

    const samples: PriceSample[] = ads
      .filter((a) => (a.matchedLineName ?? a.matchedAreaName) != null)
      .map((a) => ({
        token: a.token,
        title: a.title,
        areaName: (a.matchedLineName ?? a.matchedAreaName ?? "").trim(),
        category: a.category,
        pricePerMeter: a.pricePerMeter ?? 0,
        totalScore: a.totalScore,
        publisherType: a.publisherType,
      }));

    // ۳) آمار هر منطقه از داده واقعی
    const rawStats = computeAreaStats(samples);

    // ۴) ثبت تاریخچه امروز (فقط افزودنی — یک ثبت در روز)
    await recordHistory(rawStats);

    // ۵) تغییر نسبت به ثبت قبلی + روند کامل
    const history = await getPredictionRepository().listRecentHistory(400);
    const historyRows = history.map((h) => ({
      areaName: h.areaName,
      category: h.category,
      medianPerMeter: h.medianPerMeter,
      recordedAt: h.recordedAt.toISOString(),
    }));

    const areaStats = attachChangePercent(rawStats, historyRows);

    // ۶) هشدار جهش قیمتی (تغییر ≥ ۱۵٪ بین دو ثبت متوالی)
    const jumps = detectJump(historyRows, 15);

    // ۷) پایش سلامت قیمت‌گذاری: آگهی‌های منحرف (≥ ۳۰٪ از میانه + بیرون از چارک)
    const deviations = findDeviatingAds(samples, rawStats, 30).slice(0, 30);

    // ۸) شاخص کل بازار
    const overall = overallIndex(areaStats);

    return Response.json({
      ok: true,
      indices,
      areaStats: areaStats.slice(0, 40),
      jumps: jumps.slice(0, 10),
      deviations,
      overall,
      trend: historyRows.slice(0, 120).reverse(),
      categories: [...new Set(samples.map((s) => s.category))],
      dataSource: {
        real: true,
        liveIndices: indices.length > 0,
        marketSamples: samples.length,
        liveError: indexError,
      },
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در محاسبه شاخص قیمت روز.", 500, false));
  }
}
