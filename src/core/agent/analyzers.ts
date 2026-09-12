/**
 * تحلیل‌گرهای آماری خالص (Pure Functions)
 * ------------------------------------------------------
 * منطق هسته تحلیل — بدون وابستگی به I/O؛ به همین دلیل کامل تست‌پذیر است.
 * ورودی: رکوردهای Prisma؛ خروجی: آماده برای تولید بینش توسط ایجنت.
 */

import type { Prisma } from "@prisma/client";

type TxRow = Prisma.TransactionRecordGetPayload<Record<string, never>>;
type ExRow = Prisma.ExpertRecordGetPayload<Record<string, never>>;

// ===================== سری زمانی ماهانه =====================

export interface MonthlyPoint {
  /** کلید ماه میلادی ISO (yyyy-mm) */
  key: string;
  count: number;
  totalValue: number;
  avgPrice: number;
}

export function monthlySeries(txs: TxRow[]): MonthlyPoint[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const t of txs) {
    const d = new Date(t.dealDate);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const cur = map.get(key) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += t.price;
    map.set(key, cur);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, v]) => ({
      key,
      count: v.count,
      totalValue: v.total,
      avgPrice: v.count > 0 ? Math.round(v.total / v.count) : 0,
    }));
}

/** نرخ رشد آخرین ماه نسبت به ماه قبل (درصد؛ null اگر داده کافی نیست) */
export function growthRate(series: MonthlyPoint[]): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  if (prev.totalValue === 0) return null;
  return Math.round(((last.totalValue - prev.totalValue) / prev.totalValue) * 1000) / 10;
}

// ===================== تشخیص ناهنجاری (z-score) =====================

export interface AnomalyPoint {
  key: string;
  totalValue: number;
  z: number;
  direction: "spike" | "drop";
}

export function detectAnomalies(series: MonthlyPoint[], threshold = 1.8): AnomalyPoint[] {
  if (series.length < 4) return [];
  const values = series.map((p) => p.totalValue);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  if (std === 0) return [];
  return series
    .map((p) => ({
      key: p.key,
      totalValue: p.totalValue,
      z: Math.round(((p.totalValue - mean) / std) * 100) / 100,
      direction: (p.totalValue > mean ? "spike" : "drop") as "spike" | "drop",
    }))
    .filter((p) => Math.abs(p.z) >= threshold);
}

// ===================== کارشناسان برتر =====================

export interface ExpertStat {
  expertCode: string;
  expertName: string;
  dealCount: number;
  totalValue: number;
  avgPrice: number;
  lastDealAt: Date | null;
}

export function expertStats(txs: TxRow[]): ExpertStat[] {
  const map = new Map<string, ExpertStat>();
  for (const t of txs) {
    const cur =
      map.get(t.expertCode) ??
      { expertCode: t.expertCode, expertName: t.expertName, dealCount: 0, totalValue: 0, avgPrice: 0, lastDealAt: null };
    cur.dealCount += 1;
    cur.totalValue += t.price;
    if (!cur.lastDealAt || new Date(t.dealDate) > cur.lastDealAt) cur.lastDealAt = new Date(t.dealDate);
    map.set(t.expertCode, cur);
  }
  const stats = [...map.values()];
  for (const s of stats) s.avgPrice = s.dealCount > 0 ? Math.round(s.totalValue / s.dealCount) : 0;
  return stats;
}

export function topByCount(stats: ExpertStat[], n: number): ExpertStat[] {
  return [...stats].sort((a, b) => b.dealCount - a.dealCount).slice(0, n);
}

export function topByValue(stats: ExpertStat[], n: number): ExpertStat[] {
  return [...stats].sort((a, b) => b.totalValue - a.totalValue).slice(0, n);
}

// ===================== توزیع محله / نوع ملک =====================

export interface GroupStat {
  name: string;
  count: number;
  totalValue: number;
  avgPrice: number;
}

export function groupBy(txs: TxRow[], keyFn: (t: TxRow) => string): GroupStat[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const t of txs) {
    const k = keyFn(t);
    const cur = map.get(k) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += t.price;
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, count: v.count, totalValue: v.total, avgPrice: v.count ? Math.round(v.total / v.count) : 0 }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

// ===================== نرخ تبدیل درخواست → معامله =====================

export function conversionRate(txs: TxRow[]): number {
  if (txs.length === 0) return 0;
  const withRequest = txs.filter((t) => t.requestCode).length;
  return Math.round((withRequest / txs.length) * 1000) / 10;
}

// ===================== تحلیل عملکرد کارشناسان =====================

export interface ExpertPerformance extends ExpertStat {
  fullName: string;
  branch: string;
  active: boolean;
  /** معاملات ۹۰ روز اخیر */
  recentDeals: number;
  /** نسبت فعالیت اخیر به میانگین بلندمدت ماهانه */
  recentActivityRatio: number;
  segment: "top" | "mid" | "low" | "inactive";
}

export function expertPerformance(txs: TxRow[], experts: ExRow[]): ExpertPerformance[] {
  const stats = expertStats(txs);
  const statMap = new Map(stats.map((s) => [s.expertCode, s]));
  const now = Date.now();
  const ninetyDaysAgo = now - 90 * 24 * 3600 * 1000;

  const perfs: ExpertPerformance[] = experts.map((e) => {
    const s = statMap.get(e.personnelCode) ?? {
      expertCode: e.personnelCode,
      expertName: e.fullName,
      dealCount: 0,
      totalValue: 0,
      avgPrice: 0,
      lastDealAt: null,
    };
    const joined = new Date(e.joinedAt).getTime();
    const monthsActive = Math.max(1, (now - joined) / (30.5 * 24 * 3600 * 1000));
    const recentDeals = txs.filter(
      (t) => t.expertCode === e.personnelCode && new Date(t.dealDate).getTime() >= ninetyDaysAgo
    ).length;
    const longRunMonthly = s.dealCount / monthsActive;
    const expected90 = longRunMonthly * 3;
    const recentActivityRatio = expected90 > 0 ? Math.round((recentDeals / expected90) * 100) / 100 : recentDeals > 0 ? 1.2 : 0;

    let segment: ExpertPerformance["segment"];
    if (s.dealCount === 0) segment = "inactive";
    else if (recentDeals === 0) segment = "inactive";
    else if (recentActivityRatio >= 1.5 && s.dealCount >= 8) segment = "top";
    else if (recentActivityRatio >= 0.6) segment = "mid";
    else segment = "low";

    return {
      ...s,
      expertName: e.fullName,
      fullName: e.fullName,
      branch: e.branch,
      active: e.active,
      recentDeals,
      recentActivityRatio,
      segment,
    };
  });

  return perfs.sort((a, b) => b.totalValue - a.totalValue);
}

/** شاخص تمرکز: سهم ۵ نفر برتر از کل ارزش معاملات (درصد) */
export function concentrationIndex(stats: ExpertStat[], topN = 5): number {
  const total = stats.reduce((a, s) => a + s.totalValue, 0);
  if (total === 0) return 0;
  const top = topByValue(stats, topN).reduce((a, s) => a + s.totalValue, 0);
  return Math.round((top / total) * 1000) / 10;
}

/** کارشناسان با افت شدید فعالیت نسبت به روند شخصی خودشان */
export function droppedExperts(perfs: ExpertPerformance[]): ExpertPerformance[] {
  return perfs.filter((p) => p.dealCount >= 5 && p.recentActivityRatio < 0.35);
}
