/**
 * حالت همگام‌سازی — P2-04 → PN-038 (قانون دادهٔ مقدس)
 * ------------------------------------------------------
 * PN-038/۱.۴ (شورا-ن۰۶۳): مسیر legacy (deleteMany + createMany) برای همیشه
 * بازنشسته شد — «هیچ دادهٔ قبلی حذف نمی‌شود». تنها حالت: incremental
 * (upsert بر کلید طبیعی + نقطهٔ ازسرگیری + نامهٔ مرده).
 * مقدار MELK_SYNC_MODE=legacy دیگر بی‌اثر است (پارامتر حفظ شد تا اسکریپت‌های
 * محیطی قدیمی نشکنند).
 */

export type SyncMode = "legacy" | "incremental";

/** خواندن حالت از محیط — همیشه incremental (قانون دادهٔ مقدس PN-038) */
export function syncMode(): SyncMode {
  return "incremental";
}
