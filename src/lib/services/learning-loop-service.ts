/**
 * learning-loop-service.ts — PN-018 فاز ۷: ارکستراتور حلقهٔ کامل یادگیری
 * ---------------------------------------------------------------------------
 * هفت گام (سند طراحی §۹):
 *   ۱. collectPairs      — جفت‌های واقعی prediction↔outcome
 *   ۲. evaluateChampion  — Brier قهرمان (یا خط پایه اگر قهرمانی نیست)
 *   ۳. learn             — وزن‌های آموخته (LearningEngine موجود)
 *   ۴. ensureChallenger  — نسخهٔ v(n+1) با وزن‌های تازه
 *   ۵. shadowTick        — Brier چالشگر + verdict (بدون شورا → هرگز ارتقا خودکار)
 *   ۶. [اختیاری] promote — فقط با تأیید صریح شورا
 *   ۷. newPredictions    — رکورد پیش‌بینی تازهٔ مهرشده با نسخهٔ فعال (نمونهٔ حلقه)
 */

import { appendFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { MelkApiError } from "@/lib/melk-api/types";
import { LearningEngineImpl, tierFromRealData, type Pair } from "@/core/intelligence/p7-core";
import type { LearningPolicy } from "@/core/intelligence/contracts-p7-p11";
import { loadRealPairs, runDriftDetection } from "@/lib/services/drift-service";
import {
  ensureChallenger,
  getChampion,
  promoteModelVersion,
  shadowTick,
  type ShadowTickResult,
} from "@/lib/services/model-versioning-service";

// PN-018: ایزوله‌سازی تست — تست‌ها MELKA_INTELLIGENCE_DATA_DIR را به فهرست موقت هدایت می‌کنند
const DATA_DIR = process.env.MELKA_INTELLIGENCE_DATA_DIR
  ? path.resolve(process.env.MELKA_INTELLIGENCE_DATA_DIR)
  : path.join(process.cwd(), "intelligence-data");

export interface FullLoopWitness {
  modelId: string;
  ranAt: string;
  step1_collectPairs: { pairs: number };
  step2_evaluateChampion: { championVersion: number | null; brier: number; tier: number };
  step3_learn: { learned: boolean; reason: string; weightUpdates: number };
  step4_ensureChallenger: { version: number; id: string };
  step5_shadow: ShadowTickResult;
  step6_promote: { attempted: boolean; promoted: boolean; reason: string };
  step7_newPrediction: { predictionId: string; modelVersionId: string; probability: number } | null;
  loopClosed: boolean;
}

export interface FullLoopOptions {
  modelId?: string;
  /** گام ۶ فقط با تأیید صریح — سند/جلسهٔ شورا */
  councilApproval?: boolean;
  approvalSource?: string;
  actor?: string;
}

export async function runFullLearningCycle(opts: FullLoopOptions = {}): Promise<FullLoopWitness> {
  const modelId = opts.modelId ?? "arm-listing-v0";
  const actor = opts.actor ?? "system:learning-loop";
  const ranAt = new Date().toISOString();

  /* گام ۱ — جمع‌آوری جفت‌ها */
  const pairs = await loadRealPairs();
  if (pairs.length === 0) {
    throw new MelkApiError("UNKNOWN", "جفت پیش‌بینی↔پیامدی برای حلقه موجود نیست.", 409, false);
  }

  /* گام ۲ — ارزیابی قهرمان (یا خط پایه) + Tier از دادهٔ واقعی */
  const champion = await getChampion(modelId);
  const evModule = await import("@/core/intelligence/p7-core");
  const evalEngine = new evModule.EvaluationEngineImpl();
  const window = { from: pairs[0].predictedAt ?? ranAt, to: ranAt };
  // Tier از پیامدهای واقعی (عین core-cycle — با ساختار OutcomeRecord)
  const rawOutcomes = await readFile(path.join(DATA_DIR, "outcomes.jsonl"), "utf8")
    .then((t) => t.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as { predictionId: string; occurredAt: string }))
    .catch(() => [] as Array<{ predictionId: string; occurredAt: string }>);
  // نگاشت عین core-cycle: occurredAt خام → observedAt مدل OutcomeRecord
  const { tier } = tierFromRealData(rawOutcomes.map((o) => ({ observedAt: o.occurredAt, ...o })) as never[]);
  const championReport = evalEngine.evaluate(champion ? `${modelId}-v${champion.version}` : `${modelId}-baseline`, pairs, window, tier);

  /* گام ۳ — یادگیری (موتور موجود — سیاست Tier-aware) */
  const policy: LearningPolicy = {
    id: `lp-${modelId}-full-loop-${Date.now().toString(36)}`,
    modelId,
    version: champion ? `v${champion.version + 1}` : "v1",
    strategy: "batch",
    learningRate: 0.05,
    updateWindowDays: 7,
    minSamplesPerUpdate: 10,
    driftThreshold: 0.05,
    status: tier >= 3 ? "active_for_learning" : "proposed",
    requiresTier: tier,
    evidenceChain: [],
    rollbackTo: champion ? `v${champion.version}` : "v0",
  };
  const learningEngine = new LearningEngineImpl();
  const learning = learningEngine.learnFromOutcomes(policy, pairs.map((p) => ({ ...p, rawPayloadJson: "{}" })), {});
  const learnedWeights: Record<string, number> = {};
  for (const u of learning.weightUpdates) learnedWeights[u.feature] = u.to;

  /* گام ۴ — ساخت چالشگر با وزن‌های آموخته */
  const challenger = await ensureChallenger({
    modelId,
    weights: Object.keys(learnedWeights).length > 0 ? learnedWeights : undefined,
    notes: `حلقهٔ کامل ${ranAt} — ${learning.reason.slice(0, 120)}`,
    actor,
  });

  /* گام ۵ — ارزیابی سایه (پنجره = کل تاریخ جفت‌ها به روز) */
  const windowDays = Math.max(1, Math.round((Date.now() - new Date(window.from).getTime()) / 86400000));
  const shadow = await shadowTick(modelId, pairs, windowDays);

  /* گام ۶ — ارتقا فقط با تأیید شورا (پیش‌فرض: هرگز) */
  let promoteStep: FullLoopWitness["step6_promote"] = { attempted: false, promoted: false, reason: "بدون تأیید شورا در ورودی — ارتقا انجام نمی‌شود (قید سند ۰۲۷ §۲.۴)." };
  if (opts.councilApproval) {
    promoteStep.attempted = true;
    try {
      await promoteModelVersion(challenger.id, {
        councilApproval: true,
        approvalSource: opts.approvalSource ?? "بدون-منبع",
        actor,
      });
      promoteStep = { attempted: true, promoted: true, reason: `ارتقا با تأیید شورا انجام شد (${opts.approvalSource}).` };
    } catch (e) {
      promoteStep = { attempted: true, promoted: false, reason: e instanceof MelkApiError ? e.message : "شرایط ارتقا برقرار نبود." };
    }
  }

  /* گام ۷ — پیش‌بینی تازهٔ مهرشده با نسخهٔ فعال (جریان زندهٔ حلقه) */
  const activeChampion = await getChampion(modelId);
  let newPrediction: FullLoopWitness["step7_newPrediction"] = null;
  if (activeChampion) {
    const predictionId = `pred-fullloop-${randomUUID().slice(0, 8)}`;
    const record = JSON.stringify({
      predictionId,
      predictionType: "PROPERTY",
      probability: 0.5,
      confidence: 1,
      modelVersionId: activeChampion.id,
      generatedByLoop: `pn018-full-loop-${ranAt}`,
    });
    // جریان زندهٔ جدا از snapshot تاریخی دیمن (predictions.jsonl فقط‌یک‌بار نوشته می‌شود —
    // افزودن به آن پوشش ۱۰۰٪ پیوند پیامد دیمن را می‌شکند؛ شاهد p6537-ح-۲)
    await appendFile(path.join(DATA_DIR, "predictions-live.jsonl"), record + "\n", "utf8");
    newPrediction = { predictionId, modelVersionId: activeChampion.id, probability: 0.5 };
  }

  return {
    modelId,
    ranAt,
    step1_collectPairs: { pairs: pairs.length },
    step2_evaluateChampion: { championVersion: champion?.version ?? null, brier: championReport.metrics.brierScore, tier },
    step3_learn: { learned: learning.learned, reason: learning.reason, weightUpdates: learning.weightUpdates.length },
    step4_ensureChallenger: { version: challenger.version, id: challenger.id },
    step5_shadow: shadow,
    step6_promote: promoteStep,
    step7_newPrediction: newPrediction,
    loopClosed: Boolean(newPrediction),
  };
}

/** اجرای رانش برای همهٔ مدل‌های قهرمان — کار Worker (هر ۶ ساعت) */
export async function driftGuardTick(): Promise<{ models: string[]; runs: number; alerts: number }> {
  const ids = await (await import("@/lib/services/model-versioning-service")).championedModelIds();
  let runs = 0;
  let alerts = 0;
  for (const modelId of ids) {
    const r = await runDriftDetection(modelId);
    runs += 1;
    alerts += r.reports.filter((x) => x.action !== "monitor").length;
  }
  return { models: ids, runs, alerts };
}
