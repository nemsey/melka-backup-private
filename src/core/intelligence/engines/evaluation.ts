/**
 * قررداد موتور ارزیابی (EvaluationEngine) — PHASE 3 / interface خالص
 * ------------------------------------------------------
 * مسئولیت: سنجش کیفیت پیش‌بینی‌ها با معیارهای استاندارد:
 *  - Brier Score  — دقت احتمالاتی
 *  - Calibration  — توافق احتمال با واقعیت
 *  - Lift         — ارزش نسبت به تصادفی
 * پایان «پیش‌بینی بدون داوری» (یافته F3 ممیزی PHASE 0).
 *
 * مرز (قوانین اجرایی):
 *  - فقط خواندن + محاسبه خالص.
 *  - ورودی از OutcomeEngine (جفت‌های پیش‌بینی↔پیامد).
 *  - verdict همیشه صادقانه؛ نمونه < حداقل → INSUFFICIENT_DATA.
 *
 * نسخه قرارداد: 1.
 * فاز پیاده‌سازی بدنه: PHASE 8. در PHASE 3 فقط قرارداد.
 */

export interface CalibrationBucket {
  bucket: string;
  predicted: number;
  observed: number;
}

export type EvaluationVerdict =
  | "INSUFFICIENT_DATA"
  | "BELOW_BASELINE"
  | "AT_BASELINE"
  | "ABOVE_BASELINE";

export interface EvaluationQuery {
  tileId: string;
  windowDays?: number;
  target?: string;
}

export interface EvaluationReport {
  tileId: string;
  windowDays: number;
  sampleSize: number;
  brierScore?: number;
  calibration?: CalibrationBucket[];
  lift?: number;
  verdict: EvaluationVerdict;
  computedAt: string;
}

export interface EvaluationEngine {
  readonly contractVersion: 1;
  evaluate(query: EvaluationQuery): Promise<EvaluationReport>;
}
