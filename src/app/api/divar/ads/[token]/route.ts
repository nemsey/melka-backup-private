/**
 * /api/divar/ads/[token] — جزئیات کامل یک فایل
 * GET — داده ذخیره‌شده + جزئیات زنده تازه از دیوار (اگر ممکن باشد) +
 *       تحلیل کامل امتیازدهی + پیش‌بینی هوشمند دلایل احتمالی رد توسط کاربر
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { divarPostUrl, webGetPostDetail, classifyPublisherKind, parseActiveAdCount } from "@/lib/divar/client";
import { predictRejectReasons, PUBLISHER_KIND_LABELS, type PersonalScoreResult, type UnderpriceResult, type LocationMatchResult } from "@/lib/divar/scoring";
import { formatToman } from "@/lib/divar/parse";

interface AnalysisShape {
  personal?: { score: number; isBroker: boolean; confidence: string; signals: { key: string; label: string; weight: number; hit: boolean; evidence: string }[] };
  underprice?: { score: number; percentBelow: number | null; referencePerMeter: number | null; sampleCount: number; method: string; reason: string };
  location?: { score: number; method: string; reason: string; areaName: string | null; lineName: string | null };
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { token } = await ctx.params;
  const ad = await db.divarAd.findUnique({ where: { token } });
  if (!ad) {
    return errorResponse(new MelkApiError("NOT_FOUND", "این فایل یافت نشد — ممکن است رد یا حذف شده باشد.", 404, false));
  }

  // جزئیات زنده تازه (بهترین تلاش — اگر شبکه اجازه دهد)
  const live = await webGetPostDetail(token).catch(() => null);
  // آگهی‌دهنده — برچسب زیر نقشه دیوار (اولویت با داده زنده، سپس ذخیره)
  const publisher = (() => {
    const lt = live?.publisherType ?? null;
    if (lt && lt !== "personal") {
      const name = live?.publisherName ?? ad.publisherName;
      return {
        type: name && lt === "business" ? classifyPublisherKind(name) : lt,
        name,
        adCountText: live?.publisherAdCountText ?? null,
        adCount: live?.publisherAdCountText ? parseActiveAdCount(live.publisherAdCountText) : ad.publisherAdCount,
        brandUrl: live?.publisherBrandUrl ?? ad.publisherBrandUrl,
        source: "live" as const,
      };
    }
    if (lt === "personal") return { type: "personal", name: null, adCountText: null, adCount: null, brandUrl: null, source: "live" as const };
    const stRaw = ad.publisherType ?? null;
    const st = stRaw && (["personal", "agent", "department", "business"] as const).includes(stRaw as "personal") ? (stRaw as "personal" | "agent" | "department" | "business") : null;
    if (st && st !== "personal") {
      const name = ad.publisherName;
      return {
        type: name && st === "business" ? classifyPublisherKind(name) : st,
        name,
        adCountText: null,
        adCount: ad.publisherAdCount,
        brandUrl: ad.publisherBrandUrl,
        source: "stored" as const,
      };
    }
    if (st === "personal") return { type: "personal", name: null, adCountText: null, adCount: null, brandUrl: null, source: "stored" as const };
    return null;
  })();

  let analysis: AnalysisShape = {};
  try {
    analysis = JSON.parse(ad.analysisJson ?? "{}") as AnalysisShape;
  } catch {
    analysis = {};
  }

  const personal: PersonalScoreResult = {
    score: ad.personalScore,
    isBroker: analysis.personal?.isBroker ?? false,
    confidence: (analysis.personal?.confidence as PersonalScoreResult["confidence"]) ?? "low",
    signals: analysis.personal?.signals ?? [],
  };
  const underprice: UnderpriceResult = {
    score: ad.underpriceScore,
    percentBelow: analysis.underprice?.percentBelow ?? null,
    referencePerMeter: analysis.underprice?.referencePerMeter ?? null,
    sampleCount: analysis.underprice?.sampleCount ?? 0,
    confidence: (analysis.underprice?.method as UnderpriceResult["method"]) === "none" ? "low" : "medium",
    method: (analysis.underprice?.method as UnderpriceResult["method"]) ?? "none",
    reason: analysis.underprice?.reason ?? "تحلیل زیرقیمت در دسترس نیست.",
  };
  const location: LocationMatchResult = {
    score: ad.locationScore,
    areaId: ad.matchedAreaId,
    areaName: ad.matchedAreaName,
    lineId: ad.matchedLineId,
    lineName: ad.matchedLineName,
    method: (analysis.location?.method as LocationMatchResult["method"]) ?? "none",
    reason: analysis.location?.reason ?? "تحلیل مکان در دسترس نیست.",
  };

  const predictions = predictRejectReasons({
    personal,
    underprice,
    location,
    pricePerMeter: ad.pricePerMeter,
  });

  let specs: { title: string; value: string }[] = [];
  try {
    specs = JSON.parse(ad.specsJson ?? "[]") as { title: string; value: string }[];
  } catch {
    specs = [];
  }
  let images: string[] = [];
  try {
    images = JSON.parse(ad.imagesJson ?? "[]") as string[];
  } catch {
    images = [];
  }
  if (live?.images?.length) images = live.images;

  return Response.json({
    ok: true,
    ad: {
      token: ad.token,
      category: ad.category,
      title: ad.title,
      description: live?.description ?? ad.description,
      price: ad.price,
      priceText: ad.priceText,
      pricePerMeter: ad.pricePerMeter,
      meterage: ad.meterage,
      rooms: ad.rooms,
      floor: ad.floor,
      buildYear: ad.buildYear,
      publishedAt: ad.publishedAt?.toISOString() ?? null,
      bumpedAt: ad.bumpedAt?.toISOString() ?? null,
      locationText: ad.locationText,
      latitude: ad.latitude,
      longitude: ad.longitude,
      matchedAreaName: ad.matchedAreaName,
      matchedLineName: ad.matchedLineName,
      scores: {
        personal: ad.personalScore,
        underprice: ad.underpriceScore,
        location: ad.locationScore,
        total: ad.totalScore,
        bucket: ad.bucket,
      },
      status: ad.status,
      specs: live?.specs?.length ? live.specs : specs,
      features: live?.features ?? [],
      images,
      postUrl: divarPostUrl(ad.token, ad.title),
      liveAvailable: Boolean(live),
      // آگهی‌دهنده — عین برچسب زیر نقشه دیوار (مشاور املاک/دپارتمان املاک/شخصی)
      publisher: publisher
        ? {
            type: publisher.type,
            typeLabel: PUBLISHER_KIND_LABELS[publisher.type] ?? "کسب‌وکار املاک",
            name: publisher.name,
            adCountText: publisher.adCountText,
            adCount: publisher.adCount,
            brandUrl: publisher.brandUrl,
            source: publisher.source,
          }
        : null,
    },
    analysis: {
      personal,
      underprice: { ...underprice, referenceLabel: formatToman(underprice.referencePerMeter) },
      location,
    },
    predictions,
  });
}
