/**
 * آداپتورهای نگاشت داده واقعی سامانه ملک تبریز → مدل دامنه داشبورد
 * ------------------------------------------------------
 * ساختار ردیف‌های گزارش سامانه ARM (NestJS/Mongo) عمومی مستند نیست؛
 * آداپتور «بردبند» است: چند نام فیلد رایج را امتحان می‌کند و چیزی که
 * موجود است را نگاشت می‌کند. با تغییر نام فیلدها فقط همین فایل ویرایش
 * می‌شود.
 *
 * تاریخ‌ها: سامانه ARM با تقویم جلالی و قالب «YYYY/MM/DD» کار می‌کند
 * (کشف‌شده از باندل). تبدیل دوجهته جلالی↔میلادی پیاده‌سازی شده است.
 */

import type { CrmExpert, CrmTransaction, PropertyType } from "./types";
import { PROPERTY_TYPES } from "./types";

// ==========================================================================
// تبدیل تاریخ جلالی ↔ میلادی (الگوریتم استاندارد)
// ==========================================================================

export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy = jy <= 979 ? 621 : 1600;
  jy -= jy <= 979 ? 0 : 979;
  let days =
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  let gm = 0;
  while (gm < 13 && gd > sal_a[gm]) {
    gd -= sal_a[gm];
    gm++;
  }
  return [gy, gm, gd];
}

/** ISO (میلادی) → رشته جلالی «YYYY/MM/DD» برای پارامترهای API سامانه ARM */
export function isoToJalaliString(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

/**
 * تاریخ ورودی سامانه (جلالی «YYYY/MM/DD» یا ISO) → ISO میلادی
 * اعداد فارسی هم پذیرفته می‌شوند.
 */
export function anyDateStringToIso(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (!s) return null;
  // تبدیل ارقام فارسی/عربی به لاتین
  s = s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  s = s.replace(/[-.]/g, "/");

  // ISO میلادی (شامل زمان)
  if (/\d{4}-\d{2}-\d{2}T/.test(String(input))) {
    const d = new Date(String(input));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const parts = s.split("/").map((p) => Number(p));
  if (parts.length < 3 || parts.some((p) => !Number.isFinite(p))) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const [y, m, dd] = parts;
  // سال > 1300 → جلالی
  if (y > 1300 && y < 1600) {
    const [gy, gm, gd] = jalaliToGregorian(y, m, dd);
    return new Date(Date.UTC(gy, gm - 1, gd, 8, 30)).toISOString();
  }
  return new Date(Date.UTC(y, m - 1, dd, 8, 30)).toISOString();
}

// ==========================================================================
// خواندن بردبند فیلدها
// ==========================================================================

type Row = Record<string, unknown>;

function pick(row: Row, keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function pickStr(row: Row, keys: string[]): string {
  const v = pick(row, keys);
  if (v === undefined) return "";
  // مقادیر شیء (مثل realtor: {...}) از نگاشت مستقیم مستثنی‌اند؛
  // نگاشت تو در تو در فراخواننده انجام می‌شود.
  if (typeof v === "object") return "";
  return String(v).trim();
}

function pickNum(row: Row, keys: string[]): number {
  const v = pick(row, keys);
  if (v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[٬,،\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function pickId(row: Row, fallback: string): string {
  const v = pick(row, ["_id", "id", "code"]);
  if (v === undefined) return fallback;
  if (typeof v === "object") return String((v as Row).$oid ?? (v as Row).toString?.() ?? fallback);
  return String(v);
}

function normalizePropertyType(raw: string): PropertyType {
  const s = raw.trim();
  const direct = PROPERTY_TYPES.find((p) => p === s);
  if (direct) return direct;
  const contains = PROPERTY_TYPES.find((p) => s.includes(p));
  if (contains) return contains;
  // معادل‌های رایج
  if (/اپارتمان|آپارتمان|apartment|apartment/i.test(s)) return "آپارتمان";
  if (/کلنگ|تخریب/i.test(s)) return "کلنگی";
  if (/مغازه|تجار|shop|store/i.test(s)) return "مغازه";
  if (/ویلا|خانه|خانه ویلایی|house|villa/i.test(s)) return "خانه ویلایی";
  if (/اداری|دفتر|office/i.test(s)) return "دفتر اداری";
  if (/باغ|زمین|land|garden/i.test(s)) return "باغ";
  return "آپارتمان";
}

// ==========================================================================
// نگاشت ردیف گزارش معاملات → CrmTransaction
// ==========================================================================

/**
 * ردیف‌های گزارش «realtor-reports/traded-count-total» را به مدل معامله
 * داشبورد نگاشت می‌کند. نام فیلدها بردبند انتخاب می‌شوند تا با
 * تغییر ساختار پاسخ، فقط این تابع ویرایش شود.
 */
export function mapArmTradedRow(row: Row, index: number, page: number, limit: number): CrmTransaction | null {
  if (!row || typeof row !== "object") return null;

  const expertName =
    pickStr(row, ["realtorName", "realtor", "expertName", "fullName", "agentName", "name"]) ||
    pickStr((row.realtor ?? {}) as Row, ["fullName", "name"]) ||
    pickStr((row.expert ?? {}) as Row, ["fullName", "name"]) ||
    "نامشخص";

  const expertCode =
    pickStr(row, ["realtorCode", "expertCode", "personnelCode", "agentCode"]) ||
    pickStr((row.realtor ?? {}) as Row, ["code", "personalCode", "username"]) ||
    pickStr((row.expert ?? {}) as Row, ["code", "personalCode", "username"]) ||
    "";

  const listingCode =
    pickStr(row, ["propertyCode", "listingCode", "adCode", "advertisementCode", "property"]) ||
    pickStr((row.property ?? {}) as Row, ["code", "adCode"]) ||
    "";

  const requestCode =
    pickStr(row, ["requestCode", "requestCode", "demandCode", "request"]) ||
    pickStr((row.request ?? {}) as Row, ["code"]) ||
    null;

  const dealDateIso =
    anyDateStringToIso(
      pick(row, [
        "tradedAt",
        "dealDate",
        "createdAt",
        "date",
        "matchedAt",
        "updatedAt",
        "tradedDate",
      ])
    ) ?? new Date().toISOString();

  const price = pickNum(row, [
    "price",
    "finalPrice",
    "dealPrice",
    "totalPrice",
    "tradedPrice",
    "amount",
    "value",
  ]);

  const district =
    pickStr(row, ["district", "region", "zone", "area", "neighborhood", "address", "city"]) ||
    pickStr((row.property ?? {}) as Row, ["district", "region", "address"]) ||
    "نامشخص";

  const propertyTypeRaw =
    pickStr(row, ["propertyType", "type", "kind", "category"]) ||
    pickStr((row.property ?? {}) as Row, ["type", "propertyType", "category"]) ||
    "";

  const area = pickNum(row, ["area", "metraj", "squareMeters", "size", "areaSize"]);

  const commission = pickNum(row, ["commission", "fee", "reward", "commissionPrice"]);

  return {
    id: pickId(row, `arm-traded-${page}-${limit}-${index}-${Date.now()}`),
    dealDate: dealDateIso,
    listingCode: listingCode || "—",
    requestCode: requestCode || null,
    expertCode: expertCode || "—",
    expertName,
    price,
    district,
    propertyType: normalizePropertyType(propertyTypeRaw),
    area,
    commission,
  };
}

// ==========================================================================
// نگاشت ردیف کارشناس → CrmExpert
// ==========================================================================

/** ردیف‌های «realtors/list» را به مدل کارشناس داشبورد نگاشت می‌کند. */
export function mapArmRealtorRow(row: Row, index: number): CrmExpert | null {
  if (!row || typeof row !== "object") return null;

  const fullName =
    pickStr(row, ["fullName", "name", "realtorName", "displayName", "title"]) || "نامشخص";

  const personnelCode =
    pickStr(row, ["code", "personalCode", "personnelCode", "username", "mobile", "phone"]) || "";

  const mobile =
    pickStr(row, ["mobile", "phone", "phoneNumber", "cellphone", "tel"]) || "";

  const address =
    pickStr(row, ["address", "workAddress", "officeAddress", "location", "city"]) || "نامشخص";

  const branch =
    pickStr(row, ["branch", "office", "businessName", "teamName", "agency"]) || "شعبه مرکزی";

  const activeRaw = pick(row, ["active", "isActive", "status", "enabled"]);
  let active = true;
  if (typeof activeRaw === "boolean") active = activeRaw;
  else if (typeof activeRaw === "string") active = !/غیر|inactive|false|blocked|0/i.test(activeRaw);
  else if (typeof activeRaw === "number") active = activeRaw !== 0;

  const joinedAtIso =
    anyDateStringToIso(pick(row, ["createdAt", "joinedAt", "registerDate", "startDate"])) ??
    new Date(0).toISOString();

  return {
    id: pickId(row, `arm-realtor-${index}-${personnelCode}`),
    personnelCode: personnelCode || `بدون-کد-${index}`,
    fullName,
    mobile: mobile || "—",
    address,
    branch,
    active,
    joinedAt: joinedAtIso,
  };
}

// ==========================================================================
// استخراج لیست از پوشه‌های مختلف پاسخ سامانه
// ==========================================================================

/**
 * پاسخ‌های صفحه‌بندی سامانه در قالب‌های مختلفی برمی‌گردند:
 *  {data: [...]} | {data: {docs|rows|list|items|data: [...], count, totalPages}}
 * این تابع همه را به {rows, total} نرمال می‌کند.
 */
export function extractPagedList<T>(payload: unknown, mapRow: (row: Row, index: number) => T | null): { rows: T[]; total: number; totalPages?: number } {
  let list: unknown = payload;
  let total = 0;
  let totalPages: number | undefined;

  if (payload && typeof payload === "object") {
    const p = payload as Row;
    // data.docs / data.rows / data.data / data.list / data.items
    const inner = (p.data ?? p.docs ?? p.rows ?? p.list ?? p.items ?? p.result) as Row | undefined;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      list = (inner.docs ?? inner.rows ?? inner.data ?? inner.list ?? inner.items ?? inner.result ?? []) as unknown;
      total = Number(pick(inner as Row, ["count", "total", "totalDocs", "totalCount"]) ?? 0) || 0;
      totalPages = Number(pick(inner as Row, ["totalPages", "pages", "pageCount"]) ?? 0) || undefined;
    } else if (Array.isArray(inner)) {
      list = inner;
    }
    if (!total && Array.isArray(list)) total = list.length;
  }

  if (!Array.isArray(list)) list = [];
  const rows = (list as Row[])
    .map((row, i) => mapRow(row ?? {}, i))
    .filter((r): r is T => r !== null);
  if (!total) total = rows.length;
  return { rows, total, totalPages };
}
