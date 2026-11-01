/**
 * خط لوله کاتالوگ ARM — P6.5-10 (کاشی‌های «آگهی‌های ملک تبریز» و «درخواست‌های ملک تبریز»)
 * ---------------------------------------------------------------------------
 * دریافت و غنی‌سازی فهرست کامل آگهی‌ها/درخواست‌های سامانه ARM ملک تبریز:
 *
 *  لایه ۱ — همگام‌سازی فهرست (سریع):
 *    properties/list (صفحه‌بندی، سقف limit=500) → رجیستری PropertyRecord
 *    requests/list   (صفحه‌بندی، سقف limit=500) → RequestRecord با source='arm'
 *    هر ردیف: کد، عنوان، کارشناس (relatedRealtor)، وضعیت جاری، منطقه/محله،
 *    آدرس ترکیبی از موقعیت (استان/شهر/منطقه/محله)، تاریخ فعالیت
 *
 *  لایه ۲ — غنی‌سازی تماس (هزینه‌بر؛ برش‌برش با نرخ‌محدود):
 *    آگهی:  properties/owner/{id}    → نام و شماره تماس مالک ملک
 *           properties/details/{id}  → آدرس دقیق + مشخصات + دسته‌بندی
 *    درخواست: requests/applicant/{id} → نام و نام خانوادگی و شماره تماس درخواست‌دهنده
 *             requests/details/{id}  → منطقه‌های منتخب (P6521/M2 — ستون منطقه)
 *    نشانگر پیشرفت: extractionBatchId (تهی = در انتظار غنی‌سازی)
 *
 * اصول حاکم (عین bulk-import):
 *   · صفر fetch مستقیم (فقط melk-api/client) · صفر Prisma مستقیم (فقط Repository)
 *   · نرخ‌محدود اجباری (پیش‌فرض ۲۰۰ms بین فراخوانی) — صفر فشار به سامانه مبدأ
 *   · upsert بر کلید طبیعی (propertyCode / requestCode) با merge non-null — idempotent
 *   · Bulk هرگز deleteMany صادر نمی‌کند (§۱.۹)
 *
 * کشف زندهٔ مسیرها (پروب P6.5-10، ۱۴۰۵/۰۶/۲۹):
 *   فهرست‌ها «بدون پسوند /list» 404 می‌دهند — مسیر واقعی: properties/list و
 *   requests/list (الگوی addToURL:"list" عین visits/list و trade-overviews/list).
 *   پاکت سطح‌بالای ARM: { list, count, totalPages, page, limit } — count واقعی:
 *   آگهی ۱۱٬۳۶۳ · درخواست ۲۰٬۳۹۲ (شاهد پروب).
 */

import { randomUUID } from "crypto";
import { armCall } from "./client";
import { getMelkApiConfig } from "./config";
import { MELK_ENDPOINTS } from "./endpoints";
import { extractAddress, extractDetailItems, extractPagedList, extractPersonInfo, normalizeMobile } from "./adapters";
import {
  getPropertyRecordRepository,
  getRequestRepository,
  getIntegrationRepository,
  type PropertyBulkInput,
  type ArmRequestBulkRow,
  type PropertyRecordRepository,
  type RequestRepository,
  type SyncCheckpointDTO,
} from "@/core/repositories";
// P6547/گام دوم — نقشه‌های شناسه→نام فهرست‌های مرجع سامانه ARM
import type { TypeMaps } from "./type-registry";

// ==========================================================================
// تنظیمات خط لوله
// ==========================================================================

/** فاصلهٔ اجباری بین فراخوانی‌های ARM (ms) — پیش‌فرض ۲۰۰ (عین bulk-import §۱.۸) */
function catalogRateMs(): number {
  const n = Number(process.env.MELK_CATALOG_RATE_MS ?? "200");
  return Number.isFinite(n) && n >= 0 ? n : 200;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * سقف ایمنی صفحات — ۵۰۰ صفحه × اندازه صفحه = پوشش کامل کاتالوگ‌ها
 * (آگهی ۲۳ صفحه×۵۰۰ · درخواست ۴۰۸ صفحه×۵۰ — شاهد پروب P6.5-10)
 */
const MAX_PAGES = 500;

/** مهلت فهرست — سرور ARM برای فهرست درخواست‌ها هزینهٔ ثابت ~۵ثانیه‌ای دارد
 * (پروب: limit=50 در ۵٫۱ثانیه؛ limit=500 تا ۶۰ثانیه و بیش از مهلت)
 * PN-036 (شورا-ن۰۵۸ · فاز ۴): ۴۵ ← ۷۵ ثانیه — مسیر رله: curl ۶۰ث گوشی +
 * صف‌گذاری + ارسال نتیجه؛ مهلت سرور باید از مهلت گوشی بلندتر باشد (در
 * نسل J گوشی در ۲۵ث می‌شکست و سرور هنوز ۲۰ ثانیه دیگر منتظر می‌ماند). */
const LIST_TIMEOUT_MS = 75_000;

type RawRow = Record<string, unknown>;

function pickStr(row: RawRow, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim() !== "") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickNestedStr(row: RawRow, path: string): string | null {
  const parts = path.split(".");
  let cur: unknown = row;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as RawRow)[p];
  }
  if (typeof cur === "string" && cur.trim() !== "") return cur;
  if (typeof cur === "number" && Number.isFinite(cur)) return String(cur);
  return null;
}

function pickDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ==========================================================================
// نگاشت خالص ردیف فهرست → ورودی مخزن (قابل تست)
// ==========================================================================

/** وضعیت جاری ردیف — status[0].currentStatus.name (پروب: «در انتظار تایید مدیر» / «سرنخ») */
export function currentStatusName(row: RawRow): string | null {
  const arr = row.status;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const first = arr[0] as RawRow | null;
  if (!first || typeof first !== "object") return null;
  return pickNestedStr(first, "currentStatus.name") ?? pickNestedStr(first, "currentInbox.name");
}

/** آدرس ترکیبی از موقعیت ثبت‌شده در فهرست — استانی‌ترین → محله‌ای‌ترین (هیچ‌گاه تهی نمی‌ماند) */
export function composeLocationAddress(row: RawRow): string | null {
  const parts = ["state.name", "city.name", "area.name", "line.name"]
    .map((p) => pickNestedStr(row, p))
    .filter((v): v is string => Boolean(v));
  const unique = [...new Set(parts.map((s) => s.trim()))];
  return unique.length > 0 ? unique.join("، ") : null;
}

/**
 * ردیف فهرست آگهی ARM → PropertyBulkInput (لایه ۱ — بدون تماس مالک).
 * معناشناسی ستون‌ها (قرارداد §۲.۲ + B.3):
 *   ownerName/ownerCode = کارشناس مسؤول (relatedRealtor) — ستون دامنه
 *   rawOwnerName/rawOwnerMobile/ownerMobile = مالک ملک (لایه ۲ غنی‌سازی)
 */
export function mapArmPropertyListRow(row: RawRow): PropertyBulkInput | null {
  const id = pickStr(row, ["_id", "id"]);
  const propertyCode = pickStr(row, ["code", "propertyCode"]);
  // کدآگهی کلید طبیعی است — بدون آن ردیف معتبر نیست (عین فهرست ARM همیشه code دارد)
  if (!propertyCode) return null;

  const totalPrice = typeof row.totalPrice === "number" ? row.totalPrice : null;
  const deposit = typeof row.deposite_price === "number" ? row.deposite_price : null;
  const rent = typeof row.rent_price === "number" ? row.rent_price : null;
  const price = totalPrice ?? deposit;
  const pricePerMeter = typeof row.pricePerMeter === "number" ? row.pricePerMeter : null;

  // PN-002 گام ۱ — ستون‌های تازه از خود ردیف فهرست (بهینه‌ترین گزینهٔ استخراج: صفر API اضافه)
  const statusArr = Array.isArray(row.status) ? (row.status[0] as RawRow | undefined) : undefined;
  const statusDateRaw = statusArr ? pickStr(statusArr, ["date"]) : null;
  const statusDate = statusDateRaw ? new Date(statusDateRaw) : null;
  const branchObj = row.businessId as RawRow | undefined;
  const images = Array.isArray(row.images) ? row.images.length : 0;

  return {
    id: id ?? propertyCode!,
    propertyCode: propertyCode ?? id!,
    title: pickStr(row, ["title"]),
    status: currentStatusName(row),
    ownerCode: null, // کد پرسنلی کارشناس در ردیف فهرست نیست — دامنهٔ property تجمیعی است
    ownerName: pickStr(row, ["relatedRealtor"]),
    cityId: pickNestedStr(row, "city._id"),
    areaId: pickNestedStr(row, "area._id"),
    areaName: pickNestedStr(row, "area.name"),
    lineId: pickNestedStr(row, "line._id"),
    lineName: pickNestedStr(row, "line.name"),
    address: composeLocationAddress(row),
    price,
    pricePerMeter,
    rawPrice: price !== null ? String(price) : rent !== null ? `اجاره: ${rent}` : null,
    rawPriceUnit: "ریال",
    createdAt: pickDate(row.updatedAt) ?? pickDate(row.createdAt),
    // ---- PN-002 گام ۱ — ستون‌های تازه ----
    ...(typeof row.isRental === "boolean" ? { isRental: row.isRental } : {}),
    ...(deposit !== null ? { depositPrice: deposit } : {}),
    ...(rent !== null ? { rentPrice: rent } : {}),
    ...(typeof row.viewCount === "number" ? { viewCount: row.viewCount } : {}),
    ...(images > 0 ? { imageCount: images } : {}),
    ...(typeof row.addedToDivar === "boolean" ? { addedToDivar: row.addedToDivar } : {}),
    ...(typeof row.addedToInsta === "boolean" ? { addedToInsta: row.addedToInsta } : {}),
    ...(typeof row.isReposted === "boolean" ? { isReposted: row.isReposted } : {}),
    ...(typeof row.isTarget === "boolean" ? { isTarget: row.isTarget } : {}),
    ...(branchObj ? { armBranchTitle: pickStr(branchObj, ["title"]) } : {}),
    stateName: pickNestedStr(row, "state.name"),
    cityName: pickNestedStr(row, "city.name"),
    ...(pickStr(row, ["link"]) ? { publicUrl: pickStr(row, ["link"]) } : {}),
    ...(statusDate !== null && !Number.isNaN(statusDate.getTime()) ? { statusDate } : {}),
  };
}

/** استخراج نام‌های آرایهٔ اشیاء {_id, name} — area[]/line[] خود ردیف فهرست درخواست
 *  P6547/گام دوم (کشف زندهٔ ۱۴۰۵/۰۷/۱۲): ساختار فهرست requests/list عین ثبت کارشناسان:
 *    area: [{_id, name}] · line: [{_id, name}] — بدون نیاز به requests/details (که 500 می‌دهد) */
export function extractNameArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string" && item.trim()) {
      const t = item.trim();
      if (!out.includes(t)) out.push(t);
    } else if (item && typeof item === "object") {
      const name = (item as Record<string, unknown>)["name"] ?? (item as Record<string, unknown>)["title"];
      if (typeof name === "string" && name.trim()) {
        const t = name.trim();
        if (!out.includes(t)) out.push(t);
      }
    }
  }
  return out;
}

/** نام آبجکت مرجع ({_id, name}) — tradeType/buildingType/propertyType/… */
export function refName(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const name = (v as Record<string, unknown>)["name"] ?? (v as Record<string, unknown>)["title"];
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

// ==========================================================================
// PN-002 گام ۲ — نام‌های فارسی رسمی مقادیر enum فرم پویای درخواست (inputs)
// ==========================================================================

/** سند — inputs.sanad[] (مقادیر انگلیسی → نام نمایشی) */
export const SANAD_LABELS: Record<string, string> = {
  dardasteegdam: "در دست اقدام",
  key: "قولنامه",
  sixdong: "شش‌دانگ",
  contractical: "قراردادی",
};

/** نوع ساخت — inputs.construct_type[] */
export const CONSTRUCT_TYPE_LABELS: Record<string, string> = {
  complex: "مجتمع",
  personal: "شخصی",
  tower: "برج",
};

/** جهت — inputs.side[] */
export const SIDE_LABELS: Record<string, string> = {
  north: "شمال",
  south: "جنوب",
  west: "غرب",
  east: "شرق",
  north_west: "شمال غربی",
  north_east: "شمال شرقی",
  south_west: "جنوب غربی",
  south_east: "جنوب شرقی",
  north_south: "شمالی-جنوبی",
  east_west: "شرقی-غربی",
  three_corners: "سه‌در",
};

/** معاوضه با — changeWith[] (نام‌های رسمی enum عمومی PROPERTY_CHANGEABLE_WITH) */
export const CHANGE_WITH_LABELS: Record<string, string> = {
  notChangeable: "مایل نیستم",
  land: "زمین / ملک کلنگی",
  office: "دفتر کار",
  store: "مغازه",
  villa: "ویلا",
  factory: "کارخانه",
  apartment: "واحد آپارتمان",
  car: "خودرو",
  others: "سایر",
};

/** ترجمهٔ آرایهٔ مقادیر انگلیسی به نام‌های فارسی جدا با «،» — نام‌های ناشناخته خام می‌مانند */
function translateEnumList(v: unknown, labels: Record<string, string>): string | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string" || !item.trim()) continue;
    const t = item.trim();
    out.push(labels[t] ?? t);
  }
  return out.length > 0 ? out.join("، ") : null;
}

/** استخراج عدد با دامنهٔ معتبر per-field (فرم ARM برای «هر مقدار» از ۰ تا ۹۰ رزرو می‌کند) */
function pickBounded(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < min || v > max) return null;
  return Math.round(v);
}

/** استخراج کامل inputs خود ردیف فهرست درخواست — شاهکار PN-002 گام ۲ (۱۰۰٪ پر)
 *  دامنه‌ها: متراژ تا ۵٬۰۰۰ · اتاق تا ۳۰ · طبقه تا ۲۰۰ · سال جلالی ۱۳۰۰-۱۴۵۰
 *  (از ۰ و ۹۰ = «هر مقدار» رزرو فرم → ذخیره نمی‌شود تا ستون معنادار بماند) */
export function extractRequestInputs(inputs: unknown): Partial<ArmRequestBulkRow> {
  if (!inputs || typeof inputs !== "object") return {};
  const i = inputs as RawRow;
  const out: Partial<ArmRequestBulkRow> = {};
  const spaceFrom = pickBounded(i.space_from, 1, 5000);
  const spaceTo = pickBounded(i.space_to, 1, 5000);
  const roomsFrom = pickBounded(i.room_whole_from, 1, 30);
  const roomsTo = pickBounded(i.room_whole_to, 1, 30);
  const floorFrom = pickBounded(i.floor_from, 1, 200);
  const floorTo = pickBounded(i.floor_to, 1, 200);
  const yearFrom = pickBounded(i.year_from, 1300, 1450);
  const yearTo = pickBounded(i.year_to, 1300, 1450);
  const sanad = translateEnumList(i.sanad, SANAD_LABELS);
  const construct = translateEnumList(i.construct_type, CONSTRUCT_TYPE_LABELS);
  const side = translateEnumList(i.side, SIDE_LABELS);
  if (spaceFrom !== null) out.spaceFrom = spaceFrom;
  if (spaceTo !== null) out.spaceTo = spaceTo;
  if (roomsFrom !== null) out.roomsFrom = roomsFrom;
  if (roomsTo !== null) out.roomsTo = roomsTo;
  if (floorFrom !== null) out.floorFrom = floorFrom;
  if (floorTo !== null) out.floorTo = floorTo;
  if (yearFrom !== null) out.buildYearFrom = yearFrom;
  if (yearTo !== null) out.buildYearTo = yearTo;
  if (sanad) out.sanadNames = sanad;
  if (construct) out.constructTypeNames = construct;
  if (side) out.sideNames = side;
  return out;
}

/** P6547/گام دوم — تفکیک نام فیلد مرجع: {name} آبجکت یا شناسهٔ خام با نقشهٔ رجیستری
 *  (کشف زنده: tradeType/buildingType/… در ردیف فهرست درخواست «شناسهٔ خام»اند؛
 *  فهرست‌های مرجع building-types/list و property-types/list و … نام‌ها را می‌دهند) */
function resolveRefName(v: unknown, map?: Map<string, string>): string | null {
  if (v && typeof v === "object") return refName(v);
  if (typeof v === "string" && v.trim()) {
    const id = v.trim();
    return map?.get(id) ?? null;
  }
  return null;
}

/** ردیف فهرست درخواست ARM → ArmRequestBulkRow (لایه ۱ — بدون تماس درخواست‌دهنده)
 *  P6547/گام دوم-۱/۲ — ساختار ثبت درخواست کارشناسان (عین requests/list) کامل استخراج می‌شود:
 *  area[] + line[] + totalPrice_from/to + tradeType + buildingType + propertyType +
 *  userPaymentMethod + userSeriousity + urgent/luxury/changeable — همه از خود ردیف فهرست
 *  (شاهکار کشف: requests/details روی سرور ARM خطای 500 می‌دهد؛ خود فهرست غنی است)
 *  typeMaps — نقشه‌های شناسه→نام فهرست‌های مرجع (اختیاری؛ نبود = ستون نام خالی می‌ماند) */
export function mapArmRequestListRow(row: RawRow, typeMaps?: TypeMaps): ArmRequestBulkRow | null {
  const id = pickStr(row, ["_id", "id"]);
  const requestCode = pickStr(row, ["code", "requestCode"]);
  // کد درخواست کلید طبیعی است — بدون آن ردیف معتبر نیست
  if (!requestCode) return null;

  const relatedCustomer = pickStr(row, ["relatedCustomer"]); // نام خانوادگی مشتری عین فهرست
  // P6547/گام دوم — منطقه‌ها/محله‌ها از خود ردیف فهرست (آرایه‌های area/line)
  const areaNames = extractNameArray(row.area);
  const lineNames = extractNameArray(row.line);
  // P6547/گام دوم — بازهٔ قیمت متقاضی از خود ردیف فهرست (totalPrice_from/totalPrice_to)
  const priceFrom = typeof row.totalPrice_from === "number" && row.totalPrice_from > 0 ? row.totalPrice_from : null;
  const priceTo = typeof row.totalPrice_to === "number" && row.totalPrice_to > 0 ? row.totalPrice_to : null;
  // P6547/گام دوم — دسته‌بندی/نوع ملک/نوع ساختمان/پرداخت/جدیت: {name} یا شناسه + نقشهٔ رجیستری
  const tradeTypeName = resolveRefName(row.tradeType, typeMaps?.tradeType);
  const buildingTypeName = resolveRefName(row.buildingType, typeMaps?.buildingType);
  const propertyTypeName = resolveRefName(row.propertyType, typeMaps?.propertyType);
  const paymentMethodName = resolveRefName(row.userPaymentMethod, typeMaps?.paymentMethod);
  const seriousnessName = resolveRefName(row.userSeriousity, typeMaps?.seriousness);

  // PN-002 گام ۲ — inputs خود ردیف (متراژ/طبقه/اتاق/سال/سند/نوع ساخت/جهت) + شعبه ARM + کشور/استان/شهر
  const inputsExtras = extractRequestInputs(row.inputs);
  const branchObj = row.businessId as RawRow | undefined;
  const changeWithNames = translateEnumList(row.changeWith, CHANGE_WITH_LABELS);

  return {
    id: id ?? requestCode!,
    requestCode: requestCode ?? id!,
    customerName: relatedCustomer,
    customerMobile: null,
    status: currentStatusName(row),
    actorCode: null, // کد پرسنلی در ردیف نیست → 'arm' (رکورد سیستمی عین قرارداد §۱.۲)
    actorName: pickStr(row, ["relatedRealtor"]),
    title: pickStr(row, ["title"]),
    createdAt: pickDate(row.createdAt) ?? pickDate(row.updatedAt),
    rawCustomerName: relatedCustomer,
    rawCustomerMobile: null,
    // P6547/گام دوم — داده‌های غنی خود ردیف فهرست (بدون وابستگی به details)
    ...(areaNames.length > 0 ? { areaNames } : {}),
    ...(lineNames.length > 0 ? { lineNames } : {}),
    ...(priceFrom !== null ? { priceFrom } : {}),
    ...(priceTo !== null ? { priceTo } : {}),
    ...(tradeTypeName ? { tradeTypeName } : {}),
    ...(buildingTypeName ? { buildingTypeName } : {}),
    ...(propertyTypeName ? { propertyTypeName } : {}),
    ...(paymentMethodName ? { paymentMethodName } : {}),
    ...(seriousnessName ? { seriousnessName } : {}),
    ...(typeof row.urgent === "boolean" ? { urgent: row.urgent } : {}),
    ...(typeof row.luxury === "boolean" ? { luxury: row.luxury } : {}),
    ...(typeof row.changeable === "boolean" ? { changeable: row.changeable } : {}),
    // ---- PN-002 گام ۲ — ستون‌های تازه ----
    ...inputsExtras,
    ...(typeof row.ocasion === "boolean" ? { occasion: row.ocasion } : {}),
    ...(typeof row.deposite === "boolean" ? { deposit: row.deposite } : {}),
    ...(typeof row.confirmSMS === "boolean" ? { confirmSms: row.confirmSMS } : {}),
    ...(typeof row.notifyMe === "boolean" ? { notifyMe: row.notifyMe } : {}),
    ...(changeWithNames ? { changeWithNames } : {}),
    ...(branchObj ? { armBranchTitle: pickStr(branchObj, ["title"]) } : {}),
    countryName: pickNestedStr(row, "country.name"),
    stateName: pickNestedStr(row, "state.name"),
    cityName: pickNestedStr(row, "city.name"),
    ...(pickStr(row, ["platform"]) ? { platform: pickStr(row, ["platform"]) } : {}),
    ...(pickStr(row, ["customerDescription"]) ? { customerDescription: pickStr(row, ["customerDescription"]) } : {}),
  };
}

/**
 * دسته‌بندی خطای ARM — آیا نتیجهٔ قطعی است؟
 * ۴xx غیرقابل تلاش (retryable=false و ۴۰۰≤httpStatus<۵۰۰) یعنی خودِ رکورد/مجوز
 * مشکل دارد و تلاش مجدد بی‌فایده است؛ ۵xx/شبکه/مهلت (retryable=true) نرم است.
 */
function isDefinitive4xx(e: { code?: string; httpStatus?: number; retryable?: boolean }): boolean {
  if (e?.code === "UNAUTHORIZED") return false;
  return e?.retryable === false && typeof e.httpStatus === "number" && e.httpStatus >= 400 && e.httpStatus < 500;
}

// ==========================================================================
// نتیجه‌های خط لوله
// ==========================================================================

export interface ArmCatalogSyncResult {
  entity: "listings" | "requests";
  ok: boolean;
  pages: number;
  fetched: number;
  created: number;
  updated: number;
  duplicates: number;
  errors: number;
  totalAtSource: number;
  durationMs: number;
  errorCode?: string;
  /** P6.5-11 (بند ب) — ازسرگیری: اطلاعات چرخه و نقطهٔ ادامه */
  resumedFromPage?: number;
  cycleId?: string;
  /** PN-028/خامساً-الف — گذر سرِ تازه: شمار رکوردهای صفحهٔ ۱ (تازه‌ترین‌های منبع)
 *  که پیش از ادامهٔ چرخهٔ ناتمام upsert شدند (صفر = چرخه از صفحهٔ ۱ شروع شد) */
  freshHead?: number;
  checkpoint?: {
    lastCompletedPage: number;
    totalPages: number;
    phase: string;
    remainingPages: number;
    /** دادهٔ تازه‌ای در مبدأ دیده شده که چرخهٔ جاری پوششش نمی‌دهد */
    newAtSource: boolean;
  };
}

export interface ArmCatalogEnrichResult {
  entity: "listings" | "requests";
  ok: boolean;
  attempted: number;
  enriched: number; // ردیف‌هایی که دادهٔ تماس/آدرس واقعی یافت شد
  missingAtSource: number; // ردیف‌هایی که منبع دادهٔ تماس ندارد (نتیجهٔ قطعی، نه خطا)
  failed: number;
  remaining: number; // ردیف‌های همچنان در انتظار غنی‌سازی
  total: number;
  durationMs: number;
  errorCode?: string;
}

// ==========================================================================
// P6.5-11 (بند ب) — نقطهٔ ازسرگیری: «ادامه از جاییکه قطع شد، نه از ابتدا»
// ==========================================================================

/**
 * تصمیم نقطهٔ شروع چرخه — سه حالت:
 *   ۱) checkpoint در جریان با همان pageSize ⇒ ادامه از lastCompletedPage + 1
 *   ۲) checkpoint کامل/ناسازگار/ناموجود ⇒ چرخهٔ تازه از صفحهٔ ۱ (upsert بی‌اثر)
 *   ۳) بوت‌استرپ: پیشرفت موجود در DB بدون checkpoint (دادهٔ P6.5-10) ⇒
 *      floor(count/pageSize) صفحهٔ کامل فرض می‌شود و از بعدش ادامه می‌رویم
 *
 * قانون ترتیب (عین bulk-import §۱.۴-۳): دادهٔ صفحه اول «نوشته» می‌شود،
 * سپس checkpoint جلو می‌رود — قطع برق/شبکه هیچ‌گاه حفرهٔ داده نمی‌سازد.
 */
export function resolveCycleStart(
  saved: SyncCheckpointDTO | null,
  pageSize: number,
  existingCount: number
): { startPage: number; cycleId: string; resumed: boolean; lastCompletedPage: number } {
  // حالت ۱ — ازسرگیری چرخهٔ ناتمام با همان اندازهٔ صفحه
  if (saved && saved.phase === "in-progress" && saved.pageSize === pageSize && saved.lastCompletedPage > 0) {
    return { startPage: saved.lastCompletedPage + 1, cycleId: saved.cycleId, resumed: true, lastCompletedPage: saved.lastCompletedPage };
  }
  // حالت ۴ (P6530/گام ۲ — نکتهٔ بسیار مهم ۳) — خوددرمانی چرخهٔ «کاملِ» ناقص:
  // checkpoint کامل است اما پوشش واقعی DB (< ۹۰٪ منبع) می‌گوید چرخه به‌نادرست
  // بسته شده (شاهد: ۷٬۳۹۸ رکورد در برابر ۲۰٬۳۹۲ منبع) ⇒ چرخهٔ تازه از صفحهٔ ۱؛
  // upsert بر کلید طبیعی بی‌اثر است و حفره‌های داده پر می‌شوند.
  if (saved && saved.phase === "complete" && saved.totalAtSource > 0 && existingCount < Math.floor(saved.totalAtSource * 0.9)) {
    return { startPage: 1, cycleId: `heal-p6530-${randomUUID().slice(0, 8)}`, resumed: false, lastCompletedPage: 0 };
  }
  // حالت ۳ — بوت‌استرپ پیشرفت تاریخی (P6.5-10 پیش از وجود checkpoint)
  if (!saved && existingCount > pageSize) {
    const pages = Math.floor(existingCount / pageSize);
    return { startPage: pages + 1, cycleId: `bootstrap-p6511-${randomUUID().slice(0, 8)}`, resumed: true, lastCompletedPage: pages };
  }
  // حالت ۲ — چرخهٔ تازه
  return { startPage: 1, cycleId: `cycle-${randomUUID().slice(0, 8)}`, resumed: false, lastCompletedPage: 0 };
}

/**
 * P6530/گام ۲ (نکتهٔ بسیار مهم ۳) — گارد صفحهٔ معیوب:
 * پاکت‌های گاه‌به‌گاه ARM با total=0/totalPages کوچک‌تر از صفحهٔ جاری برمی‌گردند
 * (شاهد زندهٔ بسته‌شدن نادرست چرخهٔ درخواست‌ها در صفحهٔ ۱۲۱ از ۴۰۸).
 * چنین پاسخی «پایان داده» نیست — خطای گذراست و باید صفحه دوباره پرسیده شود.
 */
export function isDegenerateListPage(
  page: number,
  fetched: { rows: unknown[]; total: number; totalPages: number },
  knownTotalAtSource: number
): boolean {
  // بدون داده و بدون شمارش معتبر + ادعای پایان پیش از صفحهٔ جاری
  if (fetched.rows.length > 0) return false;
  if (fetched.total > 0) return false;
  // اگر منبع قبلاً شمارش معتبر اعلام کرده و این صفحه خالی/بی‌شمارش است → معیوب
  if (knownTotalAtSource > 0 && fetched.totalPages < page) return true;
  return false;
}

/** P6530/گام ۲ — آیا چرخهٔ جاری پوشش کافی برای بسته‌شدن دارد؟ (≥ ۹۰٪ منبع) */
export function hasEnoughCoverage(existingCount: number, totalAtSource: number): boolean {
  if (totalAtSource <= 0) return true; // شمارش نامعلوم — تکیه بر رسیدن به آخرین صفحه
  return existingCount >= Math.floor(totalAtSource * 0.9);
}

/** ذخیرهٔ امن checkpoint پس از هر صفحهٔ کامل (داده نوشته شد ⇒ حالا جلو می‌رویم) */
async function advanceCheckpoint(
  entity: "listings" | "requests",
  cp: { cycleId: string; pageSize: number; lastCompletedPage: number; totalPages: number; totalAtSource: number },
  phase: "in-progress" | "complete"
): Promise<void> {
  const repo = getIntegrationRepository();
  await repo.upsertSyncCheckpoint({
    id: entity,
    cycleId: cp.cycleId,
    pageSize: cp.pageSize,
    lastCompletedPage: cp.lastCompletedPage,
    totalPages: cp.totalPages,
    totalAtSource: cp.totalAtSource,
    phase,
    ...(phase === "complete" ? { completedAt: new Date() } : { completedAt: null }),
  });
}

/** نمای خواندنی checkpoint برای نتیجهٔ sync */
function checkpointView(
  savedLastCompleted: number,
  totalPages: number,
  phase: string,
  totalAtSource: number,
  savedTotalAtSource: number
) {
  return {
    lastCompletedPage: savedLastCompleted,
    totalPages,
    phase,
    remainingPages: Math.max(0, totalPages - savedLastCompleted),
    newAtSource: totalAtSource > savedTotalAtSource && savedTotalAtSource > 0,
  };
}

// ==========================================================================
// لایه ۱ — همگام‌سازی فهرست (صفحه‌به‌صفحه با نرخ‌محدود)
// ==========================================================================

async function fetchListPageOnce(
  token: string,
  path: string,
  page: number,
  pageSize: number
): Promise<{ rows: RawRow[]; total: number; totalPages: number }> {
  const cfg = getMelkApiConfig();
  const res = await armCall<unknown>({
    path,
    baseUrl: cfg.armApiBase,
    token,
    query: { page, limit: pageSize },
    // سرور ARM فهرست درخواست‌ها را با هزینهٔ ثابت ~۵ثانیه‌ای پاسخ می‌دهد (پروب P6.5-10)
    timeoutMs: LIST_TIMEOUT_MS,
    maxRetries: 1,
  });
  const extracted = extractPagedList<RawRow>(res.data, (row) => (row && typeof row === "object" ? (row as RawRow) : null));
  const rows = extracted.rows ?? [];
  const totalPages = extracted.totalPages ?? (extracted.total > 0 ? Math.ceil(extracted.total / pageSize) : 1);
  return { rows, total: extracted.total, totalPages };
}

/**
 * P6530/گام ۲ (نکتهٔ بسیار مهم ۳) — واکشی صفحهٔ فهرست با گارد صفحهٔ معیوب:
 * پاسخ بی‌داده/بی‌شمارش با ادعای پایان پیش از صفحهٔ جاری → خطای گذرا؛
 * تا دو تلاش مجدد با فاصلهٔ نرخ‌محدود، سپس خطا به بالا می‌رود (چرخه در همان‌جا
 * می‌ایستد و complete علامت نمی‌خورد — دقیقاً ریشهٔ گم‌شدن ۱۳هزار درخواست).
 */
async function fetchListPage(
  token: string,
  path: string,
  page: number,
  pageSize: number,
  knownTotalAtSource = 0
): Promise<{ rows: RawRow[]; total: number; totalPages: number }> {
  let last = { rows: [] as RawRow[], total: 0, totalPages: 1 };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    last = await fetchListPageOnce(token, path, page, pageSize);
    if (!isDegenerateListPage(page, last, knownTotalAtSource)) return last;
    // صفحهٔ معیوب — تلاش مجدد با فاصلهٔ نرخ‌محدود (سرور شلوغ است)
    await sleep(Math.max(catalogRateMs(), 500) * (attempt + 1));
  }
  // سه بار معیوب ⇒ به‌عنوان خطای گذرای پایدار بالا می‌رود؛ چرخه در همان‌جا می‌ماند
  return last;
}

/** همگام‌سازی کامل لایهٔ فهرست آگهی‌ها → PropertyRecord (با نقطهٔ ازسرگیری — بند ب P6.5-11) */
export async function syncArmListingsCatalog(
  token: string,
  opts: { pageSize?: number; maxPages?: number; repos?: { property?: PropertyRecordRepository } } = {}
): Promise<ArmCatalogSyncResult> {
  const started = Date.now();
  const repo = opts.repos?.property ?? getPropertyRecordRepository();
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 100);
  // PN-036 (شورا-ن۰۵۸ · فاز ۴): pageSize پیش‌فرض ۵۰۰ ← ۵۰ — پاسخ ۵۰۰رکوردی
  // (تا ۵+ مگابایت) هم curl ۲۵ثانیه‌ای گوشی را می‌شکست (خطای ۲۸ مکرر مالک)،
  // هم ARG_MAX jq؛ سقف clamp هم ۵۰۰ ← ۱۰۰ کاهش یافت (۵۰ عین رفتار خود سامانه پایدار است)
  const maxPages = Math.min(opts.maxPages ?? MAX_PAGES, MAX_PAGES);
  const runId = `p6510-listings-${randomUUID().slice(0, 8)}`;
  const out: ArmCatalogSyncResult = {
    entity: "listings", ok: false, pages: 0, fetched: 0, created: 0, updated: 0,
    duplicates: 0, errors: 0, totalAtSource: 0, durationMs: 0,
  };

  // ---- P6.5-11 (بند ب): تصمیم نقطهٔ شروع — ادامه از آخرین صفحهٔ کامل-ذخیره‌شده ----
  const integration = getIntegrationRepository();
  const savedCp = await integration.getSyncCheckpoint("listings");
  const existingCount = await repo.countEnrichment().then((c) => c.total).catch(() => 0);
  const cycle = resolveCycleStart(savedCp, pageSize, existingCount);
  out.resumedFromPage = cycle.resumed ? cycle.startPage : undefined;
  out.cycleId = cycle.cycleId;
  let lastCompleted = cycle.lastCompletedPage;
  let savedTotalAtSource = savedCp?.totalAtSource ?? 0;
  let reachedEndPage = 1;

  // ═══ PN-028/خامساً-الف — گذر سرِ تازه (Fresh-Head pass) ═══
  // شاهد داده: فهرست ARM «جدیدترین‌اول» است (صعود کدآگهی با extractedA در نخستین
  // چرخه = ۰٫۰). رکوردهای امروز/ساعات اخیر همیشه در صفحهٔ ۱ اند؛ اما ازسرگیریِ
  // checkpoint از میانهٔ فهرست ادامه می‌کرد ⇒ موارد تازه فقط پس از دور کامل به
  // فهرست می‌رسید (تاخیر چندساعته/چندکلیکی). درمان: هر اجرا که از صفحهٔ >۱ ادامه
  // می‌دهد، نخست یک صفحهٔ ۱ کامل می‌خواند و upsert می‌کند (بی‌اثر و idempotent)
  // — پس با همان اولین کلیکِ «بروزرسانی»، موارد امروز در فهرست اند.
  if (cycle.startPage > 1) {
    try {
      const head = await fetchListPage(token, MELK_ENDPOINTS.arm.propertiesList, 1, pageSize, savedTotalAtSource);
      const headInputs = head.rows
        .map((r) => mapArmPropertyListRow(r))
        .filter((r): r is PropertyBulkInput => r !== null);
      if (headInputs.length > 0) {
        const headStats = await repo.upsertBulk(headInputs, { sourceRunId: runId });
        out.fetched += headInputs.length;
        out.created += headStats.created;
        out.updated += headStats.updated;
        out.duplicates += headStats.duplicates;
        out.errors += headStats.errors;
        out.freshHead = headInputs.length;
      }
      if (head.total > 0) {
        out.totalAtSource = head.total;
        savedTotalAtSource = savedTotalAtSource || head.total;
      }
    } catch {
      // گذر سرِ تازه بهترین-تلاش است — شکستش هرگز چرخهٔ اصلی را متوقف نمی‌کند
    }
  }

  try {
    let page = cycle.startPage;
    let endPage = page;
    const pagesBudget = cycle.resumed ? Math.max(1, maxPages - 1) : maxPages;
    do {
      const { rows, total, totalPages: tp } = await fetchListPage(token, MELK_ENDPOINTS.arm.propertiesList, page, pageSize, savedTotalAtSource);
      out.totalAtSource = total;
      savedTotalAtSource = savedTotalAtSource || total;
      endPage = Math.min(tp, page + pagesBudget - 1);
      out.pages = page;
      const inputs = rows
        .map((r) => mapArmPropertyListRow(r))
        .filter((r): r is PropertyBulkInput => r !== null);
      out.fetched += inputs.length;
      const stats = await repo.upsertBulk(inputs, { sourceRunId: runId });
      out.created += stats.created;
      out.updated += stats.updated;
      out.duplicates += stats.duplicates;
      out.errors += stats.errors;
      // داده نوشته شد ⇒ حالا checkpoint جلو می‌رود (ترتیب حیاتی — حفره داده ممنوع)
      lastCompleted = page;
      await advanceCheckpoint("listings", { cycleId: cycle.cycleId, pageSize, lastCompletedPage: lastCompleted, totalPages: tp, totalAtSource: total }, "in-progress");
      page += 1;
      if (page <= endPage) await sleep(catalogRateMs());
    } while (page <= endPage);
    // چرخه به انتها رسید؟ (آخرین صفحهٔ کامل = totalPages) + گارد پوشش P6530/گام ۲:
    // علامت complete فقط با پوشش ≥ ۹۰٪ شمارش منبع — پاسخ معیوبِ «پایان زودرس» هرگز
    // چرخهٔ ناقص را کامل جا نمی‌زند (شاهد: چرخهٔ درخواست‌ها در صفحهٔ ۱۲۱ از ۴۰۸)
    const finalCp = await integration.getSyncCheckpoint("listings");
    if (finalCp && finalCp.lastCompletedPage >= endPage) {
      const coverage = await repo.countEnrichment().then((c) => c.total).catch(() => 0);
      if (hasEnoughCoverage(coverage, out.totalAtSource || savedTotalAtSource)) {
        await advanceCheckpoint("listings", { cycleId: cycle.cycleId, pageSize, lastCompletedPage: finalCp.lastCompletedPage, totalPages: endPage, totalAtSource: out.totalAtSource }, "complete");
      } else {
        // پوشش ناکافی — چرخه باز می‌ماند تا دفعهٔ بعد از همان‌جا ادامه یابد
        await advanceCheckpoint("listings", { cycleId: cycle.cycleId, pageSize, lastCompletedPage: finalCp.lastCompletedPage, totalPages: endPage, totalAtSource: out.totalAtSource || savedTotalAtSource }, "in-progress");
      }
    }
    reachedEndPage = endPage;
    out.ok = true;
    out.checkpoint = checkpointView(lastCompleted, endPage, lastCompleted >= endPage ? "complete" : "in-progress", out.totalAtSource, savedTotalAtSource);
  } catch (err) {
    out.errorCode = (err as { code?: string })?.code ?? "UNKNOWN";
    // خطا = دادهٔ تا اینجا محفوظ؛ checkpoint روی آخرین صفحهٔ کامل ایستاده — دفع بعد از همان‌جا ادامه
    out.checkpoint = checkpointView(lastCompleted, Math.max(reachedEndPage, lastCompleted), "in-progress", out.totalAtSource, savedTotalAtSource);
  }
  out.durationMs = Date.now() - started;
  return out;
}

/** همگام‌سازی کامل لایهٔ فهرست درخواست‌ها → RequestRecord (source='arm') — با نقطهٔ ازسرگیری */
export async function syncArmRequestsCatalog(
  token: string,
  opts: { pageSize?: number; maxPages?: number; startPage?: number; repos?: { request?: RequestRepository } } = {}
): Promise<ArmCatalogSyncResult> {
  const started = Date.now();
  const repo = opts.repos?.request ?? getRequestRepository();
  // pageSize پیش‌فرض ۵۰ — صفحهٔ کوچک عین رفتار خود سامانه پایدار است (پروب: ۵۰۰ => ۶۰ثانیه+)
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 100);
  const maxPages = Math.min(opts.maxPages ?? MAX_PAGES, MAX_PAGES);
  const runId = `p6510-requests-${randomUUID().slice(0, 8)}`;
  const out: ArmCatalogSyncResult = {
    entity: "requests", ok: false, pages: 0, fetched: 0, created: 0, updated: 0,
    duplicates: 0, errors: 0, totalAtSource: 0, durationMs: 0,
  };

  // ---- P6.5-11 (بند ب): تصمیم نقطهٔ شروع — checkpoint بر startPage صریح اولویت دارد ----
  const integration = getIntegrationRepository();
  const savedCp = await integration.getSyncCheckpoint("requests");
  const existingCount = await repo.countArmSource().catch(() => 0);
  const cycle = resolveCycleStart(savedCp, pageSize, existingCount);
  // startPage صریح فقط وقتی هیچ چرخهٔ ناتمامی نیست (سازگاری با اسکریپت شبانهٔ قدیمی)
  const startPage = cycle.resumed ? cycle.startPage : Math.max(1, opts.startPage ?? 1);
  out.resumedFromPage = cycle.resumed ? startPage : undefined;
  out.cycleId = cycle.cycleId;
  let lastCompleted = cycle.lastCompletedPage;
  let savedTotalAtSource = savedCp?.totalAtSource ?? 0;
  let reachedEndPage = 1;

  // ═══ PN-028/خامساً-الف — گذر سرِ تازه (Fresh-Head pass) — عین آگهی‌ها ═══
  // فهرست درخواست‌های ARM نیز «جدیدترین‌اول» است؛ رکوردهای امروز در صفحهٔ ۱.
  // هر ازسرگیریِ میانهٔ چرخه، نخست صفحهٔ ۱ را upsert می‌کند تا موارد تازه با
  // همان اولین کلیکِ بروزرسانی در فهرست M2 ظاهر شوند (idempotent — بی‌اثر).
  if (startPage > 1) {
    try {
      const { loadTypeMaps } = await import("./type-registry");
      const headMaps = await loadTypeMaps().catch(() => undefined);
      const head = await fetchListPage(token, MELK_ENDPOINTS.arm.requestsList, 1, pageSize, savedTotalAtSource);
      const headInputs = head.rows
        .map((r) => mapArmRequestListRow(r, headMaps))
        .filter((r): r is ArmRequestBulkRow => r !== null);
      if (headInputs.length > 0) {
        const headStats = await repo.upsertArmBulk(headInputs, { sourceRunId: runId });
        out.fetched += headInputs.length;
        out.created += headStats.created;
        out.updated += headStats.updated;
        out.duplicates += headStats.duplicates;
        out.errors += headStats.errors;
        out.freshHead = headInputs.length;
      }
      if (head.total > 0) {
        out.totalAtSource = head.total;
        savedTotalAtSource = savedTotalAtSource || head.total;
      }
    } catch {
      // گذر سرِ تازه بهترین-تلاش است — شکستش هرگز چرخهٔ اصلی را متوقف نمی‌کند
    }
  }

  try {
    let page = startPage;
    let endPage = page; // سقف نسبی: maxPages صفحه از نقطهٔ شروع (نه سقف مطلق شمارهٔ صفحه)
    const pagesBudget = cycle.resumed ? Math.max(1, maxPages - 1) : maxPages;
    // P6547/گام دوم — نقشه‌های شناسه→نام فهرست‌های مرجع (tradeType/buildingType/…) — یک‌بار در هر اجرا
    const { loadTypeMaps } = await import("./type-registry");
    const typeMaps = await loadTypeMaps().catch(() => undefined);
    do {
      const { rows, total, totalPages: tp } = await fetchListPage(token, MELK_ENDPOINTS.arm.requestsList, page, pageSize, savedTotalAtSource);
      out.totalAtSource = total;
      savedTotalAtSource = savedTotalAtSource || total;
      endPage = Math.min(tp, page + pagesBudget - 1);
      out.pages = page;
      const inputs = rows
        .map((r) => mapArmRequestListRow(r, typeMaps))
        .filter((r): r is ArmRequestBulkRow => r !== null);
      out.fetched += inputs.length;
      const stats = await repo.upsertArmBulk(inputs, { sourceRunId: runId });
      out.created += stats.created;
      out.updated += stats.updated;
      out.duplicates += stats.duplicates;
      out.errors += stats.errors;
      // داده نوشته شد ⇒ حالا checkpoint جلو می‌رود
      lastCompleted = page;
      await advanceCheckpoint("requests", { cycleId: cycle.cycleId, pageSize, lastCompletedPage: lastCompleted, totalPages: tp, totalAtSource: total }, "in-progress");
      page += 1;
      if (page <= endPage) await sleep(catalogRateMs());
    } while (page <= endPage);
    const finalCp = await integration.getSyncCheckpoint("requests");
    if (finalCp && finalCp.lastCompletedPage >= endPage) {
      // P6530/گام ۲ (نکتهٔ بسیار مهم ۳) — گارد پوشش: ۷٬۳۹۸ رکورد در برابر ۲۰٬۳۹۲ منبع
      // یعنی چرخه ناقص است؛ علامت complete ممنوع تا پوشش ≥ ۹۰٪ برسد
      const coverage = await repo.countArmSource().catch(() => 0);
      if (hasEnoughCoverage(coverage, out.totalAtSource || savedTotalAtSource)) {
        await advanceCheckpoint("requests", { cycleId: cycle.cycleId, pageSize, lastCompletedPage: finalCp.lastCompletedPage, totalPages: endPage, totalAtSource: out.totalAtSource }, "complete");
      } else {
        await advanceCheckpoint("requests", { cycleId: cycle.cycleId, pageSize, lastCompletedPage: finalCp.lastCompletedPage, totalPages: endPage, totalAtSource: out.totalAtSource || savedTotalAtSource }, "in-progress");
      }
    }
    reachedEndPage = endPage;
    out.ok = true;
    out.checkpoint = checkpointView(lastCompleted, endPage, lastCompleted >= endPage ? "complete" : "in-progress", out.totalAtSource, savedTotalAtSource);
  } catch (err) {
    out.errorCode = (err as { code?: string })?.code ?? "UNKNOWN";
    out.checkpoint = checkpointView(lastCompleted, Math.max(reachedEndPage, lastCompleted), "in-progress", out.totalAtSource, savedTotalAtSource);
  }
  out.durationMs = Date.now() - started;
  return out;
}

// ==========================================================================
// لایه ۲ — غنی‌سازی تماس/آدرس (برش‌برش با نرخ‌محدود)
// ==========================================================================

/** جزئیات آگهی → افزودنی‌های ساختاری (آدرس دقیق + متراژ/اتاق/طبقه + دسته‌بندی)
 * PN-018: صادر شد برای تست نرمال‌ساز دامنه‌دار (ریشهٔ سرریز Int32) */
export function detailsToPropertyExtras(
  detailsPayload: unknown
): Partial<PropertyBulkInput> & { detailsJson?: string | null } {
  const extras: Partial<PropertyBulkInput> & { detailsJson?: string | null } = {};
  if (!detailsPayload || typeof detailsPayload !== "object") return extras;

  const address = extractAddress(detailsPayload, null);
  if (address) extras.address = address;

  // P6521/M1 — کوی/پلاک دفاعی: اگر payload جزئیات فیلد جداگانه داشته باشد و هنوز در آدرس
  // نیامده باشد، به انتهای آدرس الحاق می‌شود (منبع فعلی فیلد جدا ندارد — آدرس‌های ۳۳۵گانهٔ
  // دارای «کوی» و ۴۲گانهٔ دارای «پلاک» همین‌طور داخل متن آدرس‌اند؛ این گارد برای آینده است).
  if (address && detailsPayload && typeof detailsPayload === "object") {
    const dp = detailsPayload as RawRow;
    const kooi = pickStr(dp, ["kooi", "alley", "کوی"]);
    const plak = pickStr(dp, ["plak", "plot", "buildingNumber", "پلاک"]);
    const parts: string[] = [];
    if (kooi && !address.includes(kooi)) parts.push(`کوی ${kooi}`);
    if (plak && !address.includes(plak)) parts.push(`پلاک ${plak}`);
    if (parts.length > 0) extras.address = `${address}، ${parts.join("، ")}`;
  }

  const items = extractDetailItems(detailsPayload);
  if (items.length > 0) extras.detailsJson = JSON.stringify(items);
  const byName = new Map<string, string>();
  const raw = detailsPayload as RawRow;
  if (Array.isArray(raw.details)) {
    for (const d of raw.details as RawRow[]) {
      const name = pickStr(d, ["name"]);
      const value = pickStr(d, ["value"]);
      if (name && value) byName.set(name, value);
    }
  }
  // دامنه‌های معتبر per-field (عین extractRequestInputs بند ۲۷۸) — سناریوی زندهٔ PN-018/T2+T3:
  // آگهی ۴۸۸۱۳ خود سامانهٔ ARM برچسب «طبقه» را با ارزش قیمتی ۱۶٬۵۰۰٬۰۰۰٬۰۰۰ پر کرده بود؛
  // مقدار خام در detailsJson/rawArea محفوظ می‌ماند (دادهٔ مقدس) اما ستون تایپ‌دار Int
  // فقط دامنهٔ معنادار می‌پذیرد — وگرنه یک ردیف کثیف همهٔ findManyها را می‌کشد (سرریز Int32 پریدا).
  const meterage = byName.get("space");
  if (meterage && /^\d+([.,]\d+)?$/.test(meterage)) {
    extras.rawArea = meterage; // لایهٔ خام عین منبع — حتی خارج از دامنه
    const m = Number(meterage.replace(",", "."));
    if (m >= 1 && m <= 5000) extras.meterage = m;
  }
  const rooms = byName.get("room_whole");
  if (rooms && /^\d+$/.test(rooms)) {
    const r = Number(rooms);
    if (r >= 0 && r <= 30) extras.rooms = r;
  }
  const floor = byName.get("floor");
  if (floor && /^\d+$/.test(floor)) {
    const f = Number(floor);
    if (f >= 0 && f <= 200) extras.floor = f;
  }
  const year = byName.get("year");
  if (year && /^\d{4}$/.test(year)) {
    const y = Number(year);
    if (y >= 1300 && y <= 1450) extras.buildYear = y;
  }

  const category = raw.propertyCategory as RawRow | undefined;
  if (category && typeof category === "object") {
    extras.tradeTypeName = pickStr(category, ["tradeType"]);
    extras.propertyTypeName = pickStr(category, ["propertyType"]);
  }
  return extras;
}

/**
 * P6530/گام ۲ (بند ۴.۱) — استخراج دفاعی «قیمت متقاضی از/تا» از payload جزئیات ARM.
 * فرم درخواست خود سامانه فیلدهای «قیمت کل از/تا» را در فرم پویای inputs دارد؛
 * کلیدهای محتمل (عین الگوی Recon) با گارد نوع بررسی می‌شوند. ارقام فارسی/حروف
 * پاک‌سازی می‌شوند (parseAmount الگوی bulk). خروجی تهی = منبع قیمت نداشت.
 */
export function extractRequestPriceRange(payload: unknown): { from: number | null; to: number | null } {
  const out = { from: null as number | null, to: null as number | null };
  if (!payload || typeof payload !== "object") return out;
  const root = payload as Record<string, unknown>;
  const containers: Array<Record<string, unknown>> = [root];
  // data تودرتو (پاکت Nest) + inputs فرم پویا
  if (root["data"] && typeof root["data"] === "object" && root["data"] !== payload) {
    containers.push(root["data"] as Record<string, unknown>);
  }
  for (const d of containers) {
    if (d["inputs"] && typeof d["inputs"] === "object" && !Array.isArray(d["inputs"])) {
      containers.push(d["inputs"] as Record<string, unknown>);
    }
  }
  /** تبدیل ایمن متن/عدد (حتی با ارقام فارسی و جداکننده) → عدد تومانی */
  const parseNum = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.round(v);
    if (typeof v !== "string") return null;
    const norm = v
      .replace(/[\u066C\u066B,،٬\s]/g, "")
      .replace(/[\u06F0-\u06F9]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
    const n = Number(norm);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  const tryKeys = [
    ["priceFrom", "totalPriceFrom", "minPrice", "price_from", "fromPrice"],
    ["priceTo", "totalPriceTo", "maxPrice", "price_to", "toPrice"],
  ] as const;
  for (const c of containers) {
    for (let i = 0; i < 2; i += 1) {
      const slot = i === 0 ? "from" : "to";
      if (out[slot] !== null) continue;
      for (const k of tryKeys[i]) {
        const v = c[k];
        if (v === undefined || v === null) continue;
        const parsed = parseNum(v);
        if (parsed !== null) {
          out[slot] = parsed;
          break;
        }
      }
    }
  }
  return out;
}

/**
 * P6530/گام ۲ (بند ۴.۱) — استخراج دفاعی «دسته‌بندی درخواست» از payload جزئیات ARM.
 * دسته‌بندی‌های سامانه ملک تبریز (نکته ۴): خرید / پیش خرید / رهن و اجاره / مشارکت در ساخت.
 * فقط مقادیر معتبرِ شناخته‌شده برمی‌گردد (صفر جعل)؛ نامعتبر = null.
 */
export function extractRequestTradeType(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const containers: Array<Record<string, unknown>> = [root];
  if (root["data"] && typeof root["data"] === "object" && root["data"] !== payload) {
    containers.push(root["data"] as Record<string, unknown>);
  }
  const VALID = ["خرید", "پیش خرید", "رهن و اجاره", "مشارکت در ساخت"];
  const norm = (v: string): string => v.replace(/\u200c/g, " ").replace(/\s+/g, " ").trim();
  for (const c of containers) {
    for (const k of ["nameRequest", "tradeType", "tradeTypeName", "requestType", "category"]) {
      const v = c[k];
      if (typeof v === "string") {
        const t = norm(v);
        if (VALID.includes(t)) return t;
      } else if (v && typeof v === "object") {
        const name = (v as Record<string, unknown>)["name"] ?? (v as Record<string, unknown>)["title"];
        if (typeof name === "string") {
          const t = norm(name);
          if (VALID.includes(t)) return t;
        }
      }
    }
  }
  return null;
}

/**
 * P6546/گام دوم — استخراج «نوع ملک درخواستی» و «نوع ساختمان» از payload جزئیات درخواست ARM.
 * ساختار خود سامانه: propertyCategory: { tradeType, propertyType, buildingType? } +
 * فیلدهای مسطح همپوشان. خروجی تهی = منبع مقدار نداشت (خنثی‌سازی صادقانه).
 */
export function extractRequestPropertyTypes(payload: unknown): { propertyTypeName: string | null; buildingTypeName: string | null } {
  const out = { propertyTypeName: null as string | null, buildingTypeName: null as string | null };
  if (!payload || typeof payload !== "object") return out;
  const root = payload as Record<string, unknown>;
  const containers: Array<Record<string, unknown>> = [root];
  if (root["data"] && typeof root["data"] === "object" && root["data"] !== payload) {
    containers.push(root["data"] as Record<string, unknown>);
  }
  const nameOf = (v: unknown): string | null => {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object") {
      const n = (v as Record<string, unknown>)["name"] ?? (v as Record<string, unknown>)["title"];
      if (typeof n === "string" && n.trim()) return n.trim();
    }
    return null;
  };
  for (const c of containers) {
    const cat = c["propertyCategory"];
    if (cat && typeof cat === "object") {
      const pc = cat as Record<string, unknown>;
      out.propertyTypeName = out.propertyTypeName ?? nameOf(pc["propertyType"]) ?? nameOf(pc["propertyTypeName"]);
      out.buildingTypeName = out.buildingTypeName ?? nameOf(pc["buildingType"]) ?? nameOf(pc["buildingTypeName"]);
    }
    out.propertyTypeName = out.propertyTypeName ?? nameOf(c["propertyType"]) ?? nameOf(c["propertyTypeName"]);
    out.buildingTypeName = out.buildingTypeName ?? nameOf(c["buildingType"]) ?? nameOf(c["buildingTypeName"]);
  }
  return out;
}

/**
 * P6521/M2 — استخراج دفاعی منطقه‌های منتخب درخواست از payload جزئیات ARM.
 * شکل دقیق payload جزئیات در باندل مستند نشده (Recon §۲ — کشف مسیر بدون پروب داده)؛
 * پس هر کلید محتمل را با گارد نوع بررسی می‌کنیم (آرایهٔ رشته یا آرایهٔ اشیای name دار).
 * خروجی: نام‌های یکتا به ترتیب ظهور؛ ورودی بی‌منطقه = آرایهٔ خالی.
 */
export function extractRequestAreas(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  const out: string[] = [];
  const push = (v: unknown): void => {
    if (typeof v === "string" && v.trim().length > 0) {
      const name = v.trim();
      if (!out.includes(name)) out.push(name);
    } else if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      const name = obj["name"] ?? obj["title"];
      if (typeof name === "string" && name.trim().length > 0) {
        const trimmed = name.trim();
        if (!out.includes(trimmed)) out.push(trimmed);
      }
    }
  };
  for (const key of ["relatedAreas", "areas", "area", "relatedLines", "lines"]) {
    const v = p[key];
    if (Array.isArray(v)) v.forEach(push);
    else if (v) push(v);
  }
  // data تودرتو (پاکت Nest)
  if (p["data"] && typeof p["data"] === "object" && p["data"] !== payload) {
    for (const name of extractRequestAreas(p["data"])) {
      if (!out.includes(name)) out.push(name);
    }
  }
  return out;
}

/**
 * غنی‌سازی برشی آگهی‌ها — تا maxRows ردیفِ در انتظار (جدیدترین اول):
 * owner → نام/موبایل مالک · details → آدرس دقیق و مشخصات.
 * ردیف‌های موفق/بی‌داده با extractionBatchId علامت می‌خورند (دیگر دوباره پرسیده نمی‌شوند).
 */
export async function enrichArmListings(
  token: string,
  opts: { maxRows?: number; repos?: { property?: PropertyRecordRepository }; rowIds?: string[] } = {}
): Promise<ArmCatalogEnrichResult> {
  const started = Date.now();
  const repo = opts.repos?.property ?? getPropertyRecordRepository();
  const maxRows = Math.min(Math.max(opts.maxRows ?? 100, 1), 500);
  const batchId = `p6510-enr-l-${randomUUID().slice(0, 8)}`;
  const cfg = getMelkApiConfig();
  const out: ArmCatalogEnrichResult = {
    entity: "listings", ok: true, attempted: 0, enriched: 0, missingAtSource: 0,
    failed: 0, remaining: 0, total: 0, durationMs: 0,
  };

  const pending = await repo.listPendingEnrichment(maxRows, opts.rowIds);
  const counts = await repo.countEnrichment();
  out.total = counts.total;

  for (const row of pending) {
    out.attempted += 1;
    const input: PropertyBulkInput = {
      id: row.id,
      propertyCode: row.naturalKey,
      extractedAt: new Date(),
      extractionBatchId: batchId,
      normalizationVersion: "arm-catalog-v1",
    };
    let gotAny = false;
    /** خطای نرم = قطعی نیست (شبکه/سرور) — اگر هر دو زنجیره نرم‌شکست خوردند، ردیف علامت نمی‌خورد */
    let softFailures = 0;

    // ---- مالک ملک: نام و نام خانوادگی + شماره تماس ----
    try {
      const own = await armCall<unknown>({
        path: MELK_ENDPOINTS.arm.propertyOwner(row.id),
        baseUrl: cfg.armApiBase,
        token,
        timeoutMs: 45_000, // نقطهٔ سرد سامانه تا ~۴۰ثانیه (شاهد پروب)
        maxRetries: 0,
      });
      const person = extractPersonInfo(own.data);
      if (person) {
        const rawName = pickStr((own.data ?? {}) as RawRow, ["fullName", "lastName"]);
        const rawMobile = pickStr((own.data ?? {}) as RawRow, ["mobileNumber", "phoneNumber"]);
        if (rawName) input.rawOwnerName = rawName;
        if (rawMobile) input.rawOwnerMobile = rawMobile;
        // مالک ملک = rawOwnerName/rawOwnerMobile (B.3) — ownerName ستون کارشناس است و لمس نمی‌شود
        if (person.mobile) input.ownerMobile = person.mobile;
        if (rawName || person.mobile) gotAny = true;
      }
    } catch (err) {
      const e = err as { code?: string; httpStatus?: number; retryable?: boolean };
      if (e?.code === "UNAUTHORIZED") throw err; // انقضای توکن — کل اجرا متوقف و تمدید می‌شود
      // خطای ۴xx (نتیجهٔ قطعی: رکورد حذف‌شده/مجوز) ⇒ علامت می‌خورد؛ ۵xx/شبکه/مهلت ⇒ نرم (تلاش در برش بعدی)
      if (!isDefinitive4xx(e)) softFailures += 1;
    }

    // ---- جزئیات: آدرس دقیق + مشخصات فنی ----
    try {
      const det = await armCall<unknown>({
        path: MELK_ENDPOINTS.arm.propertyDetails(row.id),
        baseUrl: cfg.armApiBase,
        token,
        timeoutMs: 45_000,
        maxRetries: 0,
      });
      const extras = detailsToPropertyExtras(det.data);
      Object.assign(input, extras);
      if (Object.keys(extras).length > 0) gotAny = true;
    } catch (err) {
      const e = err as { code?: string };
      if (e?.code === "UNAUTHORIZED") throw err;
      softFailures += 1;
    }

    // هر دو زنجیره قطعی نبود ⇒ بدون علامت؛ در برش بعدی دوباره تلاش می‌شود
    if (softFailures >= 2) {
      out.failed += 1;
      await sleep(catalogRateMs());
      continue;
    }

    const stats = await repo.upsertBulk([input], { sourceRunId: batchId });
    if (stats.errors > 0) {
      out.failed += 1;
    } else if (gotAny) {
      out.enriched += 1;
    } else {
      out.missingAtSource += 1;
    }
    await sleep(catalogRateMs());
  }

  const after = await repo.countEnrichment();
  out.remaining = after.pending;
  out.total = after.total;
  out.durationMs = Date.now() - started;
  return out;
}

/**
 * غنی‌سازی برشی درخواست‌ها — تا maxRows ردیفِ در انتظار (جدیدترین اول):
 * applicant → نام و نام خانوادگی + شماره تماس درخواست‌دهنده.
 */
export async function enrichArmRequests(
  token: string,
  opts: { maxRows?: number; repos?: { request?: RequestRepository }; rowIds?: string[] } = {}
): Promise<ArmCatalogEnrichResult> {
  const started = Date.now();
  const repo = opts.repos?.request ?? getRequestRepository();
  const maxRows = Math.min(Math.max(opts.maxRows ?? 100, 1), 500);
  const batchId = `p6510-enr-r-${randomUUID().slice(0, 8)}`;
  const cfg = getMelkApiConfig();
  const out: ArmCatalogEnrichResult = {
    entity: "requests", ok: true, attempted: 0, enriched: 0, missingAtSource: 0,
    failed: 0, remaining: 0, total: 0, durationMs: 0,
  };

  const pending = await repo.listPendingArmEnrichment(maxRows, opts.rowIds);
  const counts = await repo.countArmEnrichment();
  out.total = counts.total;

  for (const row of pending) {
    out.attempted += 1;
    const input: ArmRequestBulkRow = {
      id: row.id,
      requestCode: row.naturalKey,
      extractedAt: new Date(),
      extractionBatchId: batchId,
      normalizationVersion: "arm-catalog-v1",
    };
    let gotAny = false;
    /** خطای نرم = قطعی نیست (شبکه/سرور) — ردیف علامت نمی‌خورد تا در برش بعدی دوباره تلاش شود */
    let softFail = false;
    try {
      const app = await armCall<unknown>({
        path: MELK_ENDPOINTS.arm.requestApplicant(row.id),
        baseUrl: cfg.armApiBase,
        token,
        timeoutMs: 45_000,
        maxRetries: 0,
      });
      const person = extractPersonInfo(app.data);
      if (person) {
        const rawName = pickStr((app.data ?? {}) as RawRow, ["fullName", "lastName"]);
        const rawMobile = pickStr((app.data ?? {}) as RawRow, ["mobileNumber", "phoneNumber"]);
        if (rawName) {
          input.rawCustomerName = rawName;
          input.customerName = rawName;
        }
        if (rawMobile) input.rawCustomerMobile = rawMobile;
        if (person.mobile) input.customerMobile = normalizeMobile(rawMobile ?? person.mobile);
        if (rawName || person.mobile) gotAny = true;
      }
    } catch (err) {
      const e = err as { code?: string; httpStatus?: number; retryable?: boolean };
      if (e?.code === "UNAUTHORIZED") throw err; // انقضای توکن — کل اجرا متوقف و تمدید می‌شود
      // ۴xx ⇒ نتیجهٔ قطعی (علامت می‌خورد)؛ ۵xx/شبکه/مهلت ⇒ نرم (برش بعدی)
      softFail = !isDefinitive4xx(e);
    }

    // P6521/M2 — منطقه‌های منتخب از جزئیات درخواست (بهترین-تلاش؛ خطا به غنی‌سازی تماس آسیب نمی‌زند)
    if (!softFail) {
      try {
        const det = await armCall<unknown>({
          path: MELK_ENDPOINTS.arm.requestDetails(row.id),
          baseUrl: cfg.armApiBase,
          token,
          timeoutMs: 45_000,
          maxRetries: 0,
        });
        const areaNames = extractRequestAreas(det.data);
        if (areaNames.length > 0) {
          input.areaNames = areaNames;
          gotAny = true;
        }
        // P6530/گام ۲ (بند ۴.۱) — قیمت متقاضی از/تا + دسته‌بندی از جزئیات درخواست
        const priceRange = extractRequestPriceRange(det.data);
        if (priceRange.from !== null) input.priceFrom = priceRange.from;
        if (priceRange.to !== null) input.priceTo = priceRange.to;
        const tradeType = extractRequestTradeType(det.data);
        if (tradeType) input.tradeTypeName = tradeType;
        // P6546/گام دوم — نوع ملک درخواستی + نوع ساختمان از جزئیات درخواست (غنی‌سازی ستون‌های فهرست)
        const propTypes = extractRequestPropertyTypes(det.data);
        if (propTypes.propertyTypeName) input.propertyTypeName = propTypes.propertyTypeName;
        if (propTypes.buildingTypeName) input.buildingTypeName = propTypes.buildingTypeName;
        if (priceRange.from !== null || priceRange.to !== null || tradeType || propTypes.propertyTypeName) gotAny = true;
      } catch {
        /* جزئیات درخواست بهترین-تلاش است — بدون علامت‌گذاری ردیف */
      }
    }

    if (softFail) {
      out.failed += 1;
      await sleep(catalogRateMs());
      continue;
    }

    const stats = await repo.upsertArmBulk([input], { sourceRunId: batchId });
    if (stats.errors > 0) {
      out.failed += 1;
    } else if (gotAny) {
      out.enriched += 1;
    } else {
      out.missingAtSource += 1;
    }
    await sleep(catalogRateMs());
  }

  const after = await repo.countArmEnrichment();
  out.remaining = after.pending;
  out.total = after.total;
  out.durationMs = Date.now() - started;
  return out;
}
