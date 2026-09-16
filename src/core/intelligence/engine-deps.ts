/**
 * ظرف تزریق موتورها (EngineDeps) — PHASE 3 / اسکلت
 * ------------------------------------------------------
 * قواعد ظرف (طبق سند طراحی PHASE-3-DESIGN.md بخش ۳):
 *  ۱) همه فیلدها اختیاری — نبودِ هر موتور = fallback به رفتار BaseLearningAgent
 *     (تضمین سازگاری عقب‌وار کامل).
 *  ۲) سازنده پیش‌فرض در PHASE 3 فقط Placeholder خنثی می‌سازد؛ فازهای بعد
 *     پیاده‌سازی‌های واقعی را بدون تغییر امضا جایگزین می‌کنند.
 *  ۳) تست‌ها می‌توانند هر زیرمجموعه‌ای از موتورها را stub کنند.
 *
 * ⚠️ اعلام صادقانه (قانون H): هیچ موتور «آماده» نیست — این فایل فقط
 * «جای موتورها» را تعریف می‌کند. مصرف واقعی از PHASE 4 آغاز می‌شود.
 */

import type { ContextEngine, ContextQuery, AgentContext } from "./engines/context";
import type { MemoryEngine } from "./engines/memory";
import type { RetrievalEngine } from "./engines/retrieval";
import type { FeatureEngine } from "./engines/feature";
import type { PredictionEngine } from "./engines/prediction";
import type { DecisionEngine } from "./engines/decision";
import type { ActionPlannerEngine } from "./engines/action-planner";
import type { OutcomeEngine } from "./engines/outcome";
import type { EvaluationEngine } from "./engines/evaluation";
import type { LearningEngine } from "./engines/learning";
import type { SafetyEngine } from "./engines/safety";
import type { PredictionRepository } from "./prediction/prediction-repository";

// ===================== ظرف تزریق =====================

export interface EngineDeps {
  context?: ContextEngine;
  memory?: MemoryEngine;
  retrieval?: RetrievalEngine;
  feature?: FeatureEngine;
  prediction?: PredictionEngine;
  decision?: DecisionEngine;
  actionPlanner?: ActionPlannerEngine;
  outcome?: OutcomeEngine;
  evaluation?: EvaluationEngine;
  learning?: LearningEngine;
  safety?: SafetyEngine;
  /**
   * PHASE 6 (P6-06) — فیلد افزودنی اختیاری: انبار پیش‌بینی برای متد
   * predict ایجنت. غیبتش = رفتار قبل (ذخیره نمی‌شود). افزودنی — همه
   * مصرف‌کننده‌های موجود EngineDeps بدون تغییر معتبر می‌مانند.
   */
  predictionRepository?: PredictionRepository;
}

// ===================== Placeholder خنثی زمینه =====================

/**
 * Placeholder خنثی موتور زمینه — طبق استراتژی P3-03:
 * فقط tileId + مهر زمان + purpose؛ هیچ اثری روی خروجی ایجنت ندارد.
 * بدنه واقعی (غنی‌سازی با داده/کاربر/پیکربندی) در PHASE 4 ساخته می‌شود.
 */
export class PassthroughContextEngine implements ContextEngine {
  readonly contractVersion = 1 as const;

  async buildContext(query: ContextQuery): Promise<AgentContext> {
    const asOf = query.asOf ?? new Date();
    return {
      tileId: query.tileId,
      generatedAt: asOf.toISOString(),
      purpose: query.purpose,
    };
  }
}

// ===================== کارخانه پیش‌فرض =====================

/**
 * موتورهای پیش‌فرض PHASE 3 — فقط Placeholder خنثی زمینه.
 * ده موتور دیگر عمداً «غیرحاضر» (undefined) هستند: نبودِ آن‌ها یعنی
 * fallback کامل به رفتار ارث‌بری‌شده از BaseLearningAgent — این همان
 * تضمین «خروجی بایت‌به‌بایت یکسان» در P3-03 است.
 */
export function createDefaultEngineDeps(): EngineDeps {
  return {
    context: new PassthroughContextEngine(),
  };
}
