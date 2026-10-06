/**
 * TransactionRepository — قرارداد دسترسی به معاملات (گزارش تطابق)
 * ------------------------------------------------------
 * مصرف‌کننده‌ها: ایجنت معاملات، ایجنت باشگاه مشتریان،
 * روت crm/transactions، روت crm/customer-club، همگام‌سازی (P2-04).
 */
import type { TransactionDTO, TransactionUpsertInput } from "./dto";
import type { BulkUpsertOptions, BulkWriteStats } from "./bulk-write.repository";

/** فیلترهای فهرست معاملات — عین پارامترهای روت (خالص، بدون Prisma) */
export interface TransactionListFilter {
  /** از این تاریخ (yyyy-MM-dd) */
  dateFrom?: string;
  /** تا این تاریخ (yyyy-MM-dd) */
  dateTo?: string;
  /** جستجوی کد ملک (contains) */
  propertyCode?: string;
  /** جستجوی کد درخواست (contains) */
  requestCode?: string;
  /** جستجوی شماره هولوگرام (contains) */
  contractHolo?: string;
  /** نوع تطبیق: event (رویداد) | suggested (آگهی پیشنهادی) | both (هر دو) */
  matchKind?: "event" | "suggested" | "both";
}

/** گزینه‌های صفحه‌بندی و مرتب‌سازی فهرست معاملات */
export interface TransactionListOptions {
  filter?: TransactionListFilter;
  sortBy?: "contractDate" | "eventsCount" | "suggestedPropertyCount";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** خلاصه چهارگانه گزارش تطابق همان بازه (عین شاخص‌های خود سامانه) */
export interface TransactionListSummary {
  totalCount: number;
  hasRequestEvent: number;
  hasSuggestedProperty: number;
  hasBoth: number;
  withHolo: number;
  withRequest: number;
}

/** نتیجه فهرست معاملات با شاخص‌های تحلیلی */
export interface TransactionListResult {
  rows: TransactionDTO[];
  total: number;
  summary: TransactionListSummary;
}

export interface TransactionRepository {
  /** همه معاملات (تحلیل ایجنت) */
  findAll(): Promise<TransactionDTO[]>;
  /** فهرست فیلترشده + شمارنده‌ها (روت crm/transactions) */
  listWithSummary(options: TransactionListOptions): Promise<TransactionListResult>;
  /** شمارش کل (وضعیت همگام‌سازی/نشانگرها) */
  countAll(): Promise<number>;
  /** جایگزینی کامل (حالت legacy همگام‌سازی — deleteMany + createMany اتمیک) */
  replaceAll(rows: TransactionUpsertInput[]): Promise<number>;
  /** درج/به‌روزرسانی مبتنی بر کلید طبیعی id (همگام‌سازی افزایشی — P2-04) */
  upsertBatch(rows: TransactionUpsertInput[]): Promise<{ created: number; updated: number }>;
  /** P6.5-03 — درج/به‌روزرسانی انبوه با merge non-null (Bulk Import؛ محافظت sourceRunId) */
  upsertBulk(rows: TransactionUpsertInput[], opts: BulkUpsertOptions): Promise<BulkWriteStats>;
  /** P6.5-14 (BLOCK C — ملکا-شورا-۱۴۰۵-۰۱۷) — غنی‌سازی معامله‌محور بر اساس txId */
  findInfoEnrichmentsByTxIds(txIds: string[]): Promise<
    Array<{
      txId: string;
      contractType: string | null;
      contractPrice: number | null;
      buyerName: string | null;
      buyerMobile: string | null;
      sellerName: string | null;
      sellerMobile: string | null;
      realtorSharesJson: string | null;
      propertyTitle: string | null;
      propertyAddress: string | null;
      status: string | null;
      documentDate: Date | null;
      deliveryDate: Date | null;
    }>
  >;
  /** پاک‌سازی کامل (ریست کش CRM) */
  deleteAll(): Promise<void>;
}
