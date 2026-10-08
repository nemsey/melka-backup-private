/**
 * drift-service.ts — PN-018 فاز ۷: آشکارساز رانش سه‌گانهٔ پایدار
 * ---------------------------------------------------------------------------
 * سه نوع رانش (عین DriftDetector موجود — صفر تغییر موتور):
 *   · performance — مقایسهٔ Brier دو پنجره
 *   · data — جابه‌جایی میانگین ویژگی‌ها
 *   · concept — تغییر نرخ مشاهدهٔ واقعی
 * هر اجرا: تا سه ردیف DriftCheck (append-only) + AuditLog برای کنش alert+.
 * آستانه‌ها از env (Policy) با پیش‌فرض‌های سند طراحی (پیوست ج).
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { DriftDetector, EvaluationEngineImpl, type Pair } from "@/core/intelligence/p7-core";

// ─────────────────────────────────────────────────────────────────────────
// آستانه‌ها (Policy — پیوست ج)
// ─────────────────────────────────────────────────────────────────────────

export const DRIFT_ALERT = Number(process.env.MELK_DRIFT_ALERT ?? 0.02);
export const DRIFT_RETRAIN = Number(process.env.MELK_DRIFT_RETRAIN ?? 0.05);
export const DRIFT_ESCALATE = Number(process.env.MELK_DRIFT_ESCALATE ?? 0.10);

// PN-018: ایزوله‌سازی تست — تست‌ها MELKA_INTELLIGENCE_DATA_DIR را به فهرست موقت هدایت می‌کنند
const DATA_DIR = process.env.MELKA_INTELLIGENCE_DATA_DIR
  ? path.resolve(process.env.MELKA_INTELLIGENCE_DATA_DIR)
  : path.join(process.cwd(), "intelligence-data");
const DRIFT_TYPES = ["performance", "data", "concept"] as const;
const DRIFT_ACTIONS = ["monitor", "alert", "retrain", "escalate"] as const;

// ─────────────────────────────────────────────────────────────────────────
// بارگذاری جفت‌های واقعی (عین الگوی core-cycle)
// ─────────────────────────────────────────────────────────────────────────

interface RawPrediction {
  predictionId: string;
  probability: number;
  drivers?: Array<{ feature: string; value: number; weight: number }>;
  modelVersionId?: string;
}
interface RawOutcome {
  predictionId: string;
  evidence?: { observed?: number };
}

async function loadJsonl<T>(file: string): Promise<T[]> {
  const p = path.join(DATA_DIR, file);
  if (!existsSync(p)) return [];
  const raw = await readFile(p, "utf8");
  return raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as T);
}

/** جفت‌های پیش‌بینی↔پیامد از دادهٔ واقعی حلقه */
export async function loadRealPairs(): Promise<Pair[]> {
  const predictions = await loadJsonl<RawPrediction>("predictions.jsonl");
  const outcomes = await loadJsonl<RawOutcome>("outcomes.jsonl");
  const byId = new Map(outcomes.map((o) => [o.predictionId, o]));
  const pairs: Pair[] = [];
  for (const p of predictions) {
    const o = byId.get(p.predictionId);
    if (!o || o.evidence?.observed === undefined) continue;
    pairs.push({
      predictionId: p.predictionId,
      predictedValue: p.probability,
      observedValue: o.evidence.observed,
    });
  }
  return pairs;
}

/** شکست پنجره: ۷۰٪ خط پایه (قدیمی) / ۳۰٪ اخیر — روی ترتیب زمانیِ فایل (عین ثبت) */
export function splitWindows(pairs: Pair[]): { baseline: Pair[]; recent: Pair[] } {
  if (pairs.length < 4) return { baseline: pairs, recent: [] };
  const cut = Math.floor(pairs.length * 0.7);
  return { baseline: pairs.slice(0, cut), recent: pairs.slice(cut) };
}

// ─────────────────────────────────────────────────────────────────────────
// اجرای سه آشکارساز + پایدارسازی
// ─────────────────────────────────────────────────────────────────────────

export interface DriftRunResult {
  modelId: string;
  ranAt: string;
  reports: Array<{
    driftType: (typeof DRIFT_TYPES)[number];
    magnitude: number;
    action: (typeof DRIFT_ACTIONS)[number];
    rationale: string;
  }>;
  pairsBaseline: number;
  pairsRecent: number;
}

export async function runDriftDetection(modelId: string, opts: { pairs?: Pair[] } = {}): Promise<DriftRunResult> {
  const pairs = opts.pairs ?? (await loadRealPairs());
  const { baseline, recent } = splitWindows(pairs);
  const detector = new DriftDetector();
  const ranAt = new Date().toISOString();
  const reports: DriftRunResult["reports"] = [];

  // ۱) رانش عملکرد — اگر پنجرهٔ اخیر خالی، monitor صادقانه
  let performance = { magnitude: 0, action: "monitor" as (typeof DRIFT_ACTIONS)[number], rationale: "پنجرهٔ اخیر خالی — داده کافی برای مقایسه نیست.", driftType: "performance" as const };
  if (recent.length > 0) {
    const r = detector.detectPerformanceDrift(modelId, baseline, recent);
    performance = { magnitude: r.magnitude, action: r.action as (typeof DRIFT_ACTIONS)[number], rationale: r.rationale, driftType: "performance" };
  }
  reports.push(performance);

  // ۲) رانش مفهوم — نرخ واقعی دو پنجره
  let concept = { magnitude: 0, action: "monitor" as (typeof DRIFT_ACTIONS)[number], rationale: "پنجرهٔ اخیر خالی.", driftType: "concept" as const };
  if (recent.length > 0) {
    const r = detector.detectConceptDrift(modelId, baseline, recent);
    concept = { magnitude: r.magnitude, action: r.action as (typeof DRIFT_ACTIONS)[number], rationale: r.rationale, driftType: "concept" };
  }
  reports.push(concept);

  // ۳) رانش داده — میانگین ویژگی‌ها از drivers (اگر موجود)
  const featBaseline: Record<string, number[]> = {};
  const featRecent: Record<string, number[]> = {};
  const predictions = await loadJsonl<RawPrediction>("predictions.jsonl");
  const recStart = Math.floor(predictions.length * 0.7);
  predictions.forEach((p, i) => {
    const target = i < recStart ? featBaseline : featRecent;
    for (const d of p.drivers ?? []) {
      (target[d.feature] ??= []).push(d.value);
    }
  });
  const dataReport = detector.detectDataDrift(modelId, featBaseline, featRecent);
  reports.push({ driftType: "data", magnitude: dataReport.magnitude, action: dataReport.action as (typeof DRIFT_ACTIONS)[number], rationale: dataReport.rationale });

  // پایدارسازی (append-only) + هشدار
  for (const r of reports) {
    await db.driftCheck.create({
      data: {
        modelId, driftType: r.driftType, magnitude: r.magnitude, action: r.action,
        rationale: r.rationale, pairsBaseline: baseline.length, pairsRecent: recent.length,
        evidenceJson: JSON.stringify({ ranAt, thresholds: { alert: DRIFT_ALERT, retrain: DRIFT_RETRAIN, escalate: DRIFT_ESCALATE } }),
      },
    });
    if (r.action !== "monitor") {
      await db.auditLog.create({
        data: {
          action: "DRIFT_DETECTED",
          actor: "worker:drift-guard",
          detail: JSON.stringify({ modelId, driftType: r.driftType, action: r.action, magnitude: r.magnitude, rationale: r.rationale }),
        },
      }).catch(() => undefined);
    }
  }

  return { modelId, ranAt, reports, pairsBaseline: baseline.length, pairsRecent: recent.length };
}

// ─────────────────────────────────────────────────────────────────────────
// تاریخ رانش (برای API)
// ─────────────────────────────────────────────────────────────────────────

export async function listDriftChecks(opts: { modelId?: string; limit?: number } = {}) {
  const where: Record<string, unknown> = {};
  if (opts.modelId) where.modelId = opts.modelId;
  const rows = await db.driftCheck.findMany({
    where,
    orderBy: { checkedAt: "desc" },
    take: Math.min(Math.max(opts.limit ?? 50, 1), 300),
  });
  return rows.map((r) => ({
    id: r.id, modelId: r.modelId, driftType: r.driftType, magnitude: r.magnitude, action: r.action,
    rationale: r.rationale, pairsBaseline: r.pairsBaseline, pairsRecent: r.pairsRecent,
    checkedAt: r.checkedAt.toISOString(),
  }));
}

/** Brier پنجره‌ها برای شفافیت (بدون درج) */
export function windowBriers(baseline: Pair[], recent: Pair[]): { baseline: number | null; recent: number | null } {
  const ev = new EvaluationEngineImpl();
  return {
    baseline: baseline.length > 0 ? ev.computeBrierScore(baseline) : null,
    recent: recent.length > 0 ? ev.computeBrierScore(recent) : null,
  };
}
