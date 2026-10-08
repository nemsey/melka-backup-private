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

/**
 * PN-019 (مرحلهٔ ۱ — ترمیم G5): شکاف زمان‌محور پنجره‌ها.
 * کشف ریشه‌ای: شکاف ترتیب فایل، مرز نوع پیامد را می‌بُرید (فایل پیامدها دولایه
 * نوشته می‌شود) و رانش مفهوم کاذب می‌سازد. این تابع پنجره‌ها را با occurredAt
 * واقعی می‌بُرد؛ اگر همهٔ پیامدها در یک روز (اسنپ‌شات پیوند تاریخی) بیایند،
 * صادقانه به ترتیب فایل برمی‌گردد اما سازوکار را مهر می‌زند تا تحلیل بداند.
 */
export function splitWindowsByTime(
  outcomes: Array<{ predictionId: string; occurredAt?: string; evidence?: { observed?: number } }>,
  predictions: Array<{ predictionId: string; probability: number }>,
  opts: { recentDays?: number } = {},
): { baseline: Pair[]; recent: Pair[]; splitBy: "time" | "file-order"; rationale: string } {
  const recentDays = opts.recentDays ?? 30;
  const byPrediction = new Map(predictions.map((p) => [p.predictionId, p]));
  const dates = outcomes.map((o) => (o.occurredAt ?? "").slice(0, 10)).filter(Boolean);
  const distinctDays = new Set(dates).size;

  if (distinctDays <= 1) {
    // اسنپ‌شات یک‌روزه — برش زمانی ممکن نیست؛ عقب‌افت صادقانه با مهر سازوکار
    const pairs: Pair[] = [];
    for (const o of outcomes) {
      const p = byPrediction.get(o.predictionId);
      const obs = o.evidence?.observed;
      if (!p || obs === undefined) continue;
      pairs.push({ predictionId: o.predictionId, predictedValue: p.probability, observedValue: obs });
    }
    const legacy = splitWindows(pairs);
    return {
      ...legacy,
      splitBy: "file-order",
      rationale: `هر ${outcomes.length} پیامد در یک روز (${dates[0] ?? "?"}) ثبت شده‌اند — پیوند اسنپ‌شات تاریخی؛ برش زمانی ممکن نیست، ترتیب فایل با هشدار صریح (کشف PN-019 مرحلهٔ ۱).`,
    };
  }

  // برش زمانی حقیقی: اخیر = occurredAt در N روز گذشته
  const cutoff = Date.now() - recentDays * 86400000;
  const baseline: Pair[] = [];
  const recent: Pair[] = [];
  for (const o of outcomes) {
    const p = byPrediction.get(o.predictionId);
    const obs = o.evidence?.observed;
    if (!p || obs === undefined || !o.occurredAt) continue;
    const pair: Pair = { predictionId: o.predictionId, predictedValue: p.probability, observedValue: obs };
    (new Date(o.occurredAt).getTime() >= cutoff ? recent : baseline).push(pair);
  }
  // پنجرهٔ خالی → عقب‌افت به ترتیب فایل (نردبان تنزل صادقانه — آشکارسازها پنجرهٔ خالی نمی‌فهمند)
  if (baseline.length === 0 || recent.length === 0) {
    const pairs: Pair[] = [...baseline, ...recent];
    const legacy = splitWindows(pairs);
    return {
      ...legacy,
      splitBy: "file-order",
      rationale: `برش زمانی همهٔ ${pairs.length} جفت را در یک پنجره انداخت (baseline=${baseline.length} · recent=${recent.length}) — عقب‌افت به ترتیب فایل ۷۰/۳۰ تا هر دو پنجره ساکن باشند (PN-019 مرحلهٔ ۱).`,
    };
  }
  return {
    baseline,
    recent,
    splitBy: "time",
    rationale: `برش زمانی روی ${distinctDays} روز متمایز — اخیر = ${recentDays} روز گذشته (baseline=${baseline.length} · recent=${recent.length}).`,
  };
}

/**
 * PN-019 فاز ۹: شمارش رکوردهای رانش در پنجره (مصرف سرویس حاکمیت — مرز مخزن:
 * همهٔ دسترسی‌های DriftCheck از همین سرویس می‌گذرند؛ گارد audit-drift نویسندهٔ واحد را وارسی می‌کند).
 */
export async function driftCountsInWindow(from: Date, to: Date): Promise<{ alerts: number; monitors: number }> {
  const [alerts, monitors] = await Promise.all([
    db.driftCheck.count({ where: { action: { in: ["alert", "retrain", "escalate"] }, checkedAt: { gte: from, lte: to } } }),
    db.driftCheck.count({ where: { action: "monitor", checkedAt: { gte: from, lte: to } } }),
  ]);
  return { alerts, monitors };
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
  // PN-019 مرحلهٔ ۱: شکاف زمان‌محور هرجا ممکن شود — با مهر سازوکار در شاهد.
  // اگر جفت‌های آماده تزریق شده (تست)، همان شکاف کلاسیک (تست‌ها گارانتی می‌کنند).
  let baseline: Pair[];
  let recent: Pair[];
  let splitBy: "time" | "file-order" = "file-order";
  let splitRationale = "جفت‌های تزریقی تست — شکاف کلاسیک ۷۰/۳۰.";
  if (opts.pairs) {
    const s = splitWindows(opts.pairs);
    baseline = s.baseline;
    recent = s.recent;
  } else {
    const outcomes = await loadJsonl<RawOutcome & { occurredAt?: string }>("outcomes.jsonl");
    const predictions = await loadJsonl<RawPrediction>("predictions.jsonl");
    const timed = splitWindowsByTime(outcomes, predictions);
    baseline = timed.baseline;
    recent = timed.recent;
    splitBy = timed.splitBy;
    splitRationale = timed.rationale;
  }
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
        evidenceJson: JSON.stringify({ ranAt, splitBy, splitRationale, thresholds: { alert: DRIFT_ALERT, retrain: DRIFT_RETRAIN, escalate: DRIFT_ESCALATE } }),
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
