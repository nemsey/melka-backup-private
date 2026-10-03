/**
 * قرارداد موتور پیامد (OutcomeEngine) — PHASE 3 / interface خالص
 * ------------------------------------------------------
 * مسئولیت: ثبت و نگاشت «آنچه واقعاً شد» به پیش‌بینی/توصیعی که داده شد
 * (حلقه بسته). اتصال OutcomeRecord ↔ PredictionResult — پایه یادگیری
 * واقعی به‌جای تعدیل وزن بازخوردی صرف (یافته F1 ممیزی).
 *
 * مرز (قوانین اجرایی):
 *  - فقط افزودنی.
 *  - منبع داده امروز (LookupLog / DivarRejectLog / CommissionCalcLog از
 *    OutcomeRepository موجود) در فاز پیاده‌سازی به این قرارداد نگاشت می‌شود.
 *  - بدون Migration جدید.
 *
 * نسخه قرارداد: 1.
 * فاز پیاده‌سازی بدنه: PHASE 7. در PHASE 3 فقط قرارداد.
 */

export interface OutcomeRecord {
  tileId: string;
  /** اتصال به پیش‌بینی مبدأ — نبود = اقدام بدون پیش‌بینی */
  predictionId?: string;
  /** اتصال به تصمیم مبدأ (کلید بینش/اقدام) */
  decisionKey?: string;
  outcome: string;
  occurredAt: string;
  evidence?: Record<string, unknown>;
}

export interface OutcomeQuery {
  tileId: string;
  since?: string;
  predictionId?: string;
}

export interface OutcomeLinkage {
  /** پیش‌بینی‌هایی که پیامدی برایشان ثبت شده */
  matched: number;
  /** پیش‌بینی‌هایی بدون پیامد — سیگنال کیفیت */
  unmatched: number;
}

export interface OutcomeEngine {
  readonly contractVersion: 1;
  record(entry: OutcomeRecord): Promise<void>;
  query(query: OutcomeQuery): Promise<OutcomeRecord[]>;
  linkage(tileId: string): Promise<OutcomeLinkage>;
}
