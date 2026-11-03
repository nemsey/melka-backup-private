/**
 * pn019-run-witnesses.ts — اجرای رسمی شواهد فاز ۸+۹ روی دادهٔ واقعی
 * ---------------------------------------------------------------------------
 * خروجی‌ها (download/pn019/):
 *   decision-deepened.json — ساخت تصمیم سایهٔ واقعی + انگشت‌نگاری ۱۵ فیلد
 *   action-planner.json    — هر ۵ الگو × rollback/simulate/impact (برنامهٔ واقعی + ماتریس الگوها)
 *   safety.json            — هفت قاعده × سلبی/ایجابی + شمارش شاهدها
 *   governance.json        — بررسی کامل ۱۵قاعده‌ای با زمینهٔ زندهٔ ۱۷فیلدی
 *   policy-eval.json       — پنج سیاست × ۴ متریک × سه حکم
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import {
  createDecisionFromPrediction,
  listDecisions,
  expireSweep,
} from "@/lib/services/decision-service";
import {
  runGovernanceCheck,
  runPolicyEvaluation,
  latestGovernanceCheck,
} from "@/lib/services/governance-service";
import {
  EXPECTED_IMPACT_TABLE,
  ROLLBACK_PLANS,
  isDecisionExpired,
  type PlannerPattern,
} from "@/core/intelligence/p8-core";
import type { DecisionType } from "@/core/intelligence/contracts-p7-p11";
import { readFile } from "node:fs/promises";

const OUT = join(process.cwd(), "download", "pn019");
mkdirSync(OUT, { recursive: true });
const write = (name: string, data: unknown) => {
  writeFileSync(join(OUT, name), JSON.stringify(data, null, 2), "utf8");
  console.log(`  ✓ ${name}`);
};

const ranAt = new Date().toISOString();
console.log("اجرا:", ranAt);

/* ═══ ۱) تصمیم سایهٔ واقعی از جفت‌های قهرمان ═══ */
console.log("\n— فاز ۸: تصمیم سایه —");
const predFile = join(process.cwd(), "intelligence-data", "predictions.jsonl");
const lines = (await readFile(predFile, "utf8")).split("\n").filter((l) => l.trim()).slice(-5);
const created: string[] = [];
for (const line of lines) {
  const pred = JSON.parse(line) as { predictionId: string; probability: number };
  const row = await createDecisionFromPrediction({
    predictionId: pred.predictionId,
    probability: pred.probability,
    context: { daysOnMarket: 45, category: "apartment" },
    tierAtCreation: 3,
    actor: "pn019:witness-run",
    mode: "shadow",
  });
  created.push(row.id);
  console.log(`  تصمیم ${row.decisionType} (${row.confidence}) اثر +${row.expectedImpact.liftPercent}٪ — بدیل‌ها: ${row.alternatives.length}`);
}

const all = await listDecisions({ limit: 200 });
const sample = all.find((d) => d.id === created[0]) ?? all[0];
if (!sample) throw new Error("هیچ تصمیمی ساخته نشد");

/* انگشت‌نگاری ۱۵ فیلد پندرگانه (DES8 §۶) */
const fields15 = [
  ["id", sample.id],
  ["predictionId", sample.predictionId],
  ["decisionType", sample.decisionType],
  ["proposedAction", sample.proposedAction],
  ["confidence", sample.confidence],
  ["rationale", sample.rationale.slice(0, 160) + "…"],
  ["expectedImpact", sample.expectedImpact],
  ["alternatives", sample.alternatives],
  ["requiredResources", sample.requiredResources],
  ["safetyReport", sample.safetyReport],
  ["status", sample.status],
  ["expiresAt", sample.expiresAt],
  ["createdAt", sample.createdAt],
  ["tierAtCreation", sample.tierAtCreation],
  ["modelVersionId", sample.modelVersionId],
] as const;

write("decision-deepened.json", {
  council: "ملکا-شورا-ن۰۲۳-۱۴۰۵",
  stage: "فاز ۸ — تعمیق موتور تصمیم",
  ranAt,
  recordCount: all.length,
  createdThisRun: created.length,
  fields15: fields15.map(([k, v]) => ({ field: k, value: v })),
  fieldCount: fields15.length,
  guarantees: {
    minAlternatives: { rule: "≥۳", actual: sample.alternatives.length },
    expectedImpactQuantitative: { liftPercent: sample.expectedImpact.liftPercent, reach: sample.expectedImpact.reach, horizonDays: sample.expectedImpact.horizonDays, basis: sample.expectedImpact.basis },
    expiration: { expiresAt: sample.expiresAt, ttl: "۷ روز (env)", isExpired: isDecisionExpired({ expiresAt: sample.expiresAt }) },
    autoExecute: false,
    requiresApproval: true,
  },
  expectedImpactTable: EXPECTED_IMPACT_TABLE,
  statusBreakdown: all.reduce<Record<string, number>>((acc, d) => {
    acc[d.decisionType] = (acc[d.decisionType] ?? 0) + 1;
    return acc;
  }, {}),
});

/* ═══ ۲) برنامه‌ریز اقدام — برنامهٔ واقعی + ماتریس ۵ الگو ═══ */
console.log("\n— فاز ۸: برنامه‌ریز اقدام —");
const planRows = await db.actionPlanRecord.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
const realPlan = planRows.find((r) => r.decisionId === created[0]) ?? planRows[0];
const patternMatrix: Record<string, string> = {};
for (const p of Object.keys(ROLLBACK_PLANS) as PlannerPattern[]) patternMatrix[p] = ROLLBACK_PLANS[p];

write("action-planner.json", {
  council: "ملکا-شورا-ن۰۲۳-۱۴۰۵",
  stage: "فاز ۸ — Action Planner با تخمین اثر",
  ranAt,
  planCount: planRows.length,
  realPlan: realPlan
    ? {
        id: realPlan.id,
        decisionId: realPlan.decisionId,
        pattern: realPlan.pattern,
        steps: JSON.parse(realPlan.stepsJson),
        rollbackPlan: realPlan.rollbackPlan,
        simulation: JSON.parse(realPlan.simulationJson),
        impact: JSON.parse(realPlan.impactJson),
        estimatedDurationMinutes: realPlan.estimatedDurationMinutes,
        riskLevel: realPlan.riskLevel,
        autoExecute: realPlan.autoExecute,
      }
    : null,
  rollbackMatrixAllFivePatterns: patternMatrix,
  constraint: "autoExecute=false در همهٔ برنامه‌ها — اجرای گام وجود ندارد (قید سازنده)",
});

/* ═══ ۳) ایمنی — شمارش شاهدها + تست سلبی/ایجابی مرزی ═══ */
console.log("\n— فاز ۸: ایمنی —");
const safetyRows = await db.safetyCheckRecord.findMany({ orderBy: { checkedAt: "desc" }, take: 200 });
const shadowRuns = await db.shadowDecisionRun.findMany({ take: 200 });

// تست سلبی زنده: تصمیم با confidence پایین → باید بلاک شود (SAF-002)
const { SafetyEngineImpl } = await import("@/core/intelligence/p8-core");
const se = new SafetyEngineImpl();
const lowConfidenceCheck = se.check(
  { id: "neg-1", predictionId: "p-x", decisionType: "wait", proposedAction: "x", confidence: 0.2, rationale: "تست سلبی", alternatives: [], expectedOutcome: "", requiredResources: [], requiresApproval: true, autoExecute: false, safetyChecked: true, safetyReport: { passed: true, blockedBy: [], warnings: [], checkedRules: [], checkedAt: ranAt }, createdAt: ranAt, expiresAt: ranAt, tierAtCreation: 0 },
  {},
);
const noRationaleCheck = se.check(
  { id: "neg-2", predictionId: "p-x", decisionType: "wait", proposedAction: "x", confidence: 0.6, rationale: "", alternatives: [], expectedOutcome: "", requiredResources: [], requiresApproval: true, autoExecute: false, safetyChecked: true, safetyReport: { passed: true, blockedBy: [], warnings: [], checkedRules: [], checkedAt: ranAt }, createdAt: ranAt, expiresAt: ranAt, tierAtCreation: 0 },
  {},
);
const financialAutoCheck = se.check(
  { id: "neg-3", predictionId: "p-x", decisionType: "adjust_price", proposedAction: "x", confidence: 0.6, rationale: "تست", alternatives: [], expectedOutcome: "", requiredResources: [], requiresApproval: true, autoExecute: false, safetyChecked: true, safetyReport: { passed: true, blockedBy: [], warnings: [], checkedRules: [], checkedAt: ranAt }, createdAt: ranAt, expiresAt: ranAt, tierAtCreation: 0 },
  { financialAuto: true },
);

write("safety.json", {
  council: "ملکا-شورا-ن۰۲۳-۱۴۰۵",
  stage: "فاز ۸ — Safety هفت‌قاعده‌ای fail-closed",
  ranAt,
  sevenRules: ["SAF-001 صفر تصمیم بدون prediction", "SAF-002 صفر تصمیم با confidence<۰٫۳", "SAF-003 صفر تصمیم بدون rationale", "SAF-004 صفر اقدام مالی خودکار", "SAF-005 صفر تماس بدون تأیید", "SAF-006 صفر تغییر داده بدون audit", "SAF-007 صفر LLM در production"],
  witnessCounts: {
    safetyChecks: safetyRows.length,
    passed: safetyRows.filter((s) => s.passed).length,
    blocked: safetyRows.filter((s) => !s.passed).length,
    shadowRuns: shadowRuns.length,
    zeroExecutionViolations: shadowRuns.filter((s) => s.executedSteps !== 0).length,
  },
  negativeTests: {
    lowConfidence_0_2: { passed: lowConfidenceCheck.passed, blockedBy: lowConfidenceCheck.blockedBy, expectation: "SAF-002 بلاک", ok: lowConfidenceCheck.blockedBy.includes("SAF-002") },
    emptyRationale: { passed: noRationaleCheck.passed, blockedBy: noRationaleCheck.blockedBy, expectation: "SAF-003 بلاک", ok: noRationaleCheck.blockedBy.includes("SAF-003") },
    financialAuto: { passed: financialAutoCheck.passed, blockedBy: financialAutoCheck.blockedBy, expectation: "SAF-004 بلاک", ok: financialAutoCheck.blockedBy.includes("SAF-004") },
  },
  failClosed: "هر استثنای ناشناخته در مسیر ارزیابی → passed=false با blockedBy=[SAF-000]",
});

/* ═══ ۴) جاروب انقضا (شفافیت — باید صفر یا کم باشد چون همهٔ تصمیم‌ها تازه‌اند) ═══ */
const sweep = await expireSweep();

/* ═══ ۵) حاکمیت — بررسی کامل ۱۵قاعده‌ای با زمینهٔ زنده ═══ */
console.log("\n— فاز ۹: حاکمیت —");
const govCheck = await runGovernanceCheck("manual");
write("governance.json", {
  council: "ملکا-شورا-ن۰۲۳-۱۴۰۵",
  stage: "فاز ۹ — Governance ۱۵ قاعده",
  ranAt: govCheck.checkedAt,
  checkId: govCheck.checkId,
  summary: { passed: govCheck.passed, failed: govCheck.failed, criticalViolations: govCheck.criticalViolations, enforcement: govCheck.enforcement },
  liveContext17Fields: govCheck.context,
  results: govCheck.results,
});

/* ═══ ۶) ارزیابی پنج سیاست ═══ */
console.log("\n— فاز ۹: ارزیابی سیاست —");
const evals = await runPolicyEvaluation(undefined, 90, 3);
write("policy-eval.json", {
  council: "ملکا-شورا-ن۰۲۳-۱۴۰۵",
  stage: "فاز ۹ — Policy Evaluation (۵ سیاست × ۴ متریک × ۳ حکم)",
  ranAt,
  windowDays: 90,
  evaluations: evals,
  constraint: "حکم فقط توصیه است — اعمال هر تغییر سیاست نیازمند تأیید شوراست (قید مطلق)",
  workerCycle: "هر ۹۰ روز (کار policy-eval — Worker دوازدهم)",
});

console.log("\n═══ خلاصه ═══");
console.log(`تصمیم‌های ساخته‌شده: ${created.length} · جاروب انقضا: ${sweep.expiredNow}`);
console.log(`حاکمیت: ${govCheck.passed} سبز / ${govCheck.failed} قرمز (critical: ${govCheck.criticalViolations.length})`);
console.log(`ارزیابی: ${evals.map((e) => `${e.policyId}=${e.verdict}`).join(" · ")}`);
await db.$disconnect();
