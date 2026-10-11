/**
 * تحلیل هوشمند تطبیق — PN-014 (دستور مالک: هم‌ارزی کاشی تطبیق با فایل‌یابی)
 * ---------------------------------------------------------------------------
 * الگوی طراحی: عین سه لایهٔ هوشمندی کاشی فایل‌یابی (src/lib/divar/scoring.ts)،
 * متناسب با کارکرد تطبیق:
 *   ۱) بند‌بندی نتایج — سه پنجرهٔ «شکار / پیگیری / بررسی» عین سطل‌های فایل‌یابی
 *      با همان معنا: شکار = بالای آستانهٔ فرصت (۰٫۷ = ALERT_SCORE_THRESHOLD
 *      موتور — بند ۱.۴ جلسهٔ ۰۳۳) · پیگیری = میان‌بند · بررسی = نیازمند کارشناس
 *   ۲) تحلیل هوشمند امتیازدهی — تجزیهٔ هر عامل با رنگ/شاهد/سهم نهایی
 *   ۳) پیش‌بینی هوشمند دلایل احتمالی رد — عین predictRejectReasons فایل‌یابی،
 *      متناسب با کارکرد: چرا مالک ممکن است این تطبیق را رد کند
 *   ۴) پیشنهاد تصمیم — چهار سطح اقدام (تماس فوری → بررسی دستی)
 *
 * همهٔ توابع «خالص»‌اند (صفر DB، صفر fetch، صفر React) — همان قرارداد
 * intelligence-boundary؛ محاسبه فقط سمت سرور در روت، سرو فقط نمایش در کلاینت.
 */

import type { MatchCandidate, MatchResult } from "./matching-engine";
import { ALERT_SCORE_THRESHOLD } from "./matching-engine";

/* ───────────────────────── ۰) نرمال‌سازی جست‌وجوی فارسی ───────────────────────── */

/** نرمال‌سازی متن فارسی برای جست‌وجو — عین الگوریتم کاشی فایل‌یابی
 *  (ارقام فارسی/عربی → لاتین، آ/أ/إ → ا، حذف فاصله و نیم‌فاصله) */
export function normFa(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[آأإ]/g, "ا")
    .replace(/[\u200c\s]/g, "")
    .trim();
}

/* ───────────────────────── ۱) بند‌بندی نتایج ───────────────────────── */

export type MatchBucket = "hunt" | "follow" | "review";

/** آستانهٔ بند پیگیری (میان‌بند) — زیر شکار، بالای بررسی */
export const FOLLOW_THRESHOLD = 0.5;

export const MATCH_BUCKET_STYLES: Record<MatchBucket, { label: string; chip: string; ring: string; icon: "sparkles" | "gauge" | "filter" }> = {
  hunt: {
    label: "شکار",
    chip: "bg-gradient-to-l from-teal-600 to-cyan-500 text-white shadow-sm shadow-teal-600/30",
    ring: "ring-2 ring-teal-500/60 border-teal-200/70 dark:border-teal-900/60",
    icon: "sparkles",
  },
  follow: {
    label: "پیگیری",
    chip: "bg-gradient-to-l from-amber-600 to-amber-500 text-white shadow-sm shadow-amber-600/30",
    ring: "ring-2 ring-amber-500/40 border-amber-200/70 dark:border-amber-900/60",
    icon: "gauge",
  },
  review: {
    label: "بررسی",
    chip: "bg-muted text-muted-foreground border",
    ring: "",
    icon: "filter",
  },
};

/** بندِ یک امتیاز — همان معنای سه‌پنجرگی فایل‌یابی */
export function bucketOf(score: number): MatchBucket {
  if (score >= ALERT_SCORE_THRESHOLD) return "hunt";
  if (score >= FOLLOW_THRESHOLD) return "follow";
  return "review";
}

export function bucketCounts(candidates: Array<{ score: number }>): Record<MatchBucket, number> {
  const out: Record<MatchBucket, number> = { hunt: 0, follow: 0, review: 0 };
  for (const c of candidates) out[bucketOf(c.score)] += 1;
  return out;
}

/* ───────────────────────── ۲) پیشنهاد تصمیم ───────────────────────── */

export interface DecisionSuggestion {
  /** سطح اقدام */
  level: "contact-now" | "priority" | "follow-up" | "manual-review";
  title: string;
  hint: string;
  /** کلاس رنگی — هم‌خانوادهٔ پالت زمرد/کهربا (بدون آبی/بنفش) */
  tone: "emerald" | "teal" | "amber" | "muted";
}

/** پیشنهاد تصمیم از روی امتیاز — صفر اجرای خودکار؛ تصمیم نهایی همیشه با مالک */
export function decisionSuggestion(score: number): DecisionSuggestion {
  if (score >= 0.85) {
    return { level: "contact-now", title: "تماس فوری", hint: "بهترین انطباقِ ممکن — مشتری و ملک هر دو آمادهٔ معرفی‌اند", tone: "emerald" };
  }
  if (score >= ALERT_SCORE_THRESHOLD) {
    return { level: "priority", title: "اولویت بالا — تماس امروز", hint: "بالای آستانهٔ فرصت (۰٫۷) — معرفی به مشتری را از دست ندهید", tone: "teal" };
  }
  if (score >= FOLLOW_THRESHOLD) {
    return { level: "follow-up", title: "پیگیری ملایم", hint: "انطباق متوسط — مشتری را در جریان بگذارید و منتظر گزینهٔ بهتر بمانید", tone: "amber" };
  }
  return { level: "manual-review", title: "بررسی دستی", hint: "انطباق جزئی — فقط اگر کارشناس تشخیص داد پیش بروید", tone: "muted" };
}

/* ───────────────────────── ۳) تحلیل هوشمند امتیازدهی ───────────────────────── */

export interface FactorAnalysis {
  key: string;
  /** عنوان فارسی عامل — عین فاکتورهای موتور */
  label: string;
  /** مقدار عامل ۰ تا ۱ */
  value: number;
  /** وزن آموخته/پایه ۰ تا ۱ */
  weight: number;
  /** سهم نهایی در امتیاز کل (value × weight) */
  contribution: number;
  /** شاهد متنی عامل */
  note: string;
  /** خانوادهٔ رنگی — هم‌خانوادهٔ CRITERION_TONES فایل‌یابی (زمرد/کهربا/رز/فیروزه) */
  tone: "personal" | "underprice" | "other" | "location";
  /** آیا دادهٔ واقعی پشت این عامل هست (نه خنثی ۰٫۵) */
  evidenceBacked: boolean;
}

/** کلیدهای عوامل موتور → برچسب و رنگ — ترتیب عین reasons موتور
 *  PN-028/رابعاً-د — سه عامل تازهٔ فراکامل (اتاق/طبقه/ساخت) */
const FACTOR_META: Record<string, { label: string; tone: FactorAnalysis["tone"] }> = {
  "فاصله قیمت": { label: "فاصله قیمت", tone: "underprice" },
  "نزدیکی جغرافیایی": { label: "نزدیکی جغرافیایی", tone: "location" },
  "تناسب متراژ": { label: "تناسب متراژ", tone: "personal" },
  "تازگی آگهی": { label: "تازگی آگهی", tone: "location" },
  "سابقه کارشناس": { label: "سابقه کارشناس", tone: "other" },
  "تطابق نوع ملک": { label: "تطابق نوع ملک", tone: "personal" },
  "تناسب اتاق": { label: "تناسب اتاق", tone: "personal" },
  "تناسب طبقه": { label: "تناسب طبقه", tone: "location" },
  "تناسب سال ساخت": { label: "تناسب سال ساخت", tone: "other" },
};

/** تحلیل تجزیه‌شدهٔ امتیازدهی یک کاندیدا — عین «تحلیل هوشمند امتیازدهی» فایل‌یابی */
export function analyzeMatchScoring(candidate: Pick<MatchCandidate, "reasons">): FactorAnalysis[] {
  return candidate.reasons.map((r) => {
    const meta = FACTOR_META[r.factor] ?? { label: r.factor, tone: "personal" as const };
    return {
      key: r.factor,
      label: meta.label,
      value: r.value,
      weight: r.weight,
      contribution: Math.round(r.value * r.weight * 1000) / 1000,
      note: r.note,
      tone: meta.tone,
      // مقدار خنثی ۰٫۵ = بدون دادهٔ واقعی (قرارداد صداقت سیگنال موتور)
      evidenceBacked: r.value !== 0.5 || /داخل بازه|همان منطقه|متر|روز|معامله|✓/.test(r.note),
    };
  });
}

/* ───────────────────────── ۴) پیش‌بینی دلایل احتمالی رد ───────────────────────── */

export interface RejectionPrediction {
  key: string;
  title: string;
  /** احتمال تقریبی ۰-۱۰۰ — عین قرارداد فایل‌یابی */
  likely: number;
  hint: string;
}

/**
 * پیش‌بینی هوشمند دلایل احتمالی ردِ این تطبیق توسط مالک — عین
 * predictRejectReasons فایل‌یابی، متناسب با کارکرد تطبیق.
 * ورودی: عوامل تجزیه‌شده + امتیاز + پوشش سیگنال.
 */
export function predictMatchRejectionReasons(
  candidate: Pick<MatchCandidate, "reasons" | "score" | "signalCoverage">,
): RejectionPrediction[] {
  const byFactor = new Map(candidate.reasons.map((r) => [r.factor, r]));
  const out: RejectionPrediction[] = [];

  const price = byFactor.get("فاصله قیمت");
  if (price) {
    if (price.value <= 0.5 && /خنثی/.test(price.note)) {
      out.push({ key: "no-price-range", title: "بازهٔ قیمت درخواست نامشخص است", likely: 65, hint: "مذاکرهٔ قیمتی پیش‌بینی‌ناپذیر — قبل از معرفی شفاف کنید" });
    } else if (price.value < 0.7) {
      out.push({ key: "price-off", title: "قیمت ملک با بودجهٔ مشتری فاصله دارد", likely: 70, hint: price.note });
    } else if (price.value < 1) {
      out.push({ key: "price-edge", title: "قیمت در لبۀ بازهٔ درخواست است", likely: 40, hint: "کوچک‌ترین تغییر قیمتی، تطبیق را می‌شکند" });
    }
  }

  const geo = byFactor.get("نزدیکی جغرافیایی");
  if (geo) {
    if (geo.value <= 0.3) {
      out.push({ key: "geo-out", title: "منطقهٔ ملک در مناطق دلخواه مشتری نیست", likely: 75, hint: geo.note });
    } else if (geo.value === 0.5) {
      out.push({ key: "geo-unknown", title: "ترجیح منطقه‌ای مشتری نامشخص است", likely: 45, hint: "ممکن است منطقه دقیقاً خلاف سلیقهٔ مشتری باشد" });
    }
  }

  const meterage = byFactor.get("تناسب متراژ");
  if (meterage && meterage.value < 0.6 && !/خنثی/.test(meterage.note)) {
    out.push({ key: "meterage-off", title: "متراژ ملک خارج از بازهٔ درخواست است", likely: 60, hint: meterage.note });
  }

  // PN-028/رابعاً-د — دلایل رد از عوامل تازهٔ فراکامل
  const rooms = byFactor.get("تناسب اتاق");
  if (rooms && rooms.value < 0.6 && !/خنثی/.test(rooms.note)) {
    out.push({ key: "rooms-off", title: "تعداد اتاق با خواستهٔ مشتری نمی‌خواند", likely: 50, hint: rooms.note });
  }
  const floor = byFactor.get("تناسب طبقه");
  if (floor && floor.value < 0.6 && !/خنثی/.test(floor.note)) {
    out.push({ key: "floor-off", title: "طبقهٔ ملک خارج از بازهٔ درخواست است", likely: 45, hint: floor.note });
  }
  const age = byFactor.get("تناسب سال ساخت");
  if (age && age.value < 0.6 && !/خنثی/.test(age.note)) {
    out.push({ key: "age-off", title: "سال ساخت ملک با انتظار مشتری فاصله دارد", likely: 45, hint: age.note });
  }

  const freshness = byFactor.get("تازگی آگهی");
  if (freshness && freshness.value <= 0.4) {
    out.push({ key: "stale", title: "آگهی کهنه است — ممکن است قبلاً رفته باشد", likely: 55, hint: `آخرین همگام‌سازی: ${freshness.note}` });
  }

  const expert = byFactor.get("سابقه کارشناس");
  if (expert && /بدون کد کارشناس/.test(expert.note)) {
    out.push({ key: "no-expert", title: "کارشناس ثبت‌کننده شناسایی نشده", likely: 30, hint: "پیگیری مسئولیت آن سمت مشخص نیست" });
  } else if (expert && expert.value < 0.3) {
    out.push({ key: "low-expert-history", title: "سابقهٔ کارشناسِ سطر مقابل کم است", likely: 35, hint: expert.note });
  }

  const type = byFactor.get("تطابق نوع ملک");
  if (type && type.value === 0) {
    out.push({ key: "type-mismatch", title: "نوع ملک با خواستهٔ مشتری نمی‌خواند", likely: 65, hint: type.note });
  } else if (type && type.value === 0.5) {
    out.push({ key: "type-unknown", title: "نوع ملک در درخواست تصریح نشده", likely: 40, hint: "انتظار مشتری از متن قابل حدس نیست" });
  }

  if (candidate.signalCoverage < 0.5) {
    out.push({ key: "thin-signal", title: "داده‌های این تطبیق ناقص است", likely: Math.round(40 + (0.5 - candidate.signalCoverage) * 60), hint: `پوشش سیگنال فقط ${Math.round(candidate.signalCoverage * 100)}٪ — عوامل بی‌داده خنثی ارزیابی شده‌اند` });
  }

  // دلایل همیشگی — عین الگوی فایل‌یابی (پایه احتمال کم)
  out.push({ key: "already-dealt", title: "ملک قبلاً معامله/رزرو شده باشد", likely: 25, hint: "ایجنت از روی الگوی ردهای قبلی شما" });
  out.push({ key: "customer-changed-mind", title: "مشتری از فاز خرید خارج شده باشد", likely: 20, hint: "قبل از معرفی، تماس تأییدی بگیرید" });
  out.push({ key: "visit-needed", title: "وضعیت فیزیکی ملک نیاز به بازدید دارد", likely: 25, hint: "نیازمند بازدید حضوری کارشناس" });
  out.push({ key: "other", title: "دلیل دیگر (در توضیحات بنویسید)", likely: 10, hint: "خودتان شرح دهید" });

  return out.sort((a, b) => b.likely - a.likely);
}

/* ───────────────────────── ۵) خلاصهٔ هوشمند ایجنت ───────────────────────── */

export interface MatchSummary {
  buckets: Record<MatchBucket, number>;
  best: { index: number; score: number } | null;
  headline: string;
  weightsHint: string;
}

/** خلاصهٔ هوشمند نتیجهٔ تطبیق — «ایجنت می‌گوید» سرتاسری */
export function matchSummary(result: Pick<MatchResult, "candidates" | "weightsSource" | "weightsFeedbackCount">): MatchSummary {
  const buckets = bucketCounts(result.candidates);
  const best = result.candidates.length > 0 ? { index: 0, score: result.candidates[0].score } : null;
  let headline: string;
  if (result.candidates.length === 0) {
    headline = "هیچ تطبیقِ پاس‌شده از فیلترهای سخت پیدا نشد — شرط‌های ورودی را بازبینی کنید یا منتظر دادهٔ تازه بمانید.";
  } else if (buckets.hunt > 0) {
    headline = `از ${faCount(result.candidates.length)} گزینه، ${faCount(buckets.hunt)} گزینه بالای آستانهٔ فرصت (۰٫۷) است — گزینهٔ نخست با امتیاز ${faScore(best!.score)} بهترین تماس اول است.`;
  } else if (buckets.follow > 0) {
    headline = `گزینهٔ «شکار» در این نتیجه نیست؛ ${faCount(buckets.follow)} گزینهٔ میان‌بند برای پیگیری ملایم موجود است — معرفی عجله‌ناک نکنید.`;
  } else {
    headline = "همهٔ گزینه‌ها زیر آستانهٔ پیگیری‌اند — این سطر را با سطر ورودی دیگری امتحان کنید.";
  }
  const weightsHint = result.weightsSource === "learned"
    ? `وزن‌های عوامل از ${faCount(result.weightsFeedbackCount ?? 0)} بازخورد پذیرش/رد شما آموخته شده`
    : "وزن‌های پایه — با هر پذیرش/رد، وزن‌ها تدریجاً شخصی می‌شود";
  return { buckets, best, headline, weightsHint };
}

function faCount(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}
function faScore(n: number): string {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(n);
}

/* ───────────────────────── ۵-ب) تحلیل چندوجهی (PN-028/رابعاً-د — فراکامل) ───────────────────────── */

export interface MatchDimension {
  /** کلید بعد */
  key: "financial" | "spatial" | "physical" | "human" | "temporal";
  label: string;
  hint: string;
  /** امتیاز بعد ۰ تا ۱ — میانگین موزون عوامل همان بعد */
  value: number;
  /** عوامل سازندهٔ بعد */
  factors: string[];
}

/** نگاشت عامل → بعد پنج‌گانهٔ تحلیل چندوجهی */
const FACTOR_TO_DIMENSION: Record<string, MatchDimension["key"]> = {
  "فاصله قیمت": "financial",
  "نزدیکی جغرافیایی": "spatial",
  "تناسب متراژ": "physical",
  "تازگی آگهی": "temporal",
  "سابقه کارشناس": "human",
  "تطابق نوع ملک": "physical",
  "تناسب اتاق": "physical",
  "تناسب طبقه": "physical",
  "تناسب سال ساخت": "physical",
};

const DIMENSION_META: Record<MatchDimension["key"], { label: string; hint: string }> = {
  financial: { label: "بُعد مالی", hint: "تلاقی قیمت و بودجه — ستون فقرات تصمیم اقتصادی" },
  spatial: { label: "بُعد مکانی", hint: "منطقه و نزدیکی جغرافیایی — سلیقهٔ مکان متقاضی" },
  physical: { label: "بُعد فیزیکی", hint: "نوع ملک · متراژ · اتاق · طبقه · سال ساخت — تناسب عینی کالای ملک" },
  human: { label: "بُعد انسانی", hint: "سابقه و اعتبار کارشناس سمت مقابل — ریسک اجرای معامله" },
  temporal: { label: "بُعد زمانی", hint: "تازگی داده و فوریت — پنجرهٔ عمل‌پذیری معامله" },
};

/** تحلیل چندوجهی یک کاندیدا — پنج بعد مستقل با امتیاز موزون (سرور می‌سازد، کلاینت نمایش می‌دهد) */
export function dimensionsOf(candidate: Pick<MatchCandidate, "reasons">): MatchDimension[] {
  const buckets = new Map<MatchDimension["key"], { sum: number; weight: number; factors: string[] }>();
  for (const r of candidate.reasons) {
    const key = FACTOR_TO_DIMENSION[r.factor];
    if (!key) continue;
    const cur = buckets.get(key) ?? { sum: 0, weight: 0, factors: [] };
    cur.sum += r.value * r.weight;
    cur.weight += r.weight;
    if (!cur.factors.includes(r.factor)) cur.factors.push(r.factor);
    buckets.set(key, cur);
  }
  const order: MatchDimension["key"][] = ["financial", "spatial", "physical", "human", "temporal"];
  return order
    .filter((k) => buckets.has(k))
    .map((k) => {
      const b = buckets.get(k)!;
      return {
        key: k,
        label: DIMENSION_META[k].label,
        hint: DIMENSION_META[k].hint,
        value: Math.round((b.weight > 0 ? b.sum / b.weight : 0) * 100) / 100,
        factors: b.factors,
      };
    });
}

/* ───────────────────────── ۶) غنی‌سازی سرتاسری ───────────────────────── */

/** کاندیدای غنی‌شده — همان داده + بند + تحلیل + پیش‌بینی + پیشنهاد تصمیم + ابعاد چندوجهی */
export interface EnrichedCandidate extends MatchCandidate {
  listingCode?: string;
  requestLabel?: string;
  bucket: MatchBucket;
  decision: DecisionSuggestion;
  analysis: FactorAnalysis[];
  predictions: RejectionPrediction[];
  /** PN-028/رابعاً-د — تحلیل چندوجهی پنج‌گانه (مالی/مکانی/فیزیکی/انسانی/زمانی) */
  dimensions: MatchDimension[];
}

/** غنی‌سازی کامل نتیجهٔ موتور برای سرو در کلاینت (فقط در سرور اجرا شود) */
export function enrichMatchResult(result: MatchResult): {
  candidates: EnrichedCandidate[];
  summary: MatchSummary;
} {
  const candidates: EnrichedCandidate[] = result.candidates.map((c) => ({
    ...c,
    bucket: bucketOf(c.score),
    decision: decisionSuggestion(c.score),
    analysis: analyzeMatchScoring(c),
    predictions: predictMatchRejectionReasons(c),
    dimensions: dimensionsOf(c),
  }));
  return { candidates, summary: matchSummary(result) };
}
