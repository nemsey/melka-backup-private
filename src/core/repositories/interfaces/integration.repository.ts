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
}
