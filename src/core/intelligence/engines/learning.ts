/**
 * قرارداد موتور یادگیری (LearningEngine) — PHASE 3 / interface خالص
 * ------------------------------------------------------
 * مسئولیت: به‌روزرسانی سیاست بر اساس Outcome (نه فقط بازخورد صریح کاربر):
 * ترکیب سیگنال بازخورد + نتیجه واقعی اقدامات → نسخه جدید سیاست با
 * rationale. ارتقاء «سیاست نسخه‌بندی‌شده» امروزی به یادگیری حلقه‌بسته.
 *
 * مرز (قوانین اجرایی):
 *  - تنها نویسنده سیاست در معماری هدف؛ در PHASE 3 مسیر reviewPolicyIfNeeded
 *    امروزی دست‌نخورده می‌ماند (fallback).
 *  - نوشتن فقط از PolicyRepository تزریقی.
 *  - هر به‌روزرسانی = نسخه جدید (بدون بازنویسی).
 *
 * نسخه قرارداد: 1.
 * فاز پیاده‌سازی بدنه: PHASE 8. در P3-03: fallback کامل به reviewPolicyIfNeeded.
 */

export type LearningTrigger =
  | "FEEDBACK_THRESHOLD"
  | "OUTCOME_BATCH"
  | "MANUAL"
  | "SCHEDULED";

export interface LearningQuery {
  tileId: string;
  trigger: LearningTrigger;
}

export interface LearningResult {
  updated: boolean;
  newVersion: number | null;
  rationale: string;
  /** شفافیت منبع سیگنال — چقدر از بازخورد و چقدر از پیامد واقعی */
  signalBreakdown: {
    feedbackSignals: number;
    outcomeSignals: number;
  };
}

export interface LearningEngine {
  readonly contractVersion: 1;
  learn(query: LearningQuery): Promise<LearningResult>;
}
