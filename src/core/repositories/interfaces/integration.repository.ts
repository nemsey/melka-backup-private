/**
 * IntegrationRepository — قرارداد دسترسی به اتصال سامانه PM
 * ------------------------------------------------------
 * دامنه: PmConnection (تک‌رکورد singleton — حساب شخصی سامانه پرسنلی).
 * مصرف‌کننده‌ها: روت pm/connection، نشانگرهای اتصال.
 */
import type { PmConnectionDTO, PmConnectionUpsertInput } from "./dto";

export interface IntegrationRepository {
  /** رکورد اتصال PM (null اگر هرگز متصل نشده) */
  getPmConnection(): Promise<PmConnectionDTO | null>;
  /** upsert رکورد singleton با مقادیر جدید */
  upsertPmConnection(input: PmConnectionUpsertInput): Promise<void>;
  /** حذف کامل رکورد اتصال (ریست) */
  deletePmConnection(): Promise<void>;
  /** P6.5-03 — checkpoint یکپارچه Bulk Import (JSON در SyncState.singleton؛ جدا از فیلدهای sync منظم §۱.۵) */
  getBulkImportCheckpoint(): Promise<string | null>;
  /** P6.5-03 — ذخیره checkpoint (فقط همین ستون را لمس می‌کند) */
  setBulkImportCheckpoint(json: string): Promise<void>;
}
