/**
 * GET /api/crm/export/[entity] — خروجی اکسل کل فهرست هر کاشی (PN-002 گام ۶-۲)
 * ------------------------------------------------------
 * «در فهرست هر کاشی قابلیت دانلود اطلاعات کل فهرست به صورت فایل اکسل ارایه بده»
 *
 * موجودیت‌ها: listings | requests | transactions | experts
 * همان فیلترهای فهرست پذیرفته می‌شود (عین روت‌های کاتالوگ) — خروجی: فایل .xlsx واقعی
 * (RTL + ستون‌های عددی جداکننده‌دار + sheet نام‌گذاری‌شده).
 *
 * معماری: exceljs سمت سرور — بار JS موبایل اضافه نمی‌شود (چانک‌های lazy حفظ می‌شوند).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { tenantDbValue } from "@/lib/tenants";
import { normalizeFilterInput } from "@/lib/normalize-input";
import {
  getPropertyRecordRepository,
  getRequestRepository,
  getExpertRepository,
  getTransactionRepository,
} from "@/core/repositories";
import { resolveExpertBranch, BRANCH_UNSET } from "@/lib/branches";
import { expertListingCounts } from "@/lib/services/master-auth";
import { readOwnerBranchMap, readPmBranchMap } from "@/lib/branch-store";

function num(v: string | null): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(normalizeFilterInput(v));
  return Number.isFinite(n) ? n : undefined;
}

/** ساخت xlsx از ستون‌ها + ردیف‌ها */
async function buildXlsx(
  sheetName: string,
  columns: Array<{ header: string; width?: number }>,
  rows: Array<Array<string | number | null>>
): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ملکا — اکوسیستم هوشمند ملک ایران";
  const ws = wb.addWorksheet(sheetName, {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });
  ws.columns = columns.map((c) => ({ header: c.header, width: c.width ?? 18 }));
  const header = ws.getRow(1);
  header.font = { bold: true, size: 11 };
  header.alignment = { vertical: "middle", horizontal: "center" };
  for (const r of rows) ws.addRow(r);
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      if (typeof cell.value === "number" && Math.abs(cell.value) >= 1000) cell.numFmt = "#,##0";
    });
  });
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

/** شعبهٔ کارشناس — زنجیرهٔ تفکیک مشترک با روت‌های فهرست */
async function branchResolver() {
  const [ownerMap, experts, pmBranchMap] = await Promise.all([
    readOwnerBranchMap().catch(() => ({} as Record<string, string>)),
    getExpertRepository().findAll().catch(() => [] as Array<{ fullName: string; businessTitle: string | null }>),
    readPmBranchMap().catch(() => ({} as Record<string, string>)),
  ]);
  const businessByExpert = new Map<string, string | null>();
  for (const e of experts) businessByExpert.set(e.fullName, e.businessTitle);
  return (n: string | null) =>
    n ? resolveExpertBranch(n, ownerMap, businessByExpert.get(n) ?? null, pmBranchMap).branch : BRANCH_UNSET;
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { entity } = await ctx.params;
  const sp = request.nextUrl.searchParams;
  // PN-044/فاز ۴ (شورا-ن۰۸۸) — tenant همین خروجی: 'melketun' → دادهٔ ملکتون؛
  // پیش‌فرض/هر چیز دیگر → 'melk-tabriz' (رفتار فعلی — صفر شکستن).
  const tenantKey = sp.get("tenantId");
  const tenantId = tenantDbValue(tenantKey);
  const tenantLabel = tenantKey === "melketun" ? "ملکتون" : "ملک تبریز";

  try {
    let buffer: Buffer;
    let filename: string;

    if (entity === "listings") {
      const repo = getPropertyRecordRepository();
      const code = normalizeFilterInput(sp.get("code")) || undefined;
      const realtorName = normalizeFilterInput(sp.get("realtorName")) || undefined;
      const ownerName = normalizeFilterInput(sp.get("ownerName")) || undefined;
      const address = normalizeFilterInput(sp.get("address")) || undefined;
      const { rows } = await repo.listArmCatalog(
        {
          tenantId,
          code, realtorName, ownerName, address,
          priceFrom: num(sp.get("priceFrom")), priceTo: num(sp.get("priceTo")),
          rentalType: sp.get("rentalType") === "rental" ? "rental" : sp.get("rentalType") === "sale" ? "sale" : undefined,
        },
        25000
      );
      const branchOf = await branchResolver();

      buffer = await buildXlsx(
        `آگهی‌های ${tenantLabel}`,
        [
          { header: "ردیف", width: 8 }, { header: "کد آگهی", width: 12 }, { header: "عنوان", width: 30 },
          { header: "کارشناس", width: 20 }, { header: "شعبه", width: 16 }, { header: "مالک", width: 20 },
          { header: "موبایل مالک", width: 16 }, { header: "دسته‌بندی", width: 14 }, { header: "نوع ملک", width: 14 },
          { header: "قیمت (تومان)", width: 18 }, { header: "رهن (تومان)", width: 16 }, { header: "اجاره (تومان)", width: 16 },
          { header: "قیمت هر متر", width: 16 }, { header: "متراژ", width: 10 }, { header: "اتاق", width: 8 },
          { header: "طبقه", width: 8 }, { header: "سال ساخت", width: 10 }, { header: "آدرس", width: 36 },
          { header: "استان", width: 14 }, { header: "شهر", width: 12 }, { header: "منطقه", width: 16 }, { header: "محله", width: 16 },
          { header: "بازدید", width: 9 }, { header: "تصاویر", width: 9 }, { header: "دیوار", width: 8 },
          { header: "اینستا", width: 8 }, { header: "بازنشر", width: 8 }, { header: "وضعیت", width: 20 },
          { header: "تاریخ وضعیت", width: 16 }, { header: "آخرین فعالیت", width: 16 },
        ],
        rows.map((r, i) => [
          i + 1, r.propertyCode, r.title ?? "", r.realtorName ?? "", branchOf(r.realtorName),
          r.ownerName ?? "", r.ownerMobile ?? "", r.tradeTypeName ?? "", r.propertyTypeName ?? "",
          r.price, r.depositPrice, r.rentPrice, r.pricePerMeter, r.meterage, r.rooms, r.floor, r.buildYear,
          r.address ?? "", r.stateName ?? "", r.cityName ?? "", r.areaName ?? "", r.lineName ?? "",
          r.viewCount, r.imageCount, r.addedToDivar === true ? "بله" : r.addedToDivar === false ? "خیر" : "",
          r.addedToInsta === true ? "بله" : r.addedToInsta === false ? "خیر" : "",
          r.isReposted === true ? "بله" : "",
          r.status ?? "", r.statusDate ? r.statusDate.toISOString().slice(0, 10) : "",
          r.updatedAt ? r.updatedAt.toISOString().slice(0, 10) : "",
        ])
      );
      filename = `melka-listings-${new Date().toISOString().slice(0, 10)}.xlsx`;
    } else if (entity === "requests") {
      const repo = getRequestRepository();
      const code = normalizeFilterInput(sp.get("code")) || undefined;
      const realtorName = normalizeFilterInput(sp.get("realtorName")) || undefined;
      const customerName = normalizeFilterInput(sp.get("customerName")) || undefined;
      const areaName = normalizeFilterInput(sp.get("areaName")) || undefined;
      const { rows } = await repo.listArmCatalog(
        { tenantId, code, realtorName, customerName, areaName, priceFrom: num(sp.get("priceFrom")), priceTo: num(sp.get("priceTo")) },
        25000
      );
      const branchOf = await branchResolver();

      buffer = await buildXlsx(
        `درخواست‌های ${tenantLabel}`,
        [
          { header: "ردیف", width: 8 }, { header: "کد درخواست", width: 12 }, { header: "عنوان", width: 30 },
          { header: "کارشناس", width: 20 }, { header: "شعبه", width: 16 }, { header: "متقاضی", width: 20 },
          { header: "موبایل متقاضی", width: 16 }, { header: "دسته‌بندی", width: 14 }, { header: "نوع ملک", width: 14 },
          { header: "نوع ساختمان", width: 14 }, { header: "قیمت از (تومان)", width: 18 }, { header: "قیمت تا (تومان)", width: 18 },
          { header: "متراژ از", width: 10 }, { header: "متراژ تا", width: 10 }, { header: "اتاق از", width: 9 },
          { header: "اتاق تا", width: 9 }, { header: "طبقه از", width: 9 }, { header: "طبقه تا", width: 9 },
          { header: "سال ساخت از", width: 11 }, { header: "سال ساخت تا", width: 11 }, { header: "سند", width: 22 },
          { header: "نوع ساخت", width: 16 }, { header: "جهت", width: 20 }, { header: "مناطق", width: 26 },
          { header: "محله‌ها", width: 26 }, { header: "پرداخت", width: 14 }, { header: "جدیت", width: 12 },
          { header: "فوری", width: 8 }, { header: "لوکس", width: 8 }, { header: "فرصت", width: 8 },
          { header: "معاوضه با", width: 18 }, { header: "وضعیت", width: 20 }, { header: "تاریخ ثبت", width: 12 },
        ],
        rows.map((r, i) => [
          i + 1, r.requestCode, r.title ?? "", r.actorName ?? "", branchOf(r.actorName),
          r.customerName ?? "", r.customerMobile ?? "", r.tradeTypeName ?? "", r.propertyTypeName ?? "",
          r.buildingTypeName ?? "", r.priceFrom, r.priceTo, r.spaceFrom, r.spaceTo, r.roomsFrom, r.roomsTo,
          r.floorFrom, r.floorTo, r.buildYearFrom, r.buildYearTo, r.sanadNames ?? "", r.constructTypeNames ?? "",
          r.sideNames ?? "", r.areaNames.join("، "), r.lineNames.join("، "), r.paymentMethodName ?? "",
          r.seriousnessName ?? "", r.urgent === true ? "فوری" : "", r.luxury === true ? "لوکس" : "",
          r.occasion === true ? "فرصت" : "", r.changeWithNames ?? "", r.status ?? "",
          r.createdAt ? r.createdAt.toISOString().slice(0, 10) : "",
        ])
      );
      filename = `melka-requests-${new Date().toISOString().slice(0, 10)}.xlsx`;
    } else if (entity === "transactions") {
      const repo = getTransactionRepository();
      const rows = (await repo.listWithSummary({ filter: { tenantId }, limit: 25000 })) as unknown as {
        rows: Array<Record<string, unknown>>;
      };
      const txRows = (rows?.rows ?? []) as Array<Record<string, unknown>>;
      buffer = await buildXlsx(
        `معاملات ${tenantLabel}`,
        [
          { header: "ردیف", width: 8 }, { header: "کد ملک", width: 12 }, { header: "مالک/فروشنده", width: 20 },
          { header: "کد درخواست", width: 12 }, { header: "درخواست‌دهنده/خریدار", width: 20 },
          { header: "تاریخ معامله", width: 14 }, { header: "شماره هولوگرام", width: 16 },
          { header: "آگهی پیشنهادی", width: 12 }, { header: "رویداد", width: 10 },
        ],
        txRows.map((r, i) => [
          i + 1, String(r.propertyCode ?? ""), String(r.propertyCustomer ?? ""), String(r.requestCode ?? ""),
          String(r.requestCustomer ?? ""), String(r.rawDate ?? r.contractDate ?? ""), String(r.contractHolo ?? ""),
          typeof r.suggestedPropertyCount === "number" ? r.suggestedPropertyCount : null,
          typeof r.eventsCount === "number" ? r.eventsCount : null,
        ])
      );
      filename = `melka-transactions-${new Date().toISOString().slice(0, 10)}.xlsx`;
    } else if (entity === "experts") {
      const repo = getExpertRepository();
      // PN-044/فاز ۴ — findAll بدون فیلتر tenant می‌بود؛ اکنون tenant همین خروجی
      const { rows } = await repo.listWithInteractions({ filter: { tenantId }, limit: 5000 });
      // شمارش متقاطع آگهی (شاهکار M4) — PN-012 BLOCK 1: از سرویس
      const listingCount = await expertListingCounts();

      buffer = await buildXlsx(
        `کارشناسان ${tenantLabel}`,
        [
          { header: "ردیف", width: 8 }, { header: "کد پرسنلی", width: 14 }, { header: "نام و نام خانوادگی", width: 24 },
          { header: "موبایل", width: 16 }, { header: "نقش", width: 20 }, { header: "کسب‌وکار/شعبه", width: 18 },
          { header: "تعداد آگهی", width: 12 }, { header: "وضعیت", width: 10 }, { header: "تاریخ ثبت", width: 12 },
        ],
        rows.map((r, i) => [
          i + 1,
          r.personnelCode && !r.personnelCode.startsWith("بدون-کد-") ? r.personnelCode : "-",
          r.fullName ?? "", r.mobile ?? "", r.role ?? "", r.businessTitle ?? "",
          listingCount.get(r.fullName ?? "") ?? 0, r.active === false ? "غیرفعال" : "فعال",
          r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "",
        ])
      );
      filename = `melka-experts-${new Date().toISOString().slice(0, 10)}.xlsx`;
    } else {
      return errorResponse(new MelkApiError("NOT_FOUND", "موجودیت پشتیبانی‌نشده.", 404, false));
    }

    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در تولید فایل اکسل.", 500, false));
  }
}
