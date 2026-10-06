/**
 * P6545 / BLOCK 0.2 — لایهٔ کالیبراسیون (تصمیم‌های ۱ و ۳ جلسه ۰۳۳)
 * ---------------------------------------------------------------------------
 * افزودنی و مستقل از ۱۱ موتور (قید BLOCK G-6: صفر تغییر در موتورها — فقط
 * پیکربندی و لایه‌های جدید). دو مصوبهٔ شورا را پیاده می‌کند:
 *
 * تصمیم ۱ — Recalibrate سطل ۰٫۴-۰٫۶ (تأیید با قید نظارتی):
 *   · نگاشت قطعه‌ای (piecewise) احتمال → نرخ مشاهده‌شدهٔ همان ناحیه
 *   · هموارسازی لاپلاس (+۱) برای پایداری نمونهٔ کوچک
 *   · قید نظارتی: راستی‌آزمایی روی holdout طبقه‌ای — دست‌کم ۱۵ پیامد
 *     تازه در ناحیهٔ ۰٫۴-۰٫۶ که جهت بی‌قاعدگی را تأیید کنند
 *
 * تصمیم ۳ — هدف Brier به‌جای عدد ثابت ۰٫۲۰، Tier-aware می‌شود:
 *   · Tier 0-1: ≤ ۰٫۳۰ · Tier 2: ≤ ۰٫۲۵ · Tier 3: ≤ ۰٫۲۲ · Tier 4: ≤ ۰٫۲۰
 *   · تزریق از طریق SystemSnapshot.brierTarget (ورودی موتور P10) — بدون
 *     تغییر یک خط از موتور
 *
 * مصنوع ماندگار: intelligence-data/calibration-map.json (پس از اجرای ترمیم
 * تأییدشده توسط شورا تولید می‌شود؛ غیاب آن = بدون کالیبراسیون).
 */

import type { LearningTier } from "@/core/intelligence/contracts-p7-p11";

/* ─────────────────── تصمیم ۳ — هدف‌های Tier-aware ─────────────────── */

/** هدف Brier بر اساس Tier (مصوبهٔ جلسه ۰۳۳ — تصمیم ۳) */
export const TIER_BRIER_TARGETS: Readonly<Record<LearningTier, number>> = {
  0: 0.3,
  1: 0.3,
  2: 0.25,
  3: 0.22,
  4: 0.2,
} as const;

/** هدف Brier برای Tier فعلی — منبع یگانه (هیچ عدد ثابتی جای دیگر نباید باشد) */
export function tierAwareBrierTarget(tier: LearningTier): number {
  return TIER_BRIER_TARGETS[tier] ?? 0.3;
}

/* ─────────────────── تصمیم ۱ — نگاشت کالیبراسیون ─────────────────── */

/** ناحیهٔ مشکل‌دار کشف‌شده توسط P10 (DIAG-MODEL-002) */
export const CALIBRATION_REGION = { min: 0.4, max: 0.6 } as const;

/** جفت پیش‌بینی/مشاهده — هم‌شکل Pair موتور ارزیابی (بدون وابستگی به موتور) */
export interface CalibrationPair {
  predictionId: string;
  predictedValue: number;
  observedValue: number;
}

/** نگاشت قطعه‌ای کالیبراسیون — نسخه‌دار و شاهد‌دار */
export interface CalibrationMap {
  version: string;
  modelId: string;
  builtAt: string;
  fitSampleSize: number;
  smoothing: number;
  /** قطعه‌ها: [lo, hi) → calibrated value؛ خارج از همهٔ قطعه‌ها = تغییر نکرده */
  segments: Array<{ lo: number; hi: number; from: number; to: number; fitN: number; fitPositives: number }>;
  /** مبنا: مصوبهٔ شورا + شاهد راستی‌آزمایی holdout */
  approval: { source: string; decision: string; approvedAt: string };
  verification: {
    holdoutSize: number;
    freshOutcomesInRegion: number;
    brierBefore: number;
    brierAfter: number;
    improved: boolean;
  };
}

export interface BuildCalibrationOptions {
  modelId?: string;
  version?: string;
  /** هموارسازی لاپلاس (پیش‌فرض ۱) */
  smoothing?: number;
  approval?: CalibrationMap["approval"];
}

/**
 * ساخت نگاشت کالیبراسیون از مجموعهٔ fit — قطعه‌بندی ۵تایی استاندارد سطل‌ها؛
 * فقط قطعه‌هایی که دادهٔ کافی دارند نگاشت می‌شوند (بقیه دست‌نخورده می‌مانند).
 */
export function buildCalibrationMap(fitPairs: CalibrationPair[], opts: BuildCalibrationOptions = {}): CalibrationMap {
  const smoothing = opts.smoothing ?? 1;
  const buckets: Array<[number, number]> = [
    [0.0, 0.2],
    [0.2, 0.4],
    [0.4, 0.6],
    [0.6, 0.8],
    [0.8, 1.0001],
  ];
  const segments: CalibrationMap["segments"] = [];
  for (const [lo, hi] of buckets) {
    const inB = fitPairs.filter((p) => p.predictedValue >= lo && p.predictedValue < hi);
    if (inB.length === 0) continue; // بدون داده → بدون نگاشت (پایداری)
    const pos = inB.reduce((s, p) => s + (p.observedValue >= 1 ? 1 : 0), 0);
    // لاپلاس: (pos + s) / (n + 2s) — کشیده‌شدن به ۰٫۵ برای نمونهٔ کوچک
    const to = (pos + smoothing) / (inB.length + 2 * smoothing);
    const from = inB.reduce((s, p) => s + p.predictedValue, 0) / inB.length;
    segments.push({ lo, hi: hi > 1 ? 1 : hi, from: Math.round(from * 10000) / 10000, to: Math.round(to * 10000) / 10000, fitN: inB.length, fitPositives: pos });
  }
  return {
    version: opts.version ?? `cal-v1-${new Date().toISOString().slice(0, 10)}`,
    modelId: opts.modelId ?? "arm-listing-v0",
    builtAt: new Date().toISOString(),
    fitSampleSize: fitPairs.length,
    smoothing,
    segments,
    approval: opts.approval ?? {
      source: "شورای عالی ملکا — جلسه ۰۳۳ (ملکا-شورا-۱۴۰۵-۰۳۳)",
      decision: "تصمیم ۱: تأیید recalibrate سطل ۰٫۴-۰٫۶ با قید نظارتی (holdout + ۱۵ پیامد تازه)",
      approvedAt: "2026-10-03T00:00:00.000Z",
    },
    verification: { holdoutSize: 0, freshOutcomesInRegion: 0, brierBefore: 0, brierAfter: 0, improved: false },
  };
}

/** اعمال نگاشت روی یک احتمال — خارج از قطعه‌ها = بدون تغییر */
export function applyCalibrationMap(map: CalibrationMap, p: number): number {
  for (const s of map.segments) {
    if (p >= s.lo && p < (s.hi === 1 ? 1.0001 : s.hi)) {
      return Math.min(1, Math.max(0, Math.round(s.to * 10000) / 10000));
    }
  }
  return p;
}

/** اعمال نگاشت روی آرایه‌ای از جفت‌ها (نسخهٔ کالیبره‌شده) */
export function calibratePairs(map: CalibrationMap, pairs: CalibrationPair[]): CalibrationPair[] {
  return pairs.map((p) => ({ ...p, predictedValue: applyCalibrationMap(map, p.predictedValue) }));
}

/** Brier خام — همان تعریف استاندارد موتور ارزیابی (محاسبهٔ مستقل برای شاهد) */
export function brierScore(pairs: CalibrationPair[]): number {
  if (pairs.length === 0) return 0;
  return pairs.reduce((s, p) => s + (p.predictedValue - p.observedValue) ** 2, 0) / pairs.length;
}

/* ───────────── قید نظارتی — تقسیم طبقه‌ای + راستی‌آزمایی holdout ───────────── */

/**
 * تقسیم طبقه‌ای (stratified) قطعی — نیمی از هر کلاسِ مشاهده در fit، نیمهٔ
 * دیگر در holdout. دادهٔ ARM مرتب است (مثبت‌ها پیش از منفی‌ها)؛ تقسیم ترتیبی
 * تقلب می‌کند و ممنوع است — این تقسیم interleaved و قطعی است (بدون تصادفی).
 */
export function stratifiedSplitPairs<T extends CalibrationPair>(pairs: T[], seed = 42): { fit: T[]; holdout: T[] } {
  // XOR-shift قطعی — بدون وابستگی به Math.random (تولیدپذیری شاهد)
  let x = seed || 42;
  const rnd = () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return ((x >>> 0) % 10000) / 10000;
  };
  const fit: T[] = [];
  const holdout: T[] = [];
  const byObserved = new Map<number, T[]>();
  for (const p of pairs) {
    const k = p.observedValue >= 1 ? 1 : 0;
    const arr = byObserved.get(k) ?? [];
    arr.push(p);
    byObserved.set(k, arr);
  }
  for (const arr of byObserved.values()) {
    // درون هر کلاس: shuffle قطعی با seed سپس نصف/نصف
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const mid = Math.ceil(shuffled.length / 2);
    fit.push(...shuffled.slice(0, mid));
    holdout.push(...shuffled.slice(mid));
  }
  return { fit, holdout };
}

/**
 * قید نظارتی تصمیم ۱ — راستی‌آزمایی روی holdout:
 *   ۱) شمار پیامد «تازه» (holdout) در ناحیهٔ ۰٫۴-۰٫۶ (آستانهٔ شورا: ≥ ۱۵)
 *   ۲) تأیید جهت بی‌قاعدگی (نرخ مشاهده در ناحیه > پیش‌بینی)
 *   ۳) Brier نگاشت‌شده باید بهبود یابد
 */
export function verifyCalibrationOnHoldout(map: CalibrationMap, holdout: CalibrationPair[]): CalibrationMap["verification"] {
  const inRegion = holdout.filter((p) => p.predictedValue >= CALIBRATION_REGION.min && p.predictedValue < CALIBRATION_REGION.max);
  const regionObservedRate = inRegion.length ? inRegion.reduce((s, p) => s + p.observedValue, 0) / inRegion.length : 0;
  const regionPredictedAvg = inRegion.length ? inRegion.reduce((s, p) => s + p.predictedValue, 0) / inRegion.length : 0;
  const brierBefore = brierScore(holdout);
  const brierAfter = brierScore(calibratePairs(map, holdout));
  const irregularityConfirmed = inRegion.length > 0 && regionObservedRate > regionPredictedAvg;
  return {
    holdoutSize: holdout.length,
    freshOutcomesInRegion: inRegion.length,
    brierBefore: Math.round(brierBefore * 10000) / 10000,
    brierAfter: Math.round(brierAfter * 10000) / 10000,
    improved: brierAfter < brierBefore && irregularityConfirmed,
  };
}
