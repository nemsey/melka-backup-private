/**
 * CustomerRepository — قرارداد دسترسی به درخواست‌ها و رویدادهایشان
 * ------------------------------------------------------
 * دامنه «مدیریت مشتریان»: RequestRecord (فرم ۴ گامی) + RequestEventRecord.
 * مصرف‌کننده‌ها: ایجنت مدیریت مشتریان (request)، روت‌های requests/**.
 */
import type { RequestEventDTO, RequestRecordDTO, RequestRecordWithEventsDTO } from "./dto";

/** داده به‌روزرسانی نتیجه همگام‌سازی آرم روی رویداد (روت ثبت رویداد) */
export interface EventArmSyncUpdate {
  armEventId: string | null;
  armSyncedAt: Date | null;
  armPropertyId: string | null;
  armSyncJson: string;
}

export interface CustomerRepository {
  /** درخواست‌های اخیر — مرتب بر اساس updatedAt نزولی (ایجنت مدیریت مشتریان) */
  listRecentRequests(take: number): Promise<RequestRecordDTO[]>;
  /** رویدادهای اخیر — مرتب بر اساس createdAt نزولی (ایجنت مدیریت مشتریان) */
  listRecentEvents(take: number): Promise<RequestEventDTO[]>;
  /** یک درخواست با شناسه (روت‌های جزئیات/ثبت آرم) */
  findById(id: string): Promise<RequestRecordDTO | null>;
  /** یک درخواست با رویدادهایش — عین include: { events } مرتب createdAt نزولی (روت رویدادها) */
  findByIdWithEvents(id: string): Promise<RequestRecordWithEventsDTO | null>;
  /** به‌روزرسانی نتیجه همگام‌سازی آرم روی رویداد (پس از ثبت رویداد) */
  updateEventArmSync(eventId: string, data: EventArmSyncUpdate): Promise<void>;
}
