/**
 * ExpertRepository — قرارداد دسترسی به کارشناسان و تعاملاتشان
 * ------------------------------------------------------
 * مصرف‌کننده‌ها: ایجنت کارشناسان، ایجنت مالی، ایجنت باشگاه مشتریان،
 * روت crm/experts، crm/meta، crm/interactions، crm/finance، همگام‌سازی.
 */
import type { ExpertDTO, InteractionDTO } from "./dto";
import type { BulkUpsertOptions, BulkWriteStats } from "./bulk-write.repository";

/** فیلترهای فهرست کارشناسان — عین پارامترهای روت crm/experts */
export interface ExpertListFilter {
  /** PN-044/فاز ۴ — مقدار ستون tenantId در DB ('melk-tabriz' | 'melketun'). undefined → بدون فیلتر tenant (رفتار قبلی) */
  tenantId?: string;
  fullName?: string;
  mobile?: string;
  personnelCode?: string;
  role?: string;
  businessTitle?: string;
  creator?: string;
  active?: boolean;
}

/** فیلتر تعاملات — عین پارامتر روت crm/interactions */
export interface InteractionListFilter {
  /** نام مشاور (طرف درخواست یا طرف آگهی — contains) */
  realtor?: string;
}

/** گزینه‌های فهرست کارشناسان */
export interface ExpertListOptions {
  filter?: ExpertListFilter;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** ردیف غنی‌شده کارشناس با مجموع تعاملات (عین خروجی روت crm/experts) */
export type ExpertWithInteractionsDTO = ExpertDTO & {
  /** مجموع تعامل‌ها (نقش درخواست‌دهنده + نقش آگهی‌گذار) */
  interactionTotal: number;
};

/** فیلدهای فهرست مرجع برای دراپ‌داون‌ها (روت crm/meta — خام، بدون مرتب‌سازی) */
export interface ExpertDistinctFields {
  roles: string[];
  businesses: string[];
  creators: (string | null)[];
}

export interface ExpertRepository {
  /** همه کارشناسان (تحلیل ایجنت) */
  findAll(): Promise<ExpertDTO[]>;
  /** فهرست فیلترشده + مجموع تعاملات هر مشاور (روت crm/experts) */
  listWithInteractions(options: ExpertListOptions): Promise<{ rows: ExpertWithInteractionsDTO[]; total: number }>;
  /** مقادیر یکتای نقش/شعبه/ثبت‌کننده (روت crm/meta) */
  distinctFilterFields(): Promise<ExpertDistinctFields>;
  /** فهرست تعاملات مشاوران (روت crm/interactions — مرتب بر اساس تعداد، حداکثر ۱۰۰۰) */
  listInteractions(filter: InteractionListFilter): Promise<{ rows: InteractionDTO[]; total: number }>;
  /** همه تعاملات بدون ترتیب/سقف (تحلیل ایجنت — عین findMany فعلی) */
  listAllInteractions(): Promise<InteractionDTO[]>;
  /** شمارش کل کارشناسان */
  countAll(): Promise<number>;
  /** شمارش کل تعاملات */
  countAllInteractions(): Promise<number>;
  /** جایگزینی کامل (حالت legacy همگام‌سازی) */
  replaceAll(rows: ExpertUpsertInput[]): Promise<number>;
  /** جایگزینی کامل تعاملات (حالت legacy همگام‌سازی) */
  replaceInteractions(rows: InteractionUpsertInput[]): Promise<number>;
  /** درج/به‌روزرسانی مبتنی بر کلید طبیعی personnelCode (همگام‌سازی افزایشی — P2-04) */
  upsertBatch(rows: ExpertUpsertInput[]): Promise<{ created: number; updated: number }>;
  /** درج/به‌روزرسانی تعاملات بر اساس id (همگام‌سازی افزایشی — P2-04) */
  upsertInteractionsBatch(rows: InteractionUpsertInput[]): Promise<{ created: number; updated: number }>;
  /** P6.5-03 — درج/به‌روزرسانی انبوه کارشناسان با merge non-null (Bulk Import) */
  upsertBulk(rows: ExpertUpsertInput[], opts: BulkUpsertOptions): Promise<BulkWriteStats>;
  /** P6.5-03 — درج/به‌روزرسانی انبوه تعاملات با merge non-null (Bulk Import) */
  upsertInteractionsBulk(rows: InteractionUpsertInput[], opts: BulkUpsertOptions): Promise<BulkWriteStats>;
  /** پاک‌سازی کامل (ریست کش CRM) */
  deleteAll(): Promise<void>;
  /** پاک‌سازی کامل تعاملات (ریست کش CRM) */
  deleteAllInteractions(): Promise<void>;
}

/** ورودی درج کارشناس (عین نگاشت toExCreates) */
export interface ExpertUpsertInput {
  id: string;
  personnelCode: string;
  fullName: string;
  mobile: string;
  role: string;
  businessTitle: string;
  creator: string | null;
  active: boolean;
  createdAt: Date;
  /** B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام/موبایل/کسب‌وکار/ثبت‌کننده خام عین منبع */
  rawFullName?: string | null;
  rawMobile?: string | null;
  rawBusinessTitle?: string | null;
  rawCreator?: string | null;
  /** P6.5-04-e-v2 — provenance سه‌لایه حقیقت (خط لوله Bulk پر می‌کند) */
  rawSourceVersion?: string | null;
  extractedAt?: Date | null;
  extractionBatchId?: string | null;
  normalizationVersion?: string | null;
}

/** ورودی درج تعامل (عین نگاشت toInCreates) */
export interface InteractionUpsertInput {
  id: string;
  requestRealtorName: string;
  propertyRealtorName: string;
  count: number;
  /** B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام‌های خام عین منبع (کلید طبیعی) */
  rawRequestRealtorName?: string | null;
  rawPropertyRealtorName?: string | null;
  /** P6.5-04-e-v2 — provenance سه‌لایه حقیقت (خط لوله Bulk پر می‌کند) */
  rawSourceVersion?: string | null;
  extractedAt?: Date | null;
  extractionBatchId?: string | null;
  normalizationVersion?: string | null;
}
