/**
 * OutcomeRepository — قرارداد دسترسی به گزارش‌های نتیجه اقدام
 * ------------------------------------------------------
 * دامنه: گزارش‌های فقط-افزودنی «نتیجه اقدام کاربر/سیستم»:
 *   • LookupLog        — نتیجه استعلام استخراج اطلاعات
 *   • DivarRejectLog   — نتیجه رد آگهی (سیگنال یادگیری + اسنپ‌شات امتیاز)
 *   • CommissionCalcLog— نتیجه محاسبه کمیسیون
 *
 * 📍 PHASE 5+: با ساخت موتور Outcome Learning، خواندن/نویختن
 * «پیامد اقدامات ایجنت» از همین قراردار عبور می‌کند.
 */
import type {
  CommissionCalcInput,
  CommissionCalcLogDTO,
  DivarRejectInput,
  DivarRejectLogDTO,
  LookupLogDTO,
  LookupLogInput,
} from "./dto";

export interface OutcomeRepository {
  // ---------- استعلام‌ها (استخراج اطلاعات) ----------
  /** استعلام‌های اخیر — مرتب بر اساس createdAt نزولی (ایجنت استخراج + روت) */
  listRecentLookups(take: number, kind?: "PROPERTY" | "REQUEST"): Promise<LookupLogDTO[]>;
  /** شمارش استعلام‌ها (اختیاری: با فیلتر نوع) */
  countLookups(kind?: "PROPERTY" | "REQUEST"): Promise<number>;
  /** ثبت استعلام — فقط افزودنی (حسابرسی + حافظه ایجنت) */
  createLookup(input: LookupLogInput): Promise<LookupLogDTO>;

  // ---------- رد آگهی (فایل‌یابی) ----------
  /** سیگنال‌های رد اخیر — مرتب بر اساس createdAt نزولی (ایجنت فایل‌یابی) */
  listRecentRejects(take: number): Promise<DivarRejectLogDTO[]>;
  /** ثبت سیگنال رد — فقط افزودنی */
  createReject(input: DivarRejectInput): Promise<DivarRejectLogDTO>;

  // ---------- محاسبات کمیسیون (مالی) ----------
  /** ثبت محاسبه کمیسیون — فقط افزودنی (حافظه ایجنت مالی) */
  createCommissionCalc(input: CommissionCalcInput): Promise<CommissionCalcLogDTO>;
}
