/**
 * تحلیل جامعه مشتریان — تلفیق معاملات، قراردادها و مشاوران
 * ------------------------------------------------------
 * منابع واقعی:
 *   • «گزارش تطابق معاملات» — propertyCustomer (طرف فروشنده) و
 *     requestCustomer (طرف خریدار) با تاریخ معامله
 *   • «صورت وضعیت‌ها» (قراردادها) — buyerList و sellerList با شماره تماس
 *   • «فهرست کاربران/مشاوران» (realtors) — جامعه فعال حرفه‌ای
 * خروجی: جامعه یکتا، مشتریان تکراری (هم خریدار هم فروشنده)،
 * سری رشد ماهانه (هجری شمسی) و پرکارترین مشتریان.
 */

import type { CustomerClubMember } from "./types";
import { dateToJalali } from "@/lib/jalali";

/** یک حضور مشتری در داده واقعی */
export interface CustomerAppearance {
  name: string;
  role: "BUYER" | "SELLER" | "EXPERT";
  date: string | null;
  mobile?: string | null;
}

/** نرمال‌سازی نام برای یکتاسازی: حذف فاصله‌های اضافی و نیم‌فاصله */
export function normalizeCustomerName(name: string): string {
  return name
    .trim()
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک");
}

/**
 * ساخت جامعه مشتریان از حضورهای واقعی:
 * هر نام نرمال‌شده یک عضو؛ نقش‌ها تجمیع و مشتریان دوطرفه (تکراری)
 * مشخص می‌شوند. تاریخ‌های حضور برای «اولین/آخرین دیده‌شدن» نگه داشته
 * می‌شوند.
 */
export function buildCustomerClub(appearances: CustomerAppearance[]): CustomerClubMember[] {
  const map = new Map<
    string,
    { name: string; roles: Set<"BUYER" | "SELLER" | "EXPERT">; buyerCount: number; sellerCount: number; first: number | null; last: number | null; mobile: string | null }
  >();

  for (const a of appearances) {
    const key = normalizeCustomerName(a.name);
    if (!key || key.length < 2) continue;
    let entry = map.get(key);
    if (!entry) {
      entry = { name: key, roles: new Set(), buyerCount: 0, sellerCount: 0, first: null, last: null, mobile: null };
      map.set(key, entry);
    }
    entry.roles.add(a.role);
    if (a.role === "BUYER") entry.buyerCount += 1;
    if (a.role === "SELLER") entry.sellerCount += 1;
    if (a.mobile && !entry.mobile) entry.mobile = a.mobile;
    const t = a.date ? new Date(a.date).getTime() : null;
    if (Number.isFinite(t) && t !== null) {
      entry.first = entry.first === null ? t : Math.min(entry.first, t);
      entry.last = entry.last === null ? t : Math.max(entry.last, t);
    }
  }

  const members: CustomerClubMember[] = [];
  for (const e of map.values()) {
    const roles = [...e.roles];
    members.push({
      name: e.name,
      roles,
      repeat: e.roles.has("BUYER") && e.roles.has("SELLER"),
      buyerCount: e.buyerCount,
      sellerCount: e.sellerCount,
      firstSeen: e.first !== null ? new Date(e.first).toISOString() : null,
      lastSeen: e.last !== null ? new Date(e.last).toISOString() : null,
      mobile: e.mobile,
    });
  }
  return members;
}

/** کلید ماه هجری شمسی از تاریخ ISO: «۱۴۰۴-۰۶» */
function jalaliMonthKey(dateIso: string): string | null {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return null;
  const j = dateToJalali(d);
  return `${j.jy}-${String(j.jm).padStart(2, "0")}`;
}

/**
 * سری رشد جامعه مشتریان در زمان (هجری شمسی):
 * هر ماه، تعداد «مشتریان جدید» (اولین حضور در همان ماه).
 */
export function customerGrowthSeries(members: CustomerClubMember[]): { key: string; count: number }[] {
  const firstMonth = new Map<string, number>();
  for (const m of members) {
    if (!m.firstSeen) continue;
    const key = jalaliMonthKey(m.firstSeen);
    if (!key) continue;
    firstMonth.set(key, (firstMonth.get(key) ?? 0) + 1);
  }
  return [...firstMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }));
}

/** پرکارترین مشتریان — مرتب بر پایه مجموع حضور در معاملات */
export function topCustomers(members: CustomerClubMember[], limit = 8): CustomerClubMember[] {
  return [...members]
    .sort((a, b) => b.buyerCount + b.sellerCount - (a.buyerCount + a.sellerCount) || a.name.localeCompare(b.name, "fa"))
    .slice(0, limit);
}
