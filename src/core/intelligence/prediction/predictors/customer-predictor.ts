/**
 * پیش‌بینی‌کننده مشتری (CustomerPredictor) — PHASE 6 / P6-04
 * ------------------------------------------------------
 * heuristic شفاف v0: churn + conversion.
 * جدول مرجع: docs/PREDICTION-CONTRACT.md بند ۴-۲.
 *
 * انحراف صادقانه مصوب: فرمول دستور «matchCount» می‌خواست؛ این فیلد در
 * CustomerFeatureSet نیست — previousVisits به‌عنوان proxy فعالیت واقعی.
 *
 * ⚠️ قانون H: baseline قابل ارزیابی — نه مدل آموخته‌شده.
 */

import { clamp01 } from "../../feature/builders/guards";
import type { CustomerFeatureSet } from "../../feature/builders/customer-features";
import {
  makeDriver,
  type PredictionRecord,
  type PredictionRisk,
  type PredictOptions,
  type CustomerPredictionPayload,
} from "../prediction-record";
import { CUSTOMER_FEATURES_VERSION } from "../../feature/feature-engine";

export const CUSTOMER_PREDICTOR_VERSION = "customer-predictor-v0.1";

/** جدول وزن — بازرسی‌پذیر و قابل تنظیم برای کالیبراسیون PHASE 7 */
export const CUSTOMER_WEIGHTS = {
  churn: { recency: 0.5, response: 0.3, activity: 0.2 },
  conversion: { seriousness: 0.4, budget: 0.35, visits: 0.25 },
} as const;

export class CustomerPredictor {
  predict(
    customer: CustomerFeatureSet,
    options?: PredictOptions,
  ): PredictionRecord<CustomerPredictionPayload> {
    const w = CUSTOMER_WEIGHTS;

    // ---------- سیگنال‌ها ----------
    const recencySignal = clamp01(customer.recencyDays / 60);
    const responseSignal = clamp01(customer.responseRate);
    const activitySignal = clamp01(customer.activityScore);
    const seriousnessSignal = clamp01(customer.seriousnessScore);
    const budgetSignal = clamp01(customer.budgetCompatibility);
    const visitsSignal = clamp01(customer.previousVisits / 5); // proxy واقعی match

    // ---------- دو خروجی ----------
    const churnProbability = clamp01(
      w.churn.recency * recencySignal +
        w.churn.response * (1 - responseSignal) +
        w.churn.activity * (1 - activitySignal),
    );
    const conversionProbability = clamp01(
      w.conversion.seriousness * seriousnessSignal +
        w.conversion.budget * budgetSignal +
        w.conversion.visits * visitsSignal,
    );

    // ---------- drivers (۶ — سه conversion + سه churn) ----------
    const drivers = [
      makeDriver("seriousnessScore", customer.seriousnessScore, w.conversion.seriousness, seriousnessSignal),
      makeDriver("budgetCompatibility", customer.budgetCompatibility, w.conversion.budget, budgetSignal),
      makeDriver("previousVisits (proxy matchCount)", customer.previousVisits, w.conversion.visits, visitsSignal),
      makeDriver("churn.recencyDays", customer.recencyDays, w.churn.recency, recencySignal),
      makeDriver("churn.responseRate", customer.responseRate, w.churn.response, 1 - responseSignal),
      makeDriver("churn.activityScore", customer.activityScore, w.churn.activity, 1 - activitySignal),
    ];

    // ---------- risks قاعده‌محور ----------
    const risks: PredictionRisk[] = [];
    if (customer.recencyDays > 30) {
      risks.push({ type: "INACTIVITY", description: "بیش از ۳۰ روز از آخرین تعامل گذشته — ریسک ازدست‌رفتن مشتری", severity: "medium" });
    }
    if (customer.previousTransactions === 0) {
      risks.push({ type: "NO_HISTORY", description: "سابقه معامله ثبت‌شده ندارد — عدم قطعیت پیش‌بینی بالاتر", severity: "low" });
    }

    const assumptions = [
      "heuristic نسخه v0 — نه مدل آموخته‌شده؛ کالیبره با Outcome در PHASE 7",
      "previousVisits به‌عنوان proxy واقعی matchCount (انحراف مصوب قرارداد — فیلد در FeatureSet نیست)",
    ];

    const now = options?.now ?? new Date();
    return {
      predictionId: crypto.randomUUID(),
      predictionType: "CUSTOMER",
      probability: conversionProbability,
      confidence: clamp01(
        0.4 + 0.3 * clamp01(customer.frequencyCount / 10) + 0.3 * (customer.previousTransactions > 0 ? 1 : 0.3),
      ),
      drivers,
      risks,
      assumptions,
      modelVersion: CUSTOMER_PREDICTOR_VERSION,
      featureVersion: CUSTOMER_FEATURES_VERSION,
      contextSnapshot: {
        agentId: options?.agentId ?? "",
        tileId: options?.tileId ?? "",
        entityId: options?.entityId ?? "",
        entityType: "customer",
        capturedAt: now,
        features: { customer },
      },
      createdAt: now,
      payload: { churnProbability, conversionProbability },
    };
  }
}
