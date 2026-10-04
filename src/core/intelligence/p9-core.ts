/**
 * PHASE 9 (سند ۰۲۷) — ارزیابی سیاست + حاکمیت
 * ---------------------------------------------------------------------------
 * فلسفه: «حاکمیت بدون ارزیابی، استبداد است. ارزیابی بدون حاکمیت، هرج‌ومرج است.»
 * سیستم قوانین خودش را ارزیابی می‌کند و قوانین ضعیف را بازنشسته می‌کند.
 */

import {
  type GovernanceCheckResult,
  type GovernancePolicy,
  type GovernanceRule,
  type LearningTier,
  type PolicyEvaluation,
  type PolicyType,
  type PolicyVerdict,
  evidenceLink,
} from "./contracts-p7-p11";

/* ═══════════════════ ۴.۳.۱ — Policy Evaluation Engine ═══════════════════ */

export interface PolicyTimelinePoint {
  at: string;
  effectiveness: number;
}

export interface PolicyAuditPoint {
  at: string;
  compliant: boolean;
}

export interface PolicySignal {
  policyId: string;
  policyType: PolicyType;
  /** رویدادهای پیامد مرتبط با سیاست: هر رویداد یک اثر مثبت/منفی/بی‌اثر */
  outcomeSignals: Array<"positive" | "negative" | "neutral">;
  timeline: PolicyTimelinePoint[];
  audits: PolicyAuditPoint[];
  /** ساعت صرف‌شدهٔ انسانی/سیستمی در پنجره */
  costHours: number;
  sideEffects?: string[];
}

export class PolicyEvaluationEngineImpl {
  /** اثربخشی: سهم رویدادهای مثبت از کل (صادقانه — رویداد منفی کسر می‌شود) */
  computeEffectiveness(signal: PolicySignal): number {
    const { outcomeSignals } = signal;
    if (outcomeSignals.length === 0) return 0;
    const pos = outcomeSignals.filter((s) => s === "positive").length;
    const neg = outcomeSignals.filter((s) => s === "negative").length;
    return Math.round(((pos - neg) / outcomeSignals.length) * 100) / 100;
  }

  /** پایداری: ۱ − نوسان نرمال‌شدهٔ اثربخشی در طول زمان */
  computeStability(signal: PolicySignal): number {
    if (signal.timeline.length < 2) return 1;
    const vals = signal.timeline.map((t) => t.effectiveness);
    const mean = vals.reduce((a, x) => a + x, 0) / vals.length;
    const variance = vals.reduce((a, x) => a + (x - mean) ** 2, 0) / vals.length;
    const std = Math.sqrt(variance);
    return Math.round(Math.max(0, 1 - std) * 100) / 100;
  }

  /** پایبندی: سمان بازرسی‌های سازگار */
  computeCompliance(signal: PolicySignal): number {
    if (signal.audits.length === 0) return 0;
    const ok = signal.audits.filter((a) => a.compliant).length;
    return Math.round((ok / signal.audits.length) * 100) / 100;
  }

  /** §۴.۳.۱ قواعد حکم:
   *  effectiveness ≥ 0.7 ∧ compliance ≥ 0.9 → keep
   *  effectiveness < 0.5 ∨ compliance < 0.7 → adjust
   *  effectiveness < 0.3 → retire
   */
  recommendVerdict(effectiveness: number, compliance: number): PolicyVerdict {
    if (effectiveness < 0.3) return "retire";
    if (effectiveness < 0.5 || compliance < 0.7) return "adjust";
    if (effectiveness >= 0.7 && compliance >= 0.9) return "keep";
    return "adjust";
  }

  /** ارزیابی کامل یک سیاست با حکم + دلیل فارسی */
  evaluatePolicy(signal: PolicySignal, window: { from: string; to: string }, tier: LearningTier): PolicyEvaluation {
    const effectiveness = this.computeEffectiveness(signal);
    const stability = this.computeStability(signal);
    const compliance = this.computeCompliance(signal);
    const verdict = this.recommendVerdict(effectiveness, compliance);
    const sideEffects = signal.sideEffects ?? [];
    const rationale =
      verdict === "keep"
        ? `اثربخشی ${effectiveness} و پایبندی ${compliance} هر دو در محدودهٔ مطلوب — سیاست ${signal.policyId} نگه داشته می‌شود.`
        : verdict === "retire"
          ? `اثربخشی ${effectiveness} زیر ۰٫۳ است — سیاست ${signal.policyId} بازنشسته می‌شود (منابع آزاد می‌شود).`
          : `اثربخشی ${effectiveness} / پایبندی ${compliance} در محدودهٔ اصلاح است — سیاست ${signal.policyId} نیازمند تنظیم مجدد.`;
    const evaluation: PolicyEvaluation = {
      id: `pe-${signal.policyId}-${Date.now().toString(36)}`,
      policyId: signal.policyId,
      policyType: signal.policyType,
      evaluatedAt: new Date().toISOString(),
      window,
      metrics: { effectiveness, stability, compliance, costImpact: signal.costHours, sideEffects },
      verdict,
      rationale,
      tier,
      evidenceChain: [
        evidenceLink("query", `policy:${signal.policyId}`, `${signal.outcomeSignals.length} رویداد · ${signal.audits.length} بازرسی`),
      ],
    };
    if (verdict === "adjust") {
      evaluation.recommendedChanges = [
        compliance < 0.7 ? "افزایش نظارت بر اجرای سیاست (پایبندی زیر ۰٫۷)" : "بازتنظیم پارامترهای اثربخشی",
      ];
    }
    return evaluation;
  }
}

/* ═══════════════════ ۴.۳.۲ — Governance Engine (۱۵ قاعده) ═══════════════════ */

/** ۱۵ قاعدهٔ حداقلی حاکمیت (§۴.۳.۲) */
export const GOVERNANCE_RULES: GovernanceRule[] = [
  { id: "GOV-DATA-001", scope: "data", description: "صفر دسترسی به داده شخصی بدون AuditLog", severity: "critical" },
  { id: "GOV-DATA-002", scope: "data", description: "صفر حذف بدون شاهد بکاپ", severity: "critical" },
  { id: "GOV-DATA-003", scope: "data", description: "صفر تغییر در لایهٔ Raw", severity: "critical" },
  { id: "GOV-DATA-004", scope: "data", description: "هر بازیابی از بکاپ، ثبت در AuditLog", severity: "high" },
  { id: "GOV-DATA-005", scope: "data", description: "ConsultantScope fail-closed", severity: "critical" },
  { id: "GOV-MODEL-001", scope: "model", description: "صفر تغییر مدل بدون تأیید شورا", severity: "critical" },
  { id: "GOV-MODEL-002", scope: "model", description: "هر تغییر مدل، قابل rollback", severity: "high" },
  { id: "GOV-MODEL-003", scope: "model", description: "هر مدل، حداقل ۲ نسخه‌اش حفظ شود", severity: "medium" },
  { id: "GOV-ACCESS-001", scope: "access", description: "هر نشست ۳۰ روز اعتبار", severity: "high" },
  { id: "GOV-ACCESS-002", scope: "access", description: "هر ورود، ثبت در AuditLog", severity: "high" },
  { id: "GOV-ACCESS-003", scope: "access", description: "صفر bypass روی OWNER-gate", severity: "critical" },
  { id: "GOV-ACCESS-004", scope: "access", description: "صفر اشتراک توکن بین کاربران", severity: "critical" },
  { id: "GOV-DECISION-001", scope: "decision", description: "صفر auto_execute", severity: "critical" },
  { id: "GOV-DECISION-002", scope: "decision", description: "هر تصمیم، ۹۰ روز حفظ شود", severity: "medium" },
  { id: "GOV-REPAIR-001", scope: "repair", description: "صفر ترمیم بدون تأیید شورا", severity: "critical" },
];

/** زمینهٔ واقعی برای بررسی قواعد — از وضعیت زندهٔ سیستم پر می‌شود */
export interface GovernanceContext {
  personalDataAccessWithoutAudit: number;
  deletionsWithoutBackupWitness: number;
  rawLayerMutations: number;
  backupRestoresLogged: number;
  backupRestoresTotal: number;
  consultantScopeFailOpen: number;
  modelChangesWithoutCouncil: number;
  modelChangesWithoutRollback: number;
  modelVersionsKept: number;
  sessionsOlderThan30d: number;
  loginsNotAudited: number;
  ownerGateBypasses: number;
  tokenSharingIncidents: number;
  autoExecuteViolations: number;
  decisionsKept90d: number;
  decisionsTotal: number;
  repairsWithoutCouncilApproval: number;
}

export const emptyGovernanceContext = (): GovernanceContext => ({
  personalDataAccessWithoutAudit: 0,
  deletionsWithoutBackupWitness: 0,
  rawLayerMutations: 0,
  backupRestoresLogged: 0,
  backupRestoresTotal: 0,
  consultantScopeFailOpen: 0,
  modelChangesWithoutCouncil: 0,
  modelChangesWithoutRollback: 0,
  modelVersionsKept: 2,
  sessionsOlderThan30d: 0,
  loginsNotAudited: 0,
  ownerGateBypasses: 0,
  tokenSharingIncidents: 0,
  autoExecuteViolations: 0,
  decisionsKept90d: 0,
  decisionsTotal: 0,
  repairsWithoutCouncilApproval: 0,
});

export class GovernanceEngineImpl {
  readonly policy: GovernancePolicy = {
    id: "governance-core-v1",
    scope: "data",
    rules: GOVERNANCE_RULES,
    enforcement: "strict",
    updatedAt: new Date().toISOString(),
    updatedBy: "council-027",
    evidenceChain: [evidenceLink("file", "src/core/intelligence/p9-core.ts", "۱۵ قاعدهٔ حاکمیت عین سند ۰۲۷ §۴.۳.۲")],
  };

  /** بررسی هر قاعده در برابر زمینهٔ واقعی — خروجی fail یعنی نقض */
  checkRule(rule: GovernanceRule, ctx: GovernanceContext): GovernanceCheckResult {
    const fail = (details: string): GovernanceCheckResult => ({ ruleId: rule.id, passed: false, severity: rule.severity, details });
    const pass = (details: string): GovernanceCheckResult => ({ ruleId: rule.id, passed: true, severity: rule.severity, details });
    switch (rule.id) {
      case "GOV-DATA-001":
        return ctx.personalDataAccessWithoutAudit === 0 ? pass("همهٔ دسترسی‌ها با AuditLog") : fail(`${ctx.personalDataAccessWithoutAudit} دسترسی بدون حسابرسی`);
      case "GOV-DATA-002":
        return ctx.deletionsWithoutBackupWitness === 0 ? pass("حذفی فقط با شاهد بکاپ") : fail(`${ctx.deletionsWithoutBackupWitness} حذف بدون شاهد`);
      case "GOV-DATA-003":
        return ctx.rawLayerMutations === 0 ? pass("لایهٔ Raw دست‌نخورده") : fail(`${ctx.rawLayerMutations} تغییر در Raw`);
      case "GOV-DATA-004":
        return ctx.backupRestoresTotal === 0 || ctx.backupRestoresLogged === ctx.backupRestoresTotal ? pass("بازیابی‌ها ثبت‌شده") : fail(`${ctx.backupRestoresTotal - ctx.backupRestoresLogged} بازیابی ثبت‌نشده`);
      case "GOV-DATA-005":
        return ctx.consultantScopeFailOpen === 0 ? pass("محدودهٔ مشاور fail-closed") : fail(`${ctx.consultantScopeFailOpen} مورد fail-open`);
      case "GOV-MODEL-001":
        return ctx.modelChangesWithoutCouncil === 0 ? pass("تغییر مدل فقط با شورا") : fail(`${ctx.modelChangesWithoutCouncil} تغییر بدون شورا`);
      case "GOV-MODEL-002":
        return ctx.modelChangesWithoutRollback === 0 ? pass("همهٔ تغییرها قابل بازگشت") : fail(`${ctx.modelChangesWithoutRollback} تغییر بدون rollback`);
      case "GOV-MODEL-003":
        return ctx.modelVersionsKept >= 2 ? pass(`${ctx.modelVersionsKept} نسخه محفوظ`) : fail("کمتر از ۲ نسخه");
      case "GOV-ACCESS-001":
        return ctx.sessionsOlderThan30d === 0 ? pass("نشست‌ها تازه") : fail(`${ctx.sessionsOlderThan30d} نشست بیش از ۳۰ روز`);
      case "GOV-ACCESS-002":
        return ctx.loginsNotAudited === 0 ? pass("ورودها ثبت‌شده") : fail(`${ctx.loginsNotAudited} ورود ثبت‌نشده`);
      case "GOV-ACCESS-003":
        return ctx.ownerGateBypasses === 0 ? pass("OWNER-gate دست‌نخورده") : fail(`${ctx.ownerGateBypasses} bypass`);
      case "GOV-ACCESS-004":
        return ctx.tokenSharingIncidents === 0 ? pass("توکن‌ها شخصی") : fail(`${ctx.tokenSharingIncidents} اشتراک توکن`);
      case "GOV-DECISION-001":
        return ctx.autoExecuteViolations === 0 ? pass("صفر auto_execute") : fail(`${ctx.autoExecuteViolations} نقض auto_execute`);
      case "GOV-DECISION-002":
        return ctx.decisionsTotal === 0 || ctx.decisionsKept90d === ctx.decisionsTotal ? pass("تصمیم‌ها ۹۰ روز محفوظ") : fail(`${ctx.decisionsTotal - ctx.decisionsKept90d} تصمیم کمتر از ۹۰ روز`);
      case "GOV-REPAIR-001":
        return ctx.repairsWithoutCouncilApproval === 0 ? pass("ترمیم فقط با شورا") : fail(`${ctx.repairsWithoutCouncilApproval} ترمیم بدون شورا`);
      default:
        return fail("قاعدهٔ ناشناخته");
    }
  }

  /** گزارش کامل هر ۱۵ قاعده (checkAll §۴.۳.۲) */
  checkAll(ctx: GovernanceContext): { results: GovernanceCheckResult[]; passed: number; failed: number; criticalViolations: string[] } {
    const results = GOVERNANCE_RULES.map((r) => this.checkRule(r, ctx));
    const failed = results.filter((r) => !r.passed);
    return {
      results,
      passed: results.length - failed.length,
      failed: failed.length,
      criticalViolations: failed.filter((r) => r.severity === "critical").map((r) => r.ruleId),
    };
  }

  /** اعمال سیاست در سه حالت (enforce §۴.۳.۲) */
  enforce(ctx: GovernanceContext): { enforced: boolean; blocked: boolean; report: ReturnType<GovernanceEngineImpl["checkAll"]> } {
    const report = this.checkAll(ctx);
    const hasCritical = report.criticalViolations.length > 0;
    const enforcement = this.policy.enforcement;
    return {
      enforced: enforcement !== "audit-only",
      blocked: enforcement === "strict" && hasCritical,
      report,
    };
  }

  /** ثبت کنش در حسابرسی حاکمیت */
  audit(action: string): { logged: boolean; at: string; action: string } {
    return { logged: true, at: new Date().toISOString(), action };
  }
}
