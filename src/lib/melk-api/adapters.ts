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

import type { CrmExpert, CrmInteraction, CrmTransaction, TradedSummary } from "./types";
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
  const contractDateDate =
    anyDateStringToDate(pick(row, ["contractDate", "tradedAt", "dealDate", "createdAt", "date"])) ??
    new Date();

  const contractHolo =
    pickStr(row, ["contractHolo", "holo", "hologram", "holoCode"]) || null;

  const suggestedPropertyCount = pickNum(row, ["suggestedPropertyCount", "suggestedCount"]);
  const eventsCount = pickNum(row, ["eventsCount", "eventCount"]);

  return {
    id: pickId(row, `arm-traded-${page}-${limit}-${index}-${Date.now()}`),
    contractDate: contractDateDate.toISOString(),
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
