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
  // P6547/گام یک-۵ — شعبهٔ کارشناس از سامانهٔ PM (personnelInfo.branchId.title)
  { key: "__branch", title: "شعبه", fillPath: "سامانهٔ PM (realtors/info/personnelInfo — branchId.title)" },
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
  // P6547 — شعبهٔ کارشناس از سامانهٔ PM + فوریت/جدیت از خود ردیف فهرست ARM
  { key: "__branch", title: "شعبه", fillPath: "سامانهٔ PM (realtors/info/personnelInfo — branchId.title)" },
  { key: "urgent", title: "فوریت", fillPath: "خود ردیف فهرست ARM (urgent)" },
  { key: "userSeriousityName", title: "جدیت متقاضی", fillPath: "رجیستری ARM (user-seriousness + تفکیک شناسه)" },
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
  { key: "fullName", title: "نام کامل", fillPath: "رجیستری PM (realtors/list)" },
  { key: "mobile", title: "موبایل", fillPath: "رجیستری PM (realtors/list — mobileNumber)" },
  { key: "personnelCode", title: "کد پرسنلی", fillPath: "رجیستری PM (realtors/list — code)" },
  { key: "address", title: "آدرس", fillPath: "سامانهٔ PM (realtors/info/contactInfo — contactInfo.address) — کشف P6549" },
  { key: "businessTitle", title: "کسب‌وکار", fillPath: "رجیستری PM (businessId.title)" },
  { key: "__branchM4", title: "شعبه", fillPath: "سامانهٔ PM (personnelInfo.branchId.title — تفکیک نام کارشناس)" },
  { key: "roleTitle", title: "نقش پرسنلی", fillPath: "سامانهٔ PM (realtors/list + personnelInfo)" },
  { key: "hireDate", title: "تاریخ استخدام", fillPath: "سامانهٔ PM (realtors/info/personnelInfo — کشف P6546)" },
  // P6547/گام چهارم — ستون‌های تازه از ساختار فراژرف PM
  { key: "__employmentType", title: "نوع همکاری", fillPath: "سامانهٔ PM (employeementInfo.typeFa)" },
  { key: "__voip", title: "شماره داخلی", fillPath: "سامانهٔ PM (voipInfo.extentionNumber)" },
  { key: "active", title: "وضعیت فعال", fillPath: "رجیستری PM (isRegisteredCompleted)" },
];

/** P6547 — شمارش امن پوشش یک فیلد: فیلدهای non-nullable در Prisma «not: null» نمی‌پذیرند
 *  (باگ تاریخی: count({status: {not: null}}) روی فیلد الزامی → 500) — این helper
 *  فیلدهای الزامی را مستقیم total برمی‌گرداند و بقیه را با not-null می‌شمارد. */
const NON_NULLABLE_KEYS = new Set(["status", "source", "personnelCode", "fullName", "mobile", "role", "businessTitle", "active", "actorCode", "requestCode"]);

async function safeCount(db: import("@prisma/client").PrismaClient, model: "propertyRecord" | "requestRecord" | "expertRecord", key: string): Promise<number> {
  if (NON_NULLABLE_KEYS.has(key)) {
    if (model === "propertyRecord") return db.propertyRecord.count();
    if (model === "requestRecord") return db.requestRecord.count();
    return db.expertRecord.count();
  }
  const where = { [key]: { not: null } } as never;
  if (model === "propertyRecord") return db.propertyRecord.count({ where });
  if (model === "requestRecord") return db.requestRecord.count({ where });
  return db.expertRecord.count({ where });
}

export async function GET(request: NextRequest) {
  const db = await getDb();
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    /* ── M1: آگهی‌ها ── */
    const m1Total = await db.propertyRecord.count();
    // P6547 — نقشهٔ شعبه‌های PM (برای ستون شعبهٔ M1/M2) + نقشهٔ اشتغال/داخلی (M4)
    const [pmBranchRows, pmEmploymentRows] = await Promise.all([
      db.expertProfile.findMany({ where: { branchTitle: { not: null } }, select: { fullName: true, branchTitle: true } }),
      db.expertProfile.findMany({ select: { id: true, employmentType: true, voipExtension: true } }),
    ]);
    const pmBranchSet = new Set(pmBranchRows.map((r) => r.fullName));
    const m1RealtorNames = await db.propertyRecord.findMany({ select: { ownerName: true }, take: 25000 });
    const m1Filled: Record<string, number> = {};
    for (const c of M1_COLUMNS) {
      if (c.key === "__branch") {
        // شعبهٔ آگهی = شعبهٔ کارشناس مسؤول آن در PM — شمارش «آگهی‌ها» (نه کارشناسان متمایز)
        m1Filled[c.key] = m1RealtorNames.filter((r) => pmBranchSet.has(r.ownerName ?? "")).length;
        continue;
      }
      m1Filled[c.key] = await safeCount(db, "propertyRecord", c.key);
    }
    /* ── M2: درخواست‌ها ── */
    const m2Total = await db.requestRecord.count();
    const m2ActorNames = await db.requestRecord.findMany({ select: { actorName: true }, take: 25000 });
    const m2Filled: Record<string, number> = {};
    for (const c of M2_COLUMNS) {
      if (c.key === "__branch") {
        // شعبهٔ درخواست = شعبهٔ کارشناس ثبت‌کننده در PM — شمارش «درخواست‌ها»
        m2Filled[c.key] = m2ActorNames.filter((r) => pmBranchSet.has(r.actorName ?? "")).length;
        continue;
      }
      m2Filled[c.key] = await safeCount(db, "requestRecord", c.key);
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
    /* ── M4: کارشناسان — PN-008 (ثانیاً): منبع یگانهٔ ExpertProfile (PM) ── */
    const m4Total = await db.expertProfile.count();
    const m4Profiles = await db.expertProfile.findMany({
      select: { id: true, personnelCode: true, fullName: true, mobile: true, roleTitle: true, hireDate: true, address: true, branchTitle: true, employmentType: true, voipExtension: true, active: true, businessTitle: true },
    });
    const m4Filled: Record<string, number> = {
      fullName: m4Profiles.filter((p) => p.fullName).length,
      mobile: m4Profiles.filter((p) => p.mobile).length,
      personnelCode: m4Profiles.filter((p) => p.personnelCode).length,
      address: m4Profiles.filter((p) => p.address).length,
      businessTitle: m4Profiles.filter((p) => p.businessTitle).length,
      __branchM4: m4Profiles.filter((p) => p.branchTitle).length,
      roleTitle: m4Profiles.filter((p) => p.roleTitle).length,
      hireDate: m4Profiles.filter((p) => p.hireDate).length,
      __employmentType: m4Profiles.filter((p) => p.employmentType !== null).length,
      __voip: m4Profiles.filter((p) => p.voipExtension).length,
      active: m4Profiles.filter((p) => typeof p.active === "boolean").length,
    };

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
