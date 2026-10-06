/**
 * بدنهٔ موتور ایمنی (SafetyEngineImpl) — PHASE 7
 * ------------------------------------------------------
 * دروازهٔ تأیید انسانی — قواعد صریح، بازتولیدپذیر و قابل‌ممیزی.
 *
 * قاعدهٔ سخت قراردادی (قابل‌نقض‌ناپذیر — engines/safety.ts):
 *   affectsExternalSystem ∨ isDestructive  →  requiredApproval = true
 *
 * جدول قواعد (ruleIds بازرسی‌پذیر):
 *  - SAF-001 (سخت): اقدام روی سامانهٔ خارجی (آرم/پیامک/دیوار) →
 *    تأیید الزامی + ریسک حداقل MEDIUM.
 *  - SAF-002 (سخت): اقدام مخرب/غیرقابل‌بازگشت → تأیید الزامی + ریسک HIGH.
 *  - SAF-003: هزینهٔ برآوردی ≥ آستانه (پیش‌فرض ۱٬۰۰۰٬۰۰۰ تومان) →
 *    تأیید الزامی + ریسک MEDIUM.
 *  - SAF-004: تغییر سیاست (POLICY_CHANGE) → تأیید الزامی + ریسک MEDIUM
 *    (سیاست بر رفتار آیندهٔ همهٔ ایجنت‌ها اثر می‌گذارد).
 *  - SAF-005: توصیف خالی/نامعتبر → ریسک HIGH + تأیید (محافظه‌کارانه).
 *  - SAF-000: پیشنهاد کم‌ریسک معمول → LOW بدون تأیید.
 *
 * مرز: صفر عارضهٔ جانبی — خالص و بازتولیدپذیر (قرارداد v1).
 */

import type { SafetyEngine, SafetyQuery, SafetyVerdict } from "../engines/safety";

/** آستانهٔ هزینهٔ تأیید (تومان) — قابل‌تزریق برای تست؛ مقدار پیش‌فرض محافظه‌کارانه */
export const DEFAULT_COST_APPROVAL_THRESHOLD = 1_000_000;

export interface SafetyEngineOptions {
  costApprovalThreshold?: number;
}

/** ارزیابی جدول قواعد — خالص و هم‌ارز با assess (برای تست مستقیم ریاضی) */
export function assessSafetyRules(
  proposal: SafetyQuery["proposal"],
  costApprovalThreshold: number = DEFAULT_COST_APPROVAL_THRESHOLD,
): SafetyVerdict {
  const ruleIds: string[] = [];
  let requiredApproval = false;
  let riskLevel: SafetyVerdict["riskLevel"] = "LOW";
  const reasons: string[] = [];

  // SAF-005 — ورودی معتبر؟ (محافظه‌کارانه: توصیف خالی = HIGH)
  if (!proposal.description || proposal.description.trim() === "") {
    return {
      riskLevel: "HIGH",
      requiredApproval: true,
      reason: "SAF-005: توصیف پیشنهاد خالی است — ارزیابی ممکن نیست، تأیید انسانی الزامی",
      ruleIds: ["SAF-005"],
    };
  }

  // SAF-002 — مخرب/غیرقابل‌بازگشت (قاعدهٔ سخت)
  if (proposal.isDestructive) {
    requiredApproval = true;
    riskLevel = "HIGH";
    ruleIds.push("SAF-002");
    reasons.push("اقدام مخرب/غیرقابل‌بازگشت است");
  }

  // SAF-001 — سامانهٔ خارجی (قاعدهٔ سخت)
  if (proposal.affectsExternalSystem) {
    requiredApproval = true;
    if (riskLevel === "LOW") riskLevel = "MEDIUM";
    ruleIds.push("SAF-001");
    reasons.push("اقدام روی سامانهٔ خارجی (آرم/پیامک/دیوار) است");
  }

  // SAF-003 — هزینه
  if (typeof proposal.estimatedCost === "number" && proposal.estimatedCost >= costApprovalThreshold) {
    requiredApproval = true;
    if (riskLevel === "LOW") riskLevel = "MEDIUM";
    ruleIds.push("SAF-003");
    reasons.push(`هزینهٔ برآوردی (${proposal.estimatedCost}) ≥ آستانهٔ ${costApprovalThreshold}`);
  }

  // SAF-004 — تغییر سیاست
  if (proposal.kind === "POLICY_CHANGE") {
    requiredApproval = true;
    if (riskLevel === "LOW") riskLevel = "MEDIUM";
    ruleIds.push("SAF-004");
    reasons.push("تغییر سیاست بر رفتار آیندهٔ ایجنت‌ها اثر می‌گذارد");
  }

  if (ruleIds.length === 0) {
    ruleIds.push("SAF-000");
    return {
      riskLevel: "LOW",
      requiredApproval: false,
      reason: "SAF-000: پیشنهاد کم‌ریسک معمول — بدون تأیید انسانی قابل اجرا",
      ruleIds,
    };
  }

  return {
    riskLevel,
    requiredApproval,
    reason: `${ruleIds.join("+")}: ${reasons.join("؛ ")}`,
    ruleIds,
  };
}

export class SafetyEngineImpl implements SafetyEngine {
  readonly contractVersion = 1 as const;

  private readonly costApprovalThreshold: number;

  constructor(options: SafetyEngineOptions = {}) {
    this.costApprovalThreshold = options.costApprovalThreshold ?? DEFAULT_COST_APPROVAL_THRESHOLD;
  }

  async assess(query: SafetyQuery): Promise<SafetyVerdict> {
    return assessSafetyRules(query.proposal, this.costApprovalThreshold);
  }
}

/** کارخانه — الگوی فازهای ۴ تا ۶ */
export function createSafetyEngine(options: SafetyEngineOptions = {}): SafetyEngineImpl {
  return new SafetyEngineImpl(options);
}
