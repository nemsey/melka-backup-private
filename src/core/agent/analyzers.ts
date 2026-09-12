/**
 * تحلیل‌گرهای آماری خالص (Pure Functions)
 * ------------------------------------------------------
 * منطق هسته تحلیل — بدون وابستگی به I/O؛ به همین دلیل کامل تست‌پذیر است.
 * ورودی: رکوردهای Prisma (عین ساختار سامانه واقعی ملک تبریز)؛
 * خروجی: آماده برای تولید بینش توسط ایجنت.
 *
 * ✅ تحلیل‌ها بر پایه «گزارش تطابق معاملات»، «فهرست کاربران» و
 * «تعاملات مشاوران» سامانه ARM طراحی شده‌اند.
 * ✅ سری‌های ماهانه بر پایه ماه‌های هجری شمسی (جلالی) ساخته می‌شوند.
 */

import type { Prisma } from "@prisma/client";
import { dateToJalali } from "@/lib/jalali";

type TxRow = Prisma.TransactionRecordGetPayload<Record<string, never>>;
type ExRow = Prisma.ExpertRecordGetPayload<Record<string, never>>;
type InRow = Prisma.InteractionRecordGetPayload<Record<string, never>>;

// ===================== سری زمانی ماهانه (ماه هجری شمسی) =====================

export interface MonthlyPoint {
  /** کلید ماه جلالی (yyyy-mm) */
  key: string;
  /** تعداد معامله/تطبیق در ماه */
  count: number;
}

/** کلید ماه جلالی «yyyy-mm» از تاریخ */
function jalaliMonthKey(d: Date): string {
  const j = dateToJalali(d);
  return `${j.jy}-${String(j.jm).padStart(2, "0")}`;
}

/** سری ماهانه تعداد معاملات (ماه‌های هجری شمسی، مرتب) */
export function monthlySeries(txs: TxRow[]): MonthlyPoint[] {
  const map = new Map<string, number>();
  for (const t of txs) {
    const key = jalaliMonthKey(new Date(t.contractDate));
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }));
}

/** نرخ رشد تعداد آخرین ماه نسبت به ماه قبل (درصد؛ null اگر داده کافی نیست) */
export function growthRate(series: MonthlyPoint[]): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  if (prev.count === 0) return null;
  return Math.round(((last.count - prev.count) / prev.count) * 1000) / 10;
}

// ===================== تشخیص ناهنجاری (z-score) =====================

export interface AnomalyPoint {
  key: string;
  count: number;
  z: number;
  direction: "spike" | "drop";
}

export function detectAnomalies(series: MonthlyPoint[], threshold = 1.8): AnomalyPoint[] {
  if (series.length < 4) return [];
  const values = series.map((p) => p.count);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  if (std === 0) return [];
  return series
    .map((p) => ({
      key: p.key,
      count: p.count,
      z: Math.round(((p.count - mean) / std) * 100) / 100,
      direction: (p.count > mean ? "spike" : "drop") as "spike" | "drop",
    }))
    .filter((p) => Math.abs(p.z) >= threshold);
}

// ===================== ترکیب گزارش تطابق (چهارگانه خود سامانه) =====================

export interface MatchComposition {
  totalCount: number;
  /** دارای رویداد (تعامل کارشناس با درخواست) */
  hasRequestEvent: number;
  /** دارای آگهی پیشنهادی سیستم */
  hasSuggestedProperty: number;
  /** دارای هر دو */
  hasBoth: number;
  /** بدون رویداد و بدون آگهی پیشنهادی */
  neither: number;
  /** سهم معاملاتی که از مسیر درخواست ثبت‌شده رسیده‌اند (درصد) */
  requestShare: number;
  /** سهم قراردادهای دارای هولوگرام (سند ثبت‌شده — درصد) */
  holoShare: number;
}

/** ترکیب گزارش تطابق — عین خلاصه چهارگانه خود سامانه + دو سهم کلیدی */
export function matchComposition(txs: TxRow[]): MatchComposition {
  const n = txs.length;
  const hasRequestEvent = txs.filter((t) => t.eventsCount > 0).length;
  const hasSuggestedProperty = txs.filter((t) => t.suggestedPropertyCount > 0).length;
  const hasBoth = txs.filter((t) => t.eventsCount > 0 && t.suggestedPropertyCount > 0).length;
  const withRequest = txs.filter((t) => t.requestCode).length;
  const withHolo = txs.filter((t) => t.contractHolo).length;
  return {
    totalCount: n,
    hasRequestEvent,
    hasSuggestedProperty,
    hasBoth,
    neither: n - hasRequestEvent - hasSuggestedProperty + hasBoth,
    requestShare: n > 0 ? Math.round((withRequest / n) * 1000) / 10 : 0,
    holoShare: n > 0 ? Math.round((withHolo / n) * 1000) / 10 : 0,
  };
}

// ===================== ماه‌های اوج =====================

/** پرشمارترین ماه‌های معاملات */
export function topMonths(series: MonthlyPoint[], n: number): MonthlyPoint[] {
  return [...series].sort((a, b) => b.count - a.count).slice(0, n);
}

// ===================== توزیع نقش کاربران (users-list خود سامانه) =====================

export interface GroupStat {
  name: string;
  count: number;
}

/** توزیع نقش‌های کاربران — مثل «کارشناس و مشاور فروش» */
export function roleDistribution(experts: ExRow[]): GroupStat[] {
  const map = new Map<string, number>();
  for (const e of experts) map.set(e.role, (map.get(e.role) ?? 0) + 1);
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** توزیع کسب‌وکارها/شعبه‌ها */
export function businessDistribution(experts: ExRow[]): GroupStat[] {
  const map = new Map<string, number>();
  for (const e of experts) map.set(e.businessTitle, (map.get(e.businessTitle) ?? 0) + 1);
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

// ===================== رشد عضویت (ماه‌های هجری شمسی) =====================

/** سری ماهانه عضویت کاربران جدید (بر اساس createdAt — عین ستون «زمان ثبت») */
export function joinerSeries(experts: ExRow[]): MonthlyPoint[] {
  const map = new Map<string, number>();
  for (const e of experts) {
    const d = new Date(e.createdAt);
    if (d.getTime() <= 0) continue; // تاریخ نامعتبر/صفر
    const key = jalaliMonthKey(d);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }));
}

// ===================== تحلیل تعاملات مشاوران (realtor-interactions خود سامانه) =====================

export interface RealtorDegree {
  name: string;
  /** مجموع تعامل‌ها (نقش درخواست‌دهنده + نقش آگهی‌گذار) */
  total: number;
  /** تعامل در نقش مشاور درخواست */
  asRequester: number;
  /** تعامل در نقش مشاور آگهی */
  asPropertyRealtor: number;
  /** تعداد همکاران متمایز */
  partners: number;
}

/** درجه همکاری هر مشاور — «تعاملات مشاوران با یکدیگر» */
export function realtorDegrees(interactions: InRow[]): RealtorDegree[] {
  const map = new Map<string, { total: number; asRequester: number; asPropertyRealtor: number; partners: Set<string> }>();
  for (const r of interactions) {
    const req = map.get(r.requestRealtorName) ?? { total: 0, asRequester: 0, asPropertyRealtor: 0, partners: new Set<string>() };
    req.total += r.count;
    req.asRequester += r.count;
    req.partners.add(r.propertyRealtorName);
    map.set(r.requestRealtorName, req);

    const prop = map.get(r.propertyRealtorName) ?? { total: 0, asRequester: 0, asPropertyRealtor: 0, partners: new Set<string>() };
    prop.total += r.count;
    prop.asPropertyRealtor += r.count;
    prop.partners.add(r.requestRealtorName);
    map.set(r.propertyRealtorName, prop);
  }
  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      total: v.total,
      asRequester: v.asRequester,
      asPropertyRealtor: v.asPropertyRealtor,
      partners: v.partners.size,
    }))
    .sort((a, b) => b.total - a.total);
}

/** پرتعامل‌ترین جفت مشاوران */
export function topPairs(interactions: InRow[], n: number): InRow[] {
  return [...interactions].sort((a, b) => b.count - a.count).slice(0, n);
}

/** شاخص تمرکز شبکه: سهم ۵ جفت برتر از کل تعاملات (درصد) */
export function interactionConcentration(interactions: InRow[], topN = 5): number {
  const total = interactions.reduce((a, r) => a + r.count, 0);
  if (total === 0) return 0;
  const top = topPairs(interactions, topN).reduce((a, r) => a + r.count, 0);
  return Math.round((top / total) * 1000) / 10;
}

// ===================== وضعیت کلی کاربران =====================

export interface ExpertBaseStats {
  total: number;
  active: number;
  inactive: number;
  activeRate: number;
}

/** آمار پایه کاربران — عین ستون «فعال» users-list */
export function expertBaseStats(experts: ExRow[]): ExpertBaseStats {
  const total = experts.length;
  const active = experts.filter((e) => e.active).length;
  return {
    total,
    active,
    inactive: total - active,
    activeRate: total > 0 ? Math.round((active / total) * 1000) / 10 : 0,
  };
}

/** مشاوران بدون هیچ تعاملی (راکد در شبکه همکاری) */
export function isolatedRealtors(experts: ExRow[], interactions: InRow[]): ExRow[] {
  const involved = new Set<string>();
  for (const r of interactions) {
    involved.add(r.requestRealtorName);
    involved.add(r.propertyRealtorName);
  }
  return experts.filter((e) => !involved.has(e.fullName) && e.active);
}
