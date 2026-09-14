/**
 * آمار شاخص قیمت روز مناطق — از داده واقعی بازار
 * ------------------------------------------------------
 * ورودی: آگهی‌های واقعی (قیمت هر متر + منطقه) — چه از اسکن دیوار
 * (DivarAd با matchedLineName) و چه از آگهی‌های سامانه آرم.
 * خروجی: آمار توصیفی هر منطقه (میانه/چارک‌ها/کمینه/بیشینه)،
 * روند زمانی از تاریخچه (PriceIndexHistory) و هشدار جهش قیمتی.
 *
 * تمام محاسبات روی داده واقعی انجام می‌شود — بدون هیچ داده ساختگی.
 */

import type { AreaPriceStat, DeviatingAd } from "./types";

/** ردیف ورودی آمار: قیمت هر متر + منطقه + دسته */
export interface PriceSample {
  token: string;
  title: string;
  areaName: string;
  category: string;
  pricePerMeter: number;
  totalScore: number;
  publisherType: string | null;
}

/** آمار منطقه به‌همراه پرچم اعتبار (≥ ۲ نمونه) */
export interface AreaStatWithReliability extends AreaPriceStat {
  reliable: boolean;
}

/** آمار توصیفی یک گروه نمونه (میانه/چارک‌ها/کمینه/بیشینه) */
function statsFor(samples: number[]): { median: number; p25: number; p75: number; min: number; max: number } {
  if (samples.length === 0) return { median: 0, p25: 0, p75: 0, min: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  return {
    median,
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}


/** چارک/کمی از آرایه مرتب‌شده */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sorted.length) {
    return Math.round(sorted[base] + rest * (sorted[base + 1] - sorted[base]));
  }
  return Math.round(sorted[base]);
}

/**
 * گروه‌بندی نمونه‌ها بر پایه منطقه و محاسبه آمار هر منطقه.
 * حداقل نمونه پیش‌فرض: ۱ — گروه‌های تک‌نمونه با پرچم «غیرقابل‌اتکا»
 * برمی‌گردند تا در UI با نشان «نمونه واحد» نمایش داده شوند.
 */
export function computeAreaStats(
  samples: PriceSample[],
  options: { minSamples?: number } = {}
): AreaStatWithReliability[] {
  const minSamples = options.minSamples ?? 1;
  const groups = new Map<string, PriceSample[]>();
  for (const s of samples) {
    if (!s.areaName || !Number.isFinite(s.pricePerMeter) || s.pricePerMeter <= 0) continue;
    const key = `${s.areaName}::${s.category}`;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  const out: AreaStatWithReliability[] = [];
  for (const [key, arr] of groups) {
    if (arr.length < minSamples) continue;
    const [areaName, category] = key.split("::");
    const s = statsFor(arr.map((x) => x.pricePerMeter));
    out.push({
      areaName,
      category,
      sampleCount: arr.length,
      medianPerMeter: s.median,
      p25PerMeter: s.p25,
      p75PerMeter: s.p75,
      minPerMeter: s.min,
      maxPerMeter: s.max,
      changePercent: null,
      reliable: arr.length >= 2,
    });
  }
  return out.sort((a, b) => b.sampleCount - a.sampleCount || b.medianPerMeter - a.medianPerMeter);
}

/**
 * تشخیص جهش قیمتی: مقایسه آخرین ثبت تاریخچه با ثبت قبلی.
 * جهش = تغییر مطلق ≥ آستانه (پیش‌فرض ۱۵٪).
 */
export function detectJump(
  history: { areaName: string; medianPerMeter: number; recordedAt: string }[],
  thresholdPercent = 15
): { areaName: string; changePercent: number; from: number; to: number }[] {
  const byArea = new Map<string, { medianPerMeter: number; recordedAt: string }[]>();
  for (const h of history) {
    if (!h.areaName || !Number.isFinite(h.medianPerMeter) || h.medianPerMeter <= 0) continue;
    const arr = byArea.get(h.areaName) ?? [];
    arr.push(h);
    byArea.set(h.areaName, arr);
  }

  const jumps: { areaName: string; changePercent: number; from: number; to: number }[] = [];
  for (const [areaName, arr] of byArea) {
    if (arr.length < 2) continue;
    const sorted = [...arr].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
    const prev = sorted[sorted.length - 2];
    const last = sorted[sorted.length - 1];
    if (prev.medianPerMeter <= 0) continue;
    const change = ((last.medianPerMeter - prev.medianPerMeter) / prev.medianPerMeter) * 100;
    if (Math.abs(change) >= thresholdPercent) {
      jumps.push({
        areaName,
        changePercent: Math.round(change * 10) / 10,
        from: prev.medianPerMeter,
        to: last.medianPerMeter,
      });
    }
  }
  return jumps.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

/**
 * پایش سلامت قیمت‌گذاری: آگهی‌هایی که از شاخص منطقه (میانه)
 * انحراف معنادار دارند — عین کارکرد «پایش قیمت‌گذاری کارشناسان».
 * انحراف = فاصله نسبی از میانه ≥ آستانه (پیش‌فرض ۳۰٪) و بیرون از
 * بازه چارکی (p25..p75).
 */
export function findDeviatingAds(
  samples: PriceSample[],
  areaStats: AreaStatWithReliability[],
  thresholdPercent = 30
): DeviatingAd[] {
  // فقط مناطق قابل‌اتکا (≥ ۲ نمونه) مبنای پایش انحراف هستند
  const statsByKey = new Map(areaStats.filter((s) => s.reliable).map((s) => [`${s.areaName}::${s.category}`, s]));
  const out: DeviatingAd[] = [];
  for (const s of samples) {
    if (!s.areaName || !Number.isFinite(s.pricePerMeter) || s.pricePerMeter <= 0) continue;
    const stat = statsByKey.get(`${s.areaName}::${s.category}`);
    if (!stat || stat.medianPerMeter <= 0) continue;
    // انحراف از میانه
    const deviation = ((s.pricePerMeter - stat.medianPerMeter) / stat.medianPerMeter) * 100;
    const outsideIqr = s.pricePerMeter < stat.p25PerMeter || s.pricePerMeter > stat.p75PerMeter;
    if (outsideIqr && Math.abs(deviation) >= thresholdPercent) {
      out.push({
        token: s.token,
        title: s.title,
        areaName: s.areaName,
        pricePerMeter: s.pricePerMeter,
        medianPerMeter: stat.medianPerMeter,
        deviationPercent: Math.round(deviation * 10) / 10,
        totalScore: s.totalScore,
        publisherType: s.publisherType,
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.deviationPercent) - Math.abs(a.deviationPercent));
}

/** شاخص کل بازار: میانه‌ی میانه‌های مناطق (وزن‌دهی با تعداد نمونه) */
export function overallIndex(areaStats: AreaStatWithReliability[]): { medianPerMeter: number; coveredAreas: number; totalSamples: number } | null {
  const valid = areaStats.filter((s) => s.medianPerMeter > 0 && s.reliable);
  if (valid.length === 0) return null;
  let weighted = 0;
  let weights = 0;
  for (const s of valid) {
    weighted += s.medianPerMeter * s.sampleCount;
    weights += s.sampleCount;
  }
  return {
    medianPerMeter: weights > 0 ? Math.round(weighted / weights) : 0,
    coveredAreas: valid.length,
    totalSamples: weights,
  };
}

/** تغییر شاخص هر منطقه نسبت به ثبت قبلی (٪) — مبنای مقایسه: آخرین ثبتِ روزِ گذشته */
export function attachChangePercent(
  areaStats: AreaStatWithReliability[],
  history: { areaName: string; category?: string; medianPerMeter: number; recordedAt: string }[]
): AreaStatWithReliability[] {
  // آخرین ثبتِ هر کلید (شهر/دسته) پیش از امروز — «ثبت قبلی»
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const prevByArea = new Map<string, { medianPerMeter: number; recordedAt: number }>();
  for (const h of history) {
    if (!h.areaName || !Number.isFinite(h.medianPerMeter) || h.medianPerMeter <= 0) continue;
    const t = new Date(h.recordedAt).getTime();
    if (!Number.isFinite(t) || t >= todayMs) continue; // ثبت‌های امروز مبنای مقایسه نیستند
    const key = h.category ? `${h.areaName}::${h.category}` : h.areaName;
    const existing = prevByArea.get(key);
    if (!existing || t > existing.recordedAt) {
      prevByArea.set(key, { medianPerMeter: h.medianPerMeter, recordedAt: t });
    }
  }

  return areaStats.map((s) => {
    const prev = prevByArea.get(`${s.areaName}::${s.category}`) ?? prevByArea.get(s.areaName);
    if (prev && prev.medianPerMeter > 0) {
      const change = ((s.medianPerMeter - prev.medianPerMeter) / prev.medianPerMeter) * 100;
      return { ...s, changePercent: Math.round(change * 10) / 10 };
    }
    return s;
  });
}
