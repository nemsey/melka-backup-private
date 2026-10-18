/**
 * کمربند ایمنی تصمیم — قفل زمانی سه‌سطحی (PN-025 / فاز ۱۳-ج / ستون ۴)
 * ---------------------------------------------------------------------------
 * سه قفل (عین سفارش): TTL ۷ روز · Cooldown ۴۸ ساعت · RateLimit ۱۰/روز + ۳/دسته
 * ترتیب ارزیابی: TTL → Cooldown → RateLimit (ارزان‌ترین و قطعی‌ترین اول).
 *
 * قید مطلق (قانون ۱۱ ابدی): autoExecute: false در سطح نوع TypeScript —
 * صفر اجرای واقعی؛ این ماژول فقط «می‌گوید» و «صبر می‌کند».
 *
 * خلوص لایهٔ هوش: هیچ وابستگی به DB و هیچ فراخوانی شبکه‌ای (گارد audit-intelligence-boundary).
 */

/** قفل نوعی صفر-اجرا — تنها مقادیر مجاز این نوع، همین دو لفظ است */
export type NeverExecute = { autoExecute: false; requiresApproval: true };

// ═══════════════ ثابت‌های لفظی کمربند (عین سفارش — قفل نوع) ═══════════════

export const DECISION_LOCK_CONSTANTS = {
  /** ۷ روز — ثانیه */
  ttlSeconds: (7 * 24 * 3600) as 604800,
  /** ۴۸ ساعت */
  cooldownHours: 48 as 48,
  /** سقف روزانه به ازای هر کارشناس */
  ratePerDay: 10 as 10,
  /** سقف روزانه به ازای هر بستر+دسته */
  ratePerCategory: 3 as 3,
} as const;

/** دسته‌های تصمیم — شش کد معتبر */
export const DECISION_CATEGORIES = ["CALL", "PRICE", "IMAGE", "REPOST", "MATCH", "FOLLOWUP"] as const;
export type DecisionCategory = (typeof DECISION_CATEGORIES)[number];

/** قرارداد قفل — عین سفارش (ستون ۴) */
export interface DecisionLock extends NeverExecute {
  decisionId: string;
  category: DecisionCategory;
  ttl: 604800;           // 7 * 24 * 3600 — literal
  cooldownHours: 48;     // literal
  rateLimit: { perDay: 10; perCategory: 3 }; // literal
}

/** ورودی ارزیابی کمربند — دادهٔ گردآوری‌شدهٔ سرویس */
export interface LockEvaluationInput {
  /** سن آخرین توصیهٔ ارائه‌شدهٔ همین بستر+دسته به ساعت — null یعنی هرگز نبوده */
  hoursSinceLastAdvice: number | null;
  /** آیا دادهٔ شاهد بستر از آخرین توصیه تغییر معنادار کرده؟ (قیمت/وضعیت) */
  evidenceChangedSinceLast: boolean;
  /** شمار توصیه‌های ارائه‌شده به این کارشناس در روز جاری (تقویم سرور) */
  advisorCountToday: number;
  /** شمار توصیه‌های همین بستر+دسته در روز جاری */
  categoryCountToday: number;
}

/** حکم کمربند */
export interface LockVerdict {
  locked: boolean;
  reason?: "ttl" | "cooldown" | "rate-day" | "rate-category";
  message?: string;      // پیام فارسی — قالب‌های L_*
  remainingHours?: number; // برای cooldown — اطلاع‌رسانی
}

/**
 * ارزیابی سه‌قفلی — خالص و قطعی.
 *
 * نکتهٔ مهم (فصل ۷.۲ سند طراحی): TTL در این نقطه «توصیهٔ درخواستیِ تازه» را
 * نمی‌سنجد (توصیهٔ تازه تازه ساخته می‌شود) — سرویس پیش از ساخت، توصیهٔ
 * ذخیره‌شدهٔ منقضی را با evaluateTtl رد می‌کند و اینجا فقط سه قفل ارائه می‌آید.
 * استثنای Cooldown: تغییر معنادار داده ⇒ قفل کنار (L_UPDATED_SINCE).
 */
export function evaluateLock(input: LockEvaluationInput): LockVerdict {
  const c = DECISION_LOCK_CONSTANTS;

  // ── قفل ۱: TTL منطقی — اگر آخرین توصیه هنوز «جوان» است و داده عوض نشده، تکرار ممنوع (L_NO_SPAM) ──
  if (input.hoursSinceLastAdvice !== null && input.hoursSinceLastAdvice <= 0.05 && !input.evidenceChangedSinceLast) {
    return { locked: true, reason: "ttl", message: "توصیهٔ قبلی هنوز معتبر است — تا انقضا تکرار نمی‌شود" };
  }

  // ── قفل ۲: Cooldown ۴۸ ساعته هم‌دسته ──
  if (
    input.hoursSinceLastAdvice !== null &&
    input.hoursSinceLastAdvice < c.cooldownHours &&
    !input.evidenceChangedSinceLast
  ) {
    return {
      locked: true,
      reason: "cooldown",
      message: "توصیهٔ مشابه برای این بستر ارائه شده — کمیته صبر می‌کند",
      remainingHours: Math.max(1, Math.round(c.cooldownHours - input.hoursSinceLastAdvice)),
    };
  }

  // ── قفل ۳a: سقف روزانهٔ کارشناس ──
  if (input.advisorCountToday >= c.ratePerDay) {
    return { locked: true, reason: "rate-day", message: "سقف توصیه‌های امروز پر شده — فردا صبح اولین توصیه همین‌جا است" };
  }

  // ── قفل ۳b: سقف روزانهٔ بستر+دسته ──
  if (input.categoryCountToday >= c.ratePerCategory) {
    return { locked: true, reason: "rate-category", message: "سقف توصیه‌های این دسته برای امروز پر شده" };
  }

  return { locked: false };
}

/**
 * داوری انقضای توصیهٔ ذخیره‌شده — آیا هنوز قابل ارائه است؟
 * توصیهٔ منقضی هرگز ارائه نمی‌شود؛ فقط برای audit می‌ماند (دادهٔ مقدس).
 */
export function evaluateTtl(createdAtIso: string, nowIso: string = new Date().toISOString()): { expired: boolean; ageHours: number } {
  const ageMs = new Date(nowIso).getTime() - new Date(createdAtIso).getTime();
  const ageHours = ageMs / 3_600_000;
  return { expired: ageHours > DECISION_LOCK_CONSTANTS.ttlSeconds / 3600, ageHours };
}

/** تاریخ انقضای یک توصیهٔ تازه — امروز + ۷ روز (تقویم ISO) */
export function expiryFromNow(nowIso: string = new Date().toISOString()): string {
  return new Date(new Date(nowIso).getTime() + DECISION_LOCK_CONSTANTS.ttlSeconds * 1000).toISOString();
}

/**
 * ساخت قفل برای یک تصمیم — خروجی همیشه literal (قانون ۱۱).
 * تلاش برای مقدار غیر لفظی ⇒ خطای کامپایل (نه runtime).
 */
export function buildDecisionLock(decisionId: string, category: DecisionCategory): DecisionLock {
  if (!DECISION_CATEGORIES.includes(category)) {
    throw new Error(`[decision-lock] دستهٔ تصمیم ناشناخته: ${category}`);
  }
  return {
    decisionId,
    category,
    autoExecute: false,      // قید لفظی — تنها مقدار مجاز
    requiresApproval: true,   // قید لفظی — تنها مقدار مجاز
    ttl: DECISION_LOCK_CONSTANTS.ttlSeconds,
    cooldownHours: DECISION_LOCK_CONSTANTS.cooldownHours,
    rateLimit: { perDay: DECISION_LOCK_CONSTANTS.ratePerDay, perCategory: DECISION_LOCK_CONSTANTS.ratePerCategory },
  };
}
