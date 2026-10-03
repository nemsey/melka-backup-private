/**
 * قرارداد برنامه‌ریز اقدام (ActionPlannerEngine) — PHASE 3 / interface خالص
 * ------------------------------------------------------
 * مسئولیت: تبدیل تصمیم به برنامه اقدام مشتری‌محور: گام‌های مرتب با ابزار
 * UI مربوطه + فیلد requiredApproval (دروازه انسانی — هر اقدام پرخطر/
 * پرهزینه/برون‌سازمانی پیش از اجرا تأیید صریح می‌خواهد).
 *
 * مرز (قوانین اجرایی):
 *  - فقط برنامه می‌سازد — هرگز اجرا نمی‌کند.
 *  - uiAction فقط شناسه کلید/مؤلفه UI موجود است (بدون تغییر UI در این فاز).
 *
 * نسخه قرارداد: 1.
 * فاز پیاده‌سازی بدنه: PHASE 7. در PHASE 3 فقط قرارداد.
 */

import type { AgentContext } from "./context";
import type { DecisionResult } from "./decision";

export type ActionRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface ActionPlanQuery {
  context: AgentContext;
  decision: DecisionResult;
}

export interface ActionStep {
  id: string;
  title: string;
  rationale: string;
  /** شناسه کلید/مؤلفه UI موجود — بدون تغییر UI در PHASE 3 */
  uiAction?: string;
  requiredApproval: boolean;
  riskLevel: ActionRiskLevel;
}

export interface ActionPlan {
  steps: ActionStep[];
  createdAt: string;
}

export interface ActionPlannerEngine {
  readonly contractVersion: 1;
  plan(query: ActionPlanQuery): Promise<ActionPlan>;
}
