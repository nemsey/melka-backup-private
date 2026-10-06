/**
 * بدنهٔ برنامه‌ریز اقدام (ActionPlannerEngineImpl) — PHASE 7
 * ------------------------------------------------------
 * تبدیل تصمیم رتبه‌بندی‌شده به برنامهٔ اقدام مشتری‌محور — فقط برنامه
 * می‌سازد، هرگز اجرا نمی‌کند (قرارداد v1).
 *
 * قواعد ساخت گام (بازرسی‌پذیر — PLANNER_RULES):
 *  - ترتیب گام‌ها = ترتیب رتبهٔ تصمیم (score نزولی)؛ سقف MAX_STEPS.
 *  - هر گام: شناسهٔ پایدار (رتبه + کلید)، عنوان فارسی، دلیل (rationale
 *    تصمیم + دلیل ایمنی)، uiAction = نگاشت دامنه به کلید UI موجود.
 *  - پرچم‌های ایمنی هر نامزد (affectsExternalSystem/isDestructive/
 *    estimatedCost) از قابلیت افزودنی «candidateMeta» موتور تصمیم خوانده
 *    می‌شود (duck-typing — الگوی P4-06/P6-06)؛ بدون آن = گام داخلی کم‌ریسک.
 *  - requiredApproval از SafetyEngine تزریقی؛ بدون آن، قاعدهٔ سخت قراردادی
 *    (affectsExternalSystem ∨ isDestructive → true) به‌صورت درون‌خطی اعمال
 *    می‌شود — قاعدهٔ سخت هرگز قابل دورزدن نیست.
 *  - riskLevel از verdict ایمنی (نگاشت یک‌به‌یک).
 *
 * مرز: صفر اجرای اقدام / صفر عارضهٔ جانبی (قرارداد v1).
 */

import type {
  ActionPlan,
  ActionPlanQuery,
  ActionPlannerEngine,
  ActionRiskLevel,
  ActionStep,
} from "../engines/action-planner";
import type { SafetyEngine, SafetyProposal } from "../engines/safety";
import { assessSafetyRules } from "../safety/safety-engine";

/** نگاشت دامنهٔ تصمیم → کلید/مؤلفهٔ UI موجود (بدون تغییر UI — قرارداد v1) */
export const PLANNER_UI_ACTIONS: Record<string, string> = {
  transactions: "tile:transactions-contracts:open",
  experts: "tile:experts:open",
  listing: "tile:arm-listing:open",
  request: "tile:arm-request:open",
  fileFinder: "tile:file-finder:open",
  settings: "tile:settings:open",
};

/** چند تصمیم برتر به گام تبدیل می‌شوند — سقف صریح و ثابت */
export const MAX_STEPS = 5;

export interface ActionPlannerEngineOptions {
  safety?: SafetyEngine;
}

/**
 * قابلیت افزودنی موتور تصمیم — نگاشت key → فرادادهٔ ایمنی نامزد.
 * موتور تصمیم (DecisionEngineImpl) این قابلیت را فراهم می‌کند؛ هر
 * پیاده‌سازی دیگر بدون آن نیز کاملاً معتبر است (duck-typing اختیاری).
 */
export interface DecisionCandidateMeta {
  candidateMeta?: Record<string, Record<string, unknown>>;
}

export class ActionPlannerEngineImpl implements ActionPlannerEngine {
  readonly contractVersion = 1 as const;

  private readonly safety: SafetyEngine | null;

  constructor(options: ActionPlannerEngineOptions = {}) {
    this.safety = options.safety ?? null;
  }

  async plan(query: ActionPlanQuery): Promise<ActionPlan> {
    const steps: ActionStep[] = [];
    const top = query.decision.ranked.slice(0, MAX_STEPS);
    const meta = (query.decision as DecisionResultWithMeta).candidateMeta ?? {};

    for (let i = 0; i < top.length; i++) {
      const ranked = top[i]!;
      const candidateMeta = meta[ranked.key] ?? {};
      const proposal: SafetyProposal = {
        kind: "ACTION",
        description: ranked.rationale || ranked.key,
        affectsExternalSystem: candidateMeta.affectsExternalSystem === true,
        isDestructive: candidateMeta.isDestructive === true,
        estimatedCost: typeof candidateMeta.estimatedCost === "number" ? candidateMeta.estimatedCost : undefined,
      };

      // مشورت ایمنی — یا موتور تزریقی، یا قاعدهٔ سخت درون‌خطی (غیرقابل‌دورزدن)
      const verdict = this.safety
        ? await this.safety.assess({ context: query.context, proposal })
        : assessSafetyRules(proposal);

      steps.push({
        id: `step-${i + 1}-${ranked.key}`,
        title: `اقدام ${i + 1}: ${ranked.key}`,
        rationale: `${ranked.rationale} — ایمنی: ${verdict.reason}`,
        uiAction: PLANNER_UI_ACTIONS[ranked.key.split(":")[0] ?? ""] ?? undefined,
        requiredApproval: verdict.requiredApproval || ranked.requiresApproval,
        riskLevel: verdict.riskLevel as ActionRiskLevel,
      });
    }

    return { steps, createdAt: new Date().toISOString() };
  }
}

/** نمای داخلی برای duck-typing قابلیت افزودنی candidateMeta */
type DecisionResultWithMeta = ActionPlanQuery["decision"] & DecisionCandidateMeta;

/** کارخانه — الگوی فازهای ۴ تا ۶ */
export function createActionPlannerEngine(
  options: ActionPlannerEngineOptions = {},
): ActionPlannerEngineImpl {
  return new ActionPlannerEngineImpl(options);
}
