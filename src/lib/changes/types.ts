/**
 * types.ts — کاشی «تغییرات» · انواع مشترک UI ↔ سرور (DIR-FF-TILE-003)
 * ---------------------------------------------------------------------------
 * تفکیک عین الگوی lib/request/types.ts + lib/listing/types.ts:
 * UI فقط از همین فایل type-import می‌کند تا گراف import هرگز به executor
 * (که @/lib/db را ارزشی import می‌کند) نرسد — گارد P1-03 (مرز لایه‌ای).
 *
 * executor همین انواع را re-export می‌کند تا روت‌ها/اسکریپت‌ها دست‌نخورده بمانند.
 */

/** یک گام از گزارش گام‌به‌گام عملیات تغییر/حذف (عین الگوی ۰۹۹) */
export interface ChangesStep {
  key: string;
  title: string;
  status: "pending" | "done" | "failed" | "skipped";
  detail: string;
}

/** گزارش کامل یک عملیات تغییر/حذف — همان قرارداد پاسخ روت‌های /api/changes/* */
export interface ChangesReport {
  ok: boolean;
  operation: string;
  steps: ChangesStep[];
  durationMs: number;
  result?: Record<string, unknown>;
  error?: string;
}
