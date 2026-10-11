/**
 * حافظهٔ بلندمدت — هستهٔ خالص (PN-025 / فاز ۱۳-ج / ستون ۱)
 * ---------------------------------------------------------------------------
 * سه سطح حافظه (الگوی عصب‌شناختی): داغ (هفته) · گرم (ماه) · سرد (آرشیو audit)
 * + فرمول امتیاز اهمیت + قواعد گذار + بیداری — همگی توابع خالص.
 *
 * قید خلوص لایهٔ هوش (گارد audit-intelligence-boundary):
 * این فایل هیچ وابستگی به پایگاه داده و هیچ فراخوانی شبکه‌ای ندارد —
 * DB فقط در سرویس (src/lib/services/memory-lifecycle-service.ts).
 *
 * سند طراحی: docs/PHASE13-C-MEMORY-VISION-ADVISOR-LOCK-DESIGN.md فصل ۳ و ۴.
 */

// ═══════════════ ثابت‌های نام‌دار (fail-loud) ═══════════════

/** سطح‌های مجاز حافظه */
export const MEMORY_CATEGORIES = ["hot", "warm", "cold"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

/** نوع بستر حافظه */
export const MEMORY_ITEM_TYPES = ["property", "person", "request", "transaction", "advice", "insight"] as const;
export type MemoryItemType = (typeof MEMORY_ITEM_TYPES)[number];

/** وزن‌های فرمول اهمیت — جمع باید دقیقاً ۱ باشد (fail-loud) */
export const IMPORTANCE_WEIGHTS = { recency: 0.4, frequency: 0.35, outcomeLink: 0.25 } as const;

/** نیم‌عمر تازگی — هم‌زبان با موتور ۱۲ توجه (۴۸ ساعت) */
export const RECENCY_HALF_LIFE_HOURS = 48;

/** آستانه‌های گذار (عین سفارش PN-025) */
export const CONSOLIDATION_THRESHOLDS = {
  /** hot → warm: عمر > ۷ روز و امتیاز ≥ ۰٫۷ */
  promoteScore: 0.7,
  hotDays: 7,
  /** warm → cold: عمر > ۳۰ روز و امتیاز < ۰٫۳ */
  demoteScore: 0.3,
  warmDays: 30,
  /** بیداری cold → warm: دسترسی تازه + جهش امتیاز ≥ ۰٫۵ */
  awakenScore: 0.5,
  /** پنجرهٔ «دسترسی تازه» برای بیداری (ساعت) */
  awakenWindowHours: 48,
} as const;

/** سقف نرمال‌سازی بسامد — log(1+count)/log(1+MAX) */
export const FREQUENCY_NORM_CEILING = 500;

// ═══════════════ گارد اعتبار ثابت‌ها (در بارگذاری ماژول — fail-loud) ═══════════════

const weightSum = IMPORTANCE_WEIGHTS.recency + IMPORTANCE_WEIGHTS.frequency + IMPORTANCE_WEIGHTS.outcomeLink;
if (Math.abs(weightSum - 1) > 1e-9) {
  throw new Error(`[memory-lifecycle] وزن‌های اهمیت باید جمعاً ۱ باشند — الان ${weightSum}`);
}
if (CONSOLIDATION_THRESHOLDS.promoteScore <= CONSOLIDATION_THRESHOLDS.demoteScore) {
  throw new Error("[memory-lifecycle] آستانهٔ ارتقا باید بالاتر از آستانهٔ تنزل باشد");
}

// ═══════════════ فرمول امتیاز اهمیت (فصل ۳.۳ سند طراحی) ═══════════════

/** تازگی واپاشی نمایی — نیم‌عمر واقعی: exp(-Δt·ln2 / halfLife) ⇒ در ۴۸ ساعت دقیقاً ۰٫۵ */
export function recencyComponent(hoursSinceAccess: number): number {
  if (!Number.isFinite(hoursSinceAccess) || hoursSinceAccess < 0) return 0;
  return Math.exp((-hoursSinceAccess * Math.LN2) / RECENCY_HALF_LIFE_HOURS);
}

/** بسامد نرمال درون‌داده — log(1+count) / log(1+ceiling) کلمپ‌شده در [0,1] */
export function frequencyComponent(accessCount: number): number {
  if (!Number.isFinite(accessCount) || accessCount <= 0) return 0;
  const raw = Math.log(1 + accessCount) / Math.log(1 + FREQUENCY_NORM_CEILING);
  return Math.min(1, Math.max(0, raw));
}

/** پیوند نتیجه — باینری: بستر در معاملهٔ موفق نقش داشته؟ */
export function outcomeLinkComponent(hasOutcomeLink: boolean): number {
  return hasOutcomeLink ? 1 : 0;
}

/**
 * امتیاز اهمیت کل — ترکیب سه سیگنال با وزن‌های نام‌دار.
 * خروجی همیشه در [0,1] (کلمپ دفاعی).
 */
export function computeImportance(input: {
  hoursSinceAccess: number;
  accessCount: number;
  hasOutcomeLink: boolean;
}): number {
  const score =
    IMPORTANCE_WEIGHTS.recency * recencyComponent(input.hoursSinceAccess) +
    IMPORTANCE_WEIGHTS.frequency * frequencyComponent(input.accessCount) +
    IMPORTANCE_WEIGHTS.outcomeLink * outcomeLinkComponent(input.hasOutcomeLink);
  return Math.round(Math.min(1, Math.max(0, score)) * 1e6) / 1e6;
}

// ═══════════════ قواعد گذار (فصل ۴.۲ سند طراحی) ═══════════════

/** ورودی قواعد گذار — دادهٔ گردآوری‌شدهٔ سرویس (نه خود رکورد Prisma) */
export interface MemoryTransitionInput {
  category: MemoryCategory;
  /** روز از آخرین دسترسی */
  daysSinceAccess: number;
  /** ساعت از آخرین دسترسی (برای بیداری — دقت‌تر) */
  hoursSinceAccess: number;
  importanceScore: number;
}

/** حکم گذار برای یک رکورد حافظه */
export interface TransitionVerdict {
  from: MemoryCategory;
  to: MemoryCategory | null; // null = بدون تغییر
  action: "promote" | "demote" | "awaken" | "hold";
  reason: string; // فارسی — شاهد audit
}

/**
 * قاعدهٔ گذار یک رکورد — خالص و قطعی (همان ورودی ⇒ همان خروجی).
 * ترتیب ارزیابی: بیداری (cold) → ارتقا (hot) → تنزل (warm).
 */
export function decideTransition(m: MemoryTransitionInput): TransitionVerdict {
  const t = CONSOLIDATION_THRESHOLDS;

  // ۱) بیداری: cold + دسترسی تازه (پنجرهٔ ۴۸h) + جهش امتیاز
  if (
    m.category === "cold" &&
    m.hoursSinceAccess <= t.awakenWindowHours &&
    m.importanceScore >= t.awakenScore
  ) {
    return { from: m.category, to: "warm", action: "awaken", reason: `بیداری از سرد — دسترسی تازه و امتیاز ${m.importanceScore} ≥ ${t.awakenScore}` };
  }

  // ۲) ارتقا: hot + عمر > ۷ روز + امتیاز ≥ ۰٫۷
  if (m.category === "hot" && m.daysSinceAccess > t.hotDays) {
    if (m.importanceScore >= t.promoteScore) {
      return { from: m.category, to: "warm", action: "promote", reason: `ارتقا داغ→گرم — عمر ${m.daysSinceAccess} روز و امتیاز ${m.importanceScore} ≥ ${t.promoteScore}` };
    }
    // امتیاز کافی نیست ولی رکورد حذف نمی‌شود (دادهٔ مقدس) — تا پنجرهٔ ۳۰ روزه می‌ماند و بعد در مسیر تنزل cold
    return { from: m.category, to: null, action: "hold", reason: `داغِ کم‌امتیاز — می‌ماند تا پنجرهٔ تنزل (داده حذف نمی‌شود)` };
  }

  // ۳) تنزل: warm + عمر > ۳۰ روز + امتیاز < ۰٫۳
  if (m.category === "warm" && m.daysSinceAccess > t.warmDays) {
    if (m.importanceScore < t.demoteScore) {
      return { from: m.category, to: "cold", action: "demote", reason: `تنزل گرم→سرد — عمر ${m.daysSinceAccess} روز و امتیاز ${m.importanceScore} < ${t.demoteScore}` };
    }
    return { from: m.category, to: null, action: "hold", reason: `گرم پابرجا — امتیاز ${m.importanceScore} بالای آستانهٔ تنزل` };
  }

  return { from: m.category, to: null, action: "hold", reason: "بدون تغییر — شرایط گذار برقرار نیست" };
}

// ═══════════════ سقف اجرای تثبیت (حفاظت شب‌های اولیه) ═══════════════

/** سقف رکورد در هر اجرای تثبیت — پیوست د سند طراحی */
export const CONSOLIDATION_BATCH_LIMIT = 5000;

/** شمار ساعت‌های پیش‌فرض سیاست نگهداری (seed — قابل تنظیم در RetentionPolicy) */
export const DEFAULT_RETENTION_DAYS: Readonly<Record<MemoryCategory, number>> = { hot: 7, warm: 30, cold: 365 };

/** فشرده‌سازی پیش‌فرض (فعلاً none — مسیر رشد فصل ۱۰) */
export const DEFAULT_RETENTION_COMPRESSION = "none" as const;
