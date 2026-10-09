/**
 * بودجهٔ توجه — PN-023-A (فاز ۱۳-الف) · موتور ۱۲
 * ---------------------------------------------------------------------------
 * «هر لحظه فقط به N مورد توجه — صفر توجه به بقیه، بدون بودجه»
 *
 * سیاستِ بودجه جدا از محاسبهٔ امتیاز (سند طراحی فصل ۸.۳):
 *   AttentionEngine.rank بودجهٔ خام می‌گیرد؛ لایهٔ فراخوان آن را از این‌جا
 *   می‌گیرد — تست‌پذیری هر دو مستقل.
 *
 * خالص: صفر وابستگی به DB/زمان سیستم.
 */

export type AttentionBudgetLevel = "CRITICAL" | "DAILY" | "WEEKLY" | "MONTHLY";

export interface BudgetSpec {
  maxItems: number;
  refreshHours: number;
  /** روایت فارسی کاربرد */
  purpose: string;
}

/** چهار سطح بودجهٔ توجه (عین جدول فصل ۸.۱ سند طراحی) */
export const ATTENTION_BUDGETS: Readonly<Record<AttentionBudgetLevel, BudgetSpec>> = {
  CRITICAL: { maxItems: 5, refreshHours: 1, purpose: "تصمیم فوری — پنج موردِ همین ساعت" },
  DAILY: { maxItems: 10, refreshHours: 24, purpose: "لیست صبح — ده موردِ روز" },
  WEEKLY: { maxItems: 50, refreshHours: 168, purpose: "بررسی هفتگی — پنجاه مورد" },
  MONTHLY: { maxItems: 500, refreshHours: 720, purpose: "تحلیل ماهانه — پانصد مورد" },
};

/** مشخصات یک سطح — سطح نامعتبر = خطای صریح (صفر سکوت) */
export function budgetFor(level: AttentionBudgetLevel): BudgetSpec {
  const spec = ATTENTION_BUDGETS[level];
  if (!spec) {
    throw new Error(`سطح بودجهٔ توجه نامعتبر: «${String(level)}» — سطوح مجاز: CRITICAL · DAILY · WEEKLY · MONTHLY.`);
  }
  return spec;
}

/**
 * برش بودجه — سقف سطح، نه هدف:
 *   clampBudget(37, "DAILY") = 10   (درخواست بزرگ‌تر از سقف ⇒ سقف)
 *   clampBudget(3, "DAILY") = 3     (کمتر از سقف مجاز — بودجه سقف است)
 *   clampBudget(-1, "DAILY") = 0     (منفی = بی‌توجهی)
 */
export function clampBudget(requested: number, level: AttentionBudgetLevel): number {
  const max = budgetFor(level).maxItems;
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return Math.min(Math.floor(requested), max);
}

/** بزرگ‌ترین سطحی که n در گنجایش آن جا می‌شود — 7→DAILY · 30→WEEKLY · 0/1→CRITICAL */
export function levelForCount(n: number): AttentionBudgetLevel {
  if (!Number.isFinite(n) || n <= ATTENTION_BUDGETS.CRITICAL.maxItems) return "CRITICAL";
  if (n <= ATTENTION_BUDGETS.DAILY.maxItems) return "DAILY";
  if (n <= ATTENTION_BUDGETS.WEEKLY.maxItems) return "WEEKLY";
  return "MONTHLY";
}
