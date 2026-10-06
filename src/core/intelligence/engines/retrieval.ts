/**
 * قرارداد موتور بازیابی (RetrievalEngine) — PHASE 3 / interface خالص
 * ------------------------------------------------------
 * مسئولیت: یافتن قطعات حافظه مرتبط با یک پرسش/بینش (RAG اختصاصی کاشی).
 * در PHASE 3 قرارداد = همان الگوریتم امروزی (TF + Cosine) به‌صورت
 * موتور قابل‌جایگزینی؛ ارتقاء به Hybrid (واژگانی + معنایی) در فاز بعد.
 *
 * مرز (قوانین اجرایی):
 *  - توابع خالص termVector و cosineSimilarity از base-agent «انتقال نمی‌یابند» —
 *    پیاده‌سازی آینده آن‌ها را از محل موجود import می‌کند (یک منبع واحد).
 *  - صفر I/O مستقیم — خواندن حافظه فقط از MemoryEngine.
 *
 * نسخه قرارداد: 1.
 * فاز پیاده‌سازی بدنه: PHASE 5 (Hybrid قرارداد-اول). در PHASE 3: fallback کامل
 * به retrieveRelevant امروزی.
 */

import type { MemoryEntry, MemoryLayer } from "./memory";

export type RetrievalMethod = "TF_COSINE" | "HYBRID";

export interface RetrievalQuery {
  tileId: string;
  query: string;
  k?: number;
  layers?: MemoryLayer[];
}

export interface RetrievalResult {
  snippets: MemoryEntry[];
  hitCount: number;
  /** روش استفاده‌شده — در PHASE 3 همیشه "TF_COSINE" (اعلام صادقانه) */
  method: RetrievalMethod;
}

export interface RetrievalEngine {
  readonly contractVersion: 1;
  retrieve(query: RetrievalQuery): Promise<RetrievalResult>;
}
