/**
 * ContractRepository — قرارداد دسترسی به قراردادها (صورت وضعیت‌های ARM)
 * ------------------------------------------------------
 * مصرف‌کننده‌ها: ایجنت قراردادها، ایجنت مالی، ایجنت باشگاه مشتریان،
 * روت crm/contracts، روت crm/finance، روت crm/customer-club، همگام‌سازی.
 */
import type { ContractDTO } from "./dto";
import type { BulkUpsertOptions, BulkWriteStats } from "./bulk-write.repository";

/** ورودی درج قرارداد (عین نگاشت toContractCreates در همگام‌سازی) */
/** P6.5-12 — ردیف کارگزاری برای فهرست معاملات (فقط خواندن) */
export interface AgencyLookupRow {
  id: string;
  propertyCode: string | null;
  propertyId: string | null;
  realtorName: string | null;
  creatorName: string | null;
  payPercent: number | null;
  sellPrice: number | null;
  detailsJson: string | null;
  createdAt: Date | null;
}

export interface ContractUpsertInput {
  id: string;
  status: string;
  contractHolo: string | null;
  propertyCode: string | null;
  requestCode: string | null;
  contractType: string | null;
  creatorName: string | null;
  createdAt: Date | null;
  contractDate: Date | null;
  documentDate: Date | null;
  deliveryDate: Date | null;
  propertyTitle: string | null;
  propertyAddress: string | null;
  buyerListJson: string | null;
  sellerListJson: string | null;
  realtorListJson: string | null;
  canAddRealtor: boolean;
  /** P6.5-12 — مبالغ مالی قرارداد (از trade-overviews/info) */
  contractPrice?: number | null;
  rawContractPrice?: string | null;
  comisionOfContract?: number | null;
  taxOfContract?: number | null;
  /** P6.5-12 — شناسهٔ کسب‌وکار (کلید مشترک سامانه‌ها) */
  businessId?: string | null;
  /** P6.5-04-e-v2 — سه‌لایه حقیقت: لایه ۱ خام + provenance (خط لوله Bulk پر می‌کند) */
  rawDate?: string | null;
  /** B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام ثبت‌کننده و عنوان ملک خام عین منبع */
  rawCreatorName?: string | null;
  rawPropertyTitle?: string | null;
  rawSourceVersion?: string | null;
  extractedAt?: Date | null;
  extractionBatchId?: string | null;
  normalizationVersion?: string | null;
}

export interface ContractRepository {
  /** همه قراردادها (ترتیب پیش‌فرض دیتابیس — تحلیل ایجنت/مالی/باشگاه) */
  findAll(): Promise<ContractDTO[]>;
  /** همه قراردادها، جدیدترین ثبت اول (روت crm/contracts) */
  findAllOrderByCreatedAtDesc(): Promise<ContractDTO[]>;
  /** شمارش کل */
  countAll(): Promise<number>;
  /** P6.5-12 — کارگزاری‌های صادره (special-properties) برای ستون فایل قرارداد */
  listAgencyLookups(): Promise<AgencyLookupRow[]>;
  /** جایگزینی کامل (حالت legacy همگام‌سازی) */
  replaceAll(rows: ContractUpsertInput[]): Promise<number>;
  /** درج/به‌روزرسانی مبتنی بر کلید طبیعی id (همگام‌سازی افزایشی — P2-04) */
  upsertBatch(rows: ContractUpsertInput[]): Promise<{ created: number; updated: number }>;
  /** P6.5-03 — درج/به‌روزرسانی انبوه با merge non-null (Bulk Import) */
  upsertBulk(rows: ContractUpsertInput[], opts: BulkUpsertOptions): Promise<BulkWriteStats>;
  /** پاک‌سازی کامل (ریست کش CRM) */
  deleteAll(): Promise<void>;
}
