/**
 * آداپتورهای نگاشت داده واقعی سامانه ملک تبریز → مدل دامنه داشبورد
 * ------------------------------------------------------
 * ✅ ساختار ردیف‌ها عیناً از صفحات رسمی سامانه ARM مهندسی معکوس شده:
 *   • TradedStatisticsPage (گزارش تطابق معاملات):
 *       propertyCode, propertyCustomer, requestCode, requestCustomer,
 *       contractDate, contractHolo, suggestedPropertyCount, eventsCount
 *       + خلاصه: totalCount, hasRequestEvent, hasSuggestedProperty, hasBoth
 *   • users-list-page (realtors/list):
 *       fullName, mobile, role.name, businessId.title, creator.fullName, createdAt, active
 *   • realtor-interactions-page:
 *       requestRealtorName, propertyRealtorName, count
 * آداپتور «بردبند» است: چند نام فیلد رایج را امتحان می‌کند و چیزی که
 * موجود است را نگاشت می‌کند. با تغییر نام فیلدها فقط همین فایل ویرایش
 * می‌شود.
 *
 * تاریخ‌ها: سامانه ARM با تقویم جلالی و قالب «YYYY/MM/DD» کار می‌کند
 * (کشف‌شده از باندل). تبدیل دوجهته جلالی↔میلادی در «src/lib/jalali.ts».
 */

import type {
  CommissionCityConfig,
  ContractRealtorShare,
  CrmContract,
  CrmExpert,
  CrmInteraction,
  CrmSupplyDemand,
  CrmTransaction,
  CrmVisit,
  PersonInfo,
  PriceIndexConfig,
  RefListItem,
  TradedSummary,
} from "./types";
import { anyDateStringToDate, gregorianToJalali, isoToJalaliString, jalaliToGregorian } from "@/lib/jalali";

// بازصدور برای استفاده سایر ماژول‌ها (تک‌منبع: lib/jalali)
export { gregorianToJalali, jalaliToGregorian, isoToJalaliString, anyDateStringToDate };

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

/** خواندن نام از شیء تو در تو: businessId.title، role.name، creator.fullName و… */
function pickNestedStr(row: Row, paths: string[]): string {
  for (const path of paths) {
    const segs = path.split(".");
    let cur: unknown = row;
    for (const s of segs) {
      if (cur === null || cur === undefined || typeof cur !== "object") {
        cur = undefined;
        break;
      }
      cur = (cur as Row)[s];
    }
    if (cur !== null && cur !== undefined && cur !== "" && typeof cur !== "object") {
      return String(cur).trim();
    }
  }
  return "";
}

// ==========================================================================
// نگاشت ردیف گزارش تطابق معاملات → CrmTransaction
// ==========================================================================

/**
 * ردیف‌های گزارش «realtor-reports/traded-count-total» را به مدل معامله
 * داشبورد نگاشت می‌کند — عین ستون‌های جدول خود سامانه:
 * «کد ملک/مالک»، «کد درخواست/درخواست‌دهنده»، «تاریخ معامله»،
 * «شماره هولوگرام»، «آگهی پیشنهادی»، «رویداد».
 */
export function mapArmTradedRow(row: Row, index: number, page: number, limit: number): CrmTransaction | null {
  if (!row || typeof row !== "object") return null;

  const propertyCode =
    pickStr(row, ["propertyCode", "property", "listingCode", "adCode"]) ||
    pickNestedStr(row, ["property.code", "advertisement.code"]);

  const propertyCustomer =
    pickStr(row, ["propertyCustomer", "propertyCustomerName", "propertyOwner", "ownerName"]) ||
    pickNestedStr(row, ["property.customer.fullName", "property.customer"]) ||
    null;

  const requestCode =
    pickStr(row, ["requestCode", "request", "demandCode"]) ||
    pickNestedStr(row, ["request.code"]) ||
    null;

  const requestCustomer =
    pickStr(row, ["requestCustomer", "requestCustomerName", "requesterName", "demanderName"]) ||
    pickNestedStr(row, ["request.customer.fullName", "request.customer"]) ||
    null;

  // تاریخ معامله — ستون contractDate خود سامانه (جلالی یا ISO)
  // P6.5-04-e-v2 — لایه ۱ حقیقت: رشته خام عین منبع پیش از هر تبدیلی ذخیره می‌شود
  const rawDate = pickStr(row, ["contractDate", "tradedAt", "dealDate", "createdAt", "date"]) || null;
  const contractDateDate = anyDateStringToDate(rawDate) ?? new Date();

  const contractHolo =
    pickStr(row, ["contractHolo", "holo", "hologram", "holoCode"]) || null;

  const suggestedPropertyCount = pickNum(row, ["suggestedPropertyCount", "suggestedCount"]);
  const eventsCount = pickNum(row, ["eventsCount", "eventCount"]);

  return {
    id: pickId(row, `arm-traded-${page}-${limit}-${index}-${Date.now()}`),
    contractDate: contractDateDate.toISOString(),
    rawDate,
    propertyCode: propertyCode || "—",
    propertyCustomer: propertyCustomer || null,
    requestCode: requestCode || null,
    requestCustomer: requestCustomer || null,
    contractHolo: contractHolo || null,
    suggestedPropertyCount,
    eventsCount,
  };
}

// ==========================================================================
// خلاصه گزارش تطابق (چهار شاخص بالای گزارش خود سامانه)
// ==========================================================================

/**
 * شیء data پاسخ «traded-count-total» شامل خلاصه گزارش است:
 * totalCount، hasRequestEvent، hasSuggestedProperty، hasBoth.
 */
export function mapArmTradedSummary(payload: unknown): TradedSummary | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Row;
  const s = {
    totalCount: pickNum(p, ["totalCount", "count", "total"]),
    hasRequestEvent: pickNum(p, ["hasRequestEvent", "requestEvent"]),
    hasSuggestedProperty: pickNum(p, ["hasSuggestedProperty", "suggestedProperty"]),
    hasBoth: pickNum(p, ["hasBoth", "both"]),
  };
  if (s.totalCount === 0 && s.hasRequestEvent === 0 && s.hasSuggestedProperty === 0 && s.hasBoth === 0) {
    return null;
  }
  return s;
}

// ==========================================================================
// نگاشت ردیف کارشناس (users-list / realtors) → CrmExpert
// ==========================================================================

/**
 * ردیف‌های «realtors/list» را به مدل کارشناس داشبورد نگاشت می‌کند —
 * عین ستون‌های users-list خود سامانه: نام و نام خانوادگی، شماره موبایل،
 * نقش مشتری، کسب و کار، ثبت کننده، زمان ثبت، فعال.
 */
export function mapArmRealtorRow(row: Row, index: number): CrmExpert | null {
  if (!row || typeof row !== "object") return null;

  const fullName =
    pickStr(row, ["fullName", "name", "realtorName", "displayName", "title"]) || "نامشخص";

  const personnelCode =
    pickStr(row, ["code", "personalCode", "personnelCode", "username"]) ||
    pickNestedStr(row, ["realtor.code", "user.code"]) ||
    "";

  const mobile = pickStr(row, ["mobile", "phone", "phoneNumber", "cellphone", "tel"]) || "";

  // نقش مشتری — مثل «کارشناس و مشاور فروش»
  const role =
    pickNestedStr(row, ["role.name", "role.label", "role"]) ||
    pickStr(row, ["roleName", "userType", "type"]) ||
    "نامشخص";

  // کسب و کار / شعبه
  const businessTitle =
    pickNestedStr(row, ["businessId.title", "business.title", "business", "businessName"]) ||
    pickStr(row, ["branch", "office", "teamName", "agency"]) ||
    "شعبه مرکزی";

  // ثبت‌کننده — مدیری که کاربر را ایجاد کرده
  const creator =
    pickNestedStr(row, ["creator.fullName", "creator.name", "creator"]) ||
    pickStr(row, ["creatorName"]) ||
    null;

  const activeRaw = pick(row, ["active", "isActive", "status", "enabled"]);
  let active = true;
  if (typeof activeRaw === "boolean") active = activeRaw;
  else if (typeof activeRaw === "string") active = !/غیر|inactive|false|blocked|0/i.test(activeRaw);
  else if (typeof activeRaw === "number") active = activeRaw !== 0;

  const createdAtDate =
    anyDateStringToDate(pick(row, ["createdAt", "joinedAt", "registerDate", "startDate"])) ??
    new Date(0);

  return {
    id: pickId(row, `arm-realtor-${index}-${personnelCode}`),
    personnelCode: personnelCode || `بدون-کد-${index}`,
    fullName,
    mobile: mobile || "—",
    role,
    businessTitle,
    creator,
    active,
    createdAt: createdAtDate.toISOString(),
  };
}

// ==========================================================================
// نگاشت ردیف تعاملات مشاوران → CrmInteraction
// ==========================================================================

/**
 * ردیف‌های «realtor-reports/realtor-interactions» را نگاشت می‌کند —
 * عین ستون‌های خود سامانه: «مشاور درخواست»، «مشاور آگهی»، «تعداد».
 */
export function mapArmInteractionRow(row: Row, index: number): CrmInteraction | null {
  if (!row || typeof row !== "object") return null;

  const requestRealtorName =
    pickStr(row, ["requestRealtorName", "requestRealtor", "demandRealtorName"]) ||
    pickNestedStr(row, ["requestRealtor.fullName", "requestRealtor"]) ||
    "";
  const propertyRealtorName =
    pickStr(row, ["propertyRealtorName", "propertyRealtor", "adRealtorName"]) ||
    pickNestedStr(row, ["propertyRealtor.fullName", "propertyRealtor"]) ||
    "";
  const count = pickNum(row, ["count", "interactionCount", "total"]);

  if (!requestRealtorName && !propertyRealtorName) return null;

  return {
    id: pickId(row, `arm-interaction-${index}-${requestRealtorName}-${propertyRealtorName}`),
    requestRealtorName: requestRealtorName || "نامشخص",
    propertyRealtorName: propertyRealtorName || "نامشخص",
    count: count || 0,
  };
}

// ==========================================================================
// نگاشت ردیف بازدید → CrmVisit (عین ستون‌های visits خود سامانه)
// ==========================================================================

/**
 * ردیف‌های «visits/list» را نگاشت می‌کند — عین ستون‌های خود سامانه:
 * «کد آگهی»، «درخواست دهنده»، «بررسی کننده»، «مشاور آگهی»،
 * «زمان بررسی»، «زمان ثبت»، «وضعیت».
 */
export function mapArmVisitRow(row: Row, index: number): CrmVisit | null {
  if (!row || typeof row !== "object") return null;

  const propertyCode =
    pickStr(row, ["propertyCode", "code", "property"]) ||
    pickNestedStr(row, ["property.code", "propertyId.code"]) ||
    "";
  const requesterName =
    pickStr(row, ["requesterName", "requester", "customerName", "requestCustomer"]) ||
    pickNestedStr(row, ["requester.fullName", "customer.fullName", "request.customer.fullName", "request.customer"]) ||
    "";
  const checkerName =
    pickStr(row, ["checkerName", "checker", "reviewerName", "reviewer"]) ||
    pickNestedStr(row, ["checker.fullName", "reviewer.fullName"]) ||
    "";
  const propertyRealtorName =
    pickStr(row, ["propertyRealtorName", "realtorName", "propertyRealtor"]) ||
    pickNestedStr(row, ["propertyRealtor.fullName", "realtor.fullName"]) ||
    "";

  if (!propertyCode && !requesterName && !checkerName) return null;

  const checkTimeDate = anyDateStringToDate(pick(row, ["checkTime", "checkedAt", "reviewTime", "reviewedAt"]));
  const createdAtDate = anyDateStringToDate(pick(row, ["createdAt", "registeredAt", "created_at"])) ?? new Date();
  const status = pickStr(row, ["status", "statusTitle", "state"]) ||
    pickNestedStr(row, ["status.name", "status.title"]) ||
    "";

  return {
    id: pickId(row, `arm-visit-${index}-${propertyCode}-${createdAtDate.getTime()}`),
    propertyCode: propertyCode || "—",
    requesterName: requesterName || "نامشخص",
    checkerName: checkerName || "نامشخص",
    propertyRealtorName: propertyRealtorName || "نامشخص",
    checkTime: checkTimeDate ? checkTimeDate.toISOString() : null,
    createdAt: createdAtDate.toISOString(),
    status: status || "ثبت‌شده",
  };
}

// ==========================================================================
// نگاشت ردیف عرضه و تقاضا → CrmSupplyDemand (عین گزارش خود سامانه)
// ==========================================================================

/**
 * ردیف‌های «realtor-reports/supply-demand» را نگاشت می‌کند —
 * عین ستون‌های خود سامانه: «بازه»، «تعداد آگهی»، «درصد درخواست»، «وضعیت».
 */
export function mapArmSupplyDemandRow(row: Row, index: number): CrmSupplyDemand | null {
  if (!row || typeof row !== "object") return null;

  const rangeTitle =
    pickStr(row, ["range", "rangeTitle", "title", "label", "priceRange"]) ||
    pickNestedStr(row, ["range.title", "range.name"]) ||
    "";
  if (!rangeTitle) return null;

  const propertyCount = pickNum(row, ["propertyCount", "advertisementsCount", "adCount", "count", "total"]);
  // درصد ممکن است ۰ تا ۱۰۰ یا ۰ تا ۱ باشد — نرمال‌سازی به درصد
  let requestPercent = pickNum(row, ["requestPercent", "requestPercentage", "percent", "requestRatio"]);
  if (requestPercent > 0 && requestPercent <= 1) requestPercent = requestPercent * 100;
  requestPercent = Math.round(requestPercent * 10) / 10;

  const status = pickStr(row, ["status", "statusTitle", "state"]) ||
    pickNestedStr(row, ["status.name", "status.title"]) ||
    "";

  return {
    id: pickId(row, `arm-supply-demand-${index}-${rangeTitle}`),
    rangeTitle,
    propertyCount,
    requestPercent,
    status: status || "—",
  };
}

// ==========================================================================
// استخراج اطلاعات تماس یک نفر از ساختار user سامانه ARM
// ==========================================================================

/**
 * استخراج «نام و نام خانوادگی + شماره تماس» از ساختار کاربر سامانه ARM —
 * این ساختار در پاسخ‌های properties/owner و requests/applicant مشترک است:
 *   { _id, firstName?, lastName?, fullName?, mobileNumber, phoneNumber?,
 *     extraUserInfo: [{ infos: [{ firstName, lastName, mobileNumber, userId }] }] }
 */
export function extractPersonInfo(payload: unknown): PersonInfo | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Row;

  // ۱) نام — مسیرهای مستقیم
  let firstName = pickStr(p, ["firstName", "first_name"]);
  let lastName = pickStr(p, ["lastName", "last_name"]);
  let fullName = pickStr(p, ["fullName", "full_name", "name"]);

  // ۲) نام — مسیر تو در تو extraUserInfo[].infos[0]
  if (!fullName && !firstName && !lastName) {
    const extra = Array.isArray(p.extraUserInfo) ? (p.extraUserInfo as unknown[]) : [];
    for (const e of extra) {
      if (!e || typeof e !== "object") continue;
      const infos = (e as Row).infos;
      if (!Array.isArray(infos) || infos.length === 0) continue;
      const info = infos[0];
      if (!info || typeof info !== "object") continue;
      const infoRow = info as Row;
      firstName = pickStr(infoRow, ["firstName", "first_name"]);
      lastName = pickStr(infoRow, ["lastName", "last_name"]);
      if (firstName || lastName) {
        if (!fullName) fullName = pickStr(infoRow, ["fullName", "name"]);
        break;
      }
    }
  }

  // ۳) شماره تماس — مستقیم یا از extraUserInfo
  let mobile = pickStr(p, ["mobileNumber", "mobile", "phoneNumber", "phone"]);
  if (!mobile) {
    const extra = Array.isArray(p.extraUserInfo) ? (p.extraUserInfo as unknown[]) : [];
    for (const e of extra) {
      if (!e || typeof e !== "object") continue;
      const infos = (e as Row).infos;
      if (!Array.isArray(infos) || infos.length === 0) continue;
      const infoRow = infos[0] as Row;
      mobile = pickStr(infoRow, ["mobileNumber", "mobile"]);
      if (mobile) break;
    }
  }

  const phone = pickStr(p, ["phoneNumber", "phone", "tel"]);
  const isRegisteredUser = Boolean(pick(p, ["_id", "id", "userId"]));

  const resolvedName =
    fullName ||
    [firstName, lastName].filter(Boolean).join(" ").trim();

  if (!resolvedName && !mobile) return null;

  // نرمال‌سازی شماره موبایل (ارقام فارسی/عربی → لاتین)
  const normalizedMobile = normalizeMobile(mobile);
  const normalizedPhone = phone ? String(phone).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))) : "";

  return {
    fullName: resolvedName || "نامشخص",
    mobile: normalizedMobile,
    phone: normalizedPhone,
    isRegisteredUser,
  };
}

/** نرمال‌سازی شماره موبایل: ارقام فارسی→لاتین، حذف جداکننده‌ها، پیشوند ۰ */
export function normalizeMobile(input: string): string {
  if (!input) return "";
  const latin = String(input).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  const digits = latin.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+98")) return `0${digits.slice(3)}`;
  if (digits.startsWith("98") && digits.length === 12) return `0${digits.slice(2)}`;
  return digits;
}

// ==========================================================================
// نگاشت جزئیات ساختاری (details) از پاسخ properties/details یا requests/details
// ==========================================================================

/**
 * جزئیات ساختاری آگهی/درخواست را از پاسخ details استخراج می‌کند:
 * ساختار واقعی: { details: [{ label, value, unit }], address, ... }
 */
export function extractDetailItems(payload: unknown): { label: string; value: string; unit: string }[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Row;
  const list = Array.isArray(p.details) ? (p.details as unknown[]) : [];
  const items: { label: string; value: string; unit: string }[] = [];
  for (const d of list) {
    if (!d || typeof d !== "object") continue;
    const dr = d as Row;
    const label = pickStr(dr, ["label", "title", "name", "key"]);
    const value = pickStr(dr, ["value", "val"]);
    const unit = pickStr(dr, ["unit", "unitTitle"]);
    if (label && value) items.push({ label, value, unit });
  }
  return items;
}

/** ساخت آدرس خوانا از پاسخ details + فیلدهای مکانی آگهی/درخواست */
export function extractAddress(payload: unknown, rowFallback: Row | null): string {
  const parts: string[] = [];
  if (payload && typeof payload === "object") {
    const p = payload as Row;
    const direct = pickStr(p, ["address", "fullAddress"]);
    if (direct) parts.push(direct);
    // عناوین مکانی تو در تو: state.name، city.name، area.name، line.name
    for (const key of ["state", "city", "area", "line"]) {
      const nested = pickNestedStr(p, [`${key}.name`, `${key}.title`]);
      if (nested) parts.push(nested);
    }
  }
  if (rowFallback && parts.length === 0) {
    const title = pickStr(rowFallback, ["title"]);
    if (title) parts.push(title);
    for (const key of ["state", "city", "area", "line"]) {
      const nested = pickNestedStr(rowFallback, [`${key}.name`, `${key}.title`]);
      if (nested) parts.push(nested);
    }
  }
  // حذف تکراری‌ها با حفظ ترتیب
  const unique = [...new Set(parts.map((s) => s.trim()).filter(Boolean))];
  return unique.join("، ");
}

// ==========================================================================
// استخراج لیست از پوشه‌های مختلف پاسخ سامانه
// ==========================================================================

/**
 * پاسخ‌های صفحه‌بندی سامانه در قالب‌های مختلفی برمی‌گردند:
 * {data: [...]} | {data: {docs|rows|list|items|data: [...], count, totalPages}}
 * این تابع همه را به {rows, total, totalPages} نرمال می‌کند.
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

// ==========================================================================
// قراردادها و اسناد (trade-overviews) — نگاشت از ساختار رسمی سامانه ARM
// ==========================================================================

/** نگاشت اشتراک حق‌السهم مشاور — عین primaryRealtorList/secondaryRealtorList */
function mapRealtorShare(entry: Row, role: "primary" | "secondary"): ContractRealtorShare | null {
  const name = pickNestedStr(entry, ["realtor.fullName", "realtor.name", "fullName", "name"]);
  if (!name) return null;
  const unitPercent = pickNum(entry, ["realtorUnit", "realtorsPercentage", "unitPercent"]);
  return {
    name,
    unitPercent,
    confirmation: pickStr(entry, ["confirmation"]) || "wait",
    description: pickStr(entry, ["description"]) || undefined,
    role,
  };
}

/**
 * نگاشت ردیف لیست trade-overviews → CrmContract (بدون خریداران/فروشندگان).
 * عین ستون‌های جدول خود سامانه: هولوگرام/کد درخواست/کد آگهی، نوع قرارداد،
 * وضعیت، ثبت‌کننده، زمان ثبت.
 */
export function mapArmContractRow(row: Row): CrmContract | null {
  const id = pickId(row, "");
  if (!id) return null;
  const createdAtRaw = anyDateStringToDate(pickStr(row, ["createdAt"]));
  // P6.5-04-e-v2 — لایه ۱ حقیقت: تاریخ خام عین منبع (غنی‌سازی از info در mergeArmContractInfo)
  const rawDate = pickStr(row, ["createdAt"]) || null;
  return {
    id,
    rawDate,
    status: pickStr(row, ["status"]) || "preDefined",
    contractHolo: pickStr(row, ["contractHolo"]) || null,
    propertyCode: pickStr(row, ["propertyCode"]) || null,
    requestCode: pickStr(row, ["requestCode"]) || null,
    contractType: pickNestedStr(row, ["contractType.label", "contractType"]) || null,
    creatorName: pickNestedStr(row, ["creator.identifier.fullName", "creator.fullName"]) || null,
    createdAt: createdAtRaw ? createdAtRaw.toISOString() : null,
    contractDate: null,
    documentDate: null,
    deliveryDate: null,
    propertyTitle: null,
    propertyAddress: null,
    buyers: [],
    sellers: [],
    realtorShares: [],
    canAddRealtor: pick(row, ["canAddRealtor"]) === true,
  };
}

/**
 * ادغام جزئیات «trade-overviews/info/{id}» در قرارداد —
 * تاریخ سند/قرارداد/تحویل، عنوان و آدرس ملک، خریداران، فروشندگان و
 * مشاوران با حق‌السهم (اصلی و فرعی).
 */
export function mergeArmContractInfo(contract: CrmContract, infoPayload: unknown): CrmContract {
  const info = (infoPayload && typeof infoPayload === "object" ? (infoPayload as Row) : {}) as Row;
  const toDate = (keys: string[]): string | null => {
    const d = anyDateStringToDate(pickStr(info, keys));
    return d ? d.toISOString() : null;
  };

  const buyersRaw = Array.isArray(info.buyerList) ? (info.buyerList as Row[]) : [];
  const sellersRaw = Array.isArray(info.sellerList) ? (info.sellerList as Row[]) : [];
  const primaryRaw = Array.isArray(info.primaryRealtorList) ? (info.primaryRealtorList as Row[]) : [];
  const secondaryRaw = Array.isArray(info.secondaryRealtorList) ? (info.secondaryRealtorList as Row[]) : [];

  return {
    ...contract,
    // P6.5-04-e-v2 — لایه ۱ حقیقت: تاریخ خام قرارداد از info عین منبع (اولویت با detail)
    rawDate: pickStr(info, ["contractDate"]) || contract.rawDate,
    contractDate: toDate(["contractDate"]) ?? contract.createdAt,
    documentDate: toDate(["documentDate"]),
    deliveryDate: toDate(["contractPropertyDate"]),
    propertyTitle: pickNestedStr(info, ["property.title", "propertyTitle"]) || null,
    propertyAddress: pickNestedStr(info, ["property.address", "propertyAddress"]) || null,
    contractType: pickNestedStr(info, ["contractType.label"]) || contract.contractType,
    buyers: buyersRaw
      .map((b) => ({ fullName: pickStr(b, ["fullName"]), mobileNumber: pickStr(b, ["mobileNumber"]) }))
      .filter((b) => b.fullName),
    sellers: sellersRaw
      .map((s) => ({ fullName: pickStr(s, ["fullName"]), mobileNumber: pickStr(s, ["mobileNumber"]) }))
      .filter((s) => s.fullName),
    realtorShares: [
      ...primaryRaw.map((r) => mapRealtorShare(r, "primary")).filter((r): r is ContractRealtorShare => r !== null),
      ...secondaryRaw.map((r) => mapRealtorShare(r, "secondary")).filter((r): r is ContractRealtorShare => r !== null),
    ],
  };
}

// ==========================================================================
// فهرست‌های مرجع عمومی (بدون توکن) — باشگاه مشتریان
// ==========================================================================

/** نگاشت فهرست مرجع عمومی (user-characters/jobs/roles/seriousness) */
export function mapRefList(payload: unknown): RefListItem[] {
  const { rows } = extractPagedList<Row>(payload, (row) => (pickId(row, "") ? row : null));
  return rows
    .map((r) => ({ id: pickId(r, ""), name: pickStr(r, ["name"]) }))
    .filter((r) => r.name)
    .map((r, i) => ({ ...r, id: r.id || `idx-${i}` }));
}

// ==========================================================================
// مالی و کمیسیون — پیکربندی تعرفه سامانه مالی (fm)
// ==========================================================================

/** نگاشت پاسخ acc/apm/commission/configList → CommissionCityConfig[] */
export function mapCommissionConfig(payload: unknown): CommissionCityConfig[] {
  // پوشه سامانه مالی متفاوت است: { status: "success", configList: [...] }
  const root = (payload && typeof payload === "object" ? (payload as Row) : {}) as Row;
  const list = Array.isArray(root.configList) ? (root.configList as Row[]) : [];
  const configs: CommissionCityConfig[] = [];
  for (const c of list) {
    const cityId = pickNestedStr(c, ["city._id"]) || pickId(c, "");
    const cityName = pickNestedStr(c, ["city.name"]);
    if (!cityId && !cityName) continue;
    const detailRaw = Array.isArray(c.detail) ? (c.detail as Row[]) : [];
    configs.push({
      cityId: cityId || cityName,
      cityName: cityName || "—",
      valueAddedPercentage: pickNum(c, ["valueAddedPercentage"]) || 10,
      realEstateTariff: pickStr(c, ["realEstateTariff"]),
      image: pickStr(c, ["image"]) || null,
      detail: detailRaw.map((d) => {
        const inputsRaw = Array.isArray(d.inputs) ? (d.inputs as Row[]) : [];
        return {
          contractType: pickStr(d, ["contractType"]),
          contractTypeFa: pickStr(d, ["contractTypeFa"]),
          buyerLabel: pickStr(d, ["buyerLable", "buyerLabel"]) || "خریدار",
          sellerLabel: pickStr(d, ["sellerLable", "sellerLabel"]) || "فروشنده",
          inputs: inputsRaw
            .map((inp) => ({ key: pickStr(inp, ["key"]), label: pickStr(inp, ["lable", "label"]) }))
            .filter((inp) => inp.key),
        };
      }),
    });
  }
  return configs;
}

// ==========================================================================
// شاخص قیمت روز — configs/current-prices سامانه ARM
// ==========================================================================

/** نگاشت رکورد configs/current-prices → PriceIndexConfig */
export function mapPriceIndexConfig(row: Row): PriceIndexConfig | null {
  const id = pickId(row, "");
  if (!id) return null;
  const inputs = (row.inputs && typeof row.inputs === "object" ? (row.inputs as Row) : {}) as Row;
  return {
    id,
    tradeType: pickNestedStr(row, ["tradeType.name"]) || "—",
    buildingType: pickNestedStr(row, ["buildingType.name"]) || "—",
    propertyType: pickNestedStr(row, ["propertyType.name"]) || "—",
    city: pickNestedStr(row, ["city.name"]) || "—",
    yearFrom: Number(pick(inputs, ["year_from"])) || null,
    yearTo: Number(pick(inputs, ["year_to"])) || null,
    isRental: pick(row, ["isRental"]) === true,
    isActive: pick(row, ["isActive"]) === true,
    areas: [],
    details: [],
  };
}

/** نگاشت پاسخ /areas شاخص → نام مناطق */
export function mapPriceIndexAreas(payload: unknown): string[] {
  const root = (payload && typeof payload === "object" ? (payload as Row) : {}) as Row;
  const areas = root.areas;
  if (Array.isArray(areas)) {
    return areas.map((a) => (typeof a === "string" ? a : pickStr(a as Row, ["name"]))).filter(Boolean);
  }
  return [];
}

/** نگاشت پاسخ /details شاخص → مشخصات فنی */
export function mapPriceIndexDetails(payload: unknown): { label: string; value: string }[] {
  const root = (payload && typeof payload === "object" ? (payload as Row) : {}) as Row;
  const details = Array.isArray(root.details) ? (root.details as Row[]) : [];
  return details
    .map((d) => ({ label: pickStr(d, ["label"]), value: pickStr(d, ["value"]) }))
    .filter((d) => d.label || d.value);
}
