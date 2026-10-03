/**
 * قرارداد نوشتار انبوه — P6.5-03 (Bulk Import Pipeline)
 * ------------------------------------------------------
 * آمار و گزینه‌های مشترک متدهای upsertBulk مخزن‌ها + قرارداد دو مخزن جدید:
 *   · PropertyRecordRepository — رجیستری آگهی‌های ARM (§۲.۲ طراحی)
 *   · ArmRequestBulkRow — ردیف درخواست ARM برای درون‌ریزی (source='arm' — §۱.۲)
 *
 * اصول (عین §۲.۴ طراحی):
 *  ۱) merge non-null — فیلد تهیِ ورودی جدید، مقدار موجود را بازنویسی نمی‌کند.
 *  ۲) فیلدهای حسابرسی (syncedAt, sourceRunId) همیشه به‌روز می‌شوند.
 *  ۳) خطای رکورد منفرد سد دسته نیست — در errors شمرده می‌شود (PARTIAL در سطح خط لوله).
 *  ۴) متدهای v1 (upsertBatch/replaceAll/...) دست‌نخورده — اینها صرفاً افزودنی‌اند.
 *
 * ✅ این فایل باید ۱۰۰٪ خالص بماند: صفر import از @prisma/client یا @/lib/db.
 */

/** آمار یک دسته نوشتار انبوه */
export interface BulkWriteStats {
  created: number;
  updated: number;
  /** رکورد موجود با محتوای تغییرنیافته (فقط syncedAt/sourceRunId جابه‌جا شد) */
  duplicates: number;
  /** رکوردهایی که نوشتنشان خطا خورد — دسته را نمی‌شکنند */
  errors: number;
}

/** گزینه‌های نوشتار انبوه — ستون sourceRunId در create نوشته و در update همیشه تازه می‌شود */
export interface BulkUpsertOptions {
  sourceRunId: string;
}

/** ورودی درج/به‌روزرسانی انبوه آگهی ARM — PropertyRecord (کلید طبیعی: propertyCode) */
export interface PropertyBulkInput {
  /** شناسه ARM (objectId) — کلید فیزیکی */
  id: string;
  /** کدآگهی ARM — کلید طبیعی یکتا */
  propertyCode: string;
  title?: string | null;
  status?: string | null;
  ownerCode?: string | null;
  ownerName?: string | null;
  branchId?: string | null;
  cityId?: string | null;
  areaId?: string | null;
  areaName?: string | null;
  lineId?: string | null;
  lineName?: string | null;
  address?: string | null;
  propertyTypeId?: string | null;
  propertyTypeName?: string | null;
  tradeTypeId?: string | null;
  tradeTypeName?: string | null;
  /** ریال — عدد پایه (§۳.۵ مرز واحد پول) */
  price?: number | null;
  pricePerMeter?: number | null;
  meterage?: number | null;
  rooms?: number | null;
  floor?: number | null;
  buildYear?: number | null;
  description?: string | null;
  detailsJson?: string | null;
  ownerMobile?: string | null;
  createdAt?: Date | null;
  /** P6.5-04-e-v2 — لایه ۱ حقیقت (Raw): مقادیر عین منبع؛ هرگز توسط نرمال‌سازی تغییر نمی‌کنند */
  rawPrice?: string | null;
  rawPriceUnit?: string | null;
  rawArea?: string | null;
  /** B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام/موبایل مالک خام عین منبع */
  rawOwnerName?: string | null;
  rawOwnerMobile?: string | null;
  /** P6.5-04-e-v2 — provenance سه‌لایه حقیقت */
  rawSourceVersion?: string | null;
  extractedAt?: Date | null;
  extractionBatchId?: string | null;
  normalizationVersion?: string | null;
}

/** ورودی درج/به‌روزرسانی انبوه درخواست ARM — RequestRecord با source='arm' (کلید طبیعی: requestCode) */
export interface ArmRequestBulkRow {
  /** شناسه ARM — کلید فیزیکی */
  id: string;
  /** کد درخواست ARM — کلید طبیعی یکتا (ستون افزودنی P6.5-03) */
  requestCode: string;
  customerName?: string | null;
  customerMobile?: string | null;
  status?: string | null;
  /** P6521/M2 — منطقه‌های منتخب درخواست (متن ساده از requests/details) */
  areaNames?: string[] | null;
  /** P6530/گام ۲ — دسته‌بندی درخواست (خرید/پیش خرید/رهن و اجاره/مشارکت در ساخت — از جزئیات ARM) */
  tradeTypeName?: string | null;
  /** P6546/گام دوم — نوع ملک درخواستی (از جزئیات ARM — propertyCategory) */
  propertyTypeName?: string | null;
  /** P6546/گام دوم — نوع ساختمان درخواستی (از جزئیات ARM) */
  buildingTypeName?: string | null;
  /** P6530/گام ۲ — بازهٔ قیمت متقاضی (تومان — از جزئیات ARM؛ inputs فرم پویا) */
  priceFrom?: number | null;
  priceTo?: number | null;
  /** کارشناس ثبت‌کننده در ARM؛ نبود → 'arm' (رکورد سیستمی) */
  actorCode?: string | null;
  /** P6.5-10 — نام و نام خانوادگی کارشناس ثبت‌کننده (relatedRealtor ردیف فهرست ARM) */
  actorName?: string | null;
  /** P6.5-10 — عنوان درخواست عین سامانه ARM (مثل «خرید زمین یا ملک کلنگی...») */
  title?: string | null;
  createdAt?: Date | null;
  /** B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام/موبایل مشتری خام عین منبع */
  rawCustomerName?: string | null;
  rawCustomerMobile?: string | null;
  /** P6.5-04-e-v2 — provenance سه‌لایه حقیقت (خط لوله Bulk پر می‌کند) */
  rawSourceVersion?: string | null;
  extractedAt?: Date | null;
  extractionBatchId?: string | null;
  normalizationVersion?: string | null;
}

/** ردیف کاتالوگ آگهی‌های ARM — نمای نمایشی کاشی «آگهی ملک تبریز» (P6.5-10 + P6530/گام ۱)
 *  ستون‌های ده‌گانهٔ فهرست عین دستور مالک:
 *  ردیف · کد آگهی · کارشناس · شعبه · مالک (نام + موبایل زیر نام) · قیمت ملک ·
 *  آدرس ملک (منطقه، کوی، پلاک) · دسته‌بندی · وضعیت (ده‌حالته) · آخرین فعالیت */
export interface ArmListingCatalogRow {
  /** شناسه ARM (objectId) */
  id: string;
  /** کدآگهی */
  propertyCode: string;
  title: string | null;
  status: string | null;
  /** نام و نام خانوادگی کارشناس مسؤول (relatedRealtor — ستون ownerName) */
  realtorName: string | null;
  /** نام و نام خانوادگی مالک ملک (لایه ۲ غنی‌سازی — rawOwnerName) */
  ownerName: string | null;
  /** شماره تماس مالک ملک (نرمال‌شده 09xxxxxxxxx) */
  ownerMobile: string | null;
  /** P6530/گام ۱ — قیمت ملک (تومان — عدد پایهٔ سامانه) */
  price: number | null;
  /** P6530/گام ۱ — دسته‌بندی آگهی (فروش/پیش فروش/رهن و اجاره/مشارکت در ساخت) */
  tradeTypeName: string | null;
  /** آدرس ملک (دقیق از جزئیات یا ترکیبی از موقعیت فهرست) */
  address: string | null;
  areaName: string | null;
  lineName: string | null;
  /** P6546/گام یک — نوع ملک (آپارتمان/زمین یا کلنگی/...) از properties/details + APU عمومی */
  propertyTypeName: string | null;
  /** P6546/گام یک — متراژ (مترمربع) */
  meterage: number | null;
  /** P6546/گام یک — تعداد اتاق */
  rooms: number | null;
  /** P6546/گام یک — طبقه */
  floor: number | null;
  /** P6546/گام یک — سال ساخت */
  buildYear: number | null;
  /** P6546/گام یک — قیمت هر متر (تومان) */
  pricePerMeter: number | null;
  /** زمان غنی‌سازی تماس — تهی = در انتظار */
  enrichedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date;
}

/** ردیف کاتالوگ درخواست‌های ARM — نمای نمایشی کاشی «درخواست ملک تبریز» (P6.5-10 + P6530/گام ۲)
 *  ستون‌های ده‌گانهٔ فهرست عین دستور مالک:
 *  ردیف · کد درخواست · کارشناس · شعبه · متقاضی (نام + موبایل زیر نام) ·
 *  قیمت از...تا... · مناطق · دسته‌بندی · وضعیت (شش‌حالته) · تاریخ ثبت */
export interface ArmRequestCatalogRow {
  /** شناسه ARM (objectId) */
  id: string;
  /** کد درخواست */
  requestCode: string;
  title: string | null;
  status: string | null;
  /** نام و نام خانوادگی کارشناس ثبت‌کننده */
  actorName: string | null;
  /** نام و نام خانوادگی درخواست‌دهنده */
  customerName: string | null;
  /** شماره تماس درخواست‌دهنده (نرمال‌شده 09xxxxxxxxx) */
  customerMobile: string | null;
  /** P6521/M2 — منطقه‌های منتخب (متن ساده؛ تهی = هنوز از منبع تکمیل نشده) */
  areaNames: string[];
  /** P6530/گام ۲ — دسته‌بندی درخواست (خرید/پیش خرید/رهن و اجاره/مشارکت در ساخت) */
  tradeTypeName: string | null;
  /** P6546/گام دوم — نوع ملک درخواستی (از جزئیات ARM) */
  propertyTypeName: string | null;
  /** P6546/گام دوم — نوع ساختمان درخواستی (از جزئیات ARM) */
  buildingTypeName: string | null;
  /** P6530/گام ۲ — بازهٔ قیمت متقاضی (تومان): از / تا (از جزئیات ARM — inputsJson قیمت کل) */
  priceFrom: number | null;
  priceTo: number | null;
  /** زمان غنی‌سازی تماس — تهی = در انتظار */
  enrichedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date;
}

/** فیلتر کاتالوگ آگهی‌های ARM — P6530/گام ۱: فیلتر بر اساس «تمام ستون‌های فهرست»
 *  (بند ۲ دستور): کد، کارشناس، مالک (نام/موبایل)، قیمت (از/تا)، آدرس/منطقه،
 *  دسته‌بندی، وضعیت (ده‌حالته)، بازهٔ آخرین فعالیت */
export interface ArmListingCatalogFilter {
  code?: string;
  realtorName?: string;
  /** مالک: نام یا موبایل (contains نرمال‌شده) */
  ownerName?: string;
  /** قیمت ملک — تومان */
  priceFrom?: number;
  priceTo?: number;
  /** آدرس ملک / منطقه (contains نرمال‌شده روی address + areaName) */
  address?: string;
  /** دسته‌بندی — مقادیر خام (فروش/پیش فروش/رهن و اجاره/مشارکت در ساخت) */
  tradeTypes?: string[];
  /** ده‌حالته: مقادیر خام وضعیت (خروجی listingStateRawValues) */
  statuses?: string[];
  /** آخرین فعالیت — از / تا (ISO) */
  activityFrom?: string;
  activityTo?: string;
}

/** فیلتر کاتالوگ درخواست‌های ARM — P6530/گام ۲: فیلتر بر اساس «تمام ستون‌های فهرست»
 *  (بند ۲ دستور): کد، کارشناس، متقاضی (نام/موبایل)، قیمت (از/تا)، مناطق،
 *  دسته‌بندی، وضعیت (شش‌حالته)، بازهٔ تاریخ ثبت */
export interface ArmRequestCatalogFilter {
  code?: string;
  realtorName?: string;
  /** متقاضی: نام یا موبایل (contains نرمال‌شده) */
  customerName?: string;
  /** قیمت متقاضی — تومان (هم‌پوشانی با بازهٔ از/تای ردیف) */
  priceFrom?: number;
  priceTo?: number;
  /** مناطق (contains نرمال‌شده روی areaNames) */
  areaName?: string;
  /** دسته‌بندی — مقادیر خام (خرید/پیش خرید/رهن و اجاره/مشارکت در ساخت) */
  tradeTypes?: string[];
  /** شش‌حالتهٔ M2: مقادیر خام وضعیت */
  statuses?: string[];
  /** «سایر» انتخاب شده؟ → فیلتر به‌صورت NOT IN فهرست مستثنی‌شده‌ها اعمال می‌شود */
  statusesIncludesOther?: boolean;
  /** فهرست مقادیر خام مستثنی‌شده برای «سایر» (پنج‌گانهٔ کامل منهای انتخاب‌شده‌ها) */
  statusesExcluded?: string[];
  /** تاریخ ثبت — از / تا (ISO) */
  dateFrom?: string;
  dateTo?: string;
}

/** شمارش وضعیت غنی‌سازی کاتالوگ */
export interface EnrichmentCounts {
  total: number;
  /** در انتظار غنی‌سازی لایه ۲ (تماس/آدرس) */
  pending: number;
  /** تکمیل‌شده (extractionBatchId ثبت شده) */
  complete: number;
}

/** ردیف در انتظار غنی‌سازی — شناسه ARM + کلید طبیعی (برش‌های لایه ۲) */
export interface PendingEnrichmentRow {
  id: string;
  /** کلید طبیعی: propertyCode برای آگهی، requestCode برای درخواست */
  naturalKey: string;
}

/** مخزن رجیستری آگهی‌های ARM — نوشتار انبوه + شمارش + کاتالوگ P6.5-10 */
export interface PropertyRecordRepository {
  countAll(): Promise<number>;
  /** upsert انبوه بر کلید طبیعی propertyCode با merge non-null */
  upsertBulk(rows: PropertyBulkInput[], opts: BulkUpsertOptions): Promise<BulkWriteStats>;
  /** P6.5-10 — کاتالوگ تک‌صفحه‌ای با فیلتر کدآگهی/نام کارشناس (جدیدترین اول) */
  listArmCatalog(filter: ArmListingCatalogFilter, limit: number): Promise<{ rows: ArmListingCatalogRow[]; total: number }>;
  /** P6521/M1 — توزیع وضعیت‌های خام (status × count) برای بینش شش‌حالته */
  statusBreakdown(): Promise<Array<{ status: string | null; count: number }>>;
  /** P6.5-10 — شمارش غنی‌سازی: total / pending / complete */
  countEnrichment(): Promise<EnrichmentCounts>;
  /** P6.5-10 — برش ردیف‌های در انتظار غنی‌سازی (جدیدترین اول؛ rowIds = هدفگذاری دقیق) */
  listPendingEnrichment(maxRows: number, rowIds?: string[]): Promise<PendingEnrichmentRow[]>;
  /** P6.5-11 (بند پ-۵) — تماس مالک ملک بر اساس کدآگهی‌ها (دسته‌ای؛ برای ستون‌های فهرست معاملات) */
  findOwnerContactsByCodes(propertyCodes: string[]): Promise<Array<{ propertyCode: string; ownerName: string | null; ownerMobile: string | null }>>;
  /** P6546/گام صفر — کدهای موجود از میان فهرست داده‌شده (تشخیص کدهای غایب از سامانهٔ عمومی) */
  findExistingCodes(codes: string[]): Promise<string[]>;
  /** P6546/گام پنجم — به‌روزرسانی هدفمند ردیف‌ها (فقط فیلدهای داده‌شده؛ برای غنی‌سازی چند-منبعی) */
  updateCatalogFields(propertyCode: string, patch: Record<string, string | number | null>): Promise<void>;
}
