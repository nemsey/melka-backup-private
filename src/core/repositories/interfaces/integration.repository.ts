/**
 * IntegrationRepository — قرارداد دسترسی به اتصال‌های سامانه‌های بیرونی
 * ------------------------------------------------------
 * دامنه: PmConnection (تک‌رکورد singleton — حساب شخصی سامانه پرسنلی)،
 * ArmConnection (P6.5-11 بند ث — صندوقچهٔ ماندگار توکن ARM)،
 * SyncCheckpoint (P6.5-11 بند ب — نقطهٔ ازسرگیری «ادامه از جاییکه قطع شد»).
 * مصرف‌کننده‌ها: روت‌های pm/arm connection، نشانگرهای اتصال، خط لولهٔ کاتالوگ.
 */
import type {
  PmConnectionDTO,
  PmConnectionUpsertInput,
  GapConnectionDTO,
  GapConnectionUpsertInput,
  ArmConnectionDTO,
  ArmConnectionUpsertInput,
  SyncCheckpointDTO,
  SyncCheckpointUpsertInput,
} from "./dto";

export interface IntegrationRepository {
  /** رکورد اتصال PM (null اگر هرگز متصل نشده) */
  getPmConnection(): Promise<PmConnectionDTO | null>;
  /** upsert رکورد singleton با مقادیر جدید */
  upsertPmConnection(input: PmConnectionUpsertInput): Promise<void>;
  /** حذف کامل رکورد اتصال (ریست) */
  deletePmConnection(): Promise<void>;

  // ---- P6546/گام صفر — اتصال سامانه GAP (گفت‌وگوی آنلاین ملک تبریز) ----
  /** رکورد singleton اتصال GAP (null اگر هرگز متصل نشده) */
  getGapConnection(): Promise<GapConnectionDTO | null>;
  /** upsert رکورد singleton اتصال GAP */
  upsertGapConnection(input: GapConnectionUpsertInput): Promise<void>;
  /** حذف کامل رکورد اتصال GAP (ریست) */
  deleteGapConnection(): Promise<void>;
  /** P6.5-03 — checkpoint یکپارچه Bulk Import (JSON در SyncState.singleton؛ جدا از فیلدهای sync منظم §۱.۵) */
  getBulkImportCheckpoint(): Promise<string | null>;
  /** P6.5-03 — ذخیره checkpoint (فقط همین ستون را لمس می‌کند) */
  setBulkImportCheckpoint(json: string): Promise<void>;

  // ---- P6.5-11 (بند ث) — صندوقچهٔ ماندگار ARM ----
  /** رکورد صندوقچهٔ ARM با کلید بازیابی (null اگر آن کلید هرگز متصل نشده) */
  getArmConnection(ownerKey: string): Promise<ArmConnectionDTO | null>;
  /** جدیدترین رکورد متصل صندوقچه (برای بازیابی نشست OWNER با کد مستر) */
  getLatestArmConnection(): Promise<ArmConnectionDTO | null>;
  /** upsert رکورد صندوقچه با ownerKey */
  upsertArmConnection(input: ArmConnectionUpsertInput): Promise<void>;
  /** پاک‌کردن توکن‌های یک کلید (بدون حذف رکورد — سابقه می‌ماند) */
  clearArmConnectionTokens(ownerKey: string): Promise<void>;

  // ---- P6.5-11 (بند ب) — نقطهٔ ازسرگیری همگام‌سازی ----
  /** checkpoint موجودیت (null اگر هرگز ذخیره نشده) */
  getSyncCheckpoint(id: string): Promise<SyncCheckpointDTO | null>;
  /** upsert checkpoint — فقط صفحاتی که «کامل-ذخیره‌شده» جلو می‌روند */
  upsertSyncCheckpoint(input: SyncCheckpointUpsertInput): Promise<void>;
}
