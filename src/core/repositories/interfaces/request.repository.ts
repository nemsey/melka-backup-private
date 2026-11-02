/**
 * RequestRepository — قرارداد دسترسی به درخواست‌های ملک و رویدادهایشان
 * ------------------------------------------------------
 * دامنه: RequestRecord (فرم ۵ گامی) + RequestEventRecord (رویدادها).
 * مصرف‌کننده‌ها: روت‌های requests/[id]، requests/[id]/register،
 * requests/[id]/events.
 *
 * 📍 نوشتن/همگام‌سازی اصلی از مسیر lib/request/store انجام می‌شود که
 * در محدوده P2-03 نیست (فقط روت‌ها انبار-محور می‌شوند)؛ این قرارداد
 * خواندن‌ها و به‌روزرسانی نتیجه آرمِ رویداد را پوشش می‌دهد.
 */
import type { RequestEventArmSyncInput, RequestRecordDTO, RequestWithEventsDTO } from "./dto";
import type {
  ArmRequestBulkRow,
  ArmRequestCatalogFilter,
  ArmRequestCatalogRow,
  BulkUpsertOptions,
  BulkWriteStats,
  EnrichmentCounts,
  PendingEnrichmentRow,
} from "./bulk-write.repository";

export interface RequestRepository {
  /** یک درخواست با شناسه (null اگر نبود) */
  findById(id: string): Promise<RequestRecordDTO | null>;
  /** یک درخواست + رویدادهایش مرتب بر اساس createdAt نزولی (عین include قدیم) */
  findByIdWithEventsDesc(id: string): Promise<RequestWithEventsDTO | null>;
  /** ذخیره نتیجه همگام‌سازی آرم روی یک رویداد (به‌روزرسانی گزیده) */
  updateEventArmSync(eventId: string, input: RequestEventArmSyncInput): Promise<void>;
  /** P6.5-03 — درج/به‌روزرسانی انبوه درخواست‌های ARM (source='arm'؛ کلید طبیعی requestCode) */
  upsertArmBulk(rows: ArmRequestBulkRow[], opts: BulkUpsertOptions): Promise<BulkWriteStats>;
  /** P6.5-10 — کاتالوگ تک‌صفحه‌ای درخواست‌های ARM با فیلتر کد/نام کارشناس (جدیدترین اول) */
  listArmCatalog(filter: ArmRequestCatalogFilter, limit: number): Promise<{ rows: ArmRequestCatalogRow[]; total: number }>;
  /** P6530/گام ۲ (بند ۳) — توزیع وضعیت‌های خام درخواست‌های ARM برای بینش شش‌حالته */
  statusBreakdownArm(): Promise<Array<{ status: string | null; count: number }>>;
  /** P6.5-10 — شمارش غنی‌سازی درخواست‌های ARM: total / pending / complete */
  countArmEnrichment(): Promise<EnrichmentCounts>;
  /** P6.5-11 (بند ب) — شمارش کل رکوردهای کاتالوگ ARM (source='arm') — مبنای بوت‌استرپ checkpoint */
  countArmSource(): Promise<number>;
  /** P6.5-10 — برش ردیف‌های در انتظار غنی‌سازی (جدیدترین اول؛ rowIds = هدفگذاری دقیق) */
  listPendingArmEnrichment(maxRows: number, rowIds?: string[]): Promise<PendingEnrichmentRow[]>;
  /** P6.5-11 (بند پ-۵) — تماس درخواست‌دهنده بر اساس کددرخواست‌ها (دسته‌ای؛ source='arm') */
  findArmRequesterContactsByCodes(requestCodes: string[]): Promise<Array<{ requestCode: string; customerName: string | null; customerMobile: string | null }>>;
}
