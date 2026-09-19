/**
 * VisitRepository — قرارداد دسترسی به بازدیدها و پیگیری‌ها
 * ------------------------------------------------------
 * مصرف‌کننده‌ها: ایجنت بازدیدها، روت crm/visits، همگام‌سازی.
 */
import type { VisitDTO } from "./dto";
import type { BulkUpsertOptions, BulkWriteStats } from "./bulk-write.repository";

/** فیلترهای فهرست بازدیدها — عین پارامترهای روت */
export interface VisitListFilter {
  propertyCode?: string;
  requester?: string;
  checker?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** شاخص‌های تحلیلی بازدیدها (خروجی روت) */
export interface VisitListSummary {
  totalCount: number;
  checkedCount: number;
  distinctPropertyCodes: number;
  distinctRequesters: number;
}

export interface VisitRepository {
  /** همه بازدیدها (تحلیل ایجنت) */
  findAll(): Promise<VisitDTO[]>;
  /** فهرست فیلترشده + شاخص‌ها (روت crm/visits — مرتب بر اساس createdAt نزولی) */
  listWithSummary(filter: VisitListFilter, limit: number, offset: number): Promise<{ rows: VisitDTO[]; total: number; summary: VisitListSummary }>;
  /** شمارش کل */
  countAll(): Promise<number>;
  /** جایگزینی کامل (حالت legacy همگام‌سازی) */
  replaceAll(rows: VisitUpsertInput[]): Promise<number>;
  /** درج/به‌روزرسانی مبتنی بر کلید طبیعی id (همگام‌سازی افزایشی — P2-04) */
  upsertBatch(rows: VisitUpsertInput[]): Promise<{ created: number; updated: number }>;
  /** P6.5-03 — درج/به‌روزرسانی انبوه با merge non-null (Bulk Import) */
  upsertBulk(rows: VisitUpsertInput[], opts: BulkUpsertOptions): Promise<BulkWriteStats>;
  /** پاک‌سازی کامل (ریست کش CRM) */
  deleteAll(): Promise<void>;
}

/** ورودی درج بازدید (عین نگاشت toViCreates) */
export interface VisitUpsertInput {
  id: string;
  propertyCode: string;
  requesterName: string;
  checkerName: string;
  propertyRealtorName: string;
  checkTime: Date | null;
  createdAt: Date;
  status: string;
  /** B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام‌های خام عین منبع */
  rawRequesterName?: string | null;
  rawCheckerName?: string | null;
  rawPropertyRealtorName?: string | null;
  /** P6.5-04-e-v2 — provenance سه‌لایه حقیقت (خط لوله Bulk پر می‌کند) */
  rawSourceVersion?: string | null;
  extractedAt?: Date | null;
  extractionBatchId?: string | null;
  normalizationVersion?: string | null;
}
