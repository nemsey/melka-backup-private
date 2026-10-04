/**
 * پیش‌بینی‌کننده کارشناس (ExpertPredictor) — PHASE 6 / P6-04
 * ------------------------------------------------------
 * heuristic شفاف v0: capacitySaturation + topRankProbability.
 * جدول مرجع: docs/PREDICTION-CONTRACT.md بند ۴-۳.
 *
 * انحراف صادقانه مصوب: فرمول دستور «activityScore» می‌خواست؛ این فیلد در
 * ExpertFeatureSet نیست — clamp01(activeDaysLast30/30) (نرخ روزهای فعال) proxy شد.
 *
 * ⚠️ قانون H: baseline قابل ارزیابی — نه مدل آموخته‌شده.
 */

import { clamp01 } from "../../feature/builders/guards";
import type { ExpertFeatureSet } from "../../feature/builders/expert-features";
import {
  makeDriver,
  type PredictionRecord,
  type PredictionRisk,
  type PredictOptions,
  type ExpertPredictionPayload,
} from "../prediction-record";
import { EXPERT_FEATURES_VERSION } from "../../feature/feature-engine";

export const EXPERT_PREDICTOR_VERSION = "expert-predictor-v0.1";

/** جدول وزن — بازرسی‌پذیر و قابل تنظیم برای کالیبراسیون PHASE 7 */
export const EXPERT_WEIGHTS = {
  capacity: { load: 0.7, capacityScore: 0.3 },
  topRank: { conversion: 0.4, networkQuality: 0.3, activity: 0.3 },
  loadSaturationReference: 20, // ۲۰ پرونده فعال = اشباع مرجع (assumptions)
} as const;

export class ExpertPredictor {
  predict(
    expert: ExpertFeatureSet,
    options?: PredictOptions,
  ): PredictionRecord<ExpertPredictionPayload> {
    const w = EXPERT_WEIGHTS;

    // ---------- سیگنال‌ها ----------
    const loadRatio = clamp01(expert.currentLoad / w.loadSaturationReference);
    const capacitySignal = clamp01(expert.capacityScore);
    const conversionSignal = clamp01(expert.conversionRate);
    const networkQualitySignal = clamp01(expert.networkQuality);
    const activityProxy = clamp01(expert.activeDaysLast30 / 30);

    // ---------- دو خروجی ----------
    const capacitySaturation = clamp01(
      w.capacity.load * loadRatio + w.capacity.capacityScore * (1 - capacitySignal),
    );
    const topRankProbability = clamp01(
      w.topRank.conversion * conversionSignal +
        w.topRank.networkQuality * networkQualitySignal +
        w.topRank.activity * activityProxy,
    );

    // ---------- drivers (۵ — سه topRank + دو capacity) ----------
    const drivers = [
      makeDriver("conversionRate", expert.conversionRate, w.topRank.conversion, conversionSignal),
      makeDriver("networkQuality", expert.networkQuality, w.topRank.networkQuality, networkQualitySignal),
      makeDriver("activeDaysLast30/30 (proxy activityScore)", expert.activeDaysLast30, w.topRank.activity, activityProxy),
      makeDriver("capacity.currentLoad", expert.currentLoad, w.capacity.load, loadRatio),
      makeDriver("capacity.capacityScore", expert.capacityScore, w.capacity.capacityScore, 1 - capacitySignal),
    ];

    // ---------- risks قاعده‌محور ----------
    const risks: PredictionRisk[] = [];
    if (capacitySaturation > 0.8) {
      risks.push({ type: "OVERLOADED", description: "اشباع ظرفیت کارشناس — ریسک تأخیر در پیگیری", severity: "high" });
    }
    if (expert.networkSize < 3) {
      risks.push({ type: "SMALL_NETWORK", description: "شبکه همکاران کوچک است — پوشش ضعیف", severity: "low" });
    }

    const assumptions = [
      "heuristic نسخه v0 — نه مدل آموخته‌شده؛ کالیبره با Outcome در PHASE 7",
      `مرجع اشباع ظرفیت ${w.loadSaturationReference} پرونده فعال (فرض — قابل تنظیم)`,
    ];

    const now = options?.now ?? new Date();
    return {
      predictionId: crypto.randomUUID(),
      predictionType: "EXPERT",
      probability: topRankProbability,
      confidence: clamp01(
        0.4 + 0.3 * clamp01(expert.interactionsLast30 / 100) + 0.3 * clamp01(expert.networkSize / 20),
      ),
      drivers,
      risks,
      assumptions,
      modelVersion: EXPERT_PREDICTOR_VERSION,
      featureVersion: EXPERT_FEATURES_VERSION,
      contextSnapshot: {
        agentId: options?.agentId ?? "",
        tileId: options?.tileId ?? "",
        entityId: options?.entityId ?? "",
        entityType: "expert",
        capturedAt: now,
        features: { expert },
      },
      createdAt: now,
      payload: { capacitySaturation, topRankProbability },
    };
  }
}
