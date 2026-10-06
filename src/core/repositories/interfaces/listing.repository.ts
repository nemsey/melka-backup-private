/**
 * ListingRepository — قرارداد دسترسی به کاشی آگهی
 * ------------------------------------------------------
 * دامنه: ListingRecord (فرم ۵ گامی) + InstagramPostLog + InstagramConnection.
 * مصرف‌کننده‌ها: ایجنت آگهی، روت‌های listings/**، روت divar/ads/[token]/register.
 */
import type { InstagramConnectionDTO, InstagramPostLogDTO, ListingDTO } from "./dto";

/** داده به‌روزرسانی نتیجه انتقال CRM روی فایل (مسیر ثبت از فایل‌یابی) */
export interface ListingCrmTransferUpdate {
  armPropertyId: string | null;
  crmTransferredAt: Date;
  crmTransferJson: string;
  /** پاک‌سازی صریح مشتری آرم — عین update قدیم روت register (اختیاری) */
  armCustomerId?: string | null;
}

/** داده به‌روزرسانی نتیجه انتشار اینستاگرام روی فایل (روت instagram) */
export interface ListingInstagramPublicationUpdate {
  instagramPublishedAt: Date;
  instagramMediaId: string | null;
  instagramPostJson: string;
}

export interface ListingRepository {
  /** فایل‌های اخیر — مرتب بر اساس createdAt نزولی (ایجنت آگهی) */
  listRecent(take: number): Promise<ListingDTO[]>;
  /** گزارش‌های انتشار اینستاگرام — مرتب بر اساس createdAt نزولی (ایجنت آگهی) */
  listRecentPostLogs(take: number): Promise<InstagramPostLogDTO[]>;
  /** وضعیت اتصال اینستاگرام (ایجنت آگهی) */
  getInstagramConnection(): Promise<InstagramConnectionDTO | null>;
  /** یک فایل با شناسه (روت‌های جزئیات/ویرایش/انتقال) */
  findById(id: string): Promise<ListingDTO | null>;
  /** ثبت نتیجه انتقال CRM (درون‌ریزی خودکار از فایل‌یابی) */
  updateCrmTransfer(id: string, data: ListingCrmTransferUpdate): Promise<void>;
  /** ثبت نتیجه انتشار اینستاگرام (روت listings/[id]/instagram — P2-03) */
  updateInstagramPublication(id: string, data: ListingInstagramPublicationUpdate): Promise<void>;
}
