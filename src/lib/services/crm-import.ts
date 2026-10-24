/**
 * سرویس ایمپورت CRM (PN-012 · BLOCK 1)
 * ------------------------------------------------------
 * انتقال کامل منطق دامنه از ‎/api/crm/import/[entity]‎ به لایهٔ سرویس
 * (ملکا-شورا-ن۰۱۲-۱۴۰۵ · بند ۱.۲: روت فقط Auth + Validation + Service + Response).
 *
 * معناشناسی نوشتن (نکته ۲ دستور ۱۴۰۵/۰۷/۱۳ — لغو موقت قانون داده مقدس):
 *   · سلول پر ⇒ مقدار تازه جایگزین می‌شود
 *   · سلول خالی ⇒ مقدار فعلی حفظ می‌شود (پاک‌سازی از اکسل ممکن نیست)
 *   · رکورد تازه (کلید ناشناخته) ⇒ ایجاد می‌شود
 *
 * کلیدهای طبیعی: آگهی→کد آگهی · درخواست→کد درخواست · کارشناس→کد پرسنلی (یا نام)
 * · معامله→(کد ملک، کد درخواست، تاریخ معامله)
 *
 * PN-051 (دستور شورا ۱۴۰۵/۰۸/۰۲ — کنترل آپلود اکسل فهرست‌های چهارگانهٔ هر دو
 * داشبورد): پارامتر tenantId — رکوردهای تازهٔ ایمپورت در همان tenant فهرستِ
 * بارگذاری‌شده ثبت می‌شوند ('melketun' ⇒ ملکتون · پیش‌فرض ⇒ ملک تبریز).
 * به‌روزرسانی رکوردهای موجود از طریق کلید یگانه انجام می‌شود و tenant دست‌نخورده
 * می‌ماند (قانون دادهٔ مقدس — هرگز جابه‌جا نمی‌شود).
 */

import { db } from "@/lib/db";
import { normalizeFaDigits } from "@/lib/normalize-input";
import { jalaliToDate } from "@/lib/jalali";
import { MelkApiError } from "@/lib/melk-api/types";
import { tenantDbValue } from "@/lib/tenants";

export const MAX_ROWS = 25_000;

/** مقدار سلول اکسل → رشتهٔ نرمال (ارقام فارسی→لاتین، بدون فاصله‌های سر و دم) */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; hyperlink?: string };
    if (typeof o.text === "string") return o.text.trim();
    if (o.result !== undefined && o.result !== null) return String(o.result).trim();
    return "";
  }
  return String(v).trim();
}

/** رشتهٔ شمارهٔ تماس — فقط ارقام لاتین */
export function digitsOnly(s: string): string {
  return normalizeFaDigits(s).replace(/\D/g, "");
}

/** عدد یا تهی — ویرگول جداکننده و ارقام فارسی پذیرفته می‌شود */
export function cellNum(v: unknown): number | undefined {
  const s = normalizeFaDigits(cellText(v)).replace(/[,\s٬]/g, "");
  if (s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** بولی یا تهی — «بله» ⇒ true · «خیر» ⇒ false · خالی ⇒ تهی */
export function cellBool(v: unknown): boolean | undefined {
  const s = normalizeFaDigits(cellText(v));
  if (s === "بله" || s === "1" || s === "true" || s === "فوری" || s === "لوکس" || s === "فرصت") return true;
  if (s === "خیر" || s === "0" || s === "false") return false;
  return undefined;
}

/** تاریخ از سلول — ISO لاتین یا جلالی ۱۴۰۴/۰۵/۰۳ */
export function cellDate(v: unknown): Date | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const s = normalizeFaDigits(cellText(v));
  if (s === "") return undefined;
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return new Date(iso);
  const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    if (y > 1300 && y < 1600) {
      const d = jalaliToDate(y, Number(m[2]), Number(m[3]));
      if (!Number.isNaN(d.getTime())) return d;
    }
    const g = new Date(y, Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(g.getTime())) return g;
  }
  return undefined;
}

export interface SheetData {
  headers: string[];
  rows: Map<string, unknown>[];
  headerRowIndex: number;
}

/** خواندن اولین شیت + تیترها (ردیف اول — عین قالب خروجی) */
export async function readSheet(buffer: Buffer): Promise<SheetData> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new MelkApiError("UNPROCESSABLE", "شیت ورودی در فایل اکسل یافت نشد.", 400, false);

  const headerRowIndex = 1;
  const headerRow = ws.getRow(headerRowIndex);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = cellText(cell.value);
  });

  const rows: Map<string, unknown>[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIndex) return;
    if (rows.length >= MAX_ROWS) return;
    const m = new Map<string, unknown>();
    let anyValue = false;
    headers.forEach((h, idx) => {
      if (!h) return;
      const v = row.getCell(idx + 1).value;
      if (v !== null && v !== undefined && cellText(v) !== "") anyValue = true;
      m.set(h, v ?? null);
    });
    if (anyValue) rows.push(m);
  });

  return { headers: headers.filter(Boolean), rows, headerRowIndex };
}

/** نتیجهٔ ایمپورت */
export interface ImportResult {
  ok: boolean;
  entity: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  fileName: string;
  importedAt: string;
}

export function emptyResult(entity: string, fileName: string): ImportResult {
  return {
    ok: true, entity, total: 0, created: 0, updated: 0, skipped: 0,
    errors: [], fileName, importedAt: new Date().toISOString(),
  };
}

/* ============================ آگهی‌ها (listings) ============================ */

async function importListings(sheet: SheetData, result: ImportResult, tenantId: string): Promise<void> {
  const H = "کد آگهی";
  for (const row of sheet.rows) {
    // PN-051 — کلید با «قالب کامل» خوانده می‌شود (ME#### ملکتون را digitsOnly
    // قبلی می‌بُرید و رکورد تکراری با کد ناقص می‌ساخت؛ کدهای عددی ARM دست‌نخورده)
    const code = cellText(row.get(H));
    if (!code) {
      result.skipped++;
      if (result.errors.length < 12) result.errors.push(`ردیف بدون «${H}» نادیده گرفته شد`);
      continue;
    }
    const existing = await db.propertyRecord.findUnique({ where: { propertyCode: code } });

    const data: Record<string, unknown> = {};
    const put = (header: string, field: string, value: unknown) => {
      if (value === undefined || value === null || value === "") return;
      data[field] = value;
    };
    put("عنوان", "title", cellText(row.get("عنوان")) || undefined);
    put("کارشناس", "ownerName", cellText(row.get("کارشناس")) || undefined);
    put("مالک", "rawOwnerName", cellText(row.get("مالک")) || undefined);
    put("موبایل مالک", "ownerMobile", digitsOnly(cellText(row.get("موبایل مالک"))) || undefined);
    put("دسته‌بندی", "tradeTypeName", cellText(row.get("دسته‌بندی")) || undefined);
    put("نوع ملک", "propertyTypeName", cellText(row.get("نوع ملک")) || undefined);
    put("قیمت (تومان)", "price", cellNum(row.get("قیمت (تومان)")));
    put("رهن (تومان)", "depositPrice", cellNum(row.get("رهن (تومان)")));
    put("اجاره (تومان)", "rentPrice", cellNum(row.get("اجاره (تومان)")));
    put("قیمت هر متر", "pricePerMeter", cellNum(row.get("قیمت هر متر")));
    put("متراژ", "meterage", cellNum(row.get("متراژ")));
    put("اتاق", "rooms", cellNum(row.get("اتاق")));
    put("طبقه", "floor", cellNum(row.get("طبقه")));
    put("سال ساخت", "buildYear", cellNum(row.get("سال ساخت")));
    put("آدرس", "address", cellText(row.get("آدرس")) || undefined);
    put("استان", "stateName", cellText(row.get("استان")) || undefined);
    put("شهر", "cityName", cellText(row.get("شهر")) || undefined);
    put("منطقه", "areaName", cellText(row.get("منطقه")) || undefined);
    put("محله", "lineName", cellText(row.get("محله")) || undefined);
    put("بازدید", "viewCount", cellNum(row.get("بازدید")));
    put("تصاویر", "imageCount", cellNum(row.get("تصاویر")));
    put("دیوار", "addedToDivar", cellBool(row.get("دیوار")));
    put("اینستا", "addedToInsta", cellBool(row.get("اینستا")));
    put("بازنشر", "isReposted", cellBool(row.get("بازنشر")));
    put("وضعیت", "status", cellText(row.get("وضعیت")) || undefined);
    put("تاریخ وضعیت", "statusDate", cellDate(row.get("تاریخ وضعیت")));

    if (Object.keys(data).length === 0) {
      result.skipped++;
      continue;
    }
    try {
      if (existing) {
        await db.propertyRecord.update({ where: { propertyCode: code }, data });
        result.updated++;
      } else {
        await db.propertyRecord.create({
          data: { id: `import-${code}`, propertyCode: code, tenantId, ...data },
        });
        result.created++;
      }
    } catch (err) {
      result.skipped++;
      if (result.errors.length < 12) result.errors.push(`کد ${code}: ${(err as Error).message.slice(0, 120)}`);
    }
  }
}

/* ============================ درخواست‌ها (requests) ============================ */

async function importRequests(sheet: SheetData, result: ImportResult, tenantId: string): Promise<void> {
  const H = "کد درخواست";
  for (const row of sheet.rows) {
    // PN-051 — قالب کامل حفظ می‌شود (POT#### ملکتون) — عین گام ۱-ب listings
    const code = cellText(row.get(H));
    if (!code) {
      result.skipped++;
      if (result.errors.length < 12) result.errors.push(`ردیف بدون «${H}» نادیده گرفته شد`);
      continue;
    }
    const existing = await db.requestRecord.findUnique({ where: { requestCode: code } });

    const data: Record<string, unknown> = {};
    const put = (header: string, field: string, value: unknown) => {
      if (value === undefined || value === null || value === "") return;
      data[field] = value;
    };
    put("عنوان", "title", cellText(row.get("عنوان")) || undefined);
    put("کارشناس", "actorName", cellText(row.get("کارشناس")) || undefined);
    put("متقاضی", "customerName", cellText(row.get("متقاضی")) || undefined);
    put("موبایل متقاضی", "customerMobile", digitsOnly(cellText(row.get("موبایل متقاضی"))) || undefined);
    put("دسته‌بندی", "tradeTypeName", cellText(row.get("دسته‌بندی")) || undefined);
    put("نوع ملک", "propertyTypeName", cellText(row.get("نوع ملک")) || undefined);
    put("نوع ساختمان", "buildingTypeName", cellText(row.get("نوع ساختمان")) || undefined);
    put("قیمت از (تومان)", "priceFrom", cellNum(row.get("قیمت از (تومان)")));
    put("قیمت تا (تومان)", "priceTo", cellNum(row.get("قیمت تا (تومان)")));
    put("متراژ از", "spaceFrom", cellNum(row.get("متراژ از")));
    put("متراژ تا", "spaceTo", cellNum(row.get("متراژ تا")));
    put("اتاق از", "roomsFrom", cellNum(row.get("اتاق از")));
    put("اتاق تا", "roomsTo", cellNum(row.get("اتاق تا")));
    put("طبقه از", "floorFrom", cellNum(row.get("طبقه از")));
    put("طبقه تا", "floorTo", cellNum(row.get("طبقه تا")));
    put("سال ساخت از", "buildYearFrom", cellNum(row.get("سال ساخت از")));
    put("سال ساخت تا", "buildYearTo", cellNum(row.get("سال ساخت تا")));
    put("سند", "sanadNames", cellText(row.get("سند")) || undefined);
    put("نوع ساخت", "constructTypeNames", cellText(row.get("نوع ساخت")) || undefined);
    put("جهت", "sideNames", cellText(row.get("جهت")) || undefined);
    const areas = cellText(row.get("مناطق"));
    if (areas) put("مناطق", "areaNamesJson", JSON.stringify(areas.split(/[،,]/).map((s) => s.trim()).filter(Boolean)));
    const lines = cellText(row.get("محله‌ها"));
    if (lines) put("محله‌ها", "lineNamesJson", JSON.stringify(lines.split(/[،,]/).map((s) => s.trim()).filter(Boolean)));
    put("پرداخت", "userPaymentMethodName", cellText(row.get("پرداخت")) || undefined);
    put("جدیت", "userSeriousityName", cellText(row.get("جدیت")) || undefined);
    put("فوری", "urgent", cellBool(row.get("فوری")));
    put("لوکس", "luxury", cellBool(row.get("لوکس")));
    put("فرصت", "occasion", cellBool(row.get("فرصت")));
    put("معاوضه با", "changeWithNames", cellText(row.get("معاوضه با")) || undefined);
    put("وضعیت", "status", cellText(row.get("وضعیت")) || undefined);

    if (Object.keys(data).length === 0) {
      result.skipped++;
      continue;
    }
    try {
      if (existing) {
        await db.requestRecord.update({ where: { requestCode: code }, data });
        result.updated++;
      } else {
        await db.requestRecord.create({
          data: { requestCode: code, actorCode: "import", source: "excel-import", tenantId, ...data },
        });
        result.created++;
      }
    } catch (err) {
      result.skipped++;
      if (result.errors.length < 12) result.errors.push(`کد ${code}: ${(err as Error).message.slice(0, 120)}`);
    }
  }
}

/* ============================ معاملات (transactions) ============================ */

async function importTransactions(sheet: SheetData, result: ImportResult, tenantId: string): Promise<void> {
  for (const row of sheet.rows) {
    // PN-051 — قالب کامل حفظ می‌شود (کد ملک ملکتون ME####)
    const propertyCode = cellText(row.get("کد ملک"));
    const requestCodeRaw = cellText(row.get("کد درخواست"));
    const requestCode = requestCodeRaw || null;
    if (!propertyCode) {
      result.skipped++;
      if (result.errors.length < 12) result.errors.push("ردیف بدون «کد ملک» نادیده گرفته شد");
      continue;
    }
    const rawDate = cellText(row.get("تاریخ معامله")) || null;

    // کلید طبیعی: کد ملک + کد درخواست + تاریخ (اولین تطابق)
    const candidates = await db.transactionRecord.findMany({
      where: { propertyCode, requestCode, ...(rawDate ? { rawDate } : {}) },
      take: 1,
    });
    const existing = candidates[0];

    const data: Record<string, unknown> = {};
    const put = (header: string, field: string, value: unknown) => {
      if (value === undefined || value === null || value === "") return;
      data[field] = value;
    };
    put("مالک/فروشنده", "propertyCustomer", cellText(row.get("مالک/فروشنده")) || undefined);
    put("درخواست‌دهنده/خریدار", "requestCustomer", cellText(row.get("درخواست‌دهنده/خریدار")) || undefined);
    put("شماره هولوگرام", "contractHolo", cellText(row.get("شماره هولوگرام")) || undefined);
    put("تاریخ معامله", "rawDate", rawDate);
    const parsed = cellDate(row.get("تاریخ معامله"));
    if (parsed) put("تاریخ معامله (تاریخ)", "contractDate", parsed);

    if (Object.keys(data).length === 0) {
      result.skipped++;
      continue;
    }
    try {
      if (existing) {
        await db.transactionRecord.update({ where: { id: existing.id }, data });
        result.updated++;
      } else {
        const contractDate = parsed ?? new Date();
        await db.transactionRecord.create({
          data: {
            id: `tx-import-${Date.now().toString(36)}-${result.created}`,
            propertyCode, requestCode, rawDate, contractDate, tenantId, ...data,
          },
        });
        result.created++;
      }
    } catch (err) {
      result.skipped++;
      if (result.errors.length < 12) result.errors.push(`کد ملک ${propertyCode}: ${(err as Error).message.slice(0, 120)}`);
    }
  }
}

/* ============================ کارشناسان (experts) ============================ */

async function importExperts(sheet: SheetData, result: ImportResult, tenantId: string): Promise<void> {
  for (const row of sheet.rows) {
    let code = digitsOnly(cellText(row.get("کد پرسنلی")));
    if (code === "-" || code === "0") code = "";
    // PN-051 — الگوی خروجی اکسل خودمان دو هدر نام دارد: «کارشناس» (خروجی
    // /api/experts/export) و «نام و نام خانوادگی» (الگوی قدیمی) — هر دو پذیرفته
    // می‌شوند تا رفت‌وبرگشت (round-trip) همیشه هم‌کلید باشد.
    const fullName =
      cellText(row.get("نام و نام خانوادگی")) ||
      cellText(row.get("کارشناس")) ||
      "";
    if (!code && !fullName) {
      result.skipped++;
      if (result.errors.length < 12) result.errors.push("ردیف بدون «کد پرسنلی» و «نام» نادیده گرفته شد");
      continue;
    }

    // کلید: کد پرسنلی؛ اگر نبود، جست‌وجو با نام (رکوردهای «-» خروجی اکسل)
    const existing = code
      ? await db.expertRecord.findUnique({ where: { personnelCode: code } })
      : await db.expertRecord.findFirst({ where: { fullName } });
    // PN-051 — قانون دادهٔ مقدس: بدون تطابق کلید و بدون نام، هرگز رکورد
    // «بدون نام» ساخته نمی‌شود (شاهد خرابی round-trip قبلی: ۲۲۷ رکورد بی‌نام)
    if (!existing && !fullName) {
      result.skipped++;
      if (result.errors.length < 12) result.errors.push(`ردیف کد ${code}: نامی برای ایجاد رکورد تازه نیست — نادیده گرفته شد`);
      continue;
    }

    const data: Record<string, unknown> = {};
    const put = (header: string, field: string, value: unknown) => {
      if (value === undefined || value === null || value === "") return;
      data[field] = value;
    };
    put("نام و نام خانوادگی", "fullName", fullName || undefined);
    put("موبایل", "mobile", digitsOnly(cellText(row.get("موبایل"))) || undefined);
    // PN-051 — هدرهای جایگزین الگوی خروجی خودمان: «نقش» یا «سمت پرسنلی» ·
    // «کسب‌وکار/شعبه» یا «شعبه» — رفت‌وبرگشت کامل بدون گم‌شدن ستون
    put("نقش", "role", cellText(row.get("نقش")) || cellText(row.get("سمت پرسنلی")) || undefined);
    put("کسب‌وکار/شعبه", "businessTitle", cellText(row.get("کسب‌وکار/شعبه")) || cellText(row.get("شعبه")) || undefined);
    const activeTxt = cellText(row.get("وضعیت"));
    if (activeTxt === "فعال") data.active = true;
    if (activeTxt === "غیرفعال") data.active = false;

    if (Object.keys(data).length === 0) {
      result.skipped++;
      continue;
    }
    try {
      if (existing) {
        await db.expertRecord.update({ where: { id: existing.id }, data });
        result.updated++;
      } else {
        const newCode = code || `بدون-کد-${(fullName ?? "").replace(/\s+/g, "-").slice(0, 40) || Date.now().toString(36)}`;
        await db.expertRecord.create({
          data: {
            id: `import-${newCode}-${Date.now().toString(36)}`,
            personnelCode: newCode,
            fullName: (fullName as string) || "بدون نام",
            mobile: (data.mobile as string) || "",
            role: (data.role as string) || "کارشناس",
            businessTitle: (data.businessTitle as string) || "",
            tenantId,
            createdAt: new Date(),
            ...data,
          },
        });
        result.created++;
      }
    } catch (err) {
      result.skipped++;
      if (result.errors.length < 12) result.errors.push(`${code || fullName}: ${(err as Error).message.slice(0, 120)}`);
    }
  }
}

/* ============================ نقطهٔ ورود سرویس ============================ */

export type ImportEntity = "listings" | "requests" | "transactions" | "experts";

/** اجرای ایمپورت کامل یک موجودیت — tenantId فهرستِ بارگذاری‌شده (PN-051) */
export async function runImport(
  entity: ImportEntity,
  sheet: SheetData,
  fileName: string,
  tenantKey?: string | null
): Promise<ImportResult> {
  const result = emptyResult(entity, fileName);
  const tenantId = tenantDbValue(tenantKey ?? undefined); // 'melketun' | 'melk-tabriz'
  result.total = sheet.rows.length;
  if (entity === "listings") await importListings(sheet, result, tenantId);
  else if (entity === "requests") await importRequests(sheet, result, tenantId);
  else if (entity === "transactions") await importTransactions(sheet, result, tenantId);
  else await importExperts(sheet, result, tenantId);
  return result;
}
