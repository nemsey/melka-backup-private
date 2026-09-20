/**
 * تازگی دادهٔ کاشی‌ها — P6.5-11 (بند ت)
 * ------------------------------------------------------
 * «در بالای هر کاشی تاریخ آخرین بروزرسانی اطلاعات دقیقاً مشخص باشد»
 *
 * نقشهٔ کاشی → منبع(های) داده: برای هر کاشی، جدیدترین زمان نوشتن داده
 * (max(syncedAt/extractedAt/updatedAt/recordedAt)) + تعداد رکورد.
 * 🔒 فقط خواندن ستون‌های موجود — هیچ نوشتنی (قانون دادهٔ خام بند الف).
 * 🔒 لایهٔ زیرین روت‌ها (روت‌ها از @/lib/db import نمی‌کنند — گارد P2-03).
 */

import { db } from "@/lib/db";

export interface FreshnessEntry {
  /** تاریخ آخرین بروزرسانی (ISO) — null = هنوز داده‌ای نوشته نشده */
  lastUpdatedAt: string | null;
  /** تعداد رکورد ذخیره‌شده در منبع(های) این کاشی */
  recordCount: number;
  /** برچسب فارسی منبع داده برای نمایش */
  sourceLabel: string;
}

/** جدیدترین زمان از چند ستون تاریخ + شمارش — سبک روی جداول بزرگ */
async function tableFreshness(
  /* مدل Prisma Delegate — ساختار پویا (select/orderBy برنامه‌ای)؛
     انعطاف نوع با unknown چون ستون‌ها در زمان اجرا انتخاب می‌شوند */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  dateColumns: string[],
  where?: Record<string, unknown>
): Promise<{ at: Date | null; count: number }> {
  const rows: Array<Record<string, unknown>> = await model.findMany({
    where: where ?? {},
    select: Object.fromEntries(dateColumns.map((c) => [c, true])),
    take: 1,
    // Prisma v6: چند-فیلدی ⇒ آرایهٔ orderBy
    orderBy: dateColumns.map((c) => ({ [c]: "desc" })),
  });
  const count = await model.count({ where: where ?? {} });
  let at: Date | null = null;
  if (rows.length > 0) {
    for (const c of dateColumns) {
      const v = rows[0][c];
      if (v instanceof Date && (at === null || v > at)) at = v;
    }
  }
  return { at, count };
}

function isoOrNull(at: Date | null): string | null {
  return at ? at.toISOString() : null;
}

/** حداکثر چند منبع — کاشی‌های ترکیبی */
function maxOf(...entries: Array<{ at: Date | null; count: number }>): { at: Date | null; count: number } {
  let at: Date | null = null;
  for (const e of entries) if (e.at && (at === null || e.at > at)) at = e.at;
  return { at, count: entries.reduce((s, e) => s + e.count, 0) };
}

/** محاسبهٔ تازگی همهٔ کاشی‌ها — یک فراخوانی، پاسخ یکپارچه */
export async function computeTilesFreshness(): Promise<Record<string, FreshnessEntry>> {
  const [
    tx, ct, ex, sd, look, price, divarAd, listing, requestManual, requestArm, property,
  ] = await Promise.all([
    tableFreshness(db.transactionRecord, ["syncedAt", "extractedAt"]),
    tableFreshness(db.contractRecord, ["syncedAt", "extractedAt"]),
    tableFreshness(db.expertRecord, ["syncedAt", "extractedAt"]),
    tableFreshness(db.supplyDemandRecord, ["syncedAt", "extractedAt"]),
    tableFreshness(db.lookupLog, ["createdAt"]),
    tableFreshness(db.priceIndexHistory, ["recordedAt"]),
    tableFreshness(db.divarAd, ["lastSeenAt", "firstSeenAt", "publishedAt"]),
    tableFreshness(db.listingRecord, ["updatedAt", "createdAt"]),
    tableFreshness(db.requestRecord, ["updatedAt", "createdAt"], { source: "manual" }),
    // نکته: RequestRecord ستون syncedAt ندارد (کشف P6.5-10) — updatedAt + extractedAt
    tableFreshness(db.requestRecord, ["updatedAt", "extractedAt", "createdAt"], { source: "arm" }),
    tableFreshness(db.propertyRecord, ["syncedAt", "extractedAt", "updatedAt"]),
  ]);

  const merged = maxOf(tx, ct);
  const club = maxOf(tx, ct, property, requestArm, requestManual);

  return {
    // کاشی ادغامی «معاملات و قراردادهای ملک تبریز» (بند پ P6.5-11)
    "transactions-contracts": {
      lastUpdatedAt: isoOrNull(merged.at),
      recordCount: merged.count,
      sourceLabel: "گزارش تطابق معاملات + صورت وضعیت قراردادها + کمیسیون",
    },
    experts: {
      lastUpdatedAt: isoOrNull(ex.at),
      recordCount: ex.count,
      sourceLabel: "فهرست کارشناسان سامانه پرسنلی",
    },
    "customer-club": {
      lastUpdatedAt: isoOrNull(club.at),
      recordCount: club.count,
      sourceLabel: "معاملات + قراردادها + آگهی‌ها و درخواست‌های ARM",
    },
    "supply-demand": {
      lastUpdatedAt: isoOrNull(sd.at),
      recordCount: sd.count,
      sourceLabel: "گزارش عرضه و تقاضا",
    },
    "price-index": {
      lastUpdatedAt: isoOrNull(price.at),
      recordCount: price.count,
      sourceLabel: "پیکربندی و تاریخچهٔ شاخص قیمت",
    },
    extraction: {
      lastUpdatedAt: isoOrNull(look.at),
      recordCount: look.count,
      sourceLabel: "تاریخچهٔ استخراج اطلاعات",
    },
    "file-finder": {
      lastUpdatedAt: isoOrNull(divarAd.at),
      recordCount: divarAd.count,
      sourceLabel: "آگهی‌های اسکن‌شدهٔ دیوار",
    },
    listing: {
      lastUpdatedAt: isoOrNull(listing.at),
      recordCount: listing.count,
      sourceLabel: "آگهی‌های ثبت‌شدهٔ دفتر",
    },
    request: {
      lastUpdatedAt: isoOrNull(requestManual.at),
      recordCount: requestManual.count,
      sourceLabel: "درخواست‌های ثبت‌شدهٔ دفتر",
    },
    "arm-listing": {
      lastUpdatedAt: isoOrNull(property.at),
      recordCount: property.count,
      sourceLabel: "کاتالوگ آگهی‌های سامانه ARM",
    },
    "arm-request": {
      lastUpdatedAt: isoOrNull(requestArm.at),
      recordCount: requestArm.count,
      sourceLabel: "کاتالوگ درخواست‌های سامانه ARM",
    },
    // ظرف داشبورد مدیریتی — بازتاب جدیدترین فرزند
    "management-dashboard": {
      lastUpdatedAt: isoOrNull(maxOf(merged, ex, club, sd, price, property, requestArm).at),
      recordCount: 0,
      sourceLabel: "جدیدترین بروزرسانی بین همهٔ کاشی‌های مدیریتی",
    },
  };
}
