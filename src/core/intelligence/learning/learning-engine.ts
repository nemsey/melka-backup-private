/**
 * بدنهٔ موتور یادگیری (LearningEngineImpl) — PHASE 8
 * ------------------------------------------------------
 * ارتقاء «سیاست نسخه‌بندی‌شده» به یادگیری حلقه‌بسته:
 * ترکیب سیگنال بازخورد صریح + پیامد واقعی اقدامات → نسخهٔ جدید سیاست با
 * rationale — نه فقط تعدیل وزن بازخوردی صرف (یافتهٔ F1 ممیزی).
 *
 * قواعد به‌روزرسانی (بازرسی‌پذیر — LEARNING_RULES):
 *  - LRN-001 (آستانهٔ سیگنال): به‌روزرسانی فقط وقتی سیگنال کافی هست:
 *      OUTCOME_BATCH   → پیامدهای جدید ≥ outcomeBatchThreshold (پیش‌فرض ۲۵)
 *      FEEDBACK_THRESHOLD → بازخوردهای جدید ≥ feedbackThreshold (پیش‌فرض ۱۰)
 *      MANUAL/SCHEDULED → همیشه مجاز (حداقل یک سیگنال لازم)
 *  - LRN-002 (جهت وزن): برای دامنهٔ ارزیابی‌شده با ارزیابی معتبر:
 *      ABOVE_BASELINE → وزن دامنه +۰٫۰۵ (تا سقف clampWeight 1.8)
 *      BELOW_BASELINE → وزن دامنه −۰٫۰۵ (تا کف 0.3)
 *      AT_BASELINE / INSUFFICIENT_DATA → بدون تغییر وزن (نسخه ثبت می‌شود
 *      با rationale «پایش» — شفافیت چرخهٔ یادگیری)
 *  - LRN-003 (یکپارچگی): هر به‌روزرسانی = نسخهٔ جدید از PolicyRepository
 *      تزریقی + activate اتمیک؛ هرگز بازنویسی نسخه‌های قبل.
 *  - LRN-004 (صداقت): بدون مخزن سیاست یا بدون سیگنال → updated=false با
 *      rationale صریح — هیچ نسخهٔ بی‌سیگنالی ساخته نمی‌شود.
 *
 * مرز: نوشتن فقط از PolicyRepository تزریقی (قرارداد v1) — صفر Prisma مستقیم.
 */

import type { LearningEngine, LearningQuery, LearningResult, LearningTrigger } from "../engines/learning";
import type { AgentPolicyContent } from "@/core/agent/policy";

/**
 * آینهٔ محلی clampWeight (قانون پل P3-06: لایه هوشمندی حق import ارزشی از
 * لایه ایجنت را ندارد — فقط base-intelligent-agent.ts پل است). هم‌ارزی این
 * آینه با نسخهٔ مرجع با تست اختصاصی گارد می‌شود (phase8 §۴-۴).
 */
export function clampWeightMirror(w: number): number {
  return Math.min(1.8, Math.max(0.3, Math.round(w * 100) / 100));
}

/** درگاه مخزن سیاست — زیرمجموعهٔ PolicyRepository (تزریقی/قابل‌mock) */
export interface LearningPolicyPort {
  findActive(tileId: string): Promise<{ content: string; version: number; activatedAt: string | null } | null>;
  findLatest(tileId: string): Promise<{ version: number } | null>;
  createVersion(input: {
    tileId: string;
    version: number;
    content: string;
    rationale: string;
    active: boolean;
    activatedAt: Date | null;
  }): Promise<unknown>;
  activateVersion(tileId: string, version: number): Promise<unknown>;
}

/** منبع شمار بازخوردهای جدید از آخرین نسخهٔ فعال */
export interface LearningFeedbackSource {
  /** تعداد بازخوردهای ثبت‌شده پس از فعال‌شدن نسخهٔ جاری */
  countSince(tileId: string, sinceIso: string): Promise<number>;
}

/** منبع شمار پیامدهای ثبت‌شده از آخرین نسخهٔ فعال */
export interface LearningOutcomeSource {
  countSince(tileId: string, sinceIso: string): Promise<number>;
}

/** خلاصهٔ ارزیابی برای جهت‌دهی وزن (LRN-002) — بدون وابستگی به موتور کامل */
export interface LearningEvaluationSummary {
  verdict: "INSUFFICIENT_DATA" | "BELOW_BASELINE" | "AT_BASELINE" | "ABOVE_BASELINE";
  domain: string;
  sampleSize: number;
}

export interface LearningEngineOptions {
  policy: LearningPolicyPort;
  feedback: LearningFeedbackSource;
  outcomes: LearningOutcomeSource;
  evaluation?: (tileId: string) => Promise<LearningEvaluationSummary | null>;
  outcomeBatchThreshold?: number;
  feedbackThreshold?: number;
  /** دامنهٔ پیش‌فرض وقتی ارزیابی دامنه را تعیین نکرده */
  defaultDomain?: string;
}

export const DEFAULT_OUTCOME_BATCH_THRESHOLD = 25;
export const DEFAULT_FEEDBACK_THRESHOLD = 10;
export const WEIGHT_STEP = 0.05;

export class LearningEngineImpl implements LearningEngine {
  readonly contractVersion = 1 as const;

  private readonly policy: LearningPolicyPort;
  private readonly feedback: LearningFeedbackSource;
  private readonly outcomes: LearningOutcomeSource;
  private readonly evaluation: (tileId: string) => Promise<LearningEvaluationSummary | null>;
  private readonly outcomeBatchThreshold: number;
  private readonly feedbackThreshold: number;
  private readonly defaultDomain: string;

  constructor(options: LearningEngineOptions) {
    this.policy = options.policy;
    this.feedback = options.feedback;
    this.outcomes = options.outcomes;
    this.evaluation = options.evaluation ?? (() => Promise.resolve(null));
    this.outcomeBatchThreshold = options.outcomeBatchThreshold ?? DEFAULT_OUTCOME_BATCH_THRESHOLD;
    this.feedbackThreshold = options.feedbackThreshold ?? DEFAULT_FEEDBACK_THRESHOLD;
    this.defaultDomain = options.defaultDomain ?? "transactions";
  }

  async learn(query: LearningQuery): Promise<LearningResult> {
    // LRN-004 — بدون مخزن سیاست هیچ نسخه‌ای ساخته نمی‌شود
    const active = await this.policy.findActive(query.tileId);
    if (!active) {
      return {
        updated: false,
        newVersion: null,
        rationale: "LRN-004: سیاست فعالی برای این کاشی ثبت نشده — نخستین سیاست باید از مسیر ایجنت ساخته شود",
        signalBreakdown: { feedbackSignals: 0, outcomeSignals: 0 },
      };
    }

    const latest = await this.policy.findLatest(query.tileId);
    const nextVersion = (latest?.version ?? active.version) + 1;

    // شمارش سیگنال‌ها از فعال‌شدن نسخهٔ جاری (پنجرهٔ یادگیری)
    const activatedAtIso = active.activatedAt ?? new Date(0).toISOString();
    let feedbackSignals = 0;
    let outcomeSignals = 0;
    try {
      feedbackSignals = await this.feedback.countSince(query.tileId, activatedAtIso);
      outcomeSignals = await this.outcomes.countSince(query.tileId, activatedAtIso);
    } catch {
      // منابع آماری اختیاری‌اند — خطای آن‌ها یادگیری را متوقف نمی‌کند (شمارش صفر)
    }

    // LRN-001 — آستانهٔ سیگنال بر اساس محرک
    const enoughSignal =
      query.trigger === "OUTCOME_BATCH"
        ? outcomeSignals >= this.outcomeBatchThreshold
        : query.trigger === "FEEDBACK_THRESHOLD"
          ? feedbackSignals >= this.feedbackThreshold
          : feedbackSignals + outcomeSignals > 0; // MANUAL/SCHEDULEL — حداقل یک سیگنال

    if (!enoughSignal) {
      return {
        updated: false,
        newVersion: null,
        rationale: `LRN-001: سیگنال کافی نیست (بازخورد=${feedbackSignals} · پیامد=${outcomeSignals} · محرک=${query.trigger})`,
        signalBreakdown: { feedbackSignals, outcomeSignals },
      };
    }

    // LRN-002 — جهت وزن از ارزیابی
    let content: AgentPolicyContent;
    try {
      content = JSON.parse(active.content) as AgentPolicyContent;
    } catch {
      return {
        updated: false,
        newVersion: null,
        rationale: "LRN-004: محتوای سیاست فعال قابل‌خواندن نیست — یکپارچگی داده",
        signalBreakdown: { feedbackSignals, outcomeSignals },
      };
    }

    const summary = await this.evaluation(query.tileId);
    const domain = summary?.domain ?? this.defaultDomain;
    const weights = { ...content.weights };
    let directionNote = "پایش (بدون تغییر وزن)";
    if (summary && summary.verdict !== "INSUFFICIENT_DATA") {
      const current = typeof weights[domain] === "number" ? (weights[domain] as number) : 1;
      if (summary.verdict === "ABOVE_BASELINE") {
        weights[domain] = clampWeightMirror(current + WEIGHT_STEP);
        directionNote = `ارتقاء وزن دامنه «${domain}» +${WEIGHT_STEP} (ارزیابی بالاتر از خط پایه با ${summary.sampleSize} نمونه)`;
      } else if (summary.verdict === "BELOW_BASELINE") {
        weights[domain] = clampWeightMirror(current - WEIGHT_STEP);
        directionNote = `کاهش وزن دامنه «${domain}» −${WEIGHT_STEP} (ارزیابی پایین‌تر از خط پایه با ${summary.sampleSize} نمونه)`;
      } else {
        directionNote = `حفظ وزن دامنه «${domain}» (هم‌خط با خط پایه با ${summary.sampleSize} نمونه)`;
      }
    }

    // LRN-003 — نسخهٔ جدید + activate اتمیک
    const rationale = `LRN(${query.trigger}): بازخورد=${feedbackSignals} · پیامد=${outcomeSignals} — ${directionNote}`;
    await this.policy.createVersion({
      tileId: query.tileId,
      version: nextVersion,
      content: JSON.stringify({ ...content, weights }),
      rationale,
      active: false,
      activatedAt: null,
    });
    await this.policy.activateVersion(query.tileId, nextVersion);

    return {
      updated: true,
      newVersion: nextVersion,
      rationale,
      signalBreakdown: { feedbackSignals, outcomeSignals },
    };
  }
}

/** کارخانه */
export function createLearningEngine(options: LearningEngineOptions): LearningEngineImpl {
  return new LearningEngineImpl(options);
}
