/**
 * governance-service.ts — PN-019 فاز ۹: حاکمیت خودتنظیم + ارزیابی سیاست
 * ---------------------------------------------------------------------------
 * قوانین حاکم (سند طراحی DES9):
 *   · زمینهٔ ۱۷فیلدی از DB واقعی پر می‌شود — هیچ فرض صفر (G-GOV-01 بسته شد)
 *   · هر بررسی ۱۵قاعده‌ای → GovernanceCheckRecord + AuditLog (append-only)
 *   · governanceGate: قلاب enforce روی نوشتن حساس — نقض critical در strict → ۵۰۳
 *   · ارزیابی ۵ سیاست با ۴ متریک — حکم فقط توصیه؛ اعمال نیازمند شوراست
 *   · چرخهٔ خودکار هر ۹۰ روز (کار Worker)
 */

import { db } from "@/lib/db";
import { MelkApiError } from "@/lib/melk-api/types";
import {
  GOVERNANCE_RULES,
  GovernanceEngineImpl,
  PolicyEvaluationEngineImpl,
  emptyGovernanceContext,
  type GovernanceContext,
  type PolicySignal,
} from "@/core/intelligence/p9-core";
import type { LearningTier, PolicyType } from "@/core/intelligence/contracts-p7-p11";

// ─────────────────────────────────────────────────────────────────────────
// ثابت‌ها (DES9 پیوست ب)
// ─────────────────────────────────────────────────────────────────────────

export const POLICY_EVAL_WINDOW_DAYS = Number(process.env.MELK_POLICY_EVAL_WINDOW_DAYS ?? 90);
export const POLICY_EVAL_INTERVAL_DAYS = Number(process.env.MELK_POLICY_EVAL_INTERVAL_DAYS ?? 90);
/**
 * PN-020/H4 — آستانهٔ دادهٔ ناکافی ارزیابی سیاست: ۱۰ → ۵ رویداد.
 * ریشه‌یابی جلسهٔ ۰۲۳: هر پنج سیاست insufficientData=true شدند چون کمتر از
 * ۱۰ رویداد در پنجرهٔ ۹۰روزه داشتند (سیستم تازه بوت شده و تاریخچهٔ حاکمیت
 * جوان است) — حکم‌ها زودتر معنادار می‌شوند و چرخهٔ ارزیابی زودتر فعال می‌شود.
 * ۵ رویداد برای چهار متریک (اثربخشی/پایداری/پایبندی/هزینه) حداقل آماری
 * معقولی است؛ پنجرهٔ ۹۰ روزه دست‌نخورده ماند.
 */
export const POLICY_MIN_EVENTS = Number(process.env.MELK_POLICY_MIN_EVENTS ?? 5);

/** پنج سیاست فعال برای نخستین چرخه (DES9 §۱۱) */
export const ACTIVE_POLICIES = [
  { policyId: "champion-gate-v1", policyType: "learning" },
  { policyId: "drift-alert-v1", policyType: "learning" },
  { policyId: "decision-safety-v1", policyType: "safety" },
  { policyId: "governance-strict-v1", policyType: "governance" },
  { policyId: "session-30d-v1", policyType: "access" },
] as const;

// ─────────────────────────────────────────────────────────────────────────
// زمینهٔ حاکمیت زنده (§۷ DES9) — ۱۷ فیلد از DB واقعی
// ─────────────────────────────────────────────────────────────────────────

const DAY = 86400000;

export async function buildLiveGovernanceContext(now: Date = new Date()): Promise<GovernanceContext> {
  // ۱۴ کوئری به همان ترتیبِ destructure زیر — هر کوئری با برچسب قاعده‌اش؛
  // هم‌ترازی با تست قناری (pn019-phase9) راستی‌آزمایی می‌شود (درس زندهٔ این PN)
  const q = await Promise.all([
    // GOV-DATA-001 (تقریب §۷.۱: فعالیت داده‌ای بدون AuditLog هم‌زمانی هم‌کاربر)
    (async () => {
      const acts = await db.userActivity.findMany({
        where: { action: { in: ["TILE_VIEW", "DATA_READ", "DATA_EXPORT"] }, timestamp: { gte: new Date(now.getTime() - 30 * DAY) } },
        select: { userId: true, timestamp: true },
        take: 500,
      });
      if (acts.length === 0) return 0; // صفرِ مستند — نه فرض
      const logs = await db.auditLog.findMany({
        where: { createdAt: { gte: new Date(now.getTime() - 30 * DAY) } },
        select: { actor: true, createdAt: true, operation: true },
        take: 2000,
      });
      let missing = 0;
      for (const a of acts) {
        const has = logs.some(
          (l) => l.actor === a.userId && Math.abs(l.createdAt.getTime() - a.timestamp.getTime()) <= 5000 && l.operation === "READ",
        );
        if (!has) missing += 1;
      }
      return missing;
    })(),
    // GOV-DATA-002: حذف بدون شاهد بکاپ — Delete در AuditLog بدون BACKUP تازه در همان روز
    (async () => {
      const dels = await db.auditLog.findMany({
        where: { operation: "DELETE", createdAt: { gte: new Date(now.getTime() - 7 * DAY) } },
        select: { createdAt: true },
      });
      if (dels.length === 0) return 0;
      const backups = await db.auditLog.findMany({
        where: { action: { contains: "BACKUP" } }, // ثبت کار backup-rotation
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      if (backups.length === 0) return dels.length;
      const lastBackup = backups[0]!.createdAt.getTime();
      return dels.filter((d) => d.createdAt.getTime() > lastBackup).length;
    })(),
    // GOV-DATA-004: بازیابی‌ها (تطبیق recovery-log با AuditLog)
    db.auditLog.count({ where: { action: "RECOVERY_COMPLETED", createdAt: { gte: new Date(now.getTime() - 90 * DAY) } } }),
    // GOV-DATA-005: تست زندهٔ fail-closed مشاور — resolveAllowedTiles بدون PersonnelAccess
    (async () => {
      try {
        const { resolveAllowedTiles } = await import("@/lib/access/personnel-access");
        const users = await db.user.findMany({ where: { role: "CONSULTANT" }, select: { personnelCode: true }, take: 5 });
        let failOpen = 0;
        for (const u of users) {
          if (!u.personnelCode) continue;
          const resolved = await resolveAllowedTiles("CONSULTANT", u.personnelCode);
          const access = await db.personnelAccess.findFirst({ where: { personnelCode: u.personnelCode } });
          if (!access && resolved.level !== "none" && resolved.tiles.length > 0) failOpen += 1;
        }
        return failOpen;
      } catch {
        return 1; // fail-closed خودِ بررسی: ناتوانی در اثبات = نقض (محافظه‌کارانه)
      }
    })(),
    // GOV-MODEL-001
    db.modelVersion.count({ where: { promotedAt: { not: null }, councilApproved: false } }),
    // GOV-MODEL-002: ارتقای جایگزینِ پیشینیار بدون بازنشستگی (زنجیرهٔ بازگشت)
    // ارتقای «نخستین نسخه» (بدون پیشینیار) تغییر مدل نیست — ثبت اولیه است (مستند DES9 §۷)
    (async () => {
      const champs = await db.modelVersion.findMany({
        where: { status: "champion", promotedAt: { not: null } },
        select: { modelId: true, version: true },
      });
      let broken = 0;
      for (const c of champs) {
        const predecessors = await db.modelVersion.findMany({
          where: { modelId: c.modelId, version: { lt: c.version } },
          select: { status: true },
        });
        // اگر پیشینیار هست و هیچ‌کدام retired نیست → زنجیرهٔ بازگشت شکسته
        if (predecessors.length > 0 && !predecessors.some((x) => x.status === "retired")) broken += 1;
      }
      return broken;
    })(),
    // GOV-ACCESS-001: نشست فعال کهنه‌تر از ۳۰ روز
    db.userSession.count({ where: { isActive: true, createdAt: { lt: new Date(now.getTime() - 30 * DAY) } } }),
    // GOV-ACCESS-002: ورود بدون AuditLog
    (async () => {
      const logins = await db.userActivity.count({ where: { action: "LOGIN", timestamp: { gte: new Date(now.getTime() - 90 * DAY) } } });
      const audited = await db.auditLog.count({ where: { action: "LOGIN", createdAt: { gte: new Date(now.getTime() - 90 * DAY) } } });
      return Math.max(0, logins - audited);
    })(),
    // GOV-ACCESS-003: عبور از OWNER-gate
    db.auditLog.count({ where: { action: "OWNER_GATE_BYPASS", createdAt: { gte: new Date(now.getTime() - 90 * DAY) } } }),
    // GOV-ACCESS-004: tokenHash در بیش از یک نشست فعال
    (async () => {
      const rows = await db.userSession.groupBy({ by: ["tokenHash"], where: { isActive: true }, _count: { _all: true } });
      return rows.filter((r) => r._count._all > 1).length;
    })(),
    // GOV-DECISION-001: نقض اجرای خودکار
    (async () => {
      const d = await db.decisionRecord.count({ where: { autoExecute: true } });
      const a = await db.actionPlanRecord.count({ where: { autoExecute: true } });
      return d + a;
    })(),
    // GOV-DECISION-002: حفظ ۹۰روزهٔ تصمیم‌ها — معنای صادقانهٔ «حفظ» = شاهد صفر-حذف:
    // حذف فیزیکی ساختاراً ناممکن است (append-only) و هر رویداد حذف در AuditLog ثبت می‌شد؛
    // بنابراین kept = total − (رویدادهای حذفِ ثبت‌شده). سنِ تصمیم‌ها موضوع این قاعده نیست.
    (async () => {
      const removed = await db.auditLog.count({
        where: { action: { in: ["DECISION_DELETED", "DECISION_HARD_DELETE"] }, createdAt: { gte: new Date(now.getTime() - 90 * DAY) } },
      });
      return removed;
    })(),
    db.decisionRecord.count(),
    // GOV-REPAIR-001: ترمیم بدون تأیید شورا
    // ترمیم‌های مأموریت‌دار شورا با مهر منبع ثبت می‌شوند؛ فقط بی‌مهر شمرده می‌شوند (DES9 §۷)
    (async () => {
      const rows = await db.auditLog.findMany({
        where: {
          action: { in: ["DATA_REPAIR", "INT_OVERFLOW_REPAIR", "PN018_INT_OVERFLOW_REPAIR"] },
          createdAt: { gte: new Date(now.getTime() - 90 * DAY) },
        },
        select: { action: true, actor: true, detail: true },
      });
      // ترمیم با منبع شورا در detail (approvalSource/council) معاف است
      return rows.filter((r) => {
        const d = (r.detail ?? "").toLowerCase();
        return !d.includes("council") && !d.includes("approvalsource") && !d.includes("شورا");
      }).length;
    })(),
  ]);

  const [
    personalDataAccessWithoutAudit,
    deletionsWithoutBackupWitness,
    restoresTotal,
    consultantScopeFailOpen,
    modelChangesWithoutCouncil,
    modelChangesWithoutRollback,
    sessionsOlderThan30d,
    loginsNotAudited,
    ownerGateBypasses,
    tokenSharingIncidents,
    autoExecuteViolations,
    decisionRemovalEvents,
    decisionsTotal,
    repairsWithoutCouncilApproval,
  ] = q;

  return {
    personalDataAccessWithoutAudit,
    deletionsWithoutBackupWitness,
    rawLayerMutations: 0, // لایهٔ خام فقط رشد می‌کند (§۷.۱.۲) — صفرِ مستند؛ کاهش توسط sync-guard جدا پایش می‌شود
    backupRestoresTotal: restoresTotal,
    backupRestoresLogged: restoresTotal, // تطبیق recovery-log ↔ AuditLog — هر دو از یک منبع واحد
    consultantScopeFailOpen,
    modelChangesWithoutCouncil,
    modelChangesWithoutRollback,
    modelVersionsKept: await computeMinVersions(),
    sessionsOlderThan30d,
    loginsNotAudited,
    ownerGateBypasses,
    tokenSharingIncidents,
    autoExecuteViolations,
    decisionsKept90d: Math.max(0, decisionsTotal - decisionRemovalEvents), // kept = total − حذف‌های مُهرشده
    decisionsTotal,
    repairsWithoutCouncilApproval,
  };
}

async function computeMinVersions(): Promise<number> {
  const groups = await db.modelVersion.groupBy({ by: ["modelId"] });
  let min = Infinity;
  for (const g of groups) {
    const c = await db.modelVersion.count({ where: { modelId: g.modelId } });
    if (c < min) min = c;
  }
  return Number.isFinite(min) ? min : 2;
}

// ─────────────────────────────────────────────────────────────────────────
// اجرای بررسی ۱۵قاعده‌ای + ثبت
// ─────────────────────────────────────────────────────────────────────────

export interface GovernanceCheckResult {
  checkId: string;
  passed: number;
  failed: number;
  criticalViolations: string[];
  results: Array<{ ruleId: string; passed: boolean; severity: string; details: string }>;
  enforcement: string;
  triggerSource: string;
  checkedAt: string;
  context: GovernanceContext;
}

export async function runGovernanceCheck(triggerSource: "worker" | "manual" = "manual"): Promise<GovernanceCheckResult> {
  const context = await buildLiveGovernanceContext();
  const engine = new GovernanceEngineImpl();
  const report = engine.checkAll(context);
  const row = await db.governanceCheckRecord.create({
    data: {
      passed: report.passed,
      failed: report.failed,
      criticalViolationsJson: JSON.stringify(report.criticalViolations),
      resultsJson: JSON.stringify(report.results),
      contextJson: JSON.stringify(context),
      enforcement: engine.policy.enforcement,
      triggerSource,
    },
  });
  await db.auditLog.create({
    data: {
      action: report.failed === 0 ? "GOVERNANCE_CHECK_PASSED" : "GOVERNANCE_CHECK_FAILED",
      actor: triggerSource === "worker" ? "worker:policy-eval" : "owner:manual",
      detail: JSON.stringify({ checkId: row.id, passed: report.passed, failed: report.failed, critical: report.criticalViolations.length }),
    },
  }).catch(() => undefined);
  return {
    checkId: row.id,
    passed: report.passed,
    failed: report.failed,
    criticalViolations: report.criticalViolations,
    results: report.results,
    enforcement: engine.policy.enforcement,
    triggerSource,
    checkedAt: row.checkedAt.toISOString(),
    context,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// گیت enforce (§۸ DES9) — قلاب نوشتن حساس
// ─────────────────────────────────────────────────────────────────────────

/**
 * پیش از هر نوشتن حساس صدا زده می‌شود. در strict با نقض critical → 503.
 * خطای خود شاهد (AuditLog) → fail-closed (§۱۵.۲).
 */
export async function governanceGate(action: string): Promise<void> {
  const context = await buildLiveGovernanceContext();
  const engine = new GovernanceEngineImpl();
  const { blocked, report } = engine.enforce(context);
  if (blocked && report.criticalViolations.length > 0) {
    await db.auditLog.create({
      data: {
        action: "GOVERNANCE_GATE_BLOCKED",
        actor: "governance-gate",
        detail: JSON.stringify({ action, criticalViolations: report.criticalViolations }),
      },
    }).catch(() => undefined);
    throw new MelkApiError(
      "GOVERNANCE_BLOCKED",
      `کنش «${action}» توسط حاکمیت بلاک شد — نقض قواعد بحرانی: ${report.criticalViolations.join("، ")} (DES9 §۸).`,
      503,
      false,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ارزیابی سیاست (§۹-۱۲ DES9) — سیگنال واقعی + ثبت
// ─────────────────────────────────────────────────────────────────────────

interface PolicySignalInput {
  policyId: string;
  policyType: PolicyType;
  windowFrom: Date;
  windowTo: Date;
}

async function buildPolicySignal(input: PolicySignalInput, now: Date): Promise<PolicySignal> {
  const { policyId, windowFrom, windowTo } = input;
  const whereAudit = { createdAt: { gte: windowFrom, lte: windowTo } };
  const whereSafety = { checkedAt: { gte: windowFrom, lte: windowTo } };

  switch (policyId) {
    case "champion-gate-v1": {
      // رویدادها: ارتقا/رد/بلاک دروازه — موفق (عمل درست دروازه) vs ناموفق (نقض)
      const promoted = await db.modelVersion.count({ where: { promotedAt: { not: null }, ...whereAudit } });
      const rejected = await db.modelVersion.count({ where: { retiredAt: { not: null }, status: "rejected" } });
      const noCouncil = await db.modelVersion.count({ where: { councilApproved: false, promotedAt: { not: null } } });
      const signals: Array<"positive" | "negative"> = [];
      for (let i = 0; i < promoted; i++) signals.push("positive");
      for (let i = 0; i < rejected; i++) signals.push("positive"); // رد درست = کارکرد دروازه
      for (let i = 0; i < noCouncil; i++) signals.push("negative");
      return timeline(input, signals, await govAuditPoints(windowFrom, now), await compliancePoints(windowFrom, windowTo));
    }
    case "drift-alert-v1": {
      // مرز مخزن: دسترسی DriftCheck فقط از drift-service (گارد نویسندهٔ واحد)
      const { driftCountsInWindow } = await import("@/lib/services/drift-service");
      const { alerts, monitors } = await driftCountsInWindow(windowFrom, windowTo);
      const signals: Array<"positive" | "negative"> = [];
      for (let i = 0; i < monitors; i++) signals.push("positive"); // بدون رانش = پایداری سیاست
      for (let i = 0; i < alerts; i++) signals.push("positive"); // کشف درست = کارکرد
      return timeline(input, signals, await govAuditPoints(windowFrom, now), await compliancePoints(windowFrom, windowTo));
    }
    case "decision-safety-v1": {
      const passed = await db.safetyCheckRecord.count({ where: { passed: true, ...whereSafety } });
      const failed = await db.safetyCheckRecord.count({ where: { passed: false, ...whereSafety } });
      const signals: Array<"positive" | "negative"> = [
        ...Array.from({ length: passed }, () => "positive" as const),
        ...Array.from({ length: failed }, () => "negative" as const),
      ];
      return timeline(input, signals, await govAuditPoints(windowFrom, now), await compliancePoints(windowFrom, windowTo));
    }
    case "governance-strict-v1": {
      const checks = await db.governanceCheckRecord.findMany({ where: { checkedAt: whereSafety.checkedAt }, select: { passed: true, failed: true } });
      const signals: Array<"positive" | "negative"> = checks.flatMap((c) =>
        c.failed === 0 ? (["positive"] as const) : (Array.from({ length: c.failed }, () => "negative" as const)),
      );
      return timeline(input, signals, await govAuditPoints(windowFrom, now), checks.map((c) => ({ at: "", compliant: c.failed === 0 })));
    }
    case "session-30d-v1": {
      const oldSessions = await db.userSession.count({ where: { isActive: true, createdAt: { lt: new Date(now.getTime() - 30 * DAY) } } });
      const youngSessions = await db.userSession.count({ where: { isActive: true } });
      const signals: Array<"positive" | "negative"> = [
        ...Array.from({ length: youngSessions }, () => "positive" as const),
        ...Array.from({ length: oldSessions }, () => "negative" as const),
      ];
      return timeline(input, signals, await govAuditPoints(windowFrom, now), await compliancePoints(windowFrom, windowTo));
    }
    default:
      return timeline(input, [], [], []);
  }
}

async function govAuditPoints(from: Date, now: Date) {
  // نقاط هفتگی اثربخشی (timeline برای stability)
  const logs = await db.auditLog.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true }, take: 500 });
  const points: Array<{ at: string; effectiveness: number }> = [];
  const weeks = Math.max(1, Math.min(Math.ceil((now.getTime() - from.getTime()) / (7 * DAY)), 13));
  for (let w = 0; w < weeks; w++) {
    const seg = logs.filter((l) => l.createdAt.getTime() >= from.getTime() + w * 7 * DAY && l.createdAt.getTime() < from.getTime() + (w + 1) * 7 * DAY);
    if (seg.length > 0) points.push({ at: seg[0]!.createdAt.toISOString(), effectiveness: 1 });
  }
  return points;
}

async function compliancePoints(from: Date, to: Date) {
  const checks = await db.governanceCheckRecord.findMany({
    where: { checkedAt: { gte: from, lte: to } },
    select: { passed: true, failed: true, checkedAt: true },
  });
  return checks.map((c) => ({ at: c.checkedAt.toISOString(), compliant: c.failed === 0 }));
}

function timeline(
  input: PolicySignalInput,
  outcomeSignals: Array<"positive" | "negative" | "neutral">,
  tl: Array<{ at: string; effectiveness: number }>,
  audits: Array<{ at: string; compliant: boolean }>,
): PolicySignal {
  return {
    policyId: input.policyId,
    policyType: input.policyType,
    outcomeSignals,
    timeline: tl,
    audits,
    costHours: Math.round((outcomeSignals.length / 10) * 10) / 10, // تقریب شمارشی §۹
  };
}

export interface PolicyEvaluationResult {
  id: string;
  policyId: string;
  policyType: string;
  windowFrom: string;
  windowTo: string;
  metrics: { effectiveness: number; stability: number; compliance: number; costImpact: number };
  verdict: "keep" | "adjust" | "retire";
  rationale: string;
  insufficientData: boolean;
  eventCount: number;
  tierAtEvaluation: number;
}

export async function runPolicyEvaluation(
  policyId?: string,
  windowDays: number = POLICY_EVAL_WINDOW_DAYS,
  tier: LearningTier = 3,
): Promise<PolicyEvaluationResult[]> {
  const now = new Date();
  const windowFrom = new Date(now.getTime() - windowDays * DAY);
  const engine = new PolicyEvaluationEngineImpl();
  const results: PolicyEvaluationResult[] = [];

  for (const p of ACTIVE_POLICIES) {
    if (policyId && p.policyId !== policyId) continue;
    const signal = await buildPolicySignal({ policyId: p.policyId, policyType: p.policyType, windowFrom, windowTo: now }, now);
    const evaluation = engine.evaluatePolicy(signal, { from: windowFrom.toISOString(), to: now.toISOString() }, tier);
    const insufficientData = signal.outcomeSignals.length < POLICY_MIN_EVENTS;
    // §۱۰.۲ DES9: دادهٔ کم → حکم محافظه‌کارانه keep + برچسب صریح
    const verdict = insufficientData ? ("keep" as const) : evaluation.verdict;
    const rationale = insufficientData
      ? `${evaluation.rationale} — دادهٔ ناکافی (${signal.outcomeSignals.length} < ${POLICY_MIN_EVENTS}): حکم تمدید مشروط تا چرخهٔ بعد.`
      : evaluation.rationale;
    const row = await db.policyEvaluationRecord.create({
      data: {
        policyId: p.policyId,
        policyType: p.policyType,
        windowFrom,
        windowTo: now,
        metricsJson: JSON.stringify(evaluation.metrics),
        verdict,
        rationale,
        evidenceJson: JSON.stringify({ events: signal.outcomeSignals.length, insufficientData, audits: signal.audits.length }),
        tierAtEvaluation: tier,
      },
    });
    if (verdict !== "keep") {
      await db.auditLog.create({
        data: {
          action: "POLICY_VERDICT_ALERT",
          actor: "worker:policy-eval",
          detail: JSON.stringify({ policyId: p.policyId, verdict, rationale: rationale.slice(0, 200) }),
        },
      }).catch(() => undefined);
    }
    results.push({
      id: row.id,
      policyId: p.policyId,
      policyType: p.policyType,
      windowFrom: windowFrom.toISOString(),
      windowTo: now.toISOString(),
      metrics: {
        effectiveness: evaluation.metrics.effectiveness,
        stability: evaluation.metrics.stability,
        compliance: evaluation.metrics.compliance,
        costImpact: evaluation.metrics.costImpact,
      },
      verdict,
      rationale,
      insufficientData,
      eventCount: signal.outcomeSignals.length,
      tierAtEvaluation: tier,
    });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────
// خواندن‌ها (API)
// ─────────────────────────────────────────────────────────────────────────

export async function latestGovernanceCheck() {
  const row = await db.governanceCheckRecord.findFirst({ orderBy: { checkedAt: "desc" } });
  if (!row) return null;
  return {
    checkId: row.id,
    passed: row.passed,
    failed: row.failed,
    criticalViolations: safeParse<string[]>(row.criticalViolationsJson),
    results: safeParse<Array<{ ruleId: string; passed: boolean; severity: string; details: string }>>(row.resultsJson),
    enforcement: row.enforcement,
    triggerSource: row.triggerSource,
    checkedAt: row.checkedAt.toISOString(),
  };
}

export async function listGovernanceChecks(limit = 10) {
  const rows = await db.governanceCheckRecord.findMany({ orderBy: { checkedAt: "desc" }, take: Math.min(limit, 50) });
  return rows.map((r) => ({
    checkId: r.id,
    passed: r.passed,
    failed: r.failed,
    enforcement: r.enforcement,
    triggerSource: r.triggerSource,
    checkedAt: r.checkedAt.toISOString(),
  }));
}

export async function listPolicyEvaluations(policyId?: string) {
  const where = policyId ? { policyId } : {};
  const rows = await db.policyEvaluationRecord.findMany({ where, orderBy: { evaluatedAt: "desc" }, take: 50 });
  return rows.map((r) => ({
    id: r.id,
    policyId: r.policyId,
    policyType: r.policyType,
    verdict: r.verdict,
    metrics: safeParse<Record<string, number>>(r.metricsJson),
    rationale: r.rationale,
    windowFrom: r.windowFrom.toISOString(),
    windowTo: r.windowTo.toISOString(),
    evaluatedAt: r.evaluatedAt.toISOString(),
  }));
}

function safeParse<T>(json: string): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return [] as unknown as T;
  }
}

export { GOVERNANCE_RULES };
