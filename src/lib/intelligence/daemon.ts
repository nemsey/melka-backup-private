/**
 * دیمن هوشمندی v2 — PHASE 9 / بازسازی فازهای ۷-۸-۹
 * ------------------------------------------------------
 * حلقهٔ پس‌زمینهٔ مغز هوشمند: اجرای دوره‌ای حلقهٔ سرنوشت روی دادهٔ واقعی +
 * تازه‌سازی ارزیابی + نگهداری تک‌نمونه (singleton) برای endpoint وضعیت.
 *
 * طراحی (درس‌گرفته از دیمن p65xx + محدودیت‌های پلتفرم FC):
 *  - درون‌فرایندی: داخل همان پروسهٔ سرور Next (بدون پورت مجزا) — روی هر دو
 *    محیط dev و استقرار عمومی پلتفرم بدون تنظیم اضافه زنده می‌ماند.
 *  - دادهٔ زنده: هر اجرا از پایگاه واقعی محاسبه می‌کند (بازتولیدپذیر و
 *    قطعی) — هیچ وابستگی سخت به فایل شاهد نیست.
 *  - شاهد ماندگار: نخستین اجرای موفق، فایل‌های شاهد را در intelligence-data/
 *    می‌نویسد (قابل کامیت — بقای ریست‌ها طبق AGENTS.md §۷)؛ اجراهای بعدی
 *    فقط خلاصهٔ زنده (loop-latest.json) را بازنویسی می‌کنند.
 *  - خطا: هرگز بوت/درخواست را نمی‌شکند (الگوی بلع ابزار در P4-06).
 *
 * فعال‌سازی: پیش‌فرض روشن (MELK_INTELLIGENCE_DAEMON=disabled برای خاموشی)؛
 * فاصلهٔ تازه‌سازی: MELK_INTELLIGENCE_INTERVAL_MINUTES (پیش‌فرض ۶۰).
 */

import { mkdirSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { runOutcomeLoop, type OutcomeLoopSummary, type OutcomeLoopResult } from "./outcome-loop";

/** دایرکتوری شاهدهای مغز — نسبت به cwd فعلی (تنبل؛ قابل‌ایزوله‌سازی در تست) */
export function intelligenceDataDir(): string {
  return join(process.cwd(), "intelligence-data");
}
function evidencePaths() {
  const dir = intelligenceDataDir();
  return {
    predictions: join(dir, "predictions.jsonl"),
    outcomes: join(dir, "outcomes.jsonl"),
    latest: join(dir, "loop-latest.json"),
  };
}

/** عمر مفید دادهٔ تک‌نمونه پیش از تازه‌سازی (پیش‌فرض ۵۵ دقیقه) */
const MAX_AGE_MS_DEFAULT = 55 * 60 * 1000;

// ===================== تک‌نمونهٔ وضعیت =====================

interface BrainState {
  summary: OutcomeLoopSummary | null;
  lastRunAt: number;
  inFlight: Promise<OutcomeLoopResult> | null;
  lastError: string | null;
  runs: number;
}

const g = globalThis as unknown as { __melkBrainState?: BrainState };

function state(): BrainState {
  if (!g.__melkBrainState) {
    g.__melkBrainState = { summary: null, lastRunAt: 0, inFlight: null, lastError: null, runs: 0 };
  }
  return g.__melkBrainState;
}

/** تازه بودن دادهٔ فعلی */
export function isBrainDataFresh(maxAgeMs: number = MAX_AGE_MS_DEFAULT): boolean {
  const s = state();
  return s.summary !== null && Date.now() - s.lastRunAt < maxAgeMs;
}

/** آخرین وضعیت بدون اجرای دوباره (برای نمایش سریع UI) */
export function peekBrainSummary(): OutcomeLoopSummary | null {
  return state().summary;
}

/**
 * تضمین وجود دادهٔ مغز — اگر تازه نیست، حلقه را یک‌بار اجرا می‌کند
 * (نگه‌دارندهٔ هم‌زمانی: درخواست‌های هم‌زمان همان اجرا را به اشتراک می‌گذارند).
 */
export async function ensureBrainData(
  db: PrismaClient,
  options?: { maxAgeMs?: number; now?: Date },
): Promise<OutcomeLoopSummary> {
  const s = state();
  if (isBrainDataFresh(options?.maxAgeMs) && s.summary) return s.summary;
  if (s.inFlight) return (await s.inFlight).summary;

  const run = (async () => {
    const result = await runOutcomeLoop(db, options?.now ?? new Date());
    s.summary = result.summary;
    s.lastRunAt = Date.now();
    s.runs += 1;
    s.lastError = null;
    try {
      persistEvidence(result);
    } catch {
      // شاهد فایل بهترین-تلاش است — خطای آن دادهٔ زنده را بی‌اعتبار نمی‌کند
    }
    return result;
  })();

  s.inFlight = run;
  try {
    return (await run).summary;
  } catch (err) {
    s.lastError = (err as Error).message;
    // دادهٔ کهنه بهتر از بی‌داده است — اگر قبلاً محاسبه شده بود همان می‌ماند
    if (s.summary) return s.summary;
    throw err;
  } finally {
    s.inFlight = null;
  }
}

// ===================== شاهد ماندگار =====================

/**
 * نوشتن شاهدها:
 *  - predictions.jsonl / outcomes.jsonl: فقط اگر وجود ندارند (شاهد نخستین
 *    اجرای ثبت‌شده — append یک‌باره، رشد نمی‌کند)
 *  - loop-latest.json: همیشه بازنویسی (خلاصهٔ زندهٔ آخرین اجرا)
 */
function persistEvidence(result: OutcomeLoopResult): void {
  const paths = evidencePaths();
  mkdirSync(intelligenceDataDir(), { recursive: true });
  if (!existsSync(paths.predictions)) {
    for (const p of result.predictions) appendFileSync(paths.predictions, `${JSON.stringify(p)}\n`, "utf8");
  }
  if (!existsSync(paths.outcomes)) {
    for (const o of result.outcomes) appendFileSync(paths.outcomes, `${JSON.stringify(o)}\n`, "utf8");
  }
  writeFileSync(paths.latest, `${JSON.stringify(result.summary, null, 2)}\n`, "utf8");
}

// ===================== دیمن v2 =====================

/** اجرای دوره‌ای — از instrumentation.ts فراخوانده می‌شود */
export function startIntelligenceDaemon(db: PrismaClient): void {
  if (process.env.MELK_INTELLIGENCE_DAEMON === "disabled") return;
  const intervalMinutes = Math.max(
    5,
    Number.parseInt(process.env.MELK_INTELLIGENCE_INTERVAL_MINUTES ?? "60", 10) || 60,
  );

  const tick = async () => {
    try {
      await ensureBrainData(db);
    } catch {
      // خطای پس‌زمینه بی‌صدا — تیک بعدی دوباره تلاش می‌کند (الگوی sync daemon)
    }
    // فاز ۸ — یادگیری حلقه‌بسته پس از هر تیک دادهٔ تازه (بهترین-تلاش)
    try {
      await runLearningTick(db);
    } catch {
      // یادگیری هرگز دیمن را نمی‌شکند
    }
  };

  // نخستین اجرا پس از ۴۵ ثانیه (پس از آماده‌شدن کامل سرور)؛ سپس دوره‌ای
  setTimeout(() => void tick(), 45_000);
  setInterval(() => void tick(), intervalMinutes * 60 * 1000);
}

/** یک چرخهٔ یادگیری (فاز ۸) — محرک: دستهٔ پیامد (OUTCOME_BATCH) */
export async function runLearningTick(db: PrismaClient): Promise<{ updated: boolean; newVersion: number | null; rationale: string } | null> {
  const { createLearningEngine } = await import("@/core/intelligence/learning/learning-engine");
  const { policyPortFromDb, feedbackSourceFromDb, outcomeSourceFromSummary, evaluationSummaryFromLoop, LEARNING_DOMAIN } =
    await import("./learning-adapter");
  const engine = createLearningEngine({
    policy: policyPortFromDb(db),
    feedback: feedbackSourceFromDb(db),
    outcomes: outcomeSourceFromSummary(() => state().summary),
    evaluation: evaluationSummaryFromLoop(() => state().summary),
    defaultDomain: LEARNING_DOMAIN,
  });
  return engine.learn({ tileId: "arm-listing", trigger: "OUTCOME_BATCH" });
}

/** گزارش سلامت دیمن برای endpoint وضعیت */
export function daemonHealth(): { alive: boolean; runs: number; lastRunAt: string | null; lastError: string | null; intervalMinutes: number } {
  const s = state();
  return {
    alive: process.env.MELK_INTELLIGENCE_DAEMON !== "disabled",
    runs: s.runs,
    lastRunAt: s.summary ? s.summary.ranAt : null,
    lastError: s.lastError,
    intervalMinutes: Math.max(
      5,
      Number.parseInt(process.env.MELK_INTELLIGENCE_INTERVAL_MINUTES ?? "60", 10) || 60,
    ),
  };
}

// ===================== دروازهٔ امن روت (P2-03 — روت‌ها هرگز مستقیم @/lib/db) =====================

/** تضمین دادهٔ مغز با db خودِ اپ — برای روت /api/intelligence/status */
export async function ensureBrainStatus(): Promise<OutcomeLoopSummary> {
  const { db } = await import("@/lib/db");
  return ensureBrainData(db);
}

/** آخرین نسخهٔ سیاست ایجنت M1 — نمای مطمئن روت (بدون دسترسی مستقیم db در روت) */
export async function getLearningSnapshot(): Promise<{
  latestVersion: number;
  active: boolean;
  rationale: string;
  createdAt: Date;
} | null> {
  const { db } = await import("@/lib/db");
  const row = await db.agentPolicyVersion.findFirst({
    where: { tileId: "arm-listing" },
    orderBy: { version: "desc" },
    select: { version: true, rationale: true, active: true, createdAt: true },
  });
  return row ? { latestVersion: row.version, active: row.active, rationale: row.rationale, createdAt: row.createdAt } : null;
}
