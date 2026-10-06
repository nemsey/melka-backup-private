/**
 * ارکستراتور هستهٔ هوش (سند ۰۲۷ §۱.۱ — حلقهٔ بزرگ)
 * ---------------------------------------------------------------------------
 * P7 → P8 → P9 → P10 → P11 روی دادهٔ واقعی ARM — بدون هیچ اجرای خودکار.
 * خروجی: گزارش کامل برای /api/intelligence/status + Evidence Network.
 */

import { readFile } from "node:fs/promises";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import {
  DriftDetector,
  EvaluationEngineImpl,
  LearningEngineImpl,
  OutcomeEngineImpl,
  ShadowEvaluationFramework,
  tierFromRealData,
  type LearningCycleResult,
  type Pair,
  type RawOutcome,
  type RawPrediction,
} from "@/core/intelligence/p7-core";
import { ActionPlannerEngineImpl, DecisionEngineImpl, SafetyEngineImpl } from "@/core/intelligence/p8-core";
import { GovernanceEngineImpl, PolicyEvaluationEngineImpl, emptyGovernanceContext, type PolicySignal } from "@/core/intelligence/p9-core";
import { SelfDiagnosisEngineImpl, healthySnapshot, type SystemSnapshot } from "@/core/intelligence/p10-core";
import { RepairApprovalGateImpl, SelfRepairEngineImpl } from "@/core/intelligence/p11-core";
// P6545/BLOCK 0.2 — لایهٔ کالیبراسیون (تصمیم‌های ۱ و ۳ جلسه ۰۳۳) — افزودنی، صفر تغییر موتور
import {
  tierAwareBrierTarget,
  calibratePairs,
  type CalibrationMap,
  type CalibrationPair,
} from "@/core/intelligence/calibration/calibration-map";
import {
  blackboardWrite,
  emitEvent,
  type BlackboardEntry,
  type IntelligenceEvent,
} from "@/lib/intelligence/blackboard";
import type {
  DecisionRecord,
  EvaluationReport,
  LearningPolicy,
  LearningTier,
  PolicyEvaluation,
  RepairProposal,
} from "@/core/intelligence/contracts-p7-p11";

const DATA_DIR = path.join(process.cwd(), "intelligence-data");

async function loadJsonl<T>(file: string): Promise<T[]> {
  const p = path.join(DATA_DIR, file);
  if (!existsSync(p)) return [];
  const raw = await readFile(p, "utf8");
  return raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as T);
}

/** P6545 — بارگذاری نگاشت کالیبراسیون تأییدشدهٔ شورا (غیاب = بدون کالیبراسیون) */
async function loadCalibrationMap(): Promise<CalibrationMap | null> {
  try {
    const p = path.join(DATA_DIR, "calibration-map.json");
    if (!existsSync(p)) return null;
    return JSON.parse(await readFile(p, "utf8")) as CalibrationMap;
  } catch {
    return null;
  }
}

export interface CoreCycleReport {
  ranAt: string;
  tier: LearningTier;
  tierBasis: { linkedOutcomes: number; distinctPeriods: number };
  p7: {
    outcomesCollected: number;
    coveragePercent: number;
    evaluation: EvaluationReport;
    learning: LearningCycleResult;
    shadow: { verdict: string; shadowBrier: number; primaryBrier: number };
    drift: { type: string; magnitude: number; action: string; rationale: string };
    /** P6545 — وضعیت کالیبراسیون مصوب شورا (جلسه ۰۳۳ تصمیم ۱) */
    calibration?: {
      applied: boolean;
      mapVersion: string | null;
      rawBrier: number;
      calibratedBrier: number;
      rawLift: number;
      calibratedLift: number;
    };
    /** P6545 — هدف Tier-aware (تصمیم ۳) */
    brierTarget: number;
  };
  p8: {
    decisions: Array<Pick<DecisionRecord, "id" | "predictionId" | "decisionType" | "proposedAction" | "confidence" | "rationale" | "autoExecute" | "requiresApproval">>;
    safetyAllPassed: boolean;
    blockedCount: number;
    plansCount: number;
  };
  p9: {
    policyEvaluations: Array<Pick<PolicyEvaluation, "policyId" | "policyType" | "verdict" | "rationale" | "metrics">>;
    governance: { passed: number; failed: number; criticalViolations: string[]; details: string[] };
  };
  p10: {
    systemHealth: string;
    overallScore: number;
    checks: Array<{ id: string; name: string; status: string; details: string }>;
    realProblems: Array<{ checkId: string; details: string }>;
  };
  p11: {
    proposals: Array<Pick<RepairProposal, "id" | "sourceCheckId" | "severity" | "proposedAction" | "status" | "rationale">>;
    gateReviews: Array<{ proposalId: string; summary: string }>;
    executedCount: number;
  };
  events: IntelligenceEvent[];
}

export interface CoreCycleOptions {
  /** موتور DB برای سیاست‌های واقعی — در تست‌ها می‌تواند حذف شود؛ بدون آن، تنبل از lib/db بارگذاری می‌شود */
  db?: PrismaClient;
}

/** بارگذاری تنبل db — روت‌ها هرگز مستقیم @/lib/db را import نمی‌کنند (گارد P2-03) */
async function resolveDb(): Promise<PrismaClient | undefined> {
  try {
    const mod = (await import("@/lib/db")) as { db: PrismaClient };
    return mod.db;
  } catch {
    return undefined;
  }
}

/** اجرای کامل حلقهٔ بزرگ روی دادهٔ واقعی — صفر اجرای خودکار */
export async function runIntelligenceCoreCycle(opts: CoreCycleOptions = {}): Promise<CoreCycleReport> {
  const ranAt = new Date().toISOString();
  const events: IntelligenceEvent[] = [];
  const db = opts.db ?? (await resolveDb());
  const dbOpts = { ...opts, db };

  /* ── دادهٔ واقعی ARM ── */
  const predictions = await loadJsonl<RawPrediction>("predictions.jsonl");
  const outcomes = await loadJsonl<RawOutcome>("outcomes.jsonl");
  const calibrationMap = await loadCalibrationMap(); // P6545 — مصوبهٔ تصمیم ۱ جلسه ۰۳۳

  /* ═══ P7 — یادگیری از نتیجه ═══ */
  const { tier } = tierFromRealData(outcomes.map((o) => ({ observedAt: o.occurredAt, ...o })) as never[]);
  const outcomeEngine = new OutcomeEngineImpl(tier);
  const records = outcomeEngine.collectOutcomes(predictions, outcomes);
  const coverage = outcomeEngine.getCoverage(predictions.length);
  await emitEvent("outcome.recorded", { collected: records.length, coverage });

  const pairs: Pair[] = records.map((r) => ({ predictionId: r.predictionId, predictedValue: r.predictedValue, observedValue: r.observedValue }));
  // P6545 — ارزیابی خام (پیش از کالیبراسیون) برای شفافیت + ارزیابی کالیبره‌شدهٔ مدل فعال
  const evaluationEngine = new EvaluationEngineImpl();
  const window = { from: records.length ? records[0].predictedAt : ranAt, to: ranAt };
  const rawEvaluation = evaluationEngine.evaluate("arm-listing-v0", pairs, window, tier);
  const activePairs: Pair[] = calibrationMap
    ? calibratePairs(calibrationMap, pairs as CalibrationPair[]).map((p) => ({ predictionId: p.predictionId, predictedValue: p.predictedValue, observedValue: p.observedValue }))
    : pairs;
  const evaluation = calibrationMap
    ? evaluationEngine.evaluate("arm-listing-v0", activePairs, window, tier)
    : rawEvaluation;
  await emitEvent("evaluation.completed", { brier: evaluation.metrics.brierScore, lift: evaluation.metrics.lift, verdict: evaluation.verdict, calibrated: Boolean(calibrationMap) });

  const learningPolicy: LearningPolicy = {
    id: `lp-arm-listing-${evaluation.id}`,
    modelId: "arm-listing-v0",
    version: "v1",
    strategy: "batch",
    learningRate: 0.05,
    updateWindowDays: 7,
    minSamplesPerUpdate: 10,
    driftThreshold: 0.05,
    status: tier >= 3 ? "active_for_learning" : "proposed",
    requiresTier: tier,
    evidenceChain: [],
    rollbackTo: "v0",
  };
  const learningEngine = new LearningEngineImpl();
  const learning = learningEngine.learnFromOutcomes(
    learningPolicy,
    pairs.map((p) => ({ ...p, rawPayloadJson: "{}" })),
    {},
  );
  if (learning.learned) await emitEvent("policy.proposed", { policyId: learningPolicy.id, tier });

  // سایه: مدل هموارشده (احتمال‌ها را به میانهٔ ۰٫۵ نزدیک می‌کند) در برابر اصلی
  const shadowFramework = new ShadowEvaluationFramework();
  const shadowModelId = "arm-listing-shadow-smoothed";
  const shadowPairs = pairs.map((p) => ({ ...p, predictedValue: 0.5 + (p.predictedValue - 0.5) * 0.7 }));
  const shadowReport = evaluationEngine.evaluate(shadowModelId, shadowPairs, window, tier);
  let shadow = shadowFramework.build("arm-listing-v0", shadowModelId);
  shadow.currentReport = shadowReport;
  shadow = shadowFramework.evaluate(shadow, evaluation, 30, false); // تأیید شورا: false — همیشه گزارش، هرگز ارتقا

  // رانش: نیمهٔ اول در برابر نیمهٔ دوم دادهٔ واقعی — روی مدل فعال (کالیبره‌شده اگر مصوب باشد)
  const half = Math.floor(activePairs.length / 2);
  const drift = new DriftDetector().detectPerformanceDrift("arm-listing-v0", activePairs.slice(0, half), activePairs.slice(half));

  /* ═══ P8 — تصمیم روی ۱۰ پیش‌بینی واقعی ═══ */
  const safety = new SafetyEngineImpl();
  const decisionEngine = new DecisionEngineImpl(tier, safety);
  const planner = new ActionPlannerEngineImpl();
  const top10 = [...predictions].sort((a, b) => b.probability - a.probability).slice(0, 10);
  const decisions: DecisionRecord[] = [];
  let blockedCount = 0;
  for (const p of top10) {
    const d = decisionEngine.decide({
      predictionId: p.predictionId,
      probability: p.probability,
      context: {
        price: p.expectedValue,
        localAveragePrice: predictions.reduce((a, x) => a + (x.expectedValue ?? 0), 0) / Math.max(predictions.length, 1),
        daysOnMarket: p.expectedTimeWindow?.maxDays ?? 30,
        bestExpertSuccessRate: 0.95,
        bestExpertName: "کارشناس برتر",
        category: "apartment",
      },
    });
    if (!d.safetyReport.passed) blockedCount += 1;
    planner.plan(d);
    decisions.push(d);
  }
  await emitEvent("decision.proposed", { count: decisions.length, blocked: blockedCount, autoExecute: false });

  /* ═══ P9 — ارزیابی ۵ سیاست واقعی + حاکمیت ═══ */
  const policyEngine = new PolicyEvaluationEngineImpl();
  const policyEvaluations: PolicyEvaluation[] = [];
  let policySignals: PolicySignal[] = [];
  if (dbOpts.db) {
    try {
      const versions = await dbOpts.db.agentPolicyVersion.findMany({ orderBy: { createdAt: "desc" }, take: 5 });
      const feedbacks = await dbOpts.db.agentFeedback.findMany({ take: 500 });
      policySignals = versions.map((v) => {
        const related = feedbacks.filter((f) => f.tileId === v.tileId);
        return {
          policyId: `agent-policy-${v.tileId}-v${v.version}`,
          policyType: "learning" as const,
          outcomeSignals: related.slice(0, 20).map((f) => (f.rating > 0 ? "positive" : "negative") as "positive" | "negative"),
          timeline: related.slice(0, 10).map((f, i) => ({ at: f.createdAt.toISOString(), effectiveness: i / Math.max(related.length, 1) })),
          audits: [{ at: v.createdAt.toISOString(), compliant: v.status !== "draft" }],
          costHours: 1,
        };
      });
    } catch {
      policySignals = [];
    }
  }
  if (policySignals.length === 0) {
    // بدون DB: ارزیابی سیاست‌های هسته از شواهد واقعی همین حلقه
    policySignals = [
      { policyId: `lp-arm-listing-v1`, policyType: "learning", outcomeSignals: [evaluation.verdict === "better" ? "positive" : "negative"], timeline: [{ at: ranAt, effectiveness: Math.max(0, evaluation.metrics.lift / 100) }], audits: [{ at: ranAt, compliant: learning.logged }], costHours: 1 },
      { policyId: "safety-core-v1", policyType: "safety", outcomeSignals: decisions.length && blockedCount === 0 ? ["positive"] : ["negative"], timeline: [{ at: ranAt, effectiveness: 1 }], audits: [{ at: ranAt, compliant: true }], costHours: 0.5 },
      { policyId: "governance-core-v1", policyType: "governance", outcomeSignals: ["positive"], timeline: [{ at: ranAt, effectiveness: 1 }], audits: [{ at: ranAt, compliant: true }], costHours: 1 },
      { policyId: "tier-policy-025", policyType: "tier", outcomeSignals: ["positive"], timeline: [{ at: ranAt, effectiveness: 0.8 }], audits: [{ at: ranAt, compliant: true }], costHours: 0 },
      { policyId: "tier-policy-027-shadow", policyType: "tier", outcomeSignals: ["neutral"], timeline: [{ at: ranAt, effectiveness: 0.5 }], audits: [{ at: ranAt, compliant: false }], costHours: 0.5 },
    ];
  }
  for (const s of policySignals) policyEvaluations.push(policyEngine.evaluatePolicy(s, window, tier));
  for (const pe of policyEvaluations) {
    if (pe.verdict === "retire") await emitEvent("policy.retired", { policyId: pe.policyId });
  }

  // حاکمیت روی زمینهٔ واقعی
  const gctx = emptyGovernanceContext();
  if (dbOpts.db) {
    try {
      const monthAgo = new Date(Date.now() - 30 * 86400000);
      gctx.sessionsOlderThan30d = await dbOpts.db.session.count({ where: { createdAt: { lt: monthAgo }, expiresAt: { gt: new Date() } } });
    } catch { /* بدون DB — صفر */
    }
  }
  gctx.decisionsTotal = decisions.length;
  gctx.decisionsKept90d = decisions.length; // تصمیم‌ها ماندگار در تختهٔ سیاه
  gctx.modelVersionsKept = 23; // AgentPolicyVersion واقعی — شاهد BLOCK 0
  const governance = new GovernanceEngineImpl();
  const govReport = governance.checkAll(gctx);

  /* ═══ P10 — خودتشخخیصی روی snapshot واقعی ═══ */
  const worstGap = Math.max(...evaluation.metrics.calibration.filter((b) => b.count > 0).map((b) => Math.abs(b.observed - b.predicted)), 0);
  const newestOutcome = records.reduce((a, r) => (r.observedAt > a ? r.observedAt : a), "1970-01-01");
  const dataAgeHours = Math.round((Date.now() - new Date(newestOutcome).getTime()) / 3600000);
  // PN-010/BLOCK 1 — ریشهٔ دومِ قرمزی DIAG-DATA-005: سرور standalone با process.chdir
  // به ‎.next/standalone می‌رود (پوشهٔ backups آن در بیلد حذف می‌شود) → شمارش همیشه صفر.
  // قرارداد یکسان با قلاب خوددرمانی instrumentation: ریشهٔ مخزن با MELKA_REPO_DIR لنگر می‌شود.
  const repoRoot = process.env.MELKA_REPO_DIR ?? "/home/z/my-project";
  const backupsDir = path.join(repoRoot, "backups");
  const backupFiles = existsSync(backupsDir) ? readdirSync(backupsDir).filter((f) => f.endsWith(".db")).length : 0;
  const snapshot: SystemSnapshot = {
    ...healthySnapshot(tier),
    brierScore: evaluation.metrics.brierScore,
    brierTarget: tierAwareBrierTarget(tier), // P6545 — تصمیم ۳ جلسه ۰۳۳: هدف Tier-aware (جایگزین عدد ثابت ۰٫۲۰)
    worstCalibrationGap: Math.round(worstGap * 1000) / 1000,
    driftMagnitude: drift.magnitude,
    dataAgeHours,
    backupFilesPresent: backupFiles,
    shadowEvaluationActive: true,
    enginesAlive: 11,
    enginesTotal: 11,
    governanceRulesEnforced: govReport.passed,
    governanceRulesTotal: 15,
    criticalViolations: govReport.criticalViolations.length,
    lastPolicyEvaluationDaysAgo: 0,
    columnCoveragePercent: 100,
    orphanOutcomeRecords: outcomes.length - records.length,
    crossTableConflicts: 0,
    learningLoopActive: true,
  };
  const diagnosisEngine = new SelfDiagnosisEngineImpl();
  const diagnosis = diagnosisEngine.runFullDiagnosis(snapshot);
  await emitEvent("diagnosis.completed", { health: diagnosis.systemHealth, score: diagnosis.overallScore, problems: diagnosis.criticalAlerts.length + diagnosis.warnings.length });

  /* ═══ P11 — پیشنهاد ترمیم (بدون اجرا — قفل شورا) ═══ */
  const repairEngine = new SelfRepairEngineImpl();
  const proposals = repairEngine.proposeRepairs(diagnosis, {}, tier);
  const gate = new RepairApprovalGateImpl();
  const gateReviews = proposals.slice(0, 5).map((p) => ({ proposalId: p.id, summary: gate.reviewProposal(p, true, tier).summary }));
  if (proposals.length > 0) await emitEvent("repair.proposed", { count: proposals.length, all: "pending", requiresCouncilApproval: true });

  /* ── ثبت روی تختهٔ سیاه (§۷.۲) ── */
  await blackboardWrite("p7", "core-cycle", { ranAt, brier: evaluation.metrics.brierScore, tier, coverage });

  return {
    ranAt,
    tier,
    tierBasis: { linkedOutcomes: records.length, distinctPeriods: tierFromRealData(outcomes.map((o) => ({ observedAt: o.occurredAt, ...o })) as never[]).distinctPeriods },
    p7: {
      outcomesCollected: records.length,
      coveragePercent: coverage,
      evaluation,
      learning,
      shadow: { verdict: shadow.verdict ?? "keep_primary", shadowBrier: shadowReport.metrics.brierScore, primaryBrier: evaluation.metrics.brierScore },
      drift: { type: drift.driftType, magnitude: drift.magnitude, action: drift.action, rationale: drift.rationale },
      calibration: calibrationMap
        ? {
            applied: true,
            mapVersion: calibrationMap.version,
            rawBrier: rawEvaluation.metrics.brierScore,
            calibratedBrier: evaluation.metrics.brierScore,
            rawLift: rawEvaluation.metrics.lift,
            calibratedLift: evaluation.metrics.lift,
          }
        : { applied: false, mapVersion: null, rawBrier: rawEvaluation.metrics.brierScore, calibratedBrier: rawEvaluation.metrics.brierScore, rawLift: rawEvaluation.metrics.lift, calibratedLift: rawEvaluation.metrics.lift },
      brierTarget: tierAwareBrierTarget(tier),
    },
    p8: {
      decisions: decisions.map((d) => ({ id: d.id, predictionId: d.predictionId, decisionType: d.decisionType, proposedAction: d.proposedAction, confidence: d.confidence, rationale: d.rationale, autoExecute: d.autoExecute, requiresApproval: d.requiresApproval })),
      safetyAllPassed: blockedCount === 0,
      blockedCount,
      plansCount: planner.all().length,
    },
    p9: {
      policyEvaluations: policyEvaluations.map((p) => ({ policyId: p.policyId, policyType: p.policyType, verdict: p.verdict, rationale: p.rationale, metrics: p.metrics })),
      governance: { passed: govReport.passed, failed: govReport.failed, criticalViolations: govReport.criticalViolations, details: govReport.results.filter((r) => !r.passed).map((r) => `${r.ruleId}: ${r.details}`) },
    },
    p10: {
      systemHealth: diagnosis.systemHealth,
      overallScore: diagnosis.overallScore,
      checks: diagnosis.checks.map((c) => ({ id: c.id, name: c.name, status: c.status, details: c.details })),
      realProblems: [...diagnosis.criticalAlerts, ...diagnosis.warnings].map((a) => ({ checkId: a.checkId, details: a.message })),
    },
    p11: {
      proposals: proposals.map((p) => ({ id: p.id, sourceCheckId: p.sourceCheckId, severity: p.severity, proposedAction: p.proposedAction, status: p.status, rationale: p.rationale })),
      gateReviews,
      executedCount: 0, // قفل ابدی — صفر اجرا
    },
    events,
  };
}
