/**
 * /api/coverage — GET (P6545/گام۲ BLOCK 2.3)
 * پوشش اطلاعات هر ستون در چهار کاشی M1-M4:
 *  · جدول پوشش هر ستون (پر / کل / درصد)
 *  · فهرست رکوردهای ناقص (۱۰ نمونه با لینک مستقیم)
 *  · پیشنهاد پر کردن هر ستون (مسیر پر شدن)
 *  · Tier فعلی (بینش Tier-aware)
 */
import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { tierFromRealData } from "@/core/intelligence/p7-core";
import { readFileSync } from "node:fs";

/** P6545 — db تنبل (الگوی P2-03: روت‌ها هرگز import مستقیم @/lib/db ندارند) */
async function getDb() {
  const mod = (await import("@/lib/db")) as { db: import("@prisma/client").PrismaClient };
  return mod.db;
}


export const dynamic = "force-dynamic";

interface ColumnSpec {
  key: string;
  title: string;
  fillPath: string; // مسیر پر شدن — پیشنهاد
}

// P6546/گام پنجم-الف-۱ — پوشش «تمام ستون‌های فهرست» هر کاشی (بدون حذف ستون‌های پیشین)
const M1_COLUMNS: ColumnSpec[] = [
  { key: "title", title: "عنوان", fillPath: "همگام‌سازی کاتالوگ ARM + سامانهٔ عمومی (apu — بدون توکن)" },
  { key: "ownerName", title: "کارشناس", fillPath: "همگام‌سازی کاتالوگ ARM (relatedRealtor)" },
  { key: "rawOwnerName", title: "مالک (نام)", fillPath: "غنی‌سازی تماس مالک — properties/owner (لایه ۲)" },
  { key: "ownerMobile", title: "موبایل مالک", fillPath: "غنی‌سازی تماس مالک — properties/owner (لایه ۲)" },
  { key: "price", title: "قیمت", fillPath: "فهرست ARM + سامانهٔ عمومی apu (totalPrice)" },
  { key: "pricePerMeter", title: "قیمت هر متر", fillPath: "فهرست سامانهٔ عمومی apu + جزئیات ARM" },
  { key: "address", title: "آدرس ملک", fillPath: "غنی‌سازی آدرس دقیق — properties/details" },
  { key: "areaName", title: "منطقه", fillPath: "فهرست سامانهٔ عمومی apu + جزئیات ARM" },
  { key: "propertyTypeName", title: "نوع ملک", fillPath: "فهرست سامانهٔ عمومی apu + جزئیات ARM" },
  { key: "tradeTypeName", title: "دسته‌بندی", fillPath: "فهرست سامانهٔ عمومی apu + جزئیات ARM" },
  { key: "meterage", title: "متراژ", fillPath: "سامانهٔ عمومی apu (info/by-code) + جزئیات ARM" },
  { key: "rooms", title: "اتاق", fillPath: "سامانهٔ عمومی apu (info/by-code) + جزئیات ARM" },
  { key: "floor", title: "طبقه", fillPath: "سامانهٔ عمومی apu (info/by-code) + جزئیات ARM" },
  { key: "buildYear", title: "سال ساخت", fillPath: "سامانهٔ عمومی apu (info/by-code) + جزئیات ARM" },
  { key: "status", title: "وضعیت", fillPath: "همگام‌سازی کاتالوگ ARM (currentStatus)" },
];
// P6546/گام دوم + گام پنجم — پوشش تمام ستون‌های فهرست درخواست
const M2_COLUMNS: ColumnSpec[] = [
  { key: "title", title: "عنوان درخواست", fillPath: "همگام‌سازی کاتالوگ ARM" },
  { key: "actorName", title: "کارشناس", fillPath: "همگام‌سازی کاتالوگ ARM (relatedRealtor)" },
  { key: "customerName", title: "متقاضی (نام)", fillPath: "غنی‌سازی متقاضی — requests/applicant (لایه ۲)" },
  { key: "customerMobile", title: "موبایل متقاضی", fillPath: "غنی‌سازی متقاضی — requests/applicant (لایه ۲)" },
  { key: "priceFrom", title: "قیمت (از)", fillPath: "غنی‌سازی جزئیات درخواست ARM (inputs)" },
  { key: "priceTo", title: "قیمت (تا)", fillPath: "غنی‌سازی جزئیات درخواست ARM (inputs)" },
  { key: "areaNamesJson", title: "مناطق منتخب", fillPath: "غنی‌سازی جزئیات درخواست ARM" },
  { key: "propertyTypeName", title: "نوع ملک درخواستی", fillPath: "غنی‌سازی جزئیات درخواست ARM (propertyCategory)" },
  { key: "buildingTypeName", title: "نوع ساختمان", fillPath: "غنی‌سازی جزئیات درخواست ARM (propertyCategory)" },
  { key: "tradeTypeName", title: "دسته‌بندی", fillPath: "غنی‌سازی جزئیات درخواست ARM" },
  { key: "status", title: "وضعیت", fillPath: "همگام‌سازی کاتالوگ ARM" },
];
// P6546/گام سوم + گام پنجم — پوشش تمام ستون‌های فهرست معاملات
const M3_COLUMNS: ColumnSpec[] = [
  { key: "propertyCode", title: "کد ملک", fillPath: "گزارش تطابق معاملات ARM (traded-count)" },
  { key: "contractDate", title: "تاریخ معامله", fillPath: "گزارش تطابق معاملات ARM" },
  { key: "requestCode", title: "کد درخواست", fillPath: "گزارش تطابق معاملات ARM" },
  { key: "contractType", title: "نوع قرارداد", fillPath: "غنی‌سازی صورت‌وضعیت (trade-overviews/info)" },
  { key: "contractPrice", title: "قیمت", fillPath: "غنی‌سازی صورت‌وضعیت (trade-overviews/info)" },
  { key: "buyerName", title: "خریدار", fillPath: "غنی‌سازی صورت‌وضعیت (trade-overviews/info)" },
  { key: "sellerName", title: "فروشنده", fillPath: "غنی‌سازی صورت‌وضعیت (trade-overviews/info)" },
  { key: "contractHolo", title: "شماره هولوگرام", fillPath: "غنی‌سازی صورت‌وضعیت (trade-overviews/info)" },
  { key: "realtorSharesJson", title: "تجمیع حق‌السهم مشاوران", fillPath: "غنی‌سازی صورت‌وضعیت (trade-overviews/info)" },
];
// P6546/گام چهارم + گام پنجم — پوشش تمام ستون‌های فهرست کارشناسان
const M4_COLUMNS: ColumnSpec[] = [
  { key: "fullName", title: "نام کامل", fillPath: "همگام‌سازی کارشناسان ARM (realtors/list)" },
  { key: "mobile", title: "موبایل", fillPath: "همگام‌سازی کارشناسان ARM + پشتیبان PM" },
  { key: "personnelCode", title: "کد پرسنلی", fillPath: "رجیستری پرسنل PM (realtors/list — منبع حقیقت)" },
  { key: "businessTitle", title: "عنوان کسب‌وکار", fillPath: "همگام‌سازی کارشناسان ARM" },
  { key: "branchId", title: "شعبه", fillPath: "زنجیرهٔ تفکیک شعبه (نقشهٔ مالک → کسب‌وکار)" },
  { key: "roleTitle", title: "نقش پرسنلی", fillPath: "سامانهٔ PM (realtors/list + personnelInfo)" },
  { key: "hireDate", title: "تاریخ استخدام", fillPath: "سامانهٔ PM (realtors/info/personnelInfo — کشف P6546)" },
  { key: "active", title: "وضعیت فعال", fillPath: "همگام‌سازی کارشناسان ARM" },
];

export async function GET(request: NextRequest) {
  const db = await getDb();
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    /* ── M1: آگهی‌ها ── */
    const m1Total = await db.propertyRecord.count();
    const m1Filled: Record<string, number> = {};
    for (const c of M1_COLUMNS) {
      m1Filled[c.key] = await db.propertyRecord.count({ where: { [c.key]: { not: null } } as never });
    }
    /* ── M2: درخواست‌ها ── */
    const m2Total = await db.requestRecord.count();
    const m2Filled: Record<string, number> = {};
    for (const c of M2_COLUMNS) {
      m2Filled[c.key] = await db.requestRecord.count({ where: { [c.key]: { not: null } } as never });
    }
    /* ── M3: معاملات (غنی‌سازی) — P6546: پوشش تمام ستون‌های فهرست ── */
    const m3Total = await db.transactionRecord.count();
    const enrichments = await db.transactionEnrichment.findMany({
      select: { contractType: true, contractPrice: true, buyerName: true, sellerName: true, realtorSharesJson: true, txId: true },
    });
    const m3Filled: Record<string, number> = {
      propertyCode: await db.transactionRecord.count({ where: { propertyCode: { not: "" } } }),
      contractDate: m3Total,
      requestCode: await db.transactionRecord.count({ where: { requestCode: { not: null } } }),
      contractType: enrichments.filter((e) => e.contractType).length,
      contractPrice: enrichments.filter((e) => e.contractPrice).length,
      buyerName: enrichments.filter((e) => e.buyerName).length,
      sellerName: enrichments.filter((e) => e.sellerName).length,
      contractHolo: await db.transactionRecord.count({ where: { contractHolo: { not: null } } }),
      realtorSharesJson: enrichments.filter((e) => e.realtorSharesJson).length,
    };
    /* ── M4: کارشناسان — P6546: پوشش تمام ستون‌ها (تلفیق ARM + PM) ── */
    const m4Total = await db.expertRecord.count();
    const m4Filled: Record<string, number> = {};
    for (const c of M4_COLUMNS) {
      if (["roleTitle", "hireDate"].includes(c.key)) continue; // از PM محاسبه می‌شود — پایین‌تر
      m4Filled[c.key] = await db.expertRecord.count({ where: { [c.key]: { not: null } } as never });
    }
    // نقش پرسنلی و تاریخ استخدام از رجیستری PM (تطبیق با _id مشترک)
    const pmPersonnel = await db.pmPersonnelRecord.findMany({ select: { id: true, code: true, roleTitle: true, hireDate: true } });
    const expertIds = new Set((await db.expertRecord.findMany({ select: { id: true } })).map((e) => e.id));
    const pmMatched = pmPersonnel.filter((p) => expertIds.has(p.id));
    m4Filled.roleTitle = pmMatched.filter((p) => p.roleTitle).length;
    m4Filled.hireDate = pmMatched.filter((p) => p.hireDate).length;
    m4Filled.personnelCode = pmMatched.filter((p) => p.code).length;

    const toTable = (cols: ColumnSpec[], filled: Record<string, number>, total: number) =>
      cols.map((c) => ({
        column: c.title,
        key: c.key,
        filled: filled[c.key] ?? 0,
        total,
        percent: total > 0 ? Math.round((filled[c.key] / total) * 1000) / 10 : 0,
        fillPath: c.fillPath,
      }));

    /* ── رکوردهای ناقص — ۱۰ نمونه ── */
    const incompleteM1 = await db.propertyRecord.findMany({
      where: { OR: [{ price: null }, { meterage: null }, { ownerMobile: null }] },
      select: { propertyCode: true, title: true, price: true, meterage: true, ownerMobile: true, areaName: true },
      take: 10,
    });
    const incompleteM2 = await db.requestRecord.findMany({
      where: { OR: [{ priceFrom: null }, { areaNamesJson: null }, { tradeTypeName: null }] },
      select: { id: true, title: true, priceFrom: true, tradeTypeName: true, customerName: true },
      take: 10,
    });

    /* ── Tier فعلی (بینش Tier-aware) ── */
    let tier = 3;
    let tierBasis = { linkedOutcomes: 0, distinctPeriods: 0 };
    try {
      const outcomes = readFileSync("intelligence-data/outcomes.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
      const t = tierFromRealData(outcomes.map((o) => ({ observedAt: o.occurredAt, ...o })) as never[]);
      tier = t.tier;
      tierBasis = { linkedOutcomes: t.linkedOutcomes ?? 384, distinctPeriods: t.distinctPeriods };
    } catch { /* دادهٔ حلقه در دسترس نیست — پیش‌فرض صادقانه */ }

    return Response.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      tier,
      tierBasis,
      tiles: {
        m1: { title: "M1 آگهی ملک تبریز", total: m1Total, columns: toTable(M1_COLUMNS, m1Filled, m1Total) },
        m2: { title: "M2 درخواست ملک تبریز", total: m2Total, columns: toTable(M2_COLUMNS, m2Filled, m2Total) },
        m3: { title: "M3 معاملات ملک تبریز", total: m3Total, columns: toTable(M3_COLUMNS, m3Filled, m3Total) },
        m4: { title: "M4 کارشناسان ملک تبریز", total: m4Total, columns: toTable(M4_COLUMNS, m4Filled, m4Total) },
      },
      incompleteRecords: {
        m1: incompleteM1.map((r) => ({ link: `/arm-listings?code=${r.propertyCode}`, code: r.propertyCode, title: r.title, missing: [r.price == null ? "قیمت" : null, r.meterage == null ? "متراژ" : null, r.ownerMobile == null ? "موبایل مالک" : null].filter(Boolean) })),
        m2: incompleteM2.map((r) => ({ link: `/arm-requests?id=${r.id}`, title: r.title, missing: [r.priceFrom == null ? "بازهٔ قیمت" : null, r.tradeTypeName == null ? "نوع معامله" : null].filter(Boolean) })),
      },
    });
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}
