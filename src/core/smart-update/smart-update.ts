/**
 * P6545 / گام ۱ — BLOCK 1.5: بروزرسانی هوشمند (جلسه ۰۳۰ سؤال ۴)
 * ---------------------------------------------------------------------------
 * سه سازوکار (افزودنی — صفر تغییر در منطق موجود):
 *
 * الف) زمان‌بندی تطبیقی — فاصلهٔ تیک بر اساس کهنگی داده:
 *      کهنگی ≤ ۲۴س → تیک عادی · ۲۴-۷۲س → تیک نصف · ۷۲-۱۶۸س → تیک ربع · > ۱۶۸س → فوری
 *
 * ب) صف اولویت‌دار امتیازی — امتیاز = (دیده‌شدن × تازگی × نقص × تطابق فیلتر)
 *      ردیف پرمصرف، تازه، ناقص و منطبق بر فیلتر فعال کاربر، اول بروزرسانی می‌شود.
 *
 * ج) غنی‌سازی تنبل — با باز شدن ردیف، فیلد خالی همان لحظه کشیده می‌شود
 *      (هدف پاسخ ≤ ۲ ثانیه).
 *
 * قید Tier-aware (عین جلسه ۰۳۳):
 *   Tier 0-1: فقط دستی · Tier 2-3: زمان‌بندی تطبیقی · Tier 4: صف اولویت‌دار
 */

import type { LearningTier } from "@/core/intelligence/contracts-p7-p11";

/* ═══════════════ الف) زمان‌بندی تطبیقی ═══════════════ */

/** حالت‌های زمان‌بندی — ۶ حالت تست‌پذیر */
export type AdaptiveMode = "manual" | "normal" | "accelerated" | "rapid" | "immediate" | "tier-locked";

export interface AdaptiveTimingInput {
  /** کهنگی دادهٔ مرجع (ساعت) */
  stalenessHours: number;
  /** Tier فعلی سیستم */
  tier: LearningTier;
  /** فاصلهٔ پایهٔ تیک (دقیقه) — پیش‌فرض دیمن کاتالوگ: ۳ دقیقه */
  baseIntervalMinutes?: number;
}

export interface AdaptiveTimingDecision {
  mode: AdaptiveMode;
  intervalMinutes: number;
  reason: string;
}

/**
 * تصمیم زمان‌بندی تطبیقی — Tier 0-1 قفل دستی (صفر تیک خودکار).
 * بقیهٔ Tierها: هرچه کهنگی بیشتر، تیک تندتر (هرگز کندتر از پایه نمی‌شود).
 */
export function decideAdaptiveTiming(input: AdaptiveTimingInput): AdaptiveTimingDecision {
  const base = Math.max(1, input.baseIntervalMinutes ?? 3);
  if (input.tier <= 1) {
    return { mode: "tier-locked", intervalMinutes: 0, reason: `Tier ${input.tier} — فقط دستی (قید جلسه ۰۳۳)` };
  }
  if (input.stalenessHours > 168) {
    return { mode: "immediate", intervalMinutes: 1, reason: `کهنگی ${Math.round(input.stalenessHours)} ساعت > ۱۶۸ — تیک فوری (۱ دقیقه)` };
  }
  if (input.stalenessHours > 72) {
    return { mode: "rapid", intervalMinutes: Math.max(1, Math.round(base / 4)), reason: `کهنگی ${Math.round(input.stalenessHours)} ساعت > ۷۲ — تیک ربع` };
  }
  if (input.stalenessHours > 24) {
    return { mode: "accelerated", intervalMinutes: Math.max(1, Math.round(base / 2)), reason: `کهنگی ${Math.round(input.stalenessHours)} ساعت > ۲۴ — تیک نصف` };
  }
  return { mode: "normal", intervalMinutes: base, reason: `کهنگی ${Math.round(input.stalenessHours)} ساعت ≤ ۲۴ — تیک عادی (${base} دقیقه)` };
}

/* ═══════════════ ب) صف اولویت‌دار امتیازی ═══════════════ */

export interface QueueRowInput {
  id: string;
  /** دیده‌شدن: تعداد بازدید/تعامل (لگاریتمی نرمال) */
  viewCount: number;
  /** تازگی: ساعت از آخرین بروزرسانی (بیشتر = کهنه‌تر = اولویت بیشتر تا سقف) */
  hoursSinceUpdate: number;
  /** نقص: نسبت فیلدهای خالی (۰ تا ۱) */
  missingFieldRatio: number;
  /** تطابق فیلتر فعال کاربر (۰ تا ۱) */
  filterMatch: number;
}

export interface QueueRowScored extends QueueRowInput {
  score: number;
  parts: { seen: number; freshness: number; deficiency: number; filterMatch: number };
}

/**
 * امتیاز صف — عین جلسه ۰۳۳: امتیاز = (دیده‌شدن × تازگی × نقص × تطابق فیلتر)
 * ضرب (نه جمع) تا ردیفی که در همهٔ ابعاد مهم است صدر بگیرد؛ +1-smoothing ضد صفر مطلق.
 * فقط Tier 4 مصرف می‌کند (گارد Tier در مصرف‌کننده).
 */
export function scoreQueueRow(row: QueueRowInput): QueueRowScored {
  const seen = 1 + Math.min(5, Math.log2(1 + Math.max(0, row.viewCount))); // ۱ تا ~۶
  const freshness = Math.min(2, row.hoursSinceUpdate / 24) + 0.5; // ۰٫۵ تا ۲٫۵
  const deficiency = row.missingFieldRatio + 0.1; // ۰٫۱ تا ۱٫۱
  const filterMatch = row.filterMatch + 0.1; // ۰٫۱ تا ۱٫۱
  const score = Math.round(seen * freshness * deficiency * filterMatch * 100) / 100;
  return { ...row, score, parts: { seen: round2(seen), freshness: round2(freshness), deficiency: round2(deficiency), filterMatch: round2(filterMatch) } };
}

/** مرتب‌سازی صف بر اساس امتیاز (بیشترین اول) */
export function buildPriorityQueue(rows: QueueRowInput[]): QueueRowScored[] {
  return rows.map(scoreQueueRow).sort((a, b) => b.score - a.score);
}

/** گارد Tier برای مصرف صف — فقط Tier 4 */
export function queueAllowedForTier(tier: LearningTier): boolean {
  return tier >= 4;
}

/* ═══════════════ ج) غنی‌سازی تنبل ═══════════════ */

export interface LazyEnrichmentTarget {
  rowId: string;
  table: "property" | "request";
  /** فیلدهای خالی که درخواست شده‌اند */
  fields: string[];
}

export interface LazyEnrichmentResult {
  rowId: string;
  table: string;
  filled: Record<string, unknown>;
  durationMs: number;
  withinBudget: boolean; // ≤ ۲ ثانیه
}

/** بودجهٔ پاسخ غنی‌سازی تنبل — عین جلسه ۰۳۳: ≤ ۲ ثانیه */
export const LAZY_ENRICHMENT_BUDGET_MS = 2000;

/**
 * غنی‌سازی تنبل — فیلد خالی ردیف بازشده همان لحظه از منبع محلی (کش غنی‌سازی
 * موجود) خوانده می‌شود. منبع دور (ARM) فقط توسط دیمن با توکن زنده پر می‌شود؛
 * این مسیر هرگز آهستهٔ شبکه‌ای در مسیر UI نیست (بودجهٔ ۲ ثانیه).
 */
export async function lazyEnrich(
  target: LazyEnrichmentTarget,
  source: (table: string, rowId: string, fields: string[]) => Promise<Record<string, unknown>>,
): Promise<LazyEnrichmentResult> {
  const started = Date.now();
  let filled: Record<string, unknown> = {};
  try {
    filled = await source(target.table, target.rowId, target.fields);
  } catch {
    filled = {}; // خطای منبع — صادقانه خالی
  }
  const durationMs = Date.now() - started;
  return {
    rowId: target.rowId,
    table: target.table,
    filled,
    durationMs,
    withinBudget: durationMs <= LAZY_ENRICHMENT_BUDGET_MS,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
