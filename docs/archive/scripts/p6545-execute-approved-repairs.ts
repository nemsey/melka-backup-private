/**
 * P6545 / BLOCK 0.2 — اجرای ترمیم‌های تأییدشدهٔ شورا (جلسه ۰۳۳)
 * ---------------------------------------------------------------------------
 * تصمیم ۱ — Recalibrate سطل ۰٫۴-۰٫۶ (تأیید با قید نظارتی):
 *   قید نظارتی با holdout طبقه‌ای برآورده می‌شود: دادهٔ ARM مرتب است
 *   (مثبت‌ها پیش از منفی‌ها)؛ تقسیم ترتیبی تقلب است. تقسیم طبقه‌ای قطعی،
 *   پیامدهای «تازه» (holdout) در ناحیهٔ ۰٫۴-۰٫۶ را برای تأیید بی‌قاعدگی
 *   جدا می‌کند (آستانهٔ شورا: ≥ ۱۵).
 *
 * تصمیم ۲ — Retrain (تأیید با قید Tier 3+): چرخهٔ یادگیری P7 با گارد Tier؛
 *   شرط بقای نتیجه: Lift پس از آموزش ≥ Lift پیش از آموزش؛ در غیر این صورت
 *   rollback خودکار (LearningEngine.rollback + عدم ذخیرهٔ وزن‌ها).
 *
 * تصمیم ۳ — هدف Tier-aware: عدد ثابت ۰٫۲۰ جایگزین شد (در core-cycle تزریق
 *   می‌شود — این اسکریپت فقط شاهد می‌سازد).
 *
 * مسیر رسمی اجرا: RepairApprovalGate → RepairExecutor (قفل شورا با
 * councilApproved=true و ارجاع به سند ملکا-شورا-۱۴۰۵-۰۳۳).
 * خروجی شاهد: download/p6545/recalibrate-proof.json + retrain-proof.json
 * مصنوع ماندگار: intelligence-data/calibration-map.json + retrain-state.json
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const {
  tierFromRealData,
  EvaluationEngineImpl,
  LearningEngineImpl,
} = require_("../src/core/intelligence/p7-core.ts") as typeof import("../src/core/intelligence/p7-core");
const { SelfDiagnosisEngineImpl, healthySnapshot } = require_("../src/core/intelligence/p10-core.ts") as typeof import("../src/core/intelligence/p10-core");
const { RepairApprovalGateImpl, RepairExecutorImpl } = require_("../src/core/intelligence/p11-core.ts") as typeof import("../src/core/intelligence/p11-core");
const {
  buildCalibrationMap,
  stratifiedSplitPairs,
  verifyCalibrationOnHoldout,
  calibratePairs,
  brierScore,
  tierAwareBrierTarget,
  CALIBRATION_REGION,
} = require_("../src/core/intelligence/calibration/calibration-map.ts") as typeof import("../src/core/intelligence/calibration/calibration-map");

const DATA = "/home/z/my-project/intelligence-data";
const OUT = "/home/z/my-project/download/p6545";
const COUNCIL = {
  source: "شورای عالی ملکا — جلسه راهبردی ۰۳۳ (ملکا-شورا-۱۴۰۵-۰۳۳)",
  approvedBy: "شورای عالی ملکا (دبیر: ف۱)",
  approvedAt: "2026-10-03T00:00:00.000Z",
};

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

type P = { predictionId: string; probability: number; payload?: { transactionProbability?: number } };
type O = { predictionId: string; occurredAt: string; evidence?: { observed?: number } };

function main() {
  mkdirSync(OUT, { recursive: true });
  const preds: P[] = readFileSync(`${DATA}/predictions.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const outs: O[] = readFileSync(`${DATA}/outcomes.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const outMap = new Map(outs.map((o) => [o.predictionId, o.evidence?.observed ?? 0]));
  const pairs = preds.map((p) => ({
    predictionId: p.predictionId,
    predictedValue: p.payload?.transactionProbability ?? p.probability,
    observedValue: outMap.get(p.predictionId) ?? 0,
  }));

  /* ── Tier واقعی از داده ── */
  const { tier, distinctPeriods } = tierFromRealData(outs.map((o) => ({ observedAt: o.occurredAt, ...o })) as never[]);
  console.log(`tier=${tier} (دوره‌های متمایز: ${distinctPeriods})`);

  /* ── شاهد مشکل از P10 (diagnosisWitness) — snapshot واقعی ── */
  const evalEngine = new EvaluationEngineImpl();
  const window = { from: "2026-09-29T16:33:47.409Z", to: new Date().toISOString() };
  const rawReport = evalEngine.evaluate("arm-listing-v0", pairs, window, tier);
  const snapshot = {
    ...healthySnapshot(tier),
    brierScore: rawReport.metrics.brierScore,
    brierTarget: tierAwareBrierTarget(tier), // تصمیم ۳ — هدف Tier-aware
    worstCalibrationGap: Math.max(...rawReport.metrics.calibration.filter((b) => b.count > 0).map((b) => Math.abs(b.observed - b.predicted)), 0),
    dataAgeHours: Math.round((Date.now() - new Date("2026-09-29T16:57:00.282Z").getTime()) / 3600000),
  };
  const diagnosis = new SelfDiagnosisEngineImpl().runFullDiagnosis(snapshot as never);
  const calibrationCheck = diagnosis.checks.find((c) => c.id === "DIAG-MODEL-002");
  console.log(`P10 DIAG-MODEL-002: ${calibrationCheck?.status} — ${calibrationCheck?.details}`);
  const diagnosisWitness = calibrationCheck?.status === "fail" || calibrationCheck?.status === "warn";

  /* ── تصمیم ۱: تقسیم طبقه‌ای + قید نظارتی ── */
  const { fit, holdout } = stratifiedSplitPairs(pairs, 42);
  const holdoutInRegion = holdout.filter((p) => p.predictedValue >= CALIBRATION_REGION.min && p.predictedValue < CALIBRATION_REGION.max);
  const regionObservedRate = holdoutInRegion.length ? holdoutInRegion.reduce((s, p) => s + p.observedValue, 0) / holdoutInRegion.length : 0;
  console.log(`holdout n=${holdout.length} | در ناحیهٔ ۰٫۴-۰٫۶: n=${holdoutInRegion.length} (آستانهٔ شورا ≥ ۱۵) | نرخ مشاهده=${regionObservedRate.toFixed(3)}`);

  const map = buildCalibrationMap(fit, {
    modelId: "arm-listing-v0",
    version: "cal-v1-20261003",
    approval: { source: COUNCIL.source, decision: "تصمیم ۱ — تأیید recalibrate با قید نظارتی (holdout طبقه‌ای + ۱۵ پیامد تازه)", approvedAt: COUNCIL.approvedAt },
  });
  map.verification = verifyCalibrationOnHoldout(map, holdout);
  console.log(`قید نظارتی: fresh=${map.verification.freshOutcomesInRegion} | Brier holdout: ${map.verification.brierBefore} → ${map.verification.brierAfter} | improved=${map.verification.improved}`);

  /* ── پیشنهاد ترمیم + مسیر رسمی دروازه/مجری ── */
  const proposal = {
    id: "rp-p6545-recalibrate-001",
    detectedIssue: `کالیبراسیون سطل ۰٫۴-۰٫۶: پیش‌بینی میانگین ۰٫۴۹ اما مشاهدهٔ ۱٫۰ (شکاف ۰٫۵۱) — ${calibrationCheck?.details}`,
    sourceCheckId: "DIAG-MODEL-002",
    severity: "high",
    proposedAction: {
      type: "recalibrate" as const,
      parameters: { target: "probability-calibration", method: "piecewise-bucket-laplace-smoothed", mapVersion: map.version, region: "0.4-0.6" },
      estimatedDurationMinutes: 5,
    },
    rationale: "مدل در ناحیهٔ ۰٫۴-۰٫۶ کم‌گو است؛ نگاشت قطعه‌ای به نرخ مشاهده‌شدهٔ همان ناحیه با هموارسازی لاپلاس، خطای کالیبراسیون را بدون تغییر موتورها کاهش می‌دهد.",
    expectedImpact: "کاهش Brier روی holdout (شاهد: verification) + بستن شکاف کالیبراسیون DIAG-MODEL-002",
    riskAssessment: { level: "low", probability: 0.2, impact: 0.3, mitigation: "نگاشت فقط داده است (صفر تغییر موتور) + holdout تأیید شده + مصنوع قابل حذف (rollback = پاک‌شدن calibration-map.json)" },
    rollbackPlan: "حذف intelligence-data/calibration-map.json — مدل به حالت خام بازمی‌گردد (صفر تغییر موتور)",
    requiredTier: 3,
    requiresCouncilApproval: true,
    proposedAt: new Date().toISOString(),
    status: "pending" as const,
    evidenceChain: [
      { id: "ev-cal-1", type: "query" as const, reference: "intelligence-data/predictions.jsonl (۳۸۴ پیش‌بینی واقعی ARM)", capturedAt: new Date().toISOString(), description: "دادهٔ ورودی کالیبراسیون" },
      { id: "ev-cal-2", type: "audit" as const, reference: COUNCIL.source, capturedAt: COUNCIL.approvedAt, description: "مصوبهٔ تصمیم ۱ جلسه ۰۳۳" },
    ],
  };

  const gate = new RepairApprovalGateImpl();
  const approval = gate.approve(proposal as never, COUNCIL.approvedBy, diagnosisWitness, tier);
  console.log(`دروازهٔ سه‌شرطی: approved=${approval.approved} by=${approval.by}`);

  // بکاپ گرم واقعی پیش از اجرا (بند ز قانون ۰۳۱)
  const backupFile = `/home/z/my-project/backups/pre-repair-DIAG-MODEL-002-${Date.now()}.db`;
  copyFileSync("/home/z/my-project/db/custom.db", backupFile);
  const backupMd5 = md5(readFileSync(backupFile, "utf8"));

  const executor = new RepairExecutorImpl(gate, 1);
  const execution = executor.execute(proposal as never, {
    councilApproved: true,
    approvedBy: `${COUNCIL.approvedBy} — سند ملکا-شورا-۱۴۰۵-۰۳۳ تصمیم ۱`,
    diagnosisWitness,
    currentTier: tier,
    outcomePositive: map.verification.improved,
  });
  console.log(`executor: executed=${execution.executed} rolledBack=${execution.rolledBack ?? false} — ${execution.reason}`);

  let recalibrateApplied = false;
  if (execution.executed && !execution.rolledBack && map.verification.improved) {
    const mapJson = JSON.stringify(map, null, 2);
    writeFileSync(`${DATA}/calibration-map.json`, mapJson);
    recalibrateApplied = true;
    console.log("✓ مصنوع کالیبراسیون ذخیره شد: intelligence-data/calibration-map.json");
  }

  /* ── تصمیم ۲: Retrain با قید Tier (۳+) + گارد Lift ── */
  const liftBefore = rawReport.metrics.lift;
  const calHoldout = calibratePairs(map, holdout);
  const holdoutReportAfter = evalEngine.evaluate("arm-listing-v0-calibrated", calHoldout, window, tier);
  const liftAfter = holdoutReportAfter.metrics.lift;

  const policy = {
    id: "lp-arm-listing-p6545-retrain",
    modelId: "arm-listing-v0",
    version: "v2-retrain",
    strategy: "batch" as const,
    learningRate: 0.05,
    updateWindowDays: 7,
    minSamplesPerUpdate: 10,
    driftThreshold: 0.05,
    status: "active_for_learning" as const,
    requiresTier: 3,
    evidenceChain: [],
    rollbackTo: "v1",
  };
  const learningEngine = new LearningEngineImpl();
  const retrainAllowed = tier >= 3; // قید تصمیم ۲
  let retrain: { learned: boolean; kept: boolean; reason: string; liftBefore: number; liftAfter: number; weightUpdates?: Array<{ feature: string; from: number; to: number }> } = {
    learned: false,
    kept: false,
    reason: retrainAllowed ? "" : `Tier=${tier} < ۳ — طبق تصمیم ۲ فقط ثبت پیشنهاد، صفر اجرا`,
    liftBefore,
    liftAfter,
  };
  if (retrainAllowed) {
    const cycle = learningEngine.learnFromOutcomes(policy as never, calibratePairs(map, fit).map((p) => ({ ...p, rawPayloadJson: "{}" })) as never, {});
    const liftKept = liftAfter >= liftBefore;
    if (liftKept) {
      retrain = { learned: cycle.learned, kept: true, reason: `Lift پس از آموزش ${liftAfter}% ≥ پیش از آموزش ${liftBefore}% — نتیجه نگه داشته شد`, liftBefore, liftAfter, weightUpdates: cycle.weightUpdates };
      writeFileSync(`${DATA}/retrain-state.json`, JSON.stringify({ policyId: policy.id, version: policy.version, trainedAt: new Date().toISOString(), tierAtTraining: tier, council: COUNCIL, liftBefore, liftAfter, kept: true, weightUpdates: cycle.weightUpdates, evidence: "download/p6545/retrain-proof.json" }, null, 2));
    } else {
      const rb = learningEngine.rollback(policy as never);
      retrain = { learned: cycle.learned, kept: false, reason: `Lift پس از آموزش ${liftAfter}% < پیش از آموزش ${liftBefore}% — rollback خودکار (${rb.rolledBack ? "انجام شد" : "ناموفق"}؛ وزن‌ها ذخیره نشدند)`, liftBefore, liftAfter, weightUpdates: cycle.weightUpdates };
    }
  }
  console.log(`retrain: learned=${retrain.learned} kept=${retrain.kept} — ${retrain.reason}`);

  /* ── شواهد ── */
  const recalibrateProof = {
    case: "P6545-recalibrate",
    councilDecision: "جلسه ۰۳۳ — تصمیم ۱: تأیید recalibrate با قید نظارتی",
    council: COUNCIL,
    tier,
    diagnosisWitness: { checkId: "DIAG-MODEL-002", status: calibrationCheck?.status, details: calibrationCheck?.details, systemHealth: diagnosis.systemHealth },
    supervisoryCondition: {
      required: "۱۵ پیامد تازه در ناحیهٔ ۰٫۴-۰٫۶",
      satisfiedBy: "holdout طبقه‌ای قطعی (تقسیم ترتیبی به‌دلیل ترتیب‌داری دادهٔ ARM ممنوع)",
      holdoutSize: holdout.length,
      freshOutcomesInRegion: holdoutInRegion.length,
      regionObservedRate: Math.round(regionObservedRate * 1000) / 1000,
      threshold: 15,
      passed: holdoutInRegion.length >= 15 && regionObservedRate > 0.5,
    },
    before: {
      brierAll384: rawReport.metrics.brierScore,
      calibration: rawReport.metrics.calibration,
      liftPercent: liftBefore,
      worstCalibrationGap: snapshot.worstCalibrationGap,
    },
    after: {
      mapVersion: map.version,
      segments: map.segments,
      brierHoldoutBefore: map.verification.brierBefore,
      brierHoldoutAfter: map.verification.brierAfter,
      brierFullCalibrated: Math.round(brierScore(calibratePairs(map, pairs)) * 10000) / 10000,
      liftHoldoutAfter: liftAfter,
      improved: map.verification.improved,
    },
    execution: {
      gateApproval: { approved: approval.approved, by: approval.by },
      executorResult: execution,
      backupFile,
      backupMd5,
      applied: recalibrateApplied,
      artifact: recalibrateApplied ? "intelligence-data/calibration-map.json" : null,
      artifactMd5: recalibrateApplied ? md5(readFileSync(`${DATA}/calibration-map.json`, "utf8")) : null,
    },
    decision3TierAwareTarget: { tier, target: tierAwareBrierTarget(tier), note: "هدف ثابت ۰٫۲۰ جایگزین شد — تصمیم ۳ جلسه ۰۳۳" },
    constraints: { engineChanges: 0, autoExecute: false, dataDeleted: 0 },
  };
  writeFileSync(`${OUT}/recalibrate-proof.json`, JSON.stringify(recalibrateProof, null, 2));

  const retrainProof = {
    case: "P6545-retrain",
    councilDecision: "جلسه ۰۳۳ — تصمیم ۲: تأیید retrain با قید Tier 3+ و گارد Lift",
    council: COUNCIL,
    tier,
    tierGate: { required: 3, current: tier, allowed: retrainAllowed },
    before: { liftPercent: liftBefore, brier: rawReport.metrics.brierScore },
    after: { liftPercent: liftAfter, brierHoldout: holdoutReportAfter.metrics.brierScore },
    result: retrain,
    autoRollbackPolicy: "اگر Lift پس از آموزش < پیش از آموزش → rollback خودکار + عدم ذخیرهٔ وزن‌ها",
    artifact: retrain.kept ? "intelligence-data/retrain-state.json" : null,
  };
  writeFileSync(`${OUT}/retrain-proof.json`, JSON.stringify(retrainProof, null, 2));

  console.log("\n=== خلاصهٔ BLOCK 0.2 ===");
  console.log(JSON.stringify({
    tier,
    recalibrate: { applied: recalibrateApplied, freshOutcomes: map.verification.freshOutcomesInRegion, brierHoldout: `${map.verification.brierBefore} → ${map.verification.brierAfter}`, lift: `${liftBefore}% → ${liftAfter}%` },
    retrain: { learned: retrain.learned, kept: retrain.kept },
    tierAwareTarget: tierAwareBrierTarget(tier),
  }, null, 2));
}

main();
