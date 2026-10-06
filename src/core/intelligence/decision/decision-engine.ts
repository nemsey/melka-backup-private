/**
 * بدنهٔ موتور تصمیم (DecisionEngineImpl) — PHASE 8
 * ------------------------------------------------------
 * ترکیب سه منبع — پیش‌بینی + قواعد (سیاست فعال) + ایمنی → تصمیم قابل‌توضیح.
 * نوبت معماری‌پذیرِ «وزن‌دهی بینش» امروزی (قرارداد v1)؛ خالص و بازتولیدپذیر.
 *
 * فرمول امتیاز (بازرسی‌پذیر — DECISION_RULES):
 *   score = w(domain) × severityMult(severity) × (1 + 0.5 × probability)
 *   - w(domain) = وزن سیاست فعال برای دامنهٔ نامزد (پیش‌فرض ۱)
 *   - severityMult: critical=3 · warning=2 · positive=1.5 · info=1
 *   - probability = احتمال پیش‌بینی نامزد (0..1) یا 0.5 خنثی بدون پیش‌بینی
 *   سقف امتیاز = clamp به بازهٔ (0, 10] برای ثبات نمایش.
 *
 * قواعد رتبه‌بندی:
 *  - DEC-001: مرتب‌سازی نزولی score؛ تساوی = ترتیب ورود (پایدار).
 *  - DEC-002: requiresApproval هر نامزد از SafetyEngine تزریقی؛ بدون آن
 *    قاعدهٔ سخت درون‌خطی (affectsExternalSystem ∨ isDestructive).
 *  - DEC-003: فرادادهٔ ایمنی نامزدها در قابلیت افزودنی candidateMeta
 *    منتقل می‌شود (برای ActionPlanner — duck-typing اختیاری).
 *
 * مرز: هرگز اقدام اجرا نمی‌کند (کار ActionPlanner) — قرارداد v1.
 */

import type {
  DecisionCandidate,
  DecisionEngine,
  DecisionQuery,
  DecisionResult,
  RankedDecision,
} from "../engines/decision";
import type { SafetyEngine, SafetyProposal } from "../engines/safety";
import { assessSafetyRules } from "../safety/safety-engine";

/** ضریب شدت — جدول ثابت و بازرسی‌پذیر */
export const SEVERITY_MULTIPLIERS: Record<string, number> = {
  critical: 3,
  warning: 2,
  positive: 1.5,
  info: 1,
};

/** ضریب پیش‌بینی و سقف امتیاز */
export const PROBABILITY_FACTOR = 0.5;
export const NEUTRAL_PROBABILITY = 0.5;
export const MAX_SCORE = 10;

/**
 * خواندن احتمال از پیش‌بینی نامزد — قرارداد v1 (PredictionResult) فیلد
 * probability ندارد؛ predictedValue واحد احتمال (unit="probability")
 * مرجع است؛ در غیر این صورت نقطهٔ خنثی ۰٫۵ (بدون حدس).
 */
export function candidateProbability(prediction: DecisionCandidate["prediction"]): number {
  if (!prediction) return NEUTRAL_PROBABILITY;
  if (prediction.unit === "probability" && typeof prediction.predictedValue === "number") {
    return Math.min(1, Math.max(0, prediction.predictedValue));
  }
  return NEUTRAL_PROBABILITY;
}

/** امتیاز خالص یک نامزد — ممیزی‌پذیر بدون موتور */
export function scoreCandidate(candidate: DecisionCandidate, domainWeight: number): number {
  const severityMult = SEVERITY_MULTIPLIERS[candidate.severity] ?? 1;
  const probability = candidateProbability(candidate.prediction);
  const raw = domainWeight * severityMult * (1 + PROBABILITY_FACTOR * probability);
  return Math.min(MAX_SCORE, Math.max(0, Math.round(raw * 1000) / 1000));
}

export interface DecisionEngineOptions {
  safety?: SafetyEngine;
}

export class DecisionEngineImpl implements DecisionEngine {
  readonly contractVersion = 1 as const;

  private readonly safety: SafetyEngine | null;

  constructor(options: DecisionEngineOptions = {}) {
    this.safety = options.safety ?? null;
  }

  async decide(query: DecisionQuery): Promise<DecisionResult> {
    const weights = query.policy.weights ?? {};
    const appliedRuleIds = ["DEC-001"];
    const ranked: RankedDecision[] = [];
    const candidateMeta: Record<string, Record<string, unknown>> = {};

    for (const candidate of query.candidates) {
      const domainWeight = typeof weights[candidate.domain] === "number" ? (weights[candidate.domain] as number) : 1;
      const score = scoreCandidate(candidate, domainWeight);
      const meta = candidate.metadata ?? {};

      // DEC-002 — ایمنی: موتور تزریقی یا قاعدهٔ سخت درون‌خطی
      const proposal: SafetyProposal = {
        kind: "DECISION",
        description: `${candidate.key} (${candidate.domain})`,
        affectsExternalSystem: meta.affectsExternalSystem === true,
        isDestructive: meta.isDestructive === true,
        estimatedCost: typeof meta.estimatedCost === "number" ? meta.estimatedCost : undefined,
      };
      const verdict = this.safety
        ? await this.safety.assess({ context: query.context, proposal })
        : assessSafetyRules(proposal);
      if (verdict.requiredApproval && !appliedRuleIds.includes("DEC-002")) appliedRuleIds.push("DEC-002");

      // DEC-003 — انتقال فرادادهٔ ایمنی برای برنامه‌ریز اقدام
      candidateMeta[candidate.key] = {
        affectsExternalSystem: proposal.affectsExternalSystem,
        isDestructive: proposal.isDestructive,
        estimatedCost: proposal.estimatedCost,
        domain: candidate.domain,
        severity: candidate.severity,
      };

      ranked.push({
        key: candidate.key,
        score,
        rationale: `وزن دامنه ${domainWeight} × شدت ${SEVERITY_MULTIPLIERS[candidate.severity] ?? 1} × پیش‌بینی ${
          candidate.prediction ? candidateProbability(candidate.prediction).toFixed(2) : "۰٫۵ (خنثی)"
        } — ${verdict.requiredApproval ? "نیازمند تأیید" : "بدون تأیید"} (${verdict.ruleIds.join("+")})`,
        requiresApproval: verdict.requiredApproval,
      });
    }

    // DEC-001 — نزولی پایدار
    const sorted = ranked
      .map((r, i) => ({ r, i }))
      .sort((a, b) => (b.r.score - a.r.score !== 0 ? b.r.score - a.r.score : a.i - b.i))
      .map((x) => x.r);

    const result: DecisionResult = {
      ranked: sorted,
      topKey: sorted[0]?.key ?? "",
      appliedRuleIds,
    };
    // قابلیت افزودنی — مصرف duck-typing توسط ActionPlanner (اختیاری)
    (result as DecisionResult & { candidateMeta?: Record<string, Record<string, unknown>> }).candidateMeta =
      candidateMeta;
    return result;
  }
}

/** کارخانه — الگوی فازهای ۴ تا ۶ */
export function createDecisionEngine(options: DecisionEngineOptions = {}): DecisionEngineImpl {
  return new DecisionEngineImpl(options);
}
