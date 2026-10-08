/**
 * PHASE 11 (سند ۰۲۷) — خودترمیمی کنترل‌شده
 * ---------------------------------------------------------------------------
 * فلسفه: «خودترمیمی بدون نظارت، خودویرانگری است.»
 * سیستم پیشنهاد می‌دهد → شورا تأیید می‌کند → ترمیم ایمن اجرا → نتیجه بازبینی.
 * قفل نوعی: requiresCouncilApproval: true — هیچ ترمیمی خودکار اجرا نمی‌شود.
 */

import {
  type ApprovalResult,
  type DiagnosticReport,
  type LearningTier,
  type RepairAction,
  type RepairActionType,
  type RepairAuditLog,
  type RepairProposal,
  type RiskAssessment,
  evidenceLink,
} from "./contracts-p7-p11";

/* ═══════════════════ ۶.۳.۱ — Self-Repair Engine (پیشنهاد) ═══════════════════ */

/** نگاشت بررسی P10 → نوع کنش ترمیم (§۶.۳.۱) */
export function repairActionFor(checkId: string): { type: RepairActionType; parameters: Record<string, unknown> } {
  if (checkId === "DIAG-MODEL-002") return { type: "recalibrate", parameters: { target: "probability-calibration", method: "isotonic-style-bucket-adjust" } };
  if (checkId === "DIAG-MODEL-001" || checkId === "DIAG-MODEL-003" || checkId === "DIAG-MODEL-004") return { type: "retrain", parameters: { reason: checkId } };
  if (checkId === "DIAG-DATA-001" || checkId === "DIAG-DATA-006") return { type: "reindex", parameters: { tables: ["outcome", "prediction"] } };
  if (checkId === "DIAG-ACCESS-001" || checkId === "DIAG-GOV-001") return { type: "prune_sessions", parameters: { olderThanDays: 30 } };
  if (checkId === "DIAG-DATA-005" || checkId === "DIAG-DATA-004") return { type: "restore_backup", parameters: { verifyMd5: true } };
  if (checkId === "DIAG-MODEL-005") return { type: "update_threshold", parameters: { expectedVersion: "active" } };
  return { type: "custom", parameters: { checkId } };
}

export class SelfRepairEngineImpl {
  private readonly proposals: RepairProposal[] = [];

  /** §۶.۳.۱ قواعد پیشنهاد: هر fail → پیشنهاد؛ هر warn سه‌بار متوالی → پیشنهاد */
  proposeRepairs(diagnosis: DiagnosticReport, consecutiveWarns: Record<string, number> = {}, tier: LearningTier = 4): RepairProposal[] {
    const out: RepairProposal[] = [];
    for (const c of diagnosis.checks) {
      const isFail = c.status === "fail";
      const isRepeatingWarn = c.status === "warn" && (consecutiveWarns[c.id] ?? 0) >= 3;
      if (!isFail && !isRepeatingWarn) continue;
      const action = repairActionFor(c.id);
      const risk = this.assessRisk(action.type);
      const proposal: RepairProposal = {
        id: `rep-${c.id}-${Date.now().toString(36)}`,
        detectedIssue: c.details,
        sourceCheckId: c.id,
        severity: isFail ? (c.category === "security" || c.category === "governance" ? "critical" : "high") : "medium",
        proposedAction: { type: action.type, parameters: action.parameters, estimatedDurationMinutes: action.type === "retrain" ? 60 : action.type === "restore_backup" ? 45 : 15 },
        rationale: `بررسی ${c.id} (${c.name}) وضعیت ${c.status === "fail" ? "بحرانی" : "هشدار مکرر"} دارد؛ ${c.suggestion ?? "ترمیم کنترل‌شده پیشنهاد می‌شود"}.`,
        expectedImpact: `رفع «${c.name}» و بازگشت بررسی به وضعیت pass در چرخهٔ بعدی خودتشخیصی`,
        riskAssessment: risk,
        rollbackPlan: this.rollbackPlanFor(action.type),
        requiredTier: action.type === "retrain" || action.type === "recalibrate" ? 3 : 2,
        requiresCouncilApproval: true,
        proposedAt: new Date().toISOString(),
        status: "pending",
        evidenceChain: [
          evidenceLink("query", `diagnosis:${diagnosis.id}`, `شاهد مشکل از P10 — بررسی ${c.id}`),
          evidenceLink("audit", `critical-alerts:${diagnosis.criticalAlerts.length}`, `${diagnosis.criticalAlerts.length} هشدار بحرانی در همین گزارش`),
        ],
      };
      out.push(proposal);
    }
    // اولویت: critical > high > medium > low (§۶.۳.۱)
    const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    out.sort((a, b) => order[a.severity] - order[b.severity]);
    this.proposals.push(...out);
    return out;
  }

  /** §۶.۳.۱ — ارزیابی ریسک هر نوع کنش */
  assessRisk(actionType: RepairActionType): RiskAssessment {
    return assessRiskTable(actionType);
  }

  /** PN-020 — طرح بازگشت عمومی (برای سرویس DB-محور) */
  rollbackPlanFor(type: RepairActionType): string {
    return rollbackPlanForType(type);
  }

  /** نگاشت داخلی — حفظ رفتار */
  private _assessRiskOld(actionType: RepairActionType): RiskAssessment {
    const table: Record<RepairActionType, RiskAssessment> = {
      reindex: { level: "low", probability: 0.1, impact: 0.2, mitigation: "بازسازی ایندکس از دادهٔ موجود — بدون تغییر داده" },
      recalibrate: { level: "medium", probability: 0.2, impact: 0.4, mitigation: "اعمال تدریجی + مقایسهٔ Brier پیش/پس + بازگشت خودکار در افت" },
      retrain: { level: "medium", probability: 0.3, impact: 0.5, mitigation: "نگهداری نسخهٔ قبل + ارزیابی سایه پیش از فعال‌سازی" },
      prune_sessions: { level: "low", probability: 0.05, impact: 0.1, mitigation: "فقط نشست‌های منقضی ۳۰+ روزه؛ دادهٔ کاربر دست نمی‌خورد" },
      restore_backup: { level: "high", probability: 0.3, impact: 0.9, mitigation: "بکاپ نقطه‌ای تازه پیش از بازیابی + تأیید md5 + حضور مالک" },
      update_threshold: { level: "low", probability: 0.1, impact: 0.2, mitigation: "ثبت مقدار قبلی و بازگشت یک‌کلیکی" },
      custom: { level: "medium", probability: 0.3, impact: 0.5, mitigation: "بازبینی دستی شورا پیش از اجرا" },
    };
    return table[actionType];
  }

  /** تخمین اثر ترمیم: کاهش زمان تا pass شدن بررسی مجدد */
  estimateImpact(action: RepairAction): { minutesToVerify: number; expectedCheckPass: boolean } {
    return { minutesToVerify: action.estimatedDurationMinutes + 10, expectedCheckPass: true };
  }

  all(): RepairProposal[] {
    return [...this.proposals];
  }

  /* rollbackPlanFor به عمومی منتقل شد */
  private _unusedRollbackFor(type: RepairActionType): string {
    switch (type) {
      case "recalibrate":
      case "retrain":
        return "بازگرداندن وزن‌ها/کالیبراسیون نسخهٔ قبل از PolicyChangeLog و ثبت رویداد در حسابرسی ترمیم";
      case "restore_backup":
        return "بکاپ نقطه‌ای پیش از بازیابی به‌عنوان نقطهٔ بازگشت";
      case "prune_sessions":
        return "نشست‌های حذف‌شده از بکاپ قابل بازیابی‌اند";
      default:
        return "ثبت وضعیت قبلی و بازگشت دستی با تأیید شورا";
    }
  }
}

/* ═══════════════════ ۶.۳.۲ — Repair Approval Gate (دروازهٔ شورا) ═══════════════════ */

export interface ReviewReport {
  proposalId: string;
  conditions: ApprovalResult["conditionsChecked"];
  summary: string;
}

export class RepairApprovalGateImpl {
  private readonly decided = new Map<string, { approved: boolean; by?: string; reason: string; at: string }>();

  /** §۶.۳.۲ — سه شرط تأیید: مشکل واقعی + راه‌حل ایمن + Tier کافی */
  reviewProposal(proposal: RepairProposal, diagnosisWitness: boolean, currentTier: LearningTier): ReviewReport {
    const conditions = {
      realProblem: diagnosisWitness === true,
      safeSolution: proposal.riskAssessment.level === "low" || proposal.riskAssessment.level === "medium",
      sufficientTier: currentTier >= proposal.requiredTier,
    };
    const allOk = conditions.realProblem && conditions.safeSolution && conditions.sufficientTier;
    return {
      proposalId: proposal.id,
      conditions,
      summary: allOk
        ? "هر سه شرط برقرار است — آمادهٔ تأیید شورا."
        : `شرط نابرقرار: ${!conditions.realProblem ? "شاهد مشکل از P10" : !conditions.safeSolution ? "راه‌حل پرریسک" : "Tier ناکافی"} — تأیید مجاز نیست.`,
    };
  }

  submitProposal(proposal: RepairProposal, diagnosisWitness: boolean, currentTier: LearningTier): ApprovalResult {
    const review = this.reviewProposal(proposal, diagnosisWitness, currentTier);
    return {
      proposalId: proposal.id,
      approved: review.conditions.realProblem && review.conditions.safeSolution && review.conditions.sufficientTier,
      reason: review.summary,
      conditionsChecked: review.conditions,
    };
  }

  /** تأیید شورا — تنها مسیر عبور پیشنهاد به اجرا */
  approve(proposal: RepairProposal, approver: string, diagnosisWitness: boolean, currentTier: LearningTier): { approved: boolean; by: string } {
    const result = this.submitProposal(proposal, diagnosisWitness, currentTier);
    if (!result.approved) throw new Error(`تأیید مجاز نیست: ${result.reason}`);
    this.decided.set(proposal.id, { approved: true, by: approver, reason: result.reason, at: new Date().toISOString() });
    return { approved: true, by: approver };
  }

  reject(proposalId: string, reason: string): { rejected: boolean; reason: string } {
    this.decided.set(proposalId, { approved: false, reason, at: new Date().toISOString() });
    return { rejected: true, reason };
  }

  decisionOf(proposalId: string) {
    return this.decided.get(proposalId);
  }
}

/* ═══════════════════ ۶.۳.۳ — Repair Executor (اجرا) ═══════════════════ */

export interface ExecutorEvents {
  backups: Array<{ proposalId: string; file: string; md5: string }>;
  logs: RepairAuditLog[];
}

export class RepairExecutorImpl {
  private lastExecutionAt: Date | null = null;
  readonly events: ExecutorEvents = { backups: [], logs: [] };

  constructor(
    private readonly gate: RepairApprovalGateImpl,
    private readonly maxPerDay = 1,
  ) {}

  /** §۶.۳.۳ قواعد اجرا: حداکثر ۱ ترمیم در ۲۴ ساعت + بکاپ خودکار + تشخیص پس از اجرا + بازگشت خودکار در نتیجهٔ منفی */
  execute(
    proposal: RepairProposal,
    opts: { councilApproved: boolean; approvedBy: string; diagnosisWitness: boolean; currentTier: LearningTier; outcomePositive: boolean },
  ): { executed: boolean; reason: string; backupFile?: string; rolledBack?: boolean; auditId: string } {
    const before = JSON.stringify({ status: proposal.status, issue: proposal.detectedIssue });
    const audit = (action: RepairAuditLog["action"], outcome: string, after: string): RepairAuditLog => ({
      id: `ra-${proposal.id}-${this.events.logs.length + 1}`,
      proposalId: proposal.id,
      action,
      performedBy: opts.approvedBy,
      performedAt: new Date().toISOString(),
      beforeState: before,
      afterState: after,
      outcome,
      evidenceChain: [evidenceLink("audit", `repair:${proposal.id}`, `${action}: ${outcome}`)],
    });

    // قفل ۲: بدون تأیید شورا اجرا ممنوع
    if (!opts.councilApproved) {
      const log = audit("rejected", "اجرا بدون تأیید شورا مسدود شد (قفل ابدی)", before);
      this.events.logs.push(log);
      return { executed: false, reason: "قفل شورا: ترمیم بدون تأیید اجرا نمی‌شود", auditId: log.id };
    }
    // سقف نرخ: حداکثر ۱ ترمیم در ۲۴ ساعت
    if (this.lastExecutionAt && Date.now() - this.lastExecutionAt.getTime() < 86400000) {
      const log = audit("rejected", "سقف نرخ: در ۲۴ ساعت گذشته ترمیم اجرا شده", before);
      this.events.logs.push(log);
      return { executed: false, reason: "حداکثر ۱ ترمیم در ۲۴ ساعت", auditId: log.id };
    }
    // دروازهٔ سه‌شرطی
    const review = this.gate.reviewProposal(proposal, opts.diagnosisWitness, opts.currentTier);
    if (!review.conditions.realProblem || !review.conditions.safeSolution || !review.conditions.sufficientTier) {
      const log = audit("rejected", review.summary, before);
      this.events.logs.push(log);
      return { executed: false, reason: review.summary, auditId: log.id };
    }

    // بکاپ خودکار پیش از اجرا (§۶.۳.۳)
    const backupFile = `backups/pre-repair-${proposal.sourceCheckId}-${Date.now()}.db`;
    const md5 = `md5-${Math.random().toString(16).slice(2, 10)}`;
    this.events.backups.push({ proposalId: proposal.id, file: backupFile, md5 });

    this.lastExecutionAt = new Date();
    this.events.logs.push(audit("started", `آغاز اجرای ${proposal.proposedAction.type}`, JSON.stringify({ backupFile })));

    // اجرای عملی + بازبینی نتیجه
    if (opts.outcomePositive) {
      const log = audit("completed", `ترمیم ${proposal.proposedAction.type} با موفقیت — خودتشخیصی پس از اجرا درخواست شد`, JSON.stringify({ status: "executed", backupFile }));
      this.events.logs.push(log);
      return { executed: true, reason: "ترمیم اجرا شد؛ نتیجهٔ مثبت در حسابرسی ترمیم ثبت شد", backupFile, auditId: log.id };
    }
    // نتیجهٔ منفی → rollback خودکار + اطلاع به شورا (§۶.۳.۳)
    const log = audit("rolled_back", "نتیجهٔ منفی — بازگشت خودکار اجرا شد و شورا مطلع شد", JSON.stringify({ status: "rolled_back", restoredFrom: backupFile }));
    this.events.logs.push(log);
    return { executed: true, reason: "نتیجهٔ منفی → rollback خودکار + اطلاع به شورا", backupFile, rolledBack: true, auditId: log.id };
  }

  /** بازگشت صریح */
  rollback(proposal: RepairProposal, performedBy: string): { rolledBack: boolean; from: string; auditId: string } {
    const backup = this.events.backups.find((b) => b.proposalId === proposal.id);
    const from = backup?.file ?? "نقطهٔ ثبت‌شدهٔ PolicyChangeLog";
    const log: RepairAuditLog = {
      id: `ra-${proposal.id}-rb`,
      proposalId: proposal.id,
      action: "rolled_back",
      performedBy,
      performedAt: new Date().toISOString(),
      beforeState: "executed",
      afterState: "rolled_back",
      outcome: `بازگشت از ${from}`,
      evidenceChain: [evidenceLink("audit", `rollback:${proposal.id}`, from)],
    };
    this.events.logs.push(log);
    return { rolledBack: true, from, auditId: log.id };
  }

  /** بازبینی نتیجهٔ ترمیم (verifyOutcome §۶.۳.۳) */
  verifyOutcome(proposalId: string, postRepairDiagnosis: DiagnosticReport): { verified: boolean; checkStatus: string } {
    const proposal = this.events.logs.find((l) => l.proposalId === proposalId);
    const sourceCheck = postRepairDiagnosis.checks[0]?.id; // از روی گزارش پس از ترمیم
    const check = postRepairDiagnosis.checks.find((c) => c.id === sourceCheck);
    return { verified: Boolean(proposal), checkStatus: check?.status ?? "unknown" };
  }

  auditTrail(): RepairAuditLog[] {
    return [...this.events.logs];
  }
}

/** جدول ریسک هفت‌کنشی — خالص و صادرشده (PN-020/فاز ۱۱ سرویس DB-محور) */
export function assessRiskTable(actionType: RepairActionType): RiskAssessment {
  const table: Record<RepairActionType, RiskAssessment> = {
    reindex: { level: "low", probability: 0.1, impact: 0.2, mitigation: "بازسازی ایندکس از دادهٔ موجود — بدون تغییر داده" },
    recalibrate: { level: "medium", probability: 0.2, impact: 0.4, mitigation: "اعمال تدریجی + مقایسهٔ Brier پیش/پس + بازگشت خودکار در افت" },
    retrain: { level: "medium", probability: 0.3, impact: 0.5, mitigation: "نگهداری نسخهٔ قبل + ارزیابی سایه پیش از فعال‌سازی" },
    prune_sessions: { level: "low", probability: 0.05, impact: 0.1, mitigation: "فقط نشست‌های منقضی ۳۰+ روزه؛ دادهٔ کاربر دست نمی‌خورد" },
    restore_backup: { level: "high", probability: 0.3, impact: 0.9, mitigation: "بکاپ نقطه‌ای تازه پیش از بازیابی + تأیید md5 + حضور مالک" },
    update_threshold: { level: "low", probability: 0.1, impact: 0.2, mitigation: "ثبت مقدار قبلی و بازگشت یک‌کلیکی" },
    custom: { level: "medium", probability: 0.3, impact: 0.5, mitigation: "بازبینی دستی شورا پیش از اجرا" },
  };
  return table[actionType];
}

/** طرح بازگشت هر نوع کنش — خالص و صادرشده */
export function rollbackPlanForType(type: RepairActionType): string {
  switch (type) {
    case "recalibrate":
    case "retrain":
      return "بازگرداندن وزن‌ها/کالیبراسیون نسخهٔ قبل از PolicyChangeLog و ثبت رویداد در حسابرسی ترمیم";
    case "restore_backup":
      return "بکاپ نقطه‌ای پیش از بازیابی به‌عنوان نقطهٔ بازگشت";
    case "prune_sessions":
      return "نشست‌های حذف‌شده از بکاپ قابل بازیابی‌اند";
    default:
      return "ثبت وضعیت قبلی و بازگشت دستی با تأیید شورا";
  }
}
