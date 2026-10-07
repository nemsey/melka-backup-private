/**
 * یادگیری وزن‌های تطبیق از بازخورد مالک — PN-011 خامسا-۲ (دستور مالک)
 * ---------------------------------------------------------------------------
 * «الگوریتم (هوشمندی و یادگیری) به دلیل اهمیت بالای عملکرد این کاشی افزایش یابد»
 *
 * حلقهٔ بستهٔ سبک و شفاف (الگوی LRN-001..004 لایهٔ هوشمندی — سازگار با آن):
 *   ۱) هر پذیرش/رد تطبیق در کاشی M5 با «عوامل امتیاز همان تطبیق» ثبت می‌شود
 *      (AgentFeedback با insightKey=match:… و context.factors=[{factor,value}]).
 *   ۲) این ماژول بازخوردهای اخیر کاشی smart-matching را می‌خواند و برای هر
 *      عامل یک «ضریب آموخته» می‌سازد:
 *        ضریب(f) = 1 + η × Σ(امتیاز × (ارزش عامل − ۰٫۵)) / N      (η = ۰٫۳)
 *      شهود صادقانه: عاملی که در پذیرش‌ها بالاتر از میانگین بوده تقویت می‌شود و
 *      عاملی که در ردها بالا بوده تضعیف — نسبت به پایه، نه مطلق.
 *   ۳) وزن نهایی = وزن پایه × ضریب، محدود به [۰٫۵ · پایه، ۱٫۵ · پایه] (کلمپ
 *      محافظه‌کارانه)، سپس نرمال‌سازی مجموع روی ۱.
 *   ۴) حداقل سیگنال: کمتر از ۳ بازخورد ← null (وزن پایه — صفر یادگیری بی‌داده).
 *
 * قواعد ایمنی:
 *   - فقط خواندن (append-only از روت بازخورد) — این ماژول هرگز DB نمی‌نویسد.
 *   - خروجی هرگز NaN/Infinity نیست (پایه همیشه بخشندهٔ تقسیم است).
 *   - سقف بازخورد خوانده‌شده: ۲۰۰ تازه‌ترین (پنجرهٔ لغزان — اثر بازخورد کهنه محو می‌شود).
 */

import type { PrismaClient } from "@prisma/client";
import { BASE_MATCH_WEIGHTS, type MatchWeights } from "./matching-engine";

/** نرخ یادگیری (η) — محافظه‌کارانه */
const LEARNING_RATE = 0.3;
/** حداقل بازخورد برای فعال‌شدن وزن آموخته (LRN-001) */
const MIN_FEEDBACK = 3;
/** سقف بازخورد خوانده‌شده (پنجرهٔ لغزان) */
const MAX_WINDOW = 200;
/** کلمپ ضریب نسبت به پایه */
const CLAMP = { min: 0.5, max: 1.5 };

/** نام فارسی عامل ↔ کلید وزن — همان برچسب‌هایی که UI کارت امتیاز نشان می‌دهد */
const FACTOR_TO_WEIGHT: Record<string, keyof MatchWeights> = {
  "فاصله قیمت": "priceDistance",
  "نزدیکی جغرافیایی": "geoProximity",
  "تناسب متراژ": "meterageFit",
  "تازگی آگهی": "freshness",
  "سابقه کارشناس": "expertHistory",
  "تطابق نوع ملک": "propertyTypeMatch",
};

export interface LearnedWeights {
  weights: MatchWeights;
  feedbackCount: number;
  /** ضریب هر عامل نسبت به پایه (شفافیت — برای نمایش/تست) */
  factors: Array<{ factor: string; multiplier: number; weight: number }>;
}

/**
 * محاسبهٔ وزن‌های آموخته از بازخوردهای کاشی تطبیق.
 * خروجی null = داده کافی نیست؛ موتور با BASE_MATCH_WEIGHTS ادامه می‌دهد.
 */
export async function computeLearnedMatchWeights(db: PrismaClient): Promise<LearnedWeights | null> {
  const feedbacks = await db.agentFeedback.findMany({
    where: { tileId: "smart-matching", insightKey: { startsWith: "match:" } },
    orderBy: { createdAt: "desc" },
    take: MAX_WINDOW,
  });
  if (feedbacks.length < MIN_FEEDBACK) return null;

  // جمع سیگنال هر عامل: Σ rating × (value − 0.5)
  const signal: Record<string, { sum: number; n: number }> = {};
  let usable = 0;
  for (const f of feedbacks) {
    let factors: Array<{ factor?: string; value?: number }> = [];
    try {
      const ctx = JSON.parse(f.context) as { factors?: Array<{ factor?: string; value?: number }> };
      if (Array.isArray(ctx.factors)) factors = ctx.factors;
    } catch {
      continue; // بازخورد بدون عوامل (قدیمی/دستی) — در یادگیری وزن بی‌اثر
    }
    for (const fac of factors) {
      const key = fac.factor && FACTOR_TO_WEIGHT[fac.factor];
      const val = typeof fac.value === "number" && Number.isFinite(fac.value) ? fac.value : null;
      if (!key || val === null) continue;
      const cur = signal[fac.factor!] ?? { sum: 0, n: 0 };
      cur.sum += f.rating * (val - 0.5);
      cur.n += 1;
      signal[fac.factor!] = cur;
      usable += 1;
    }
  }
  if (usable < MIN_FEEDBACK) return null;

  // ضریب آموختهٔ هر عامل + کلمپ محافظه‌کارانه
  const multipliers: Record<string, number> = {};
  for (const [factor, { sum, n }] of Object.entries(signal)) {
    const raw = 1 + (LEARNING_RATE * sum) / Math.max(n, 1);
    multipliers[factor] = Math.min(CLAMP.max, Math.max(CLAMP.min, raw));
  }

  // وزن نهایی = پایه × ضریب → نرمال‌سازی روی ۱
  const weights: MatchWeights = { ...BASE_MATCH_WEIGHTS };
  for (const [factor, key] of Object.entries(FACTOR_TO_WEIGHT)) {
    const m = multipliers[factor];
    if (m !== undefined) weights[key] = BASE_MATCH_WEIGHTS[key] * m;
  }
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total > 0 && Number.isFinite(total)) {
    for (const k of Object.keys(weights) as Array<keyof MatchWeights>) weights[k] = weights[k] / total;
  }

  const factors = Object.keys(FACTOR_TO_WEIGHT).map((factor) => ({
    factor,
    multiplier: multipliers[factor] ?? 1,
    weight: weights[FACTOR_TO_WEIGHT[factor]],
  }));

  return { weights, feedbackCount: feedbacks.length, factors };
}
