/**
 * ContractRepository — قرارداد دسترسی به قراردادها (صورت وضعیت‌های ARM)
 * ------------------------------------------------------
 * مصرف‌کننده‌ها: ایجنت قراردادها، ایجنت مالی، ایجنت باشگاه مشتریان،
 * روت crm/contracts، روت crm/finance، روت crm/customer-club، همگام‌سازی.
 */
import type { ContractDTO } from "./dto";

/** ورودی درج قرارداد (عین نگاشت toContractCreates در همگام‌سازی) */
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
}

export interface ContractRepository {
  /** همه قراردادها (ترتیب پیش‌فرض دیتابیس — تحلیل ایجنت/مالی/باشگاه) */
  findAll(): Promise<ContractDTO[]>;
  /** همه قراردادها، جدیدترین ثبت اول (روت crm/contracts) */
  findAllOrderByCreatedAtDesc(): Promise<ContractDTO[]>;
  /** شمارش کل */
  countAll(): Promise<number>;
  /** جایگزینی کامل (حالت legacy همگام‌سازی) */
  replaceAll(rows: ContractUpsertInput[]): Promise<number>;
  /** درج/به‌روزرسانی مبتنی بر کلید طبیعی id (همگام‌سازی افزایشی — P2-04) */
  upsertBatch(rows: ContractUpsertInput[]): Promise<{ created: number; updated: number }>;
  /** پاک‌سازی کامل (ریست کش CRM) */
  deleteAll(): Promise<void>;
}
