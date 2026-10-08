/**
 * decision-service.ts — PN-019 فاز ۸: پایاوری سه موتور تصمیم + Shadow Mode
 * ---------------------------------------------------------------------------
 * قوانین حاکم (سند طراحی DES8):
 *   · هر تصمیم ثبت‌شده: ۱۵ فیلد پندرگانه + expectedImpact کمی + ≥۳ بدیل + انقضا
 *   · autoExecute=false همیشه — نقض runtime → 422 (لایه دوم بعد از قید نوعی)
 *   · Shadow Mode: تصمیم فقط ثبت می‌شود، صفر اجرا (executedSteps=0 لفظی)
 *   · هر transition → AuditLog
 *   · SafetyCheckRecord برای هر بررسی ایمنی (SAF-006 شاهد پایدار)
 *   · گیت حاکمیت (فاز ۹) روی DECISION_CREATE قلاق شده است
 */

import { db } from "@/lib/db";
import { MelkApiError } from "@/lib/melk-api/types";
import {
  ActionPlannerEngineImpl,
  DecisionEngineImpl,
  SafetyEngineImpl,
  isDecisionExpired,
  type DecisionContext,
  type DecisionInput,
} from "@/core/intelligence/p8-core";
import type { DecisionRecord, ExpectedImpact, LearningTier } from "@/core/intelligence/contracts-p7-p11";

// ─────────────────────────────────────────────────────────────────────────
// ثابت‌ها (DES8 پیوست ب)
// ─────────────────────────────────────────────────────────────────────────

export const DECISION_TTL_DAYS = Number(process.env.MELK_DECISION_TTL_DAYS ?? 7);
export const SHADOW_SAMPLE = Number(process.env.MELK_DECISION_SHADOW_SAMPLE ?? 5);
export const MIN_ALTERNATIVES = 3; // ثابت — قابل تغییر نیست (DES8 §۹)

export const DECISION_STATUSES = ["active", "expired", "superseded"] as const;

// ─────────────────────────────────────────────────────────────────────────
// انواع
// ─────────────────────────────────────────────────────────────────────────

export interface DecisionRow {
  id: string;
  predictionId: string;
  decisionType: string;
  proposedAction: string;
  confidence: number;
  rationale: string;
  expectedImpact: ExpectedImpact;
  alternatives: Array<{ action: string; whyRejected: string; expectedValue: number; rank: number }>;
  requiredResources: string[];
  safetyReport: { passed: boolean; blockedBy: string[]; warnings: string[]; checkedRules: string[] };
  status: string;
  expiresAt: string;
  createdAt: string;
  tierAtCreation: number;
  modelVersionId: string | null;
  expired: boolean;
  requiresApproval: boolean;
  autoExecute: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// ساخت تصمیم از پیش‌بینی (گام موتور → ثبت پایا)
// ─────────────────────────────────────────────────────────────────────────

export interface CreateDecisionInput {
  predictionId: string;
  probability: number;
  context?: DecisionContext;
  tierAtCreation?: number;
  modelVersionId?: string;
  actor: string;
  /** تنها مسیر مجاز: سایه (ثبت بدون اجرا) — متد اجرا وجود ندارد */
  mode: "shadow";
}

export async function createDecisionFromPrediction(input: CreateDecisionInput): Promise<DecisionRow> {
  if (!input.predictionId || input.predictionId.trim().length < 3) {
    throw new MelkApiError("UNKNOWN", "شناسهٔ پیش‌بینی نامعتبر است.", 400, false);
  }
  if (input.mode !== "shadow") {
    throw new MelkApiError("UNKNOWN", "تنها حالت سایه مجاز است — اجرای تصمیم در مسیر خودکار وجود ندارد.", 422, false);
  }

  // گیت حاکمیت فاز ۹ — نوشتن حساس قلاق‌شده (DES9 §۱۵.۱)
  const { governanceGate } = await import("@/lib/services/governance-service");
  await governanceGate("DECISION_CREATE");

  const safety = new SafetyEngineImpl();
  const engine = new DecisionEngineImpl((input.tierAtCreation ?? 0) as LearningTier, safety);
  const decisionInput: DecisionInput = {
    predictionId: input.predictionId.trim(),
    probability: Math.min(1, Math.max(0, input.probability)),
    context: input.context ?? {},
  };
  const record = engine.decide(decisionInput);

  // تضمین §۹: فهرست کامل رتبه‌بندی‌شده (نخست + ردشده‌ها) — همیشه ≥۳
  const ranked = [
    { action: record.proposedAction, whyRejected: "", expectedValue: Math.round(record.confidence * 1000) / 1000 },
    ...record.alternatives.map((a) => ({ action: a.action, whyRejected: a.whyRejected, expectedValue: a.expectedValue })),
  ].map((a, i) => ({ ...a, rank: i + 1 }));
  if (ranked.length < MIN_ALTERNATIVES) {
    // fail-loud — نقص سازنده؛ هرگز دادهٔ ناقص پر نمی‌شود
    throw new MelkApiError(
      "ALTERNATIVES_MIN",
      `تعداد بدیل‌ها (${ranked.length}) کمتر از حداقل مجاز (${MIN_ALTERNATIVES}) است — نقض سازندهٔ موتور.`,
      500,
      false,
    );
  }

  // ثبت SafetyCheckRecord (شاهد پایدار SAF-006)
  const checkRow = await db.safetyCheckRecord.create({
    data: {
      decisionId: "pending",
      passed: record.safetyReport.passed,
      blockedByJson: JSON.stringify(record.safetyReport.blockedBy),
      warningsJson: JSON.stringify(record.safetyReport.warnings),
      checkedRulesJson: JSON.stringify(record.safetyReport.checkedRules),
    },
  });

  const expiresAt = new Date(Date.now() + DECISION_TTL_DAYS * 86400000);
  const row = await db.decisionRecord.create({
    data: {
      predictionId: record.predictionId,
      decisionType: record.decisionType,
      proposedAction: record.proposedAction,
      confidence: record.confidence,
      rationale: record.rationale,
      expectedImpact: JSON.stringify(record.expectedImpact),
      alternativesJson: JSON.stringify(ranked),
      requiredResourcesJson: JSON.stringify(record.requiredResources),
      safetyReportJson: JSON.stringify(record.safetyReport),
      status: "active",
      expiresAt,
      tierAtCreation: input.tierAtCreation ?? 0,
      modelVersionId: input.modelVersionId ?? null,
      requiresApproval: true,
      autoExecute: false,
    },
  });

  // پیوند شاهد ایمنی به تصمیم ثبت‌شده
  await db.safetyCheckRecord.update({ where: { id: checkRow.id }, data: { decisionId: row.id } });

  // برنامهٔ اقدام + شبیه‌سازی + اثر (هر ۵ الگو با rollback — DES8 §۱۱)
  const planner = new ActionPlannerEngineImpl();
  const plan = planner.plan(record);
  const simulation = planner.simulate(plan);
  const impact = planner.estimateImpact(plan, record);
  await db.actionPlanRecord.create({
    data: {
      decisionId: row.id,
      pattern: plan.steps.length > 0 && plan.rollbackPlan ? inferPattern(record.decisionType) : "smart_wait",
      stepsJson: JSON.stringify(plan.steps),
      rollbackPlan: plan.rollbackPlan ?? ROLLBACK_FALLBACK,
      simulationJson: JSON.stringify(simulation),
      impactJson: JSON.stringify(impact),
      estimatedDurationMinutes: plan.estimatedDurationMinutes,
      riskLevel: plan.riskLevel,
      autoExecute: false,
    },
  });

  // ثبت سایه — صفر اجرا
  await db.shadowDecisionRun.create({
    data: {
      sourcePredictionId: record.predictionId,
      decisionId: row.id,
      executedSteps: 0,
      verdict: record.safetyReport.passed ? "recorded" : "safety_blocked",
    },
  });

  await db.auditLog.create({
    data: {
      action: "SHADOW_DECISION_CREATED",
      actor: input.actor,
      detail: JSON.stringify({
        decisionId: row.id,
        predictionId: record.predictionId,
        decisionType: record.decisionType,
        executedSteps: 0,
        mode: "shadow",
      }),
    },
  }).catch(() => undefined);

  return toRow(row, ranked);
}

const ROLLBACK_FALLBACK = "بازگشت به صف پایش — بدون اثر جانبی (پیش‌فرض)";

function inferPattern(decisionType: string): string {
  switch (decisionType) {
    case "contact_owner":
    case "priority_action":
    case "investigate":
      return "direct_call";
    case "schedule_visit":
      return "property_visit";
    case "adjust_price":
      return "price_adjust";
    case "assign_expert":
      return "expert_assign";
    default:
      return "smart_wait";
  }
}

// ─────────────────────────────────────────────────────────────────────────
// خواندن‌ها
// ─────────────────────────────────────────────────────────────────────────

function toRow(
  r: {
    id: string; predictionId: string; decisionType: string; proposedAction: string; confidence: number;
    rationale: string; expectedImpact: string; alternativesJson: string; requiredResourcesJson: string;
    safetyReportJson: string; status: string; expiresAt: Date; createdAt: Date; tierAtCreation: number;
    modelVersionId: string | null;
  },
  preRanked?: DecisionRow["alternatives"],
): DecisionRow {
  let alternatives: DecisionRow["alternatives"] = preRanked ?? [];
  if (!preRanked) {
    try {
      alternatives = JSON.parse(r.alternativesJson) as DecisionRow["alternatives"];
    } catch {
      alternatives = [];
    }
  }
  let impact: ExpectedImpact = { liftPercent: 0, reach: "listing", horizonDays: 30, basis: "نامعتبر" };
  try {
    impact = JSON.parse(r.expectedImpact) as ExpectedImpact;
  } catch { /* مقدار پیش‌فرض محافظه‌کارانه */ }
  return {
    id: r.id,
    predictionId: r.predictionId,
    decisionType: r.decisionType,
    proposedAction: r.proposedAction,
    confidence: r.confidence,
    rationale: r.rationale,
    expectedImpact: impact,
    alternatives,
    requiredResources: safeParseArray(r.requiredResourcesJson),
    safetyReport: safeParseSafety(r.safetyReportJson),
    status: r.status,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    tierAtCreation: r.tierAtCreation,
    modelVersionId: r.modelVersionId,
    expired: isDecisionExpired({ expiresAt: r.expiresAt.toISOString() }),
    requiresApproval: true,
    autoExecute: false,
  };
}

function safeParseArray(json: string): string[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

function safeParseSafety(json: string): DecisionRow["safetyReport"] {
  try {
    const v = JSON.parse(json) as Partial<DecisionRow["safetyReport"]>;
    return {
      passed: v.passed === true,
      blockedBy: Array.isArray(v.blockedBy) ? v.blockedBy : [],
      warnings: Array.isArray(v.warnings) ? v.warnings : [],
      checkedRules: Array.isArray(v.checkedRules) ? v.checkedRules : [],
    };
  } catch {
    return { passed: false, blockedBy: ["PARSE"], warnings: [], checkedRules: [] };
  }
}

export async function listDecisions(opts: { status?: string; limit?: number } = {}): Promise<DecisionRow[]> {
  const where: Record<string, unknown> = {};
  if (opts.status && (DECISION_STATUSES as readonly string[]).includes(opts.status)) where.status = opts.status;
  const rows = await db.decisionRecord.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(opts.limit ?? 50, 1), 200) });
  return rows.map((r) => toRow(r));
}

export async function getDecision(id: string): Promise<DecisionRow | null> {
  const r = await db.decisionRecord.findUnique({ where: { id } });
  return r ? toRow(r) : null;
}

export async function decisionStats(): Promise<Record<string, number>> {
  const grouped = await db.decisionRecord.groupBy({ by: ["status"], _count: { _all: true } });
  const byType = await db.decisionRecord.groupBy({ by: ["decisionType"], _count: { _all: true } });
  const stats: Record<string, number> = {};
  for (const g of grouped) stats[`status:${g.status}`] = g._count._all;
  for (const g of byType) stats[`type:${g.decisionType}`] = g._count._all;
  return stats;
}

/** فهرست برنامه‌های اقدام (مرز مخزن — روت لاغر می‌خواند) */
export async function listActionPlans(opts: { decisionId?: string; limit?: number } = {}) {
  const where: Record<string, unknown> = {};
  if (opts.decisionId) where.decisionId = opts.decisionId;
  const rows = await db.actionPlanRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(opts.limit ?? 50, 1), 200),
  });
  return rows.map((r) => ({
    id: r.id,
    decisionId: r.decisionId,
    pattern: r.pattern,
    steps: JSON.parse(r.stepsJson),
    rollbackPlan: r.rollbackPlan,
    simulation: JSON.parse(r.simulationJson),
    impact: JSON.parse(r.impactJson),
    estimatedDurationMinutes: r.estimatedDurationMinutes,
    riskLevel: r.riskLevel,
    autoExecute: r.autoExecute,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// انقضای فعال (DES8 §۱۰) — جاروب بدون حذف
// ─────────────────────────────────────────────────────────────────────────

export async function expireSweep(now: Date = new Date()): Promise<{ expiredNow: number }> {
  const result = await db.decisionRecord.updateMany({
    where: { status: "active", expiresAt: { lte: now } },
    data: { status: "expired" },
  });
  if (result.count > 0) {
    await db.auditLog.create({
      data: {
        action: "DECISIONS_EXPIRED",
        actor: "worker:decision-shadow",
        detail: JSON.stringify({ expiredNow: result.count, sweptAt: now.toISOString() }),
      },
    }).catch(() => undefined);
  }
  return { expiredNow: result.count };
}

/** برنامهٔ اقدام روی تصمیم منقضی → ۴۰۹ (سازگاری قراردادی) */
export async function requireActiveDecision(id: string): Promise<DecisionRow> {
  const row = await getDecision(id);
  if (!row) throw new MelkApiError("UNKNOWN", "تصمیم یافت نشد.", 404, false);
  if (row.status !== "active" || row.expired) {
    throw new MelkApiError("DECISION_EXPIRED", "این تصمیم منقضی شده است — تصمیم تازه لازم است.", 409, false);
  }
  return row;
}

// ─────────────────────────────────────────────────────────────────────────
// جریان سایهٔ دوره‌ای (کار Worker — هر ۶ ساعت)
// ─────────────────────────────────────────────────────────────────────────

export async function shadowDecisionTick(): Promise<{ runs: number; blocked: number; expiredSwept: number }> {
  const { getChampion } = await import("@/lib/services/model-versioning-service");
  const { readFile } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  const path = await import("node:path");
  const dataDir = process.env.MELKA_INTELLIGENCE_DATA_DIR
    ? path.resolve(process.env.MELKA_INTELLIGENCE_DATA_DIR)
    : path.join(process.cwd(), "intelligence-data");

  let runs = 0;
  let blocked = 0;
  for (const modelId of ["arm-listing-v0"]) {
    const champion = await getChampion(modelId);
    const pairsFile = path.join(dataDir, "predictions.jsonl");
    if (!existsSync(pairsFile)) continue;
    const lines = (await readFile(pairsFile, "utf8")).split("\n").filter((l) => l.trim()).slice(-SHADOW_SAMPLE);
    for (const line of lines) {
      try {
        const pred = JSON.parse(line) as { predictionId: string; probability: number };
        const row = await createDecisionFromPrediction({
          predictionId: pred.predictionId,
          probability: pred.probability,
          tierAtCreation: 3,
          modelVersionId: champion?.id,
          actor: "worker:decision-shadow",
          mode: "shadow",
        });
        runs += 1;
        if (!row.safetyReport.passed) blocked += 1;
      } catch {
        // ردیف معیوب پیش‌بینی — لاگ سکوت، حلقه ادامه می‌یابد
      }
    }
  }
  const sweep = await expireSweep();
  return { runs, blocked, expiredSwept: sweep.expiredNow };
}

export type { DecisionRecord };
