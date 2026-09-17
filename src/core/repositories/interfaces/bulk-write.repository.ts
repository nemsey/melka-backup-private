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
  /** کارشناس ثبت‌کننده در ARM؛ نبود → 'arm' (رکورد سیستمی) */
  actorCode?: string | null;
  createdAt?: Date | null;
}

/** مخزن رجیستری آگهی‌های ARM — نوشتار انبوه + شمارش (خواندنهای غنی در P6.5-05/08) */
export interface PropertyRecordRepository {
  countAll(): Promise<number>;
  /** upsert انبوه بر کلید طبیعی propertyCode با merge non-null */
  upsertBulk(rows: PropertyBulkInput[], opts: BulkUpsertOptions): Promise<BulkWriteStats>;
}
