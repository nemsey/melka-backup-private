/**
 * تحلیل‌گرهای آماری خالص (Pure Functions)
 * ------------------------------------------------------
 * منطق هسته تحلیل — بدون وابستگی به I/O؛ به همین دلیل کامل تست‌پذیر است.
 * ورودی: DTOهای لایه Repository (آینه ساختاری رکوردهای سامانه واقعی ملک تبریز)؛
 * خروجی: آماده برای تولید بینش توسط ایجنت.
 *
 * ✅ تحلیل‌ها بر پایه «گزارش تطابق معاملات»، «فهرست کاربران» و
 * «تعاملات مشاوران» سامانه ARM طراحی شده‌اند.
 * ✅ سری‌های ماهانه بر پایه ماه‌های هجری شمسی (جلالی) ساخته می‌شوند.
 * ✅ PHASE 2 (P2-02): وابستگی تایپی Prisma حذف شد — ورودی‌ها DTO خالص‌اند.
 */

// ⚠️ مرز لایه‌ای: این فایل از UI (صفحات کاشی) به‌صورت ارزشی import می‌شود؛
// DTOها فقط از زیرماژول خالص interfaces برداشته می‌شوند — هرگز از barrel
// اصلی (@/core/repositories) که پیاده‌سازی‌های Prisma را هم value-export می‌کند.
import type {
  ExpertDTO,
  InteractionDTO,
  LookupLogDTO,
  SupplyDemandDTO,
  TransactionDTO,
  VisitDTO,
} from "@/core/repositories/interfaces";
import { dateToJalali } from "@/lib/jalali";
import { classifyContract, type ContractFamily } from "@/lib/contract-classify";

type TxRow = TransactionDTO;
type ExRow = ExpertDTO;
type InRow = InteractionDTO;

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

// ===================== تحلیل بازدیدها (visits/list خود سامانه) =====================

type ViRow = VisitDTO;

export interface VisitStats {
  total: number;
  /** بازدیدهای بررسی‌شده (بررسی‌کننده مشخص) */
  checked: number;
  /** نرخ بررسی (درصد) */
  checkedRate: number;
  /** تعداد آگهی متمایز بازدیدشده */
  distinctProperties: number;
  /** تعداد درخواست‌دهنده متمایز */
  distinctRequesters: number;
  /** بازدیدهای بدون بررسی */
  pending: number;
}

/** آمار پایه بازدیدها — عین ستون‌های «بررسی کننده» و «زمان بررسی» */
export function visitStats(visits: ViRow[]): VisitStats {
  const total = visits.length;
  const checked = visits.filter((v) => v.checkTime !== null).length;
  const properties = new Set(visits.map((v) => v.propertyCode));
  const requesters = new Set(visits.map((v) => v.requesterName));
  return {
    total,
    checked,
    checkedRate: total > 0 ? Math.round((checked / total) * 1000) / 10 : 0,
    distinctProperties: properties.size,
    distinctRequesters: requesters.size,
    pending: total - checked,
  };
}

/** سری ماهانه ثبت بازدید (ماه‌های هجری شمسی) */
export function visitMonthlySeries(visits: ViRow[]): MonthlyPoint[] {
  const map = new Map<string, number>();
  for (const v of visits) {
    const key = jalaliMonthKey(new Date(v.createdAt));
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }));
}

/** توزیع وضعیت بازدیدها — عین ستون «وضعیت» */
export function visitStatusDistribution(visits: ViRow[]): GroupStat[] {
  const map = new Map<string, number>();
  for (const v of visits) map.set(v.status || "نامشخص", (map.get(v.status || "نامشخص") ?? 0) + 1);
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** رتبه‌بندی بررسی‌کنندگان (بر اساس تعداد بررسی انجام‌شده) */
export function checkerLeaderboard(visits: ViRow[], n = 5): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const v of visits) {
    if (v.checkTime === null) continue;
    map.set(v.checkerName, (map.get(v.checkerName) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/** آگهی‌های با بیشترین بازدید مشتری */
export function mostVisitedProperties(visits: ViRow[], n = 5): { code: string; count: number }[] {
  const map = new Map<string, number>();
  for (const v of visits) map.set(v.propertyCode, (map.get(v.propertyCode) ?? 0) + 1);
  return [...map.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

// ===================== تحلیل عرضه و تقاضا (realtor-reports/supply-demand خود سامانه) =====================

type SdRow = SupplyDemandDTO;

export interface SupplyDemandStats {
  rangeCount: number;
  totalAds: number;
  /** میانگین درصد درخواست */
  avgRequestPercent: number;
  /** بازه‌های با فشار تقاضای بالا (درصد >= ۶۰) */
  highDemand: SdRow[];
  /** بازه‌های با فشار تقاضای پایین (۰ < درصد <= ۲۵) */
  lowDemand: SdRow[];
  /** بازه با بیشترین فشار تقاضا */
  topDemand: SdRow | null;
  /** بازه با بیشترین عرضه (تعداد آگهی) */
  topSupply: SdRow | null;
  /** شاخص تعادل کلی بازار: ۵۰ = تعادل کامل */
  balanceIndex: number;
}

/** شاخص‌های تعادل بازار — از گزارش عرضه و تقاضای خود سامانه */
export function supplyDemandStats(rows: SdRow[]): SupplyDemandStats {
  const rangeCount = rows.length;
  const totalAds = rows.reduce((a, r) => a + r.propertyCount, 0);
  const avgRequestPercent = rangeCount > 0 ? Math.round((rows.reduce((a, r) => a + r.requestPercent, 0) / rangeCount) * 10) / 10 : 0;
  const highDemand = rows.filter((r) => r.requestPercent >= 60).sort((a, b) => b.requestPercent - a.requestPercent);
  const lowDemand = rows.filter((r) => r.requestPercent > 0 && r.requestPercent <= 25);
  const topDemand = [...rows].sort((a, b) => b.requestPercent - a.requestPercent)[0] ?? null;
  const topSupply = [...rows].sort((a, b) => b.propertyCount - a.propertyCount)[0] ?? null;
  // شاخص تعادل: میانگین درصد درخواست — هرچه به ۵۰ نزدیک‌تر، بازار متعادل‌تر
  const balanceIndex = Math.round(avgRequestPercent * 10) / 10;
  return { rangeCount, totalAds, avgRequestPercent, highDemand, lowDemand, topDemand, topSupply, balanceIndex };
}

// ===================== تحلیل استعلام‌های استخراج اطلاعات (LookupLog) =====================

type LkRow = LookupLogDTO;

export interface LookupStats {
  total: number;
  found: number;
  notFound: number;
  /** نرخ موفقیت (درصد) */
  successRate: number;
  propertyLookups: number;
  requestLookups: number;
  /** پرتکرارترین کدهای استعلام‌شده */
  topCodes: { code: string; kind: string; count: number }[];
  /** استعلام‌های نزدیک به هم (امروز) */
  recentToday: number;
  /** استعلام‌های موفق بدون شماره تماس (کیفیت داده) */
  missingMobile: number;
}

/** آمار استعلام‌های کاشی استخراج اطلاعات — از LookupLog (فقط داده واقعی) */
export function lookupStats(logs: LkRow[]): LookupStats {
  const total = logs.length;
  const found = logs.filter((l) => l.found).length;
  const propertyLookups = logs.filter((l) => l.kind === "PROPERTY").length;
  const requestLookups = logs.filter((l) => l.kind === "REQUEST").length;
  const codeMap = new Map<string, { code: string; kind: string; count: number }>();
  for (const l of logs) {
    const key = `${l.kind}:${l.code}`;
    const cur = codeMap.get(key) ?? { code: l.code, kind: l.kind, count: 0 };
    cur.count += 1;
    codeMap.set(key, cur);
  }
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return {
    total,
    found,
    notFound: total - found,
    successRate: total > 0 ? Math.round((found / total) * 1000) / 10 : 0,
    propertyLookups,
    requestLookups,
    topCodes: [...codeMap.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    recentToday: logs.filter((l) => l.createdAt >= startOfDay).length,
    missingMobile: logs.filter((l) => l.found && !l.personMobile).length,
  };
}

// ===================== تحلیل‌های DTO — اشتراک UI ↔ سرور (PHASE 1 / P1-02) =====================
// توابع خالص روی DTOهای API (نه رکورد Prisma) — منطق دامنه‌ای که قبلاً در
// کامپوننت‌های UI تکرار می‌شد؛ اکنون یگانه و تست‌پذیر.
// ورودی/خروجی این توابع باید با پیاده‌سازی قبلی داخل صفحات بایت‌به‌بایت یکسان بماند.

export interface MonthCountPointDto {
  /** کلید ماه جلالی (yyyy-mm) */
  key: string;
  count: number;
}

export interface MonthlyCountsOptions {
  /** نادیده‌گرفتن تاریخ‌های نامعتبر (سبک صفحه بازدیدها) */
  skipInvalid?: boolean;
  /** فقط N ماه آخر (سبک نمودار بازدیدها: ۹ ماه) */
  takeLast?: number;
}

/**
 * شمارش رخدادها به تفکیک ماه هجری شمسی از فهرست تاریخ‌های ISO —
 * هسته مشترک نمودارهای روند (معاملات/بازدیدها).
 */
export function monthlyCounts(dates: (string | null | undefined)[], opts: MonthlyCountsOptions = {}): MonthCountPointDto[] {
  const map = new Map<string, number>();
  for (const raw of dates) {
    if (raw == null) continue;
    const iso = new Date(raw);
    if (opts.skipInvalid && Number.isNaN(iso.getTime())) continue;
    const j = dateToJalali(iso);
    const key = `${j.jy}-${String(j.jm).padStart(2, "0")}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (opts.takeLast !== undefined) {
    return entries.slice(-opts.takeLast).map(([key, count]) => ({ key, count }));
  }
  return entries.map(([key, count]) => ({ key, count }));
}

// ===================== آستانه‌های دامنه — عرضه و تقاضا =====================

/** سطح تقاضای یک بازه قیمتی — آستانه‌های رسمی گزارش خود سامانه (۶۰/۴۰) */
export type DemandLevel = "HIGH" | "BALANCED" | "LOW" | "NONE";

export function demandLevel(requestPercent: number): DemandLevel {
  if (requestPercent >= 60) return "HIGH";
  if (requestPercent >= 40) return "BALANCED";
  if (requestPercent > 0) return "LOW";
  return "NONE";
}

/** جهت‌گیری بازار بر پایه شاخص تعادل — همان آستانه‌های ۶۰/۴۰ */
export type MarketTilt = "DEMAND_LED" | "BALANCED" | "SUPPLY_LED";

export function marketTilt(avgRequestPercent: number): MarketTilt {
  if (avgRequestPercent >= 60) return "DEMAND_LED";
  if (avgRequestPercent >= 40) return "BALANCED";
  return "SUPPLY_LED";
}

// ===================== درجه همکاری مشاوران =====================

/** درجه همکاری مشاور از مجموع تعامل‌ها — آستانه‌های گزارش تعاملات (۲۰/۵) */
export type CooperationDegree = "CORE" | "FREQUENT" | "RARE" | "NONE";

export function cooperationDegree(totalInteractions: number): CooperationDegree {
  if (totalInteractions >= 20) return "CORE";
  if (totalInteractions >= 5) return "FREQUENT";
  if (totalInteractions > 0) return "RARE";
  return "NONE";
}

// ===================== ماتریس روند چند-منطقه‌ای (شاخص قیمت) =====================

export interface TrendPointDto {
  areaName: string;
  recordedAt: string;
  medianPerMeter: number;
}

/**
 * ردیف‌های نمودار خطی روند شاخص: N منطقه برتر (پرنمونه‌ترین)،
 * محور تاریخ = تاریخ‌های ثبت‌شده، مقدار گمشده = ۰ — عین منطق قبلی PriceIndexPage.
 */
export function areaTrendMatrix(trend: TrendPointDto[], topN = 5): Record<string, string | number>[] {
  const byArea = new Map<string, TrendPointDto[]>();
  for (const p of trend) {
    const arr = byArea.get(p.areaName) ?? [];
    arr.push(p);
    byArea.set(p.areaName, arr);
  }
  const topAreas = [...byArea.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, topN);
  if (topAreas.length === 0) return [];
  const allDates = [...new Set(trend.map((p) => p.recordedAt.slice(0, 10)))].sort();
  return allDates.map((date) => {
    const row: Record<string, string | number> = { date };
    for (const [area] of topAreas) {
      const point = byArea.get(area)?.find((p) => p.recordedAt.slice(0, 10) === date);
      row[area] = point ? point.medianPerMeter : 0;
    }
    return row;
  });
}

// ===================== تجزیه مبلغ فارسی (مالی و کمیسیون) =====================

/**
 * تجزیه ورودی مبلغ کاربر (ارقام فارسی/عربی + جداکننده‌های ٬ ، ، و فاصله) به عدد —
 * عین parseAmount قبلی FinancePage؛ خالی/نامعتبر → undefined.
 */
export function parseFaAmount(v: string): number | undefined {
  const normalized = v.replace(/[٬,،\s]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  if (normalized === "") return undefined;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

// ===================== P6.5-15 (ملکا-شورا-۱۴۰۵-۰۱۸ — BLOCK A/C) =====================
// روند ماهانهٔ سه‌سری + کارشناسان برتر سه‌ستونی — بر پایهٔ «قانون انواع معاملات ملکا»:
// سری ۱ (فروش) = مبایعه‌نامه + پیش‌فروش · سری ۲ (اجاره) = اجاره + تمدید اجاره
// سری ۳ (مجموع) = فروش + اجاره + ثبت‌نشده (رکوردهای بدون قرارداد هم معامله‌اند).
// دسته‌بندی فقط از طریق تابع مرکزی classifyContract (BLOCK 0.3) — مستقل از فاصله/نیم‌فاصله.

/** دستهٔ نوع معامله — مجموع = فروش + اجاره + ثبت‌نشده (قید ریاضی A.۱ جلسه ۰۱۸) */
export type TxTypeCategory = "sale" | "rent" | "other";

/** ورودی ردیف نوع‌دار — خروجی غنی‌سازی معاملات (contractType از لایه ۲) */
export interface TypedTxRow {
  contractDate: Date | string;
  /** نوع قرارداد از منبع (غنی‌سازی معامله‌محور / قرارداد تطبیقی) — nullable */
  contractType: string | null;
  /** عنوان ملک — فقط برای نمایش؛ در دسته‌بندی جلسه ۰۱۸ استفاده نمی‌شود */
  propertyTitle?: string | null;
}

/**
 * دسته‌بندی نوع یک معامله — پوشش نازک روی classifyContract (قانون جلسه ۰۱۸):
 *   family=sale → "sale" (مبایعه‌نامه + پیش‌فروش)
 *   family=rent → "rent" (اجاره + تمدید اجاره)
 *   family=none → "other" (ثبت‌نشده — در مجموع محاسبه می‌شود)
 * دسته‌بندی تنها از contractType است — طبق spec جلسه ۰۱۸ تابع مرکزی فقط rawType می‌گیرد.
 */
export function categorizeTxType(row: TypedTxRow): TxTypeCategory {
  const { family } = classifyContract(row.contractType);
  if (family === "sale") return "sale";
  if (family === "rent") return "rent";
  return "other";
}

/** خانوادهٔ قرارداد ردیف — میان‌بر برای منطق خانواده‌ای BLOCK A/C */
export function txContractFamily(row: Pick<TypedTxRow, "contractType">): ContractFamily {
  return classifyContract(row.contractType).family;
}

export interface TxTypeMonthlyPoint {
  /** کلید ماه جلالی (yyyy-mm) */
  key: string;
  /** سری ۱ — مبایعه‌نامه (شامل پیش‌فروش) */
  sale: number;
  /** سری ۲ — اجاره (شامل تمدید اجاره) */
  rent: number;
  /** بدون قرارداد ثبت‌شده (family=none) — در مجموع محاسبه می‌شود */
  none: number;
  /** سری ۳ — مجموع = فروش + اجاره + ثبت‌نشده (قید ریاضی جلسه ۰۱۸) */
  total: number;
}

/**
 * سری ماهانهٔ سه‌سری — منطق خانواده‌ای جلسه ۰۱۸ (BLOCK A.۱):
 *   سری ۱ (مبایعه‌نامه) = count(مبایعه‌نامه) + count(پیش‌فروش)
 *   سری ۲ (اجاره)       = count(اجاره) + count(تمدید اجاره)
 *   سری ۳ (مجموع)       = سری۱ + سری۲ + count(ثبت‌نشده)
 * بازه: فروردین ۱۴۰۴ تا ماه جاری؛ ماه‌های بی‌داده با صفر پر می‌شوند.
 * تضمین ریاضی: total = sale + rent + none در هر ماه.
 */
export function txTypeMonthlySeries(rows: TypedTxRow[], range?: { fromKey: string; toKey: string }): TxTypeMonthlyPoint[] {
  const from = range?.fromKey ?? "1404-01";
  const to = range?.toKey ?? jalaliMonthKey(new Date());
  const map = new Map<string, TxTypeMonthlyPoint>();
  // کلیدهای بازه — پیمایش ماه‌به‌ماه جلالی
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    map.set(key, { key, sale: 0, rent: 0, none: 0, total: 0 });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  for (const row of rows) {
    const key = jalaliMonthKey(new Date(row.contractDate));
    const point = map.get(key);
    if (!point) continue; // خارج از بازه
    const { family } = classifyContract(row.contractType);
    if (family === "sale") point.sale += 1;
    else if (family === "rent") point.rent += 1;
    else point.none += 1;
    point.total += 1;
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export interface TopExpertRow {
  name: string;
  count: number;
}

/** ورودی ردیف حامل سهم مشاوران + نوع معامله — برای کارشناسان برتر سه‌ستونی */
export interface SharedTxRow extends TypedTxRow {
  /** سهم مشاوران — JSON [{name, unitPercent, confirmation}] یا خلاصهٔ ازپیش‌محاسبه */
  realtorSharesJson?: string | null;
  shareNames?: string[];
}

/**
 * کارشناسان برتر بر اساس تعداد معاملات — سه ستون با منطق خانواده‌ای (BLOCK C جلسه ۰۱۸):
 *   ستون ۱ (مبایعه‌نامه) = مبایعه‌نامه + پیش‌فروش هر کارشناس
 *   ستون ۲ (اجاره)       = اجاره + تمدید اجاره هر کارشناس
 *   ستون ۳ (مجموع)       = ستون ۱ + ستون ۲ + ثبت‌نشده‌های همان کارشناس
 * هر معامله برای هر مشاورِ دارای سهم یک‌بار شمرده می‌شود (max-نه-جمع عین P6.5-12).
 */
export function topExpertsByTxType(rows: SharedTxRow[], n = 10): {
  sale: TopExpertRow[];
  rent: TopExpertRow[];
  total: TopExpertRow[];
} {
  const sale = new Map<string, number>();
  const rent = new Map<string, number>();
  const total = new Map<string, number>();
  for (const row of rows) {
    const names = row.shareNames ?? parseShareNames(row.realtorSharesJson);
    if (names.length === 0) continue;
    const { family } = classifyContract(row.contractType);
    for (const name of names) {
      if (family === "sale") sale.set(name, (sale.get(name) ?? 0) + 1);
      else if (family === "rent") rent.set(name, (rent.get(name) ?? 0) + 1);
      // ستون مجموع هر کارشناس = فروش + اجاره + ثبت‌نشده او (عین ستون ۳ جدول C.۱)
      total.set(name, (total.get(name) ?? 0) + 1);
    }
  }
  const rank = (m: Map<string, number>): TopExpertRow[] =>
    [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fa"))
      .slice(0, n);
  return { sale: rank(sale), rent: rank(rent), total: rank(total) };
}

function parseShareNames(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as { name?: string }[];
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((s) => s?.name?.trim()).filter((x): x is string => Boolean(x)))];
  } catch {
    return [];
  }
}


/** P6530/گام ۴ — آمار خانواده‌ای فهرست کارشناسان (مبایعه نامه با پیش‌فروش · اجاره نامه با تمدید)
 *  محاسبهٔ خالص برای صفحهٔ M4 — صفحات فقط فرمت می‌کنند (قانون معماری P1-02) */
export function expertFamilyStats(
  rows: Array<{ active: boolean; saleCount: number; rentCount: number }>
): { count: number; active: number; saleTotal: number; rentTotal: number } {
  let active = 0;
  let saleTotal = 0;
  let rentTotal = 0;
  for (const r of rows) {
    if (r.active) active += 1;
    saleTotal += r.saleCount;
    rentTotal += r.rentCount;
  }
  return { count: rows.length, active, saleTotal, rentTotal };
}
