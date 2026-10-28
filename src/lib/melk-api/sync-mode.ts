/**
 * حالت همگام‌سازی — P2-04 (Feature Flag)
 * ------------------------------------------------------
 * MELK_SYNC_MODE=legacy       → رفتار فعلی: deleteMany + createMany اتمیک (پیش‌فرض)
 * MELK_SYNC_MODE=incremental  → upsert بر کلید طبیعی + نقطهٔ ازسرگیری + نامهٔ مرده
 *
 * ⚠️ پیش‌فرض legacy است و تا PHASE 4 (پس از اعتبارسنجی میدانی) تغییر نمی‌کند.
 * هر دو مسیر در تست‌ها پوشش داده شده‌اند (tests/phase2-sync.test.ts).
 */

export type SyncMode = "legacy" | "incremental";

/** خواندن حالت از محیط — هر مقدار غیر از "incremental" یعنی legacy */
export function syncMode(): SyncMode {
  return process.env.MELK_SYNC_MODE === "incremental" ? "incremental" : "legacy";
}
