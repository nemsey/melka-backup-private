/**
 * بینش «پوشش اطلاعات فهرست» — سازندهٔ مشترک ایجنت‌های چهار کاشی (P6547)
 * ---------------------------------------------------------------------------
 * گام یک-۳ / گام دوم-۳ / گام سوم-۲ / گام چهارم-۴:
 * «بینش پوشش اطلاعات فهرست ایجاد شود (این بینش باید شامل تمام اطلاعات ستون‌های فهرست باشد)
 *  و با داده‌های بینش، جدول پوشش اطلاعات فهرست ساخته شود»
 *
 * این ماژول محاسبهٔ خالص است: ورودی = فهرست ستون‌ها با (پر، کل)؛ خروجی = کارت بینش
 * با پوشش کلی + ضعیف‌ترین/قوی‌ترین ستون‌ها + ارجاع به جدول پوشش همان کاشی.
 * دادهٔ همین بینش (filled/total هر ستون) مبنای «جدول پوشش اطلاعات فهرست» است
 * (مؤلفهٔ TileCoverageTable — همان ساختار را می‌سازد).
 */

import { faNumber } from "@/lib/format";
import type { InsightCard } from "./base-agent";

/** ورودی یک ستون برای بینش پوشش */
export interface CoverageColumnInput {
  /** عنوان ستون عین فهرست کاشی */
  title: string;
  /** تعداد رکوردهای پرشده */
  filled: number;
  /** کل رکوردهای بررسی‌شده */
  total: number;
  /** مسیر پر شدن (برای راهنمای بینش) */
  fillPath?: string;
}

/** خروجی تحلیل پوشش — مبنای کارت بینش و جدول پوشش */
export interface CoverageAnalysis {
  overallPct: number;
  columns: Array<CoverageColumnInput & { pct: number }>;
  weakest: Array<CoverageColumnInput & { pct: number }>;
  strongest: Array<CoverageColumnInput & { pct: number }>;
}

/** محاسبهٔ خالص پوشش — قابل تست (هیچ وابستگی به DB) */
export function analyzeCoverage(columns: CoverageColumnInput[]): CoverageAnalysis {
  const withPct = columns.map((c) => {
    const pct = c.total > 0 ? Math.round((c.filled / c.total) * 1000) / 10 : 0;
    return { ...c, pct };
  });
  const overallPct = withPct.length > 0 ? Math.round((withPct.reduce((s, c) => s + c.pct, 0) / withPct.length) * 10) / 10 : 0;
  const sorted = [...withPct].sort((a, b) => a.pct - b.pct);
  return {
    overallPct,
    columns: withPct,
    weakest: sorted.slice(0, 3),
    strongest: sorted.slice(-3).reverse(),
  };
}

/**
 * ساخت کارت بینش «پوشش اطلاعات فهرست» برای یک کاشی.
 * @param tileName نام کاشی (مثلاً «آگهی ملک تبریز»)
 * @param key کلید کارت (مثلاً "al-list-coverage")
 * @param columns ستون‌ها با پر/کل
 */
export function buildCoverageInsight(tileName: string, key: string, columns: CoverageColumnInput[]): InsightCard | null {
  if (columns.length === 0 || columns.every((c) => c.total === 0)) return null;
  const a = analyzeCoverage(columns);
  const weakText =
    a.weakest.length > 0
      ? `ضعیف‌ترین ستون‌ها: ${a.weakest.map((c) => `«${c.title}» (${faNumber(c.pct)}٪)`).join("، ")}.`
      : "";
  const strongText =
    a.strongest.length > 0
      ? ` کامل‌ترین ستون‌ها: ${a.strongest.map((c) => `«${c.title}» (${faNumber(c.pct)}٪)`).join("، ")}.`
      : "";
  const sev: InsightCard["severity"] = a.overallPct >= 70 ? "positive" : a.overallPct >= 40 ? "info" : "warning";
  return {
    key,
    domain: "COVERAGE",
    title: `پوشش اطلاعات فهرست ${tileName}`,
    body: `پوشش میانگین ${faNumber(columns.length)} ستون فهرست ${tileName} روی دادهٔ واقعی انبار، ${faNumber(a.overallPct)}٪ است.${weakText}${strongText} جدول کامل «پوشش اطلاعات فهرست» (پر/کل/درصد هر ستون + مسیر پر شدن) در همین کاشی بالای بخش بروزرسانی نمایش داده می‌شود؛ دادهٔ آن از همین تحلیل استخراج می‌شود و با هر بروزرسانی، ستون‌های در نوبت تکمیل به‌تدریج پر می‌شوند.`,
    severity: sev,
    metrics: [
      { label: "پوشش میانگین", value: `${faNumber(a.overallPct)}٪` },
      { label: "ستون‌های بررسی‌شده", value: faNumber(columns.length) },
      ...(a.weakest[0] ? [{ label: `ضعیف‌ترین: ${a.weakest[0].title}`, value: `${faNumber(a.weakest[0].pct)}٪` }] : []),
    ],
  };
}
