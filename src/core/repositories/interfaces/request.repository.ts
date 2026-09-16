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

export interface RequestRepository {
  /** یک درخواست با شناسه (null اگر نبود) */
  findById(id: string): Promise<RequestRecordDTO | null>;
  /** یک درخواست + رویدادهایش مرتب بر اساس createdAt نزولی (عین include قدیم) */
  findByIdWithEventsDesc(id: string): Promise<RequestWithEventsDTO | null>;
  /** ذخیره نتیجه همگام‌سازی آرم روی یک رویداد (به‌روزرسانی گزیده) */
  updateEventArmSync(eventId: string, input: RequestEventArmSyncInput): Promise<void>;
}
