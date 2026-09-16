/**
 * قرارداد موتور ایمنی (SafetyEngine) — PHASE 3 / interface خالص
 * ------------------------------------------------------
 * مسئولیت: دروازه تأیید انسانی — طبقه‌بندی ریسک هر تصمیم/اقدام پیش از
 * اجرا و تعیین requiredApproval. هیچ اقدام HIGH هرگز بدون تأیید صریح
 * مالک اجرا نمی‌شود (قاعده سازنده).
 *
 * قاعده سخت قراردادی:
 *   affectsExternalSystem ∨ isDestructive  →  همیشه requiredApproval = true
 *
 * مرز (قوانین اجرایی):
 *  - قواعد در PHASE 3 به‌صورت ثابت‌های قراردادی اعلام شده‌اند (فهرست بالا)؛
 *    بدنه قاعده‌محرک واقعی + AuditLog در PHASE 4-7.
 *  - صفر اجرای اقدام.
 *
 * نسخه قرارداد: 1.
 * فاز پیاده‌سازی بدنه: PHASE 7 (همزمان ActionPlanner). در PHASE 3 فقط قرارداد.
 */

import type { AgentContext } from "./context";

export type SafetyProposalKind = "DECISION" | "ACTION" | "POLICY_CHANGE";

export type SafetyRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface SafetyProposal {
  kind: SafetyProposalKind;
  description: string;
  /** اقدام روی سامانه خارجی (آرم/پیامک/دیوار) */
  affectsExternalSystem: boolean;
  /** اقدام مخرب/غیرقابل بازگشت */
  isDestructive: boolean;
  estimatedCost?: number;
}

export interface SafetyQuery {
  context: AgentContext;
  proposal: SafetyProposal;
}

export interface SafetyVerdict {
  riskLevel: SafetyRiskLevel;
  requiredApproval: boolean;
  reason: string;
  ruleIds: string[];
}

export interface SafetyEngine {
  readonly contractVersion: 1;
  assess(query: SafetyQuery): Promise<SafetyVerdict>;
}
