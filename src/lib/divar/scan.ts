/**
 * موتور اسکن فایل‌یابی دیوار — هسته ایجنت
 * ------------------------------------------------------
 * جریان هر اسکن:
 *  ۱) جست‌وجوی دسته‌های فعال در تبریز (وب عمومی یا کنار در صورت کلید)
 *  ۲) برای آگهی‌های تازه/تغییرکرده: دریافت جزئیات و خواندن «انتشار آگهی» —
 *     فیلتر زمان بر زمان واقعی ایجاد اعمال می‌شود، نه ترتیب نردبان دیوار
 *  ۳) امتیازدهی سه‌گانه (شخصی/زیرقیمت/مکان) و دسته‌بندی شکار/پیگیری/بررسی
 *  ۴) به‌روزرسانی آمار قیمت بازار برای مبنای زیرقیمت
 *  ۵) ثبت گزارش اسکن
 * آگهی‌های بیرون از بازه زمانی (رد سیستم) هرگز ذخیره نمی‌شوند.
 */

import { db } from "@/lib/db";
import { webSearchTabriz, webGetPostDetail, kenarSearch, type DivarPostDetail } from "./client";
import { loadDivarSettings, readKenarKey, kenarPostToFields } from "./store";
import { timeWindowHours, type DivarSettings } from "./config";
import { locationAllowed } from "./tabriz-locations";
import {
  parsePriceToman,
  parsePricePerMeterToman,
  parseMeterage,
  parseFloor,
  parseBuildYear,
  parseRooms,
  parseDivarJalaliDateTime,
} from "./parse";
import { scorePersonalAd, scoreUnderprice, scoreLocation, computeTotalScore, type AdBucket, type LocationMatchResult } from "./scoring";

export interface ScanSummary {
  ok: boolean;
  source: "web" | "kenar";
  scanned: number;
  fetched: number;
  inWindow: number;
  /** آگهی‌های درون بازه که بیرون از مناطق انتخابی مالک بودند و ذخیره نشدند */
  outOfArea: number;
  newAds: number;
  updatedAds: number;
  durationMs: number;
  message: string;
}

interface AdAnalysis {
  personal: ReturnType<typeof scorePersonalAd>;
  underprice: ReturnType<typeof scoreUnderprice>;
  location: ReturnType<typeof scoreLocation>;
}

/** آمار بازار فعلی برای یک محله (از آگهی‌های ذخیره‌شده) */
async function marketRefFor(lineId: string | null, category: string, minSample: number): Promise<{ median: number | null; count: number }> {
  if (!lineId) return { median: null, count: 0 };
  const stat = await db.marketPriceStat.findUnique({ where: { scopeKey: `line:${lineId}` } });
  if (stat && stat.sampleCount >= minSample) return { median: stat.medianPerMeter, count: stat.sampleCount };
  // جایگزین: آمار سطح دسته
  const catStat = await db.marketPriceStat.findUnique({ where: { scopeKey: `cat:${category}` } });
  if (catStat && catStat.sampleCount >= minSample) return { median: catStat.medianPerMeter, count: catStat.sampleCount };
  return { median: null, count: 0 };
}

/** بازسازی آمار قیمت بازار از آگهی‌های ذخیره‌شده (میانه + چارک‌ها) */
async function rebuildMarketStats(settings: DivarSettings): Promise<void> {
  const ads = await db.divarAd.findMany({
    where: { status: "active", pricePerMeter: { not: null } },
    select: { matchedLineId: true, category: true, pricePerMeter: true },
    take: 5000,
  });
  type Bucket = { values: number[] };
  const byLine = new Map<string, Bucket>();
  const byCat = new Map<string, Bucket>();
  for (const ad of ads) {
    if (!ad.pricePerMeter) continue;
    if (ad.matchedLineId) {
      const b = byLine.get(ad.matchedLineId) ?? { values: [] };
      b.values.push(ad.pricePerMeter);
      byLine.set(ad.matchedLineId, b);
    }
    const c = byCat.get(ad.category) ?? { values: [] };
    c.values.push(ad.pricePerMeter);
    byCat.set(ad.category, c);
  }
  const quantile = (sorted: number[], q: number): number => {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
  };
  const upserts: { scopeKey: string; medianPerMeter: number; p25: number; p75: number; count: number }[] = [];
  for (const [lineId, b] of byLine) {
    const sorted = [...b.values].sort((x, y) => x - y);
    upserts.push({ scopeKey: `line:${lineId}`, medianPerMeter: quantile(sorted, 0.5), p25: quantile(sorted, 0.25), p75: quantile(sorted, 0.75), count: sorted.length });
  }
  for (const [cat, b] of byCat) {
    const sorted = [...b.values].sort((x, y) => x - y);
    upserts.push({ scopeKey: `cat:${cat}`, medianPerMeter: quantile(sorted, 0.5), p25: quantile(sorted, 0.25), p75: quantile(sorted, 0.75), count: sorted.length });
  }
  for (const u of upserts) {
    await db.marketPriceStat.upsert({
      where: { scopeKey: u.scopeKey },
      create: { scopeKey: u.scopeKey, medianPerMeter: u.medianPerMeter, p25PerMeter: u.p25, p75PerMeter: u.p75, sampleCount: u.count },
      update: { medianPerMeter: u.medianPerMeter, p25PerMeter: u.p25, p75PerMeter: u.p75, sampleCount: u.count },
    });
  }
}

/** استخراج فیلدهای ساختاری از جزئیات آگهی */
function extractAdFields(detail: DivarPostDetail) {
  let meterage: number | null = null;
  let rooms: number | null = null;
  let buildYear: number | null = null;
  let floor: number | null = null;
  let priceTotal: number | null = null;
  let pricePerMeter: number | null = null;
  for (const s of detail.specs) {
    if (s.title.includes("متراژ") && meterage == null) meterage = parseMeterage(s.value);
    else if (s.title.includes("اتاق") && rooms == null) rooms = parseRooms(s.value);
    else if (s.title.includes("ساخت") && buildYear == null) buildYear = parseBuildYear(s.value);
    else if (s.title.includes("طبقه") && floor == null) floor = parseFloor(s.value)?.floor ?? null;
  }
  priceTotal = parsePriceToman(detail.priceTotalText);
  pricePerMeter = parsePricePerMeterToman(detail.pricePerMeterText);
  if (!pricePerMeter && priceTotal && meterage && meterage >= 10) {
    pricePerMeter = Math.round(priceTotal / meterage);
  }
  return { meterage, rooms, buildYear, floor, priceTotal, pricePerMeter };
}

/** امتیازدهی کامل یک آگهی — مکان می‌تواند از قبل (برای فیلتر مکانی) محاسبه شده باشد */
async function scoreAd(
  detail: DivarPostDetail,
  fields: ReturnType<typeof extractAdFields>,
  settings: DivarSettings,
  preLocation?: LocationMatchResult
): Promise<{ analysis: AdAnalysis; total: ReturnType<typeof computeTotalScore> }> {
  const personal = scorePersonalAd({
    title: detail.title,
    description: detail.description,
  });
  const market = await marketRefFor(null, detail.category ?? "apartment-sell", settings.minMarketSample);
  const location =
    preLocation ??
    scoreLocation({
      title: detail.title,
      locationText: detail.locationText,
      description: detail.description,
      latitude: detail.latitude,
      longitude: detail.longitude,
      selectedAreaIds: settings.areaIds,
      selectedLineIds: settings.lineIds,
    });
  const lineRef = await marketRefFor(location.lineId, detail.category ?? "apartment-sell", settings.minMarketSample);
  const ref = lineRef.median ? { median: lineRef.median, count: lineRef.count } : market;
  const underprice = scoreUnderprice({
    pricePerMeter: fields.pricePerMeter,
    ref: ref.median ? { medianPerMeter: ref.median, sampleCount: ref.count, source: "divar" as const } : null,
    armRefPerMeter: null,
    armWeight: settings.armPriceWeight,
    minSample: settings.minMarketSample,
  });
  const total = computeTotalScore({
    personal: personal.score,
    underprice: underprice.score,
    location: location.score,
    settings,
  });
  return { analysis: { personal, underprice, location }, total };
}

/** اجرای کامل یک اسکن */
export async function runDivarScan(input: { force?: boolean } = {}): Promise<ScanSummary> {
  const started = Date.now();
  const settings = await loadDivarSettings();
  const kenarKey = await readKenarKey().catch(() => null);
  const kenarRow = await db.divarConnection.findUnique({ where: { method: "kenar" } }).catch(() => null);
  const useKenar = Boolean(kenarKey && kenarRow?.status === "connected");

  const hours = timeWindowHours(settings.timeWindow);
  const windowStart = new Date(Date.now() - hours * 3600 * 1000);

  let scanned = 0;
  let fetched = 0;
  let inWindow = 0;
  let outOfArea = 0;
  let newAds = 0;
  let updatedAds = 0;
  const locationFilterActive = settings.areaIds.length > 0 || settings.lineIds.length > 0;

  const log = await db.divarScanLog.create({ data: { source: useKenar ? "kenar" : "web" } });

  try {
    // مرحله ۱ — جست‌وجو در دسته‌های فعال
    const tokenQueue: { token: string; title: string; priceText: string | null; category: string }[] = [];
    for (const category of settings.categories) {
      let searchUid: string | null = null;
      let viewedTokens: string | null = null;
      let lastPostDate: string | null = null;
      for (let page = 1; page <= settings.maxScanPages; page++) {
        if (useKenar && kenarKey) {
          const res = await kenarSearch(kenarKey, { category, page });
          for (const p of res.posts) {
            tokenQueue.push({ token: p.token, title: "", priceText: null, category });
          }
          scanned += res.posts.length;
          if (!res.hasMore) break;
        } else {
          const res = await webSearchTabriz({ category, page, searchUid, viewedTokens, lastPostDate });
          for (const r of res.rows) {
            tokenQueue.push({ token: r.token, title: r.title, priceText: r.priceText, category });
          }
          scanned += res.rows.length;
          searchUid = res.searchUid;
          viewedTokens = res.viewedTokens;
          lastPostDate = res.lastPostDate;
          if (!res.hasMore) break;
        }
      }
    }

    // مرحله ۲ — جزئیات آگهی‌های تازه یا تغییرکرده (حذف تکراری‌های صف — یک توکن ممکن است در چند دسته دیده شود)
    const seenTokens = new Set<string>();
    const uniqueQueue = tokenQueue.filter((t) =>
      seenTokens.has(t.token) ? false : (seenTokens.add(t.token), true)
    );
    const known = await db.divarAd.findMany({
      where: { token: { in: uniqueQueue.map((t) => t.token) } },
      select: { token: true, changeKey: true, price: true, publishedAt: true, totalScore: true },
    });
    const knownMap = new Map(known.map((k) => [k.token, k]));

    for (const item of uniqueQueue) {
      const existing = knownMap.get(item.token);
      const newChangeKeyGuess = `${item.token}|${item.priceText ?? "np"}`;
      if (existing && existing.changeKey === newChangeKeyGuess) {
        // آگهی شناخته‌شده بدون تغییر مهم — فقط دیدن دوباره ثبت می‌شود
        await db.divarAd.update({
          where: { token: item.token },
          data: { lastSeenAt: new Date() },
        });
        continue;
      }
      // آگهی تازه یا تغییر قیمت → جزئیات لازم است
      const detail = await webGetPostDetail(item.token).catch(() => null);
      if (!detail) continue;
      fetched += 1;
      const fields = extractAdFields(detail);
      const publishedAt = parseDivarJalaliDateTime(detail.publishedText);
      const bumpedAt = parseDivarJalaliDateTime(detail.lastBumpText);

      // فیلتر زمان واقعی انتشار — قلب حساسیت به «زمان ایجاد»
      if (!publishedAt || publishedAt < windowStart) {
        // رد سیستم: بیرون از بازه — هرگز ذخیره نمی‌شود
        continue;
      }
      inWindow += 1;

      // فیلتر مکان (منطبق با سامانه آرم): تطبیق مکانی پیش از امتیازدهی کامل محاسبه می‌شود؛
      // آگهی بیرون از مناطق انتخابی یا بدون نشانه مکانی قابل اتکا، هرگز ذخیره نمی‌شود (رد سیستم).
      const location = scoreLocation({
        title: detail.title,
        locationText: detail.locationText,
        description: detail.description,
        latitude: detail.latitude,
        longitude: detail.longitude,
        selectedAreaIds: settings.areaIds,
        selectedLineIds: settings.lineIds,
      });
      if (!locationAllowed({ areaId: location.areaId, lineId: location.lineId }, settings)) {
        outOfArea += 1;
        continue;
      }

      const { analysis, total } = await scoreAd(detail, fields, settings, location);

      const analysisJson = JSON.stringify({
        personal: { score: analysis.personal.score, isBroker: analysis.personal.isBroker, confidence: analysis.personal.confidence, signals: analysis.personal.signals },
        underprice: {
          score: analysis.underprice.score,
          percentBelow: analysis.underprice.percentBelow,
          referencePerMeter: analysis.underprice.referencePerMeter,
          sampleCount: analysis.underprice.sampleCount,
          method: analysis.underprice.method,
          reason: analysis.underprice.reason,
        },
        location: { score: analysis.location.score, method: analysis.location.method, reason: analysis.location.reason, areaName: analysis.location.areaName, lineName: analysis.location.lineName },
      });

      const changeKey = `${item.token}|${fields.priceTotal ?? "np"}`;
      const data = {
        category: detail.category ?? item.category,
        title: detail.title || item.title,
        description: detail.description,
        priceText: detail.priceTotalText ?? item.priceText,
        price: fields.priceTotal,
        pricePerMeter: fields.pricePerMeter,
        meterage: fields.meterage,
        rooms: fields.rooms,
        floor: fields.floor,
        buildYear: fields.buildYear,
        publishedAt,
        bumpedAt,
        locationText: detail.locationText,
        latitude: detail.latitude,
        longitude: detail.longitude,
        matchedAreaId: analysis.location.areaId,
        matchedAreaName: analysis.location.areaName,
        matchedLineId: analysis.location.lineId,
        matchedLineName: analysis.location.lineName,
        personalScore: analysis.personal.score,
        underpriceScore: analysis.underprice.score,
        locationScore: analysis.location.score,
        totalScore: total.total,
        bucket: total.bucket,
        analysisJson,
        imagesJson: JSON.stringify(detail.images.slice(0, 12)),
        specsJson: JSON.stringify(detail.specs),
        changeKey,
        lastSeenAt: new Date(),
      };

      if (existing) {
        // تغییر مهم (قیمت) یا صعود امتیاز → به‌روزرسانی
        const scoreImproved = total.total > (existing.totalScore ?? 0) + 5;
        if (changeKey !== existing.changeKey || scoreImproved) {
          await db.divarAd.update({ where: { token: item.token }, data });
          updatedAds += 1;
        } else {
          await db.divarAd.update({ where: { token: item.token }, data: { lastSeenAt: new Date() } });
        }
      } else {
        try {
          await db.divarAd.create({ data: { token: item.token, status: "active", ...data } });
          newAds += 1;
        } catch (createErr) {
          // رقابت همزمان/تکرار توکن → به‌روزرسانی به‌جای خطا
          const code = (createErr as { code?: string }).code;
          if (code === "P2002") {
            await db.divarAd.update({ where: { token: item.token }, data }).catch(() => undefined);
            updatedAds += 1;
          } else {
            throw createErr;
          }
        }
      }
    }

    // مرحله ۳ — بازسازی آمار بازار و بازامتیازدهی آگهی‌های محله‌دار
    await rebuildMarketStats(settings);
    await rescoreAgainstMarket(settings);

    const durationMs = Date.now() - started;
    await db.divarScanLog.update({
      where: { id: log.id },
      data: { durationMs, scanned, fetched, inWindow, outOfArea, newAds, updatedAds },
    });
    return {
      ok: true,
      source: useKenar ? "kenar" : "web",
      scanned,
      fetched,
      inWindow,
      outOfArea,
      newAds,
      updatedAds,
      durationMs,
      message: locationFilterActive
        ? `اسکن کامل شد — ${newAds} فایل تازه، ${updatedAds} به‌روزشده از ${inWindow} آگهی درون بازه؛ ${outOfArea} آگهی بیرون از مناطق انتخابی رد شد (فیلتر مکان فعال).`
        : `اسکن کامل شد — ${newAds} فایل تازه، ${updatedAds} به‌روزشده از ${inWindow} آگهی درون بازه (فیلتر مکان: همه تبریز).`,
    };
  } catch (err) {
    const message = (err as Error).message ?? "خطای نامشخص در اسکن";
    await db.divarScanLog.update({
      where: { id: log.id },
      data: { error: message.slice(0, 300), durationMs: Date.now() - started, scanned, fetched, inWindow, outOfArea, newAds, updatedAds },
    });
    return { ok: false, source: useKenar ? "kenar" : "web", scanned, fetched, inWindow, outOfArea, newAds, updatedAds, durationMs: Date.now() - started, message };
  }
}

/** بازامتیازدهی آگهی‌های موجود پس از به‌روز شدن آمار بازار (فقط زیرقیمت و کل) */
async function rescoreAgainstMarket(settings: DivarSettings): Promise<void> {
  const ads = await db.divarAd.findMany({
    where: { status: "active" },
    take: 2000,
    select: { token: true, pricePerMeter: true, category: true, personalScore: true, locationScore: true, totalScore: true, matchedLineId: true, analysisJson: true },
  });
  for (const ad of ads) {
    const lineRef = await marketRefFor(ad.matchedLineId, ad.category, settings.minMarketSample);
    const ref = lineRef.median
      ? { medianPerMeter: lineRef.median, sampleCount: lineRef.count, source: "divar" as const }
      : null;
    const underprice = scoreUnderprice({
      pricePerMeter: ad.pricePerMeter,
      ref,
      armWeight: settings.armPriceWeight,
      minSample: settings.minMarketSample,
    });
    const total = computeTotalScore({
      personal: ad.personalScore,
      underprice: underprice.score,
      location: ad.locationScore,
      settings,
    });
    if (total.total === ad.totalScore && underprice.score === 0) continue;
    if (total.total === ad.totalScore) continue;
    // به‌روزرسانی تحلیل زیرقیمت در analysisJson
    let analysisObj: Record<string, unknown> = {};
    try {
      analysisObj = JSON.parse(ad.analysisJson ?? "{}") as Record<string, unknown>;
    } catch {
      analysisObj = {};
    }
    analysisObj.underprice = {
      score: underprice.score,
      percentBelow: underprice.percentBelow,
      referencePerMeter: underprice.referencePerMeter,
      sampleCount: underprice.sampleCount,
      method: underprice.method,
      reason: underprice.reason,
    };
    await db.divarAd.update({
      where: { token: ad.token },
      data: { underpriceScore: underprice.score, totalScore: total.total, bucket: total.bucket, analysisJson: JSON.stringify(analysisObj) },
    });
  }
}

/** آیا زمان اسکن خودکار رسیده؟ (فراخوانی فرصت‌طلبانه از API فهرست آگهی‌ها) */
export async function autoScanDue(): Promise<boolean> {
  const settings = await loadDivarSettings();
  if (settings.autoScanMinutes <= 0) return false;
  const last = await db.divarScanLog.findFirst({ where: { error: null }, orderBy: { startedAt: "desc" } });
  if (!last) return true;
  return Date.now() - last.startedAt.getTime() >= settings.autoScanMinutes * 60 * 1000;
}

/** اسکن در پس‌زمینه — خطا هرگز به فراخواننده نمی‌رسد */
export function triggerBackgroundScan(): void {
  if (globalThis.__divarScanRunning) return;
  globalThis.__divarScanRunning = true;
  runDivarScan()
    .catch(() => undefined)
    .finally(() => {
      globalThis.__divarScanRunning = false;
    });
}

declare global {
  var __divarScanRunning: boolean | undefined;
}

export type { AdBucket };
