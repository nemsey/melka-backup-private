/**
 * PHASE 10 (سند ۰۲۷) — خودتشخیصی سیستم
 * ---------------------------------------------------------------------------
 * فلسفه: «سیستمی که خودش را نمی‌شناسد، نمی‌تواند خودش را بهبود دهد.»
 * ۲۵ بررسی اجباری در ۵ دسته: داده(۷) مدل(۶) موتور(۵) امنیت(۴) حاکمیت(۳)
 * سیستم قبل از شورا مشکل را پیدا می‌کند و صادقانه گزارش می‌دهد.
 */

import {
  type CriticalAlert,
  type DiagnosticCheck,
  type DiagnosticReport,
  type LearningTier,
  type RecommendedAction,
  type Warning,
  evidenceLink,
} from "./contracts-p7-p11";

/** نمای واقعی سیستم — از وضعیت زنده (DB + حلقه + حسابرسی) پر می‌شود */
export interface SystemSnapshot {
  /** داده */
  orphanOutcomeRecords: number;
  columnCoveragePercent: number;
  dataAgeHours: number;
  illegalDeletions: number;
  backupFilesPresent: number;
  crossTableConflicts: number;
  weeklyGrowthPercent: number;
  /** مدل */
  brierScore: number;
  brierTarget: number;
  worstCalibrationGap: number;
  driftMagnitude: number;
  overfitGap: number;
  activeModelVersionMatchesExpected: boolean;
  shadowEvaluationActive: boolean;
  /** موتور */
  enginesAlive: number;
  enginesTotal: number;
  maxEngineLatencyMs: number;
  consecutiveEngineErrors: number;
  tierValid: boolean;
  learningLoopActive: boolean;
  /** امنیت */
  auditLogActive: boolean;
  unauthorizedAccess24h: number;
  llmCallsInProduction: number;
  postsToOriginSystem: number;
  /** حاکمیت */
  governanceRulesEnforced: number;
  governanceRulesTotal: number;
  criticalViolations: number;
  lastPolicyEvaluationDaysAgo: number;
  /** Tier فعلی برای گزارش */
  tier: LearningTier;
}

export const healthySnapshot = (tier: LearningTier = 4): SystemSnapshot => ({
  orphanOutcomeRecords: 0,
  columnCoveragePercent: 95,
  dataAgeHours: 6,
  illegalDeletions: 0,
  backupFilesPresent: 3,
  crossTableConflicts: 0,
  weeklyGrowthPercent: 2,
  brierScore: 0.19,
  brierTarget: 0.2,
  worstCalibrationGap: 0.1,
  driftMagnitude: 0.01,
  overfitGap: 0.05,
  activeModelVersionMatchesExpected: true,
  shadowEvaluationActive: true,
  enginesAlive: 11,
  enginesTotal: 11,
  maxEngineLatencyMs: 120,
  consecutiveEngineErrors: 0,
  tierValid: true,
  learningLoopActive: true,
  auditLogActive: true,
  unauthorizedAccess24h: 0,
  llmCallsInProduction: 0,
  postsToOriginSystem: 0,
  governanceRulesEnforced: 15,
  governanceRulesTotal: 15,
  criticalViolations: 0,
  lastPolicyEvaluationDaysAgo: 5,
  tier,
});

/** نتیجهٔ یک بررسی از روی مقدار و آستانه */
function check(
  id: string,
  name: string,
  category: DiagnosticCheck["category"],
  status: DiagnosticCheck["status"],
  details: string,
  extra: { metric?: number; threshold?: number; suggestion?: string } = {},
): DiagnosticCheck {
  return { id, name, category, status, details, ...extra };
}

/** وضعیت از مقایسهٔ مقدار با آستانه (خطرناک‌تر از آستانه → fail/warn) */
function grade(value: number, warnAt: number, failAt: number): "pass" | "warn" | "fail" {
  if (value >= failAt) return "fail";
  if (value >= warnAt) return "warn";
  return "pass";
}

export class SelfDiagnosisEngineImpl {
  /** هر ۲۵ بررسی — خالص و قابل تست با دادهٔ معلوم */
  runAllChecks(s: SystemSnapshot): DiagnosticCheck[] {
    return [
      /* ── داده (۷) ── */
      check("DIAG-DATA-001", "انسجام داده (رکوردهای یتیم)", "data", grade(s.orphanOutcomeRecords, 1, 5), `${s.orphanOutcomeRecords} رکورد پیامد بدون پیش‌بینی مرجع`, { metric: s.orphanOutcomeRecords, threshold: 0, suggestion: s.orphanOutcomeRecords > 0 ? "پاکسازی/اتصال رکوردهای یتیم با تأیید شورا" : undefined }),
      check("DIAG-DATA-002", "پوشش ستون‌های کلیدی", "data", 100 - s.columnCoveragePercent >= 20 ? "fail" : 100 - s.columnCoveragePercent >= 10 ? "warn" : "pass", `پوشش ستون‌ها ${s.columnCoveragePercent}٪`, { metric: s.columnCoveragePercent, threshold: 90 }),
      check("DIAG-DATA-003", "تازگی داده", "data", s.dataAgeHours >= 48 ? "fail" : s.dataAgeHours >= 24 ? "warn" : "pass", `آخرین داده ${s.dataAgeHours} ساعت پیش`, { metric: s.dataAgeHours, threshold: 24 }),
      check("DIAG-DATA-004", "صفر حذف غیرمجاز", "data", s.illegalDeletions > 0 ? "fail" : "pass", `${s.illegalDeletions} حذف غیرمجاز`, { metric: s.illegalDeletions, threshold: 0 }),
      check("DIAG-DATA-005", "بکاپ‌های موجود", "data", s.backupFilesPresent === 0 ? "fail" : s.backupFilesPresent < 2 ? "warn" : "pass", `${s.backupFilesPresent} فایل بکاپ موجود`, { metric: s.backupFilesPresent, threshold: 2 }),
      check("DIAG-DATA-006", "تناقض بین جداول", "data", grade(s.crossTableConflicts, 1, 10), `${s.crossTableConflicts} تناقض شمارشی بین جداول`, { metric: s.crossTableConflicts, threshold: 0 }),
      check("DIAG-DATA-007", "حجم رشد هفتگی", "data", s.weeklyGrowthPercent >= 50 ? "warn" : "pass", `رشد ${s.weeklyGrowthPercent}٪ در هفته`, { metric: s.weeklyGrowthPercent, threshold: 50 }),
      /* ── مدل (۶) ── */
      check("DIAG-MODEL-001", "Brier Score", "model", s.brierScore > s.brierTarget + 0.05 ? "fail" : s.brierScore > s.brierTarget ? "warn" : "pass", `Brier = ${s.brierScore} (هدف ≤ ${s.brierTarget})`, { metric: s.brierScore, threshold: s.brierTarget, suggestion: s.brierScore > s.brierTarget ? "آموزش مجدد/تعدیل وزن‌ها پس از تأیید شورا" : undefined }),
      check("DIAG-MODEL-002", "کالیبراسیون", "model", s.worstCalibrationGap >= 0.3 ? "fail" : s.worstCalibrationGap >= 0.15 ? "warn" : "pass", `بدترین شکاف کالیبراسیون ${s.worstCalibrationGap}`, { metric: s.worstCalibrationGap, threshold: 0.15, suggestion: s.worstCalibrationGap >= 0.15 ? "بازکالیبراسیون احتمال‌ها (recalibrate)" : undefined }),
      check("DIAG-MODEL-003", "رانش (Drift)", "model", s.driftMagnitude >= 0.1 ? "fail" : s.driftMagnitude >= 0.05 ? "warn" : "pass", `مقدار رانش ${s.driftMagnitude}`, { metric: s.driftMagnitude, threshold: 0.05 }),
      check("DIAG-MODEL-004", "Overfitting", "model", s.overfitGap >= 0.15 ? "fail" : s.overfitGap >= 0.08 ? "warn" : "pass", `شکاف آموزش/آزمون ${s.overfitGap}`, { metric: s.overfitGap, threshold: 0.08 }),
      check("DIAG-MODEL-005", "نسخهٔ فعال مدل مطابق انتظار", "model", s.activeModelVersionMatchesExpected ? "pass" : "fail", s.activeModelVersionMatchesExpected ? "نسخهٔ فعال مطابق انتظار" : "نسخهٔ فعال با انتظار نمی‌خواند"),
      check("DIAG-MODEL-006", "Shadow Evaluation فعال", "model", s.shadowEvaluationActive ? "pass" : "warn", s.shadowEvaluationActive ? "ارزیابی سایه فعال" : "ارزیابی سایه غیرفعال", { suggestion: s.shadowEvaluationActive ? undefined : "فعال‌سازی ارزیابی سایه برای مدل کاندید" }),
      /* ── موتور (۵) ── */
      check("DIAG-ENGINE-001", "موتورهای زنده", "engine", s.enginesAlive < s.enginesTotal - 2 ? "fail" : s.enginesAlive < s.enginesTotal ? "warn" : "pass", `${s.enginesAlive}/${s.enginesTotal} موتور زنده`, { metric: s.enginesAlive, threshold: s.enginesTotal }),
      check("DIAG-ENGINE-002", "زمان پاسخ موتورها", "engine", s.maxEngineLatencyMs >= 2000 ? "fail" : s.maxEngineLatencyMs >= 1000 ? "warn" : "pass", `بدترین تأخیر ${s.maxEngineLatencyMs}ms`, { metric: s.maxEngineLatencyMs, threshold: 1000 }),
      check("DIAG-ENGINE-003", "صفر خطای متوالی", "engine", s.consecutiveEngineErrors >= 3 ? "fail" : s.consecutiveEngineErrors >= 1 ? "warn" : "pass", `${s.consecutiveEngineErrors} خطای متوالی`, { metric: s.consecutiveEngineErrors, threshold: 0 }),
      check("DIAG-ENGINE-004", "اعتبار Tier فعلی", "engine", s.tierValid ? "pass" : "fail", s.tierValid ? `Tier ${s.tier} معتبر` : "Tier نامعتبر — بازمحاسبه لازم"),
      check("DIAG-ENGINE-005", "چرخهٔ یادگیری فعال", "engine", s.learningLoopActive ? "pass" : "fail", s.learningLoopActive ? "چرخهٔ یادگیری فعال" : "چرخهٔ یادگیری متوقف"),
      /* ── امنیت (۴) ── */
      check("DIAG-SEC-001", "AuditLog فعال", "security", s.auditLogActive ? "pass" : "fail", s.auditLogActive ? "حسابرسی فعال" : "حسابرسی غیرفعال"),
      check("DIAG-SEC-002", "صفر دسترسی غیرمجاز ۲۴ ساعت گذشته", "security", s.unauthorizedAccess24h > 0 ? "fail" : "pass", `${s.unauthorizedAccess24h} دسترسی غیرمجاز`, { metric: s.unauthorizedAccess24h, threshold: 0 }),
      check("DIAG-SEC-003", "صفر LLM call در production", "security", s.llmCallsInProduction > 0 ? "fail" : "pass", `${s.llmCallsInProduction} فراخوانی LLM`, { metric: s.llmCallsInProduction, threshold: 0 }),
      check("DIAG-SEC-004", "صفر POST در سامانهٔ مبدأ", "security", s.postsToOriginSystem > 0 ? "fail" : "pass", `${s.postsToOriginSystem} درخواست POST به مبدأ`, { metric: s.postsToOriginSystem, threshold: 0 }),
      /* ── حاکمیت (۳) ── */
      check("DIAG-GOV-001", "۱۵ قاعدهٔ حاکمیت enforce", "governance", s.governanceRulesEnforced < s.governanceRulesTotal - 3 ? "fail" : s.governanceRulesEnforced < s.governanceRulesTotal ? "warn" : "pass", `${s.governanceRulesEnforced}/${s.governanceRulesTotal} قاعده برقرار`, { metric: s.governanceRulesEnforced, threshold: s.governanceRulesTotal }),
      check("DIAG-GOV-002", "صفر نقض critical", "governance", s.criticalViolations > 0 ? "fail" : "pass", `${s.criticalViolations} نقض بحرانی`, { metric: s.criticalViolations, threshold: 0 }),
      check("DIAG-GOV-003", "ارزیابی ۹۰ روزهٔ سیاست‌ها به‌روز", "governance", s.lastPolicyEvaluationDaysAgo > 90 ? "fail" : s.lastPolicyEvaluationDaysAgo > 60 ? "warn" : "pass", `آخرین ارزیابی ${s.lastPolicyEvaluationDaysAgo} روز پیش`, { metric: s.lastPolicyEvaluationDaysAgo, threshold: 90 }),
    ];
  }

  /** اجرای یک بررسی تکی */
  runCheck(checkId: string, s: SystemSnapshot): DiagnosticCheck | undefined {
    return this.runAllChecks(s).find((c) => c.id === checkId);
  }

  /** امتیاز سلامت ۰-۱۰۰: fail=۰، warn=۵۰، pass=۱۰۰ */
  getHealthScore(checks: DiagnosticCheck[]): number {
    if (checks.length === 0) return 0;
    const score = checks.reduce((a, c) => a + (c.status === "pass" ? 100 : c.status === "warn" ? 50 : 0), 0) / checks.length;
    return Math.round(score);
  }

  /** §۵.۳ — گزارش critical بلافاصله */
  reportCritical(alert: { checkId: string; message: string }): CriticalAlert {
    return { id: `alert-${Date.now().toString(36)}`, ...alert, reportedAt: new Date().toISOString() };
  }

  /** تشخیص کامل: گزارش + هشدار + توصیه (runFullDiagnosis §۵.۳) */
  runFullDiagnosis(s: SystemSnapshot): DiagnosticReport {
    const checks = this.runAllChecks(s);
    const overallScore = this.getHealthScore(checks);
    const systemHealth: DiagnosticReport["systemHealth"] = checks.some((c) => c.status === "fail" && (c.category === "security" || c.category === "governance")) || overallScore < 50 ? "critical" : checks.some((c) => c.status !== "pass") ? "degraded" : "healthy";
    const warnings: Warning[] = checks.filter((c) => c.status === "warn").map((c) => ({ id: `warn-${c.id}`, checkId: c.id, message: c.details }));
    const criticalAlerts: CriticalAlert[] = checks.filter((c) => c.status === "fail").map((c) => this.reportCritical({ checkId: c.id, message: c.details }));
    const recommendations: RecommendedAction[] = checks
      .filter((c) => c.status !== "pass")
      .map((c) => ({
        id: `rec-${c.id}`,
        checkId: c.id,
        action: c.suggestion ?? `بررسی و ترمیم «${c.name}» با پیشنهاد P11 و تأیید شورا`,
        rationale: c.details,
      }));
    return {
      id: `diag-${Date.now().toString(36)}`,
      reportedAt: new Date().toISOString(),
      systemHealth,
      checks,
      overallScore,
      warnings,
      criticalAlerts,
      recommendations,
      tier: s.tier,
      evidenceChain: [
        evidenceLink("query", "self-diagnosis:25-checks", `${checks.length} بررسی — امتیاز ${overallScore}/100`),
        evidenceLink("test", "tests/p6537-p10-core.test.ts", "تست ۲۵ بررسی با دادهٔ معلوم"),
      ],
    };
  }
}
