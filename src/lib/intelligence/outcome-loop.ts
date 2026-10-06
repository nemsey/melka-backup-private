/**
 * حلقهٔ سرنوشت (Outcome Loop) — PHASE 7 / بازسازی فازهای ۷-۸-۹
 * ------------------------------------------------------
 * نگاشت‌گر منبع دادهٔ واقعی به موتورهای هوشمندی (طبق قرارداد engines/outcome):
 * پیش‌بینی روی دادهٔ واقعی ARM + پیامد واقعی + پیوند + ارزیابی صادقانه.
 *
 * طراحی (صادقانه و بازتولیدپذیر):
 *  ۱) نمونه‌گیری قطعی (deterministic): همهٔ ملک‌های «معامله شده» (پیامد مثبت
 *     واقعی ARM) + همان تعداد ملک «منتشر شده» (گروه مقایسه فعال) — مرتب بر
 *     اساس propertyCode (قطعیت کامل؛ بدون تصادف).
 *  ۲) ویژگی‌سازی واقعی: buildPropertyFeatures از ستون‌های واقعی ARM (بدون
 *     ستون status — پیش‌بینی‌کننده هرگز برچسب را نمی‌بیند؛ گارد نشت برچسب).
 *  ۳) پیش‌بینی: PropertyPredictor (heuristic v0.1) → احتمال معامله.
 *  ۴) پیامد واقعی: status عین ARM → TRANSACTION_OCCURRED / NOT_OCCURRED با
 *     evidence.observed عددی (مرجع حل موتور ارزیابی).
 *  ۵) پیوند: linkOutcome(predictionId, outcomeId) — حلقهٔ بستهٔ کامل.
 *  ۶) ارزیابی: Brier + کالیبراسیون + Lift نسبت به پیش‌بین نرخ پایه —
 *     هر عددی که باشد، همان گزارش می‌شود (قانون H).
 *
 * محدودیت افشاشده (صداقت ساختاری): پیش‌بینی و پیامد روی یک snapshot واحد
 * اند (دادهٔ پیامدی که پس از پیش‌بینی ثبت شده باشد هنوز وجود ندارد) — این
 * ارزیابی «قدرت افتراق مدل روی دادهٔ واقعی» را می‌سنجد، نه دقت زمانی؛
 * حلقهٔ زندهٔ دیمن v2 از این پس پیامدهای پس از پیش‌بینی را جمع می‌کند.
 *
 * مرز: این فایل در src/lib است (نه core/intelligence) — تنها نقطهٔ مجاز
 * دسترسی به DB (گارد خلوص P3-06).
 */

import type { PrismaClient } from "@prisma/client";
import {
  buildPropertyFeatures,
  type PropertyInput,
} from "@/core/intelligence/feature/builders/property-features";
import { buildMarketFeatures, type MarketSampleInput } from "@/core/intelligence/feature/builders/market-features";
import { PropertyPredictor } from "@/core/intelligence/prediction/predictors/property-predictor";
import type { PredictionRecord } from "@/core/intelligence/prediction/prediction-record";
import { InMemoryPredictionRepository } from "@/core/intelligence/prediction/prediction-repository";
import { createOutcomeEngine } from "@/core/intelligence/outcome/outcome-engine";
import type { StoredOutcomeRecord } from "@/core/intelligence/outcome/outcome-store";
import { createEvaluationEngine } from "@/core/intelligence/evaluation/evaluation-engine";
import type { EvaluationReport } from "@/core/intelligence/engines/evaluation";

/** شناسهٔ کاشی میزبان حلقه — M1 آگهی ملک تبریز (دادهٔ واقعی ARM) */
export const OUTCOME_TILE_ID = "arm-listing";

/** وضعیت ARM برای پیامد مثبت واقعی (معامله انجام‌شده) */
export const ARM_SOLD_STATUS = "معامله شده";
/** گروه مقایسه — آگهی فعال منتشرشده */
export const ARM_PUBLISHED_STATUS = "منتشر شده";

export interface OutcomeLoopSummary {
  ranAt: string;
  tileId: string;
  predictions: number;
  positiveOutcomes: number;
  negativeOutcomes: number;
  linked: number;
  evaluation: EvaluationReport & { unresolvablePairs?: number };
  /** دستور بازتولید کامل — شفافیت پرووِننس */
  reproduction: {
    source: "arm.melketabriz.ir (PropertyRecord واقعی)";
    soldStatus: string;
    controlStatus: string;
    ordering: "propertyCode صعودی";
    modelVersion: string;
    note: string;
  };
}

export interface OutcomeLoopResult {
  summary: OutcomeLoopSummary;
  predictions: PredictionRecord[];
  outcomes: StoredOutcomeRecord[];
}

/** ردیف خام DB → ورودی ضدفساد builder (ستون status عمداً حذف می‌شود) */
function toPropertyInput(row: {
  id: string;
  propertyCode: string;
  areaId: string | null;
  areaName: string | null;
  price: number | null;
  pricePerMeter: number | null;
  propertyTypeName: string | null;
  tradeTypeName: string | null;
  meterage: number | null;
  rooms: number | null;
  floor: number | null;
  buildYear: number | null;
  description: string | null;
}): PropertyInput | null {
  if (!row.areaId || !row.areaName) return null;
  if (!row.price || row.price <= 0) return null;
  if (!row.pricePerMeter || row.pricePerMeter <= 0) return null;
  if (!row.meterage || row.meterage <= 0 || row.meterage >= 2000) return null;
  const currentYear = 1405;
  return {
    id: row.propertyCode,
    areaId: row.areaId,
    areaName: row.areaName,
    price: row.price / 10, // ریال → تومان (§۳.۵ مرز واحد پول)
    pricePerMeter: row.pricePerMeter / 10,
    propertyType: row.propertyTypeName ?? "نامشخص",
    tradeType: row.tradeTypeName ?? "نامشخص",
    meterage: row.meterage,
    rooms: row.rooms ?? 0,
    floor: row.floor ?? 0,
    age: row.buildYear ? Math.max(0, currentYear - row.buildYear) : 0,
    hasElevator: false, // دادهٔ آسانسور/پارکینگ در لایه ۱ نیست — صادقانه خنثی
    hasParking: false,
    photoCount: 0,
    hasVideo: false,
    description: row.description ?? "",
    publisherType: "agency",
    publishedHoursAgo: 0,
  };
}

/**
 * اجرای کامل حلقهٔ سرنوشت روی دادهٔ واقعی — خالص نسبت به زمان ورودی.
 * همهٔ ذخیره‌سازی‌ها در حافظهٔ همین اجرا (بازتولیدپذیری کامل)؛ شاهد‌ها
 * جداگانه توسط دیمن/اسکریپت نوشته می‌شوند.
 */
export async function runOutcomeLoop(db: PrismaClient, now: Date = new Date()): Promise<OutcomeLoopResult> {
  // ---------- ۱) نمونه‌گیری قطعی ----------
  const select = {
    id: true,
    propertyCode: true,
    areaId: true,
    areaName: true,
    price: true,
    pricePerMeter: true,
    propertyTypeName: true,
    tradeTypeName: true,
    meterage: true,
    rooms: true,
    floor: true,
    buildYear: true,
    description: true,
  } as const;

  const [soldRows, controlRows, allRows] = await Promise.all([
    db.propertyRecord.findMany({
      where: { status: ARM_SOLD_STATUS, price: { gt: 0 }, pricePerMeter: { gt: 0 }, meterage: { gt: 0, lt: 2000 }, areaId: { not: null }, areaName: { not: null } },
      orderBy: { propertyCode: "asc" },
      select: { ...select, status: true },
    }),
    db.propertyRecord.findMany({
      where: { status: ARM_PUBLISHED_STATUS, price: { gt: 0 }, pricePerMeter: { gt: 0 }, meterage: { gt: 0, lt: 2000 }, areaId: { not: null }, areaName: { not: null } },
      orderBy: { propertyCode: "asc" },
      take: 1000,
      select: { ...select, status: true },
    }),
    db.propertyRecord.findMany({
      where: { price: { gt: 0 }, pricePerMeter: { gt: 0 }, meterage: { gt: 0, lt: 2000 }, areaId: { not: null }, areaName: { not: null } },
      orderBy: { propertyCode: "asc" },
      select,
    }),
  ]);

  // گروه مقایسه: همان تعداد مثبت‌ها — قطعی (اولین‌ها بر اساس کد)
  const positives = soldRows;
  const controls = controlRows.slice(0, positives.length);
  const sample = [...positives, ...controls];

  // ---------- ۲) ویژگی بازار واقعی هر منطقه (از کل دادهٔ معتبر) ----------
  const byArea = new Map<string, { pricePerMeter: number }[]>();
  for (const row of allRows) {
    if (!row.areaId || !row.pricePerMeter || row.pricePerMeter <= 0) continue;
    const list = byArea.get(row.areaId) ?? [];
    list.push({ pricePerMeter: row.pricePerMeter / 10 });
    byArea.set(row.areaId, list);
  }
  const marketByArea = new Map<string, ReturnType<typeof buildMarketFeatures>>();
  for (const [areaId, samples] of byArea) {
    const input: MarketSampleInput = {
      areaId,
      snapshotDate: now,
      samples,
    };
    marketByArea.set(areaId, buildMarketFeatures(input));
  }

  // ---------- ۳) پیش‌بینی + ۴/۵) پیامد واقعی + پیوند ----------
  const predictor = new PropertyPredictor();
  const predictionRepo = new InMemoryPredictionRepository();
  const outcomeEngine = createOutcomeEngine();

  const predictions: PredictionRecord[] = [];
  const outcomes: StoredOutcomeRecord[] = [];
  let positiveOutcomes = 0;
  let negativeOutcomes = 0;
  let linked = 0;

  for (const row of sample) {
    const input = toPropertyInput(row);
    if (!input) continue;
    const market = marketByArea.get(input.areaId);
    if (!market) continue;

    const record = await predictor.predict(buildPropertyFeatures(input, market), market, {
      agentId: "outcome-loop",
      tileId: OUTCOME_TILE_ID,
      entityId: input.id,
      now,
    });
    await predictionRepo.save(record);
    predictions.push(record);

    const observed = row.status === ARM_SOLD_STATUS ? 1 : 0;
    const stored = await outcomeEngine.append({
      tileId: OUTCOME_TILE_ID,
      predictionId: record.predictionId,
      outcome: observed === 1 ? "TRANSACTION_OCCURRED" : "NOT_OCCURRED",
      occurredAt: now.toISOString(),
      evidence: { observed, status: row.status, propertyCode: row.propertyCode, source: "arm" },
    });
    outcomes.push(stored);
    if (observed === 1) positiveOutcomes += 1;
    else negativeOutcomes += 1;

    await predictionRepo.linkOutcome(record.predictionId, stored.outcomeId);
    linked += 1;
  }

  // ---------- ۶) ارزیابی صادقانه ----------
  // خواندن مجدد از انبار — نسخه‌های پیوندشده (linkOutcome رکورد تازه برمی‌گرداند)
  const linkedPredictions: PredictionRecord[] = [];
  for (const p of predictions) {
    const fresh = await predictionRepo.findById(p.predictionId);
    if (fresh) linkedPredictions.push(fresh);
  }

  const evaluationEngine = createEvaluationEngine({
    predictions: {
      list: async (tileId?: string) => {
        const all: PredictionRecord[] = [];
        for (const p of linkedPredictions) {
          if (!tileId || p.contextSnapshot.tileId === tileId) all.push(p);
        }
        return all;
      },
    },
    outcomes: {
      query: async (q) =>
        outcomes
          .filter((o) => o.tileId === q.tileId)
          .filter((o) => (q.predictionId ? o.predictionId === q.predictionId : true))
          .map(({ outcomeId: _a, recordedAt: _b, ...v1 }) => v1),
    },
    // حداقل نمونه در حلقهٔ واقعی: ۱۰۰ (نظم نمونهٔ PREDICTION-BASELINE)
    minSample: 100,
    now: () => now,
  });
  const evaluation = await evaluationEngine.evaluate({ tileId: OUTCOME_TILE_ID, windowDays: 3650 });

  const summary: OutcomeLoopSummary = {
    ranAt: now.toISOString(),
    tileId: OUTCOME_TILE_ID,
    predictions: predictions.length,
    positiveOutcomes,
    negativeOutcomes,
    linked,
    evaluation,
    reproduction: {
      source: "arm.melketabriz.ir (PropertyRecord واقعی)",
      soldStatus: ARM_SOLD_STATUS,
      controlStatus: ARM_PUBLISHED_STATUS,
      ordering: "propertyCode صعودی",
      modelVersion: record_modelVersion(predictions),
      note: "پیش‌بینی و پیامد روی یک snapshot واحد — سنجش قدرت افتراق، نه دقت زمانی (محدودیت افشاشده)",
    },
  };

  return { summary, predictions: linkedPredictions, outcomes };
}

function record_modelVersion(predictions: PredictionRecord[]): string {
  return predictions[0]?.modelVersion ?? "unknown";
}
