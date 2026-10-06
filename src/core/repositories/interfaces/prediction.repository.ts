/**
 * PredictionRepository — قرارداد دسترسی به داده پیش‌بینی/روند
 * ------------------------------------------------------
 * دامنه امروز: PriceIndexHistory — تنها سری زمانی پیش‌روی برنامه
 * (تاریخچه شاخص قیمت مناطق؛ مبنای تشخیص جهش و روند).
 *
 * 📍 PHASE 3+: با ساخت موتور Prediction، جدول‌های اختصاصی پیش‌بینی
 * به همین قرارداد اضافه می‌شوند (افزودن متد، بدون تغییر امضاهای موجود).
 */
import type { PriceHistoryInput, PriceIndexHistoryDTO } from "./dto";

export interface PredictionRepository {
  /** تاریخچه شاخص — مرتب بر اساس recordedAt نزولی (ایجنت شاخص قیمت + روت) */
  listRecentHistory(take: number): Promise<PriceIndexHistoryDTO[]>;
  /** تاریخچه از یک زمان مشخص به بعد (قانون «حداکثر یک ثبت در روز») */
  listHistorySince(since: Date): Promise<PriceIndexHistoryDTO[]>;
  /** ثبت یک نقطه تاریخچه — فقط افزودنی */
  createHistoryEntry(input: PriceHistoryInput): Promise<PriceIndexHistoryDTO>;
}
