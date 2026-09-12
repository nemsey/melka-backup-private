/**
 * سیاست (Policy) ایجنت — نسخه‌بندی‌شده و قابل بازگشت
 * ------------------------------------------------------
 * هر ایجنت یک «سیاست فعال» دارد که اولویت نمایش بینش‌ها را تعیین می‌کند.
 * سیاست هرگز بازنویسی نمی‌شود؛ هر به‌روزرسانی = نسخه جدید.
 * نسخه‌های قبلی برای Rollback باقی می‌مانند.
 */

export interface AgentPolicyContent {
  /** وزن نمایش هر دسته بینش (بیشتر = مهم‌تر) */
  weights: Record<string, number>;
  /** حداکثر تعداد بینش نمایش‌داده‌شده */
  maxInsights: number;
}

export interface AgentPolicyRecord {
  id: string;
  tileId: string;
  version: number;
  content: AgentPolicyContent;
  rationale: string;
  active: boolean;
  createdAt: string;
  activatedAt: string | null;
}

/** سیاست اولیه هر ایجنت — پیش از هر بازخوردی */
export function defaultPolicy(domains: readonly string[], maxInsights = 6): AgentPolicyContent {
  const weights: Record<string, number> = {};
  for (const d of domains) weights[d] = 1;
  return { weights, maxInsights };
}

export function clampWeight(w: number): number {
  return Math.min(1.8, Math.max(0.3, Math.round(w * 100) / 100));
}
