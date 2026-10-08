/**
 * model-versioning-service.ts — PN-018 فاز ۷ (شورا-ن۰۲۲): چرخهٔ عمر نسخه‌های مدل
 * ---------------------------------------------------------------------------
 * Champion/Challenger با دروازهٔ تأیید شورا (سند ۰۲۷ §۲.۴):
 *   ensureChallenger → shadowTick → [promote (شورا) | reject | keep] → rollback
 *
 * قوانین حاکم:
 *   · هر مدل حداکثر یک قهرمان همزمان — promote/rollback اتمیک برقرار می‌کند.
 *   · ارتقا فقط با councilApproval=true صریح + approvalSource (شماره سند).
 *   · هر transition رکورد AuditLog می‌سازد.
 *   · صفر تغییر موتور — فقط مصرف ShadowEvaluationFramework/EvaluationEngineImpl موجود.
 */

import { db } from "@/lib/db";
import { MelkApiError } from "@/lib/melk-api/types";
import {
  EvaluationEngineImpl,
  ShadowEvaluationFramework,
  type Pair,
} from "@/core/intelligence/p7-core";

// ─────────────────────────────────────────────────────────────────────────
// ثابت‌ها (پیوست ج سند طراحی — env-قابل‌تغییر با پیش‌فرض سند ۰۲۷)
// ─────────────────────────────────────────────────────────────────────────

export const SHADOW_MIN_SAMPLES = Number(process.env.MELK_SHADOW_MIN_SAMPLES ?? 50);
export const SHADOW_MIN_WINDOW_DAYS = Number(process.env.MELK_SHADOW_MIN_WINDOW_DAYS ?? 7);
export const SHADOW_MIN_DELTA = Number(process.env.MELK_SHADOW_MIN_DELTA ?? 0.02);

export const VERSION_STATUSES = ["champion", "challenger", "retired", "rejected"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

// ─────────────────────────────────────────────────────────────────────────
// انواع (قرارداد)
// ─────────────────────────────────────────────────────────────────────────

export interface ModelVersionRow {
  id: string; modelId: string; version: number; status: string;
  brierScore: number | null; sampleSize: number; windowDays: number;
  weightsJson: string | null; calibrated: boolean; councilApproved: boolean;
  approvalSource: string | null; promotedAt: string | null; retiredAt: string | null;
  notes: string | null; createdAt: string; updatedAt: string;
}

export interface ShadowTickResult {
  verdict: "promote" | "keep_primary" | "reject";
  championBrier: number | null;
  challengerBrier: number | null;
  sampleSize: number;
  windowDays: number;
  criteria: { enoughSamples: boolean; enoughWindow: boolean; enoughBetter: boolean };
  rationale: string;
}

function toRow(v: {
  id: string; modelId: string; version: number; status: string;
  brierScore: number | null; sampleSize: number; windowDays: number;
  weightsJson: string | null; calibrated: boolean; councilApproved: boolean;
  approvalSource: string | null; promotedAt: Date | null; retiredAt: Date | null;
  notes: string | null; createdAt: Date; updatedAt: Date;
}): ModelVersionRow {
  return {
    ...v,
    promotedAt: v.promotedAt ? v.promotedAt.toISOString() : null,
    retiredAt: v.retiredAt ? v.retiredAt.toISOString() : null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// خواندن‌ها
// ─────────────────────────────────────────────────────────────────────────

export async function listModelVersions(opts: { modelId?: string; status?: string } = {}): Promise<ModelVersionRow[]> {
  const where: Record<string, unknown> = {};
  if (opts.modelId) where.modelId = opts.modelId;
  if (opts.status && (VERSION_STATUSES as readonly string[]).includes(opts.status)) where.status = opts.status;
  const rows = await db.modelVersion.findMany({ where, orderBy: [{ modelId: "asc" }, { version: "desc" }], take: 200 });
  return rows.map(toRow);
}

export async function getChampion(modelId: string) {
  const row = await db.modelVersion.findFirst({ where: { modelId, status: "champion" }, orderBy: { version: "desc" } });
  return row ? toRow(row) : null;
}

export async function getActiveChallenger(modelId: string) {
  const row = await db.modelVersion.findFirst({ where: { modelId, status: "challenger" }, orderBy: { version: "desc" } });
  return row ? toRow(row) : null;
}

/** مدل‌هایی که قهرمان دارند (برای Worker رانش) */
export async function championedModelIds(): Promise<string[]> {
  const rows = await db.modelVersion.findMany({ where: { status: "champion" }, select: { modelId: true }, distinct: ["modelId"] });
  return rows.map((r) => r.modelId);
}

// ─────────────────────────────────────────────────────────────────────────
// ساخت چالشگر (§۶.۲ سند طراحی)
// ─────────────────────────────────────────────────────────────────────────

export interface EnsureChallengerInput {
  modelId: string;
  /** وزن‌های آموخته — عین خروجی LearningEngine؛ خالی = بدون وزن (چالشگر ارزیابی-محور) */
  weights?: Record<string, number>;
  brierScore?: number;
  sampleSize?: number;
  windowDays?: number;
  notes?: string;
  actor: string;
}

export async function ensureChallenger(input: EnsureChallengerInput): Promise<ModelVersionRow> {
  if (!input.modelId || input.modelId.trim().length < 3) {
    throw new MelkApiError("UNKNOWN", "شناسهٔ مدل نامعتبر است.", 400, false);
  }
  // یک چالشگر فعال در هر لحظه — اگر هست، همان به‌روز می‌شود (idempotent در سطح وضعیت)
  const existing = await db.modelVersion.findFirst({ where: { modelId: input.modelId, status: "challenger" } });
  if (existing) return toRow(existing);

  const max = await db.modelVersion.findFirst({ where: { modelId: input.modelId }, orderBy: { version: "desc" } });
  const version = (max?.version ?? 0) + 1;
  const row = await db.modelVersion.create({
    data: {
      modelId: input.modelId,
      version,
      status: "challenger",
      weightsJson: input.weights ? JSON.stringify(input.weights) : null,
      brierScore: input.brierScore ?? null,
      sampleSize: input.sampleSize ?? 0,
      windowDays: input.windowDays ?? 0,
      notes: input.notes ?? null,
    },
  });
  await db.auditLog.create({
    data: {
      action: "MODEL_CHALLENGER_CREATED",
      actor: input.actor,
      detail: JSON.stringify({ modelId: input.modelId, version, id: row.id }),
    },
  }).catch(() => undefined);
  return toRow(row);
}

// ─────────────────────────────────────────────────────────────────────────
// ارزیابی سایه (§۶.۳ — بدون تغییر موتور؛ verdict بدون تأیید = هرگز ارتقا)
// ─────────────────────────────────────────────────────────────────────────

/**
 * ارزیابی چالشگر فعال در برابر قهرمان روی همان جفت‌های واقعی.
 * weights اعمالی: اگر چالشگر weightsJson داشته باشد، احتمال‌ها بازمقیاس می‌شوند؛
 * در غیر این صورت چالشگرِ هموار (عین الگوی core-cycle) ارزیابی می‌شود.
 */
export async function shadowTick(modelId: string, pairs: Pair[], windowDays: number): Promise<ShadowTickResult> {
  const challenger = await db.modelVersion.findFirst({ where: { modelId, status: "challenger" }, orderBy: { version: "desc" } });
  if (!challenger) throw new MelkApiError("UNKNOWN", "چالشگر فعالی برای این مدل وجود ندارد.", 404, false);
  const champion = await db.modelVersion.findFirst({ where: { modelId, status: "champion" }, orderBy: { version: "desc" } });

  const evalEngine = new EvaluationEngineImpl();
  const now = new Date().toISOString();
  const window = { from: pairs.length ? (pairs[0].predictedAt ?? now) : now, to: now };
  const championPairs = pairs; // همان پنجرهٔ قهرمان
  const championReport = evalEngine.evaluate(champion ? `${modelId}-champion-v${champion.version}` : `${modelId}-v0`, championPairs, window, 3);

  // بازمحاسبهٔ احتمال‌ها با وزن‌های چالشگر (اگر موجود) — وگرنه هموارسازی عین core-cycle
  let challengerPairs: Pair[];
  let weights: Record<string, number> = {};
  if (challenger.weightsJson) {
    try { weights = JSON.parse(challenger.weightsJson) as Record<string, number>; } catch { weights = {}; }
  }
  if (Object.keys(weights).length > 0) {
    challengerPairs = pairs.map((p) => {
      // مقیاس وزنی خطی حول ۰٫۵ — تفسیرپذیر و مهارشده (کلمپ ۰٫۰۵..۰٫۹۵)
      const scale = Object.values(weights).reduce((a, w) => a + Math.abs(w), 0) || 1;
      const k = Math.min(1, scale / 10);
      const next = 0.5 + (p.predictedValue - 0.5) * (1 - k * 0.5);
      return { ...p, predictedValue: Math.max(0.05, Math.min(0.95, Math.round(next * 10000) / 10000)) };
    });
  } else {
    challengerPairs = pairs.map((p) => ({ ...p, predictedValue: 0.5 + (p.predictedValue - 0.5) * 0.7 }));
  }
  const challengerReport = evalEngine.evaluate(`${modelId}-challenger-v${challenger.version}`, challengerPairs, window, 3);

  // چارچوب سایهٔ موجود — بدون تأیید شورا: verdict تازه، هرگز ارتقا خودکار
  const framework = new ShadowEvaluationFramework();
  let shadow = framework.build(champion ? `${modelId}-v${champion.version}` : `${modelId}-v0`, `${modelId}-challenger-v${challenger.version}`);
  shadow.currentReport = challengerReport;
  shadow = framework.evaluate(shadow, championReport, windowDays, false);

  const enoughSamples = challengerReport.sampleSize >= SHADOW_MIN_SAMPLES;
  const enoughWindow = windowDays >= SHADOW_MIN_WINDOW_DAYS;
  const enoughBetter = challengerReport.metrics.brierScore <= championReport.metrics.brierScore - SHADOW_MIN_DELTA;

  await db.modelVersion.update({
    where: { id: challenger.id },
    data: {
      brierScore: challengerReport.metrics.brierScore,
      sampleSize: challengerReport.sampleSize,
      windowDays,
      calibrated: challengerReport.metrics.ece < 0.1,
    },
  });

  return {
    verdict: shadow.verdict ?? "keep_primary",
    championBrier: championReport.metrics.brierScore,
    challengerBrier: challengerReport.metrics.brierScore,
    sampleSize: challengerReport.sampleSize,
    windowDays,
    criteria: { enoughSamples, enoughWindow, enoughBetter },
    rationale: `قهرمان Brier=${championReport.metrics.brierScore} · چالشگر Brier=${challengerReport.metrics.brierScore} (Δ=${Math.round((challengerReport.metrics.brierScore - championReport.metrics.brierScore) * 10000) / 10000}). ${enoughSamples ? "نمونه کافی" : `نمونه ناکافی (<${SHADOW_MIN_SAMPLES})`} · ${enoughWindow ? "پنجره کافی" : `پنجره ناکافی (<${SHADOW_MIN_WINDOW_DAYS} روز)`}.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// ارتقا با دروازهٔ شورا (§۶.۴ — هر پنج پیش‌شرط سخت)
// ─────────────────────────────────────────────────────────────────────────

export interface PromoteInput {
  councilApproval: boolean;
  approvalSource?: string;
  actor: string;
}

export async function promoteModelVersion(versionId: string, input: PromoteInput): Promise<ModelVersionRow> {
  const challenger = await db.modelVersion.findUnique({ where: { id: versionId } });
  if (!challenger) throw new MelkApiError("UNKNOWN", "نسخهٔ مدل یافت نشد.", 404, false);
  if (challenger.status !== "challenger") {
    throw new MelkApiError("NOT_A_CHALLENGER", `این نسخه در وضعیت «${challenger.status}» است — فقط چالشگر فعال ارتقا می‌یابد.`, 409, false);
  }
  if (!input.councilApproval) {
    throw new MelkApiError(
      "COUNCIL_APPROVAL_REQUIRED",
      "ارتقای مدل بدون تأیید شورا ممنوع است (سند ۰۲۷ §۲.۴). درخواست را با councilApproval=true و approvalSource (شماره سند) تکرار کنید.",
      422, false,
    );
  }
  if (!input.approvalSource || input.approvalSource.trim().length < 4) {
    throw new MelkApiError("COUNCIL_APPROVAL_REQUIRED", "منبع تأیید شورا (approvalSource — شماره سند/جلسه) الزامی است.", 422, false);
  }
  if (challenger.sampleSize < SHADOW_MIN_SAMPLES) {
    throw new MelkApiError("SHADOW_CRITERIA_NOT_MET", `نمونهٔ ارزیابی ناکافی: ${challenger.sampleSize} < ${SHADOW_MIN_SAMPLES}.`, 422, false);
  }
  if (challenger.windowDays < SHADOW_MIN_WINDOW_DAYS) {
    throw new MelkApiError("SHADOW_CRITERIA_NOT_MET", `پنجرهٔ ارزیابی ناکافی: ${challenger.windowDays} < ${SHADOW_MIN_WINDOW_DAYS} روز.`, 422, false);
  }
  const champion = await db.modelVersion.findFirst({ where: { modelId: challenger.modelId, status: "champion" } });
  if (champion && (challenger.brierScore ?? 1) > champion.brierScore! - SHADOW_MIN_DELTA) {
    throw new MelkApiError(
      "SHADOW_CRITERIA_NOT_MET",
      `بهبود معنادار نیست: چالشگر Brier=${challenger.brierScore} در برابر قهرمان ${champion.brierScore} (نیاز: ≤ ${Math.round((champion.brierScore! - SHADOW_MIN_DELTA) * 10000) / 10000}).`,
      422, false,
    );
  }

  // جابه‌جایی اتمیک: قهرمان فعلی → بازنشسته · چالشگر → قهرمان
  const now = new Date();
  await db.$transaction(async (tx) => {
    if (champion) {
      await tx.modelVersion.update({ where: { id: champion.id }, data: { status: "retired", retiredAt: now } });
    }
    await tx.modelVersion.update({
      where: { id: challenger.id },
      data: { status: "champion", promotedAt: now, councilApproved: true, approvalSource: input.approvalSource!.trim() },
    });
  });

  await db.auditLog.create({
    data: {
      action: "MODEL_PROMOTED",
      actor: input.actor,
      detail: JSON.stringify({
        modelId: challenger.modelId, fromVersion: champion?.version ?? null, toVersion: challenger.version,
        brier: challenger.brierScore, approvalSource: input.approvalSource,
      }),
    },
  }).catch(() => undefined);

  const updated = await db.modelVersion.findUnique({ where: { id: challenger.id } });
  return toRow(updated!);
}

// ─────────────────────────────────────────────────────────────────────────
// رد چالشگر (§۶.۵ — بدون شورا: فقط بستن مسیر، نه تغییر قهرمان)
// ─────────────────────────────────────────────────────────────────────────

export async function rejectChallenger(versionId: string, actor: string, reason?: string): Promise<ModelVersionRow> {
  const challenger = await db.modelVersion.findUnique({ where: { id: versionId } });
  if (!challenger) throw new MelkApiError("UNKNOWN", "نسخهٔ مدل یافت نشد.", 404, false);
  if (challenger.status !== "challenger") {
    throw new MelkApiError("NOT_A_CHALLENGER", `این نسخه در وضعیت «${challenger.status}» است.`, 409, false);
  }
  await db.modelVersion.update({ where: { id: versionId }, data: { status: "rejected", retiredAt: new Date() } });
  await db.auditLog.create({
    data: {
      action: "MODEL_REJECTED",
      actor,
      detail: JSON.stringify({ modelId: challenger.modelId, version: challenger.version, reason: reason ?? null }),
    },
  }).catch(() => undefined);
  const updated = await db.modelVersion.findUnique({ where: { id: versionId } });
  return toRow(updated!);
}

// ─────────────────────────────────────────────────────────────────────────
// بازگشت (rollback — هم‌رتبهٔ promote: نیازمند شورا)
// ─────────────────────────────────────────────────────────────────────────

export interface RollbackInput {
  targetId: string;
  councilApproval: boolean;
  approvalSource?: string;
  reason?: string;
  actor: string;
}

export async function rollbackChampion(modelId: string, input: RollbackInput): Promise<ModelVersionRow> {
  if (!input.councilApproval || !input.approvalSource || input.approvalSource.trim().length < 4) {
    throw new MelkApiError("COUNCIL_APPROVAL_REQUIRED", "بازگشت مدل هم‌رتبهٔ ارتقاست — تأیید شورا و منبع آن الزامی است.", 422, false);
  }
  const target = await db.modelVersion.findUnique({ where: { id: input.targetId } });
  if (!target || target.modelId !== modelId || target.status !== "retired") {
    throw new MelkApiError("UNKNOWN", "نسخهٔ هدف بازگشت باید بازنشستهٔ همین مدل باشد.", 404, false);
  }
  const champion = await db.modelVersion.findFirst({ where: { modelId, status: "champion" } });
  const now = new Date();
  await db.$transaction(async (tx) => {
    if (champion) {
      await tx.modelVersion.update({ where: { id: champion.id }, data: { status: "retired", retiredAt: now } });
    }
    await tx.modelVersion.update({
      where: { id: target.id },
      data: { status: "champion", promotedAt: now, councilApproved: true, approvalSource: input.approvalSource!.trim(), notes: input.reason ?? target.notes },
    });
  });
  await db.auditLog.create({
    data: {
      action: "MODEL_ROLLED_BACK",
      actor: input.actor,
      detail: JSON.stringify({ modelId, fromVersion: champion?.version ?? null, toVersion: target.version, reason: input.reason ?? null, approvalSource: input.approvalSource }),
    },
  }).catch(() => undefined);
  const updated = await db.modelVersion.findUnique({ where: { id: target.id } });
  return toRow(updated!);
}
