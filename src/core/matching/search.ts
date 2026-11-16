/**
 * جست‌وجوی هوشمند ورودی تطبیق — PN-014 (لایهٔ سرویس) → PN-084 (پوشش کامل جدول)
 * ---------------------------------------------------------------------------
 * الگوریتم: عین جست‌وجوی کاشی فایل‌یابی — نرمال‌سازی فارسی (ارقام فارسی/عربی
 * → لاتین، آ/أ/إ → ا، حذف فاصله/نیم‌فاصله) + تطبیق زیررشته‌ای روی فیلدهای
 * معنادار. منطق دامنه اینجاست (قانون لایه‌ای روت‌های لاغر — بند ۱.۲ ن۰۱۲).
 *
 * PN-084 — دو منبع ترکیبی (فوق‌مجموعهٔ رفتار قبل):
 *   ۱) پیش‌فیلتر SQL روی کل جدول (LIKE زیررشته‌ای خام: کد/عنوان/نام/منطقه) —
 *      پایان وابستگی به ۴٬۰۰۰ سطرِ تازه‌تر؛ هر کد در هر عمق تاریخی پیدا می‌شود.
 *   ۲) پشتیبان نرمال‌شده: تازه‌ترین‌ها + normFa (فاصله/نیم‌فاصله را می‌بیند).
 */

import type { PrismaClient } from "@prisma/client";
import { normFa } from "./match-analysis";

export interface MatchSearchRow {
  code: string;
  title: string | null;
  customerName: string | null;
  region: string | null;
  price: number | null;
  priceFrom: number | null;
  priceTo: number | null;
  updatedAt: string | null;
}

/** PN-084 — از ۸ به ۱۲ (هم‌زمان با پوشش کامل جدول) */
export const MATCH_SEARCH_LIMIT = 12;

/** وضعیت‌های فعال درخواست — همان قرارداد موتور تطبیق */
const ACTIVE_REQUEST_STATUSES = ["سرنخ", "فرصت", "در انتظار تایید", "در انتظار معامله", "ready"];

/**
 * جست‌وجوی هوشمند — direction=listing در آگهی‌های منتشرشده، direction=request
 * در درخواست‌های زنده. جست‌وجو روی: کد · عنوان · نام مالک/مشتری · منطقه/محله.
 */
export async function searchMatchInputs(
  db: PrismaClient,
  q: string,
  direction: "listing" | "request",
  limit: number = MATCH_SEARCH_LIMIT,
): Promise<MatchSearchRow[]> {
  const nq = normFa(q);
  if (!nq) return [];
  const rawQ = q.trim();
  const fetchCap = Math.max(24, limit * 3);

  if (direction === "listing") {
    const sel = { propertyCode: true, title: true, areaName: true, lineName: true, price: true, ownerName: true, syncedAt: true } as const;
    let rows = rawQ
      ? await db.propertyRecord
          .findMany({
            where: {
              status: "منتشر شده",
              OR: [
                { propertyCode: { contains: rawQ } },
                { title: { contains: rawQ } },
                { ownerName: { contains: rawQ } },
                { areaName: { contains: rawQ } },
                { lineName: { contains: rawQ } },
              ],
            },
            select: sel,
            orderBy: { syncedAt: "desc" },
            take: fetchCap,
          })
          .catch(() => [] as Array<{ propertyCode: string; title: string | null; areaName: string | null; lineName: string | null; price: number | null; ownerName: string | null; syncedAt: Date | null }>)
      : [];
    if (rows.length < limit) {
      // پشتیبان نرمال‌شده — تازه‌ترین‌ها با normFa (فاصله/نیم‌فاصله/ارقام فارسی)
      const recent = await db.propertyRecord
        .findMany({ where: { status: "منتشر شده" }, select: sel, orderBy: { syncedAt: "desc" }, take: 4000 })
        .catch(() => [] as Array<{ propertyCode: string; title: string | null; areaName: string | null; lineName: string | null; price: number | null; ownerName: string | null; syncedAt: Date | null }>);
      const seen = new Set(rows.map((r) => r.propertyCode));
      rows = rows.concat(recent.filter((r) => !seen.has(r.propertyCode)));
    }
    return rows
      .filter((r) =>
        normFa(r.propertyCode ?? "").includes(nq) ||
        normFa(r.title ?? "").includes(nq) ||
        normFa(r.ownerName ?? "").includes(nq) ||
        normFa(r.areaName ?? "").includes(nq) ||
        normFa(r.lineName ?? "").includes(nq)
      )
      .slice(0, limit)
      .map((r) => ({
        code: r.propertyCode,
        title: r.title ?? null,
        customerName: r.ownerName ?? null,
        region: [r.lineName, r.areaName].filter(Boolean).join("، ") || null,
        price: r.price,
        priceFrom: null,
        priceTo: null,
        updatedAt: r.syncedAt instanceof Date ? r.syncedAt.toISOString() : null,
      }));
  }

  const sel = { id: true, requestCode: true, title: true, customerName: true, priceFrom: true, priceTo: true, areaNamesJson: true, updatedAt: true } as const;
  let rows = rawQ
    ? await db.requestRecord
        .findMany({
          where: {
            status: { in: ACTIVE_REQUEST_STATUSES },
            OR: [
              { requestCode: { contains: rawQ } },
              { title: { contains: rawQ } },
              { customerName: { contains: rawQ } },
              { areaNamesJson: { contains: rawQ } },
            ],
          },
          select: sel,
          orderBy: { updatedAt: "desc" },
          take: fetchCap,
        })
        .catch(() => [] as Array<{ id: string; requestCode: string | null; title: string | null; customerName: string | null; priceFrom: number | null; priceTo: number | null; areaNamesJson: string | null; updatedAt: Date | null }>)
    : [];
  if (rows.length < limit) {
    const recent = await db.requestRecord
      .findMany({ where: { status: { in: ACTIVE_REQUEST_STATUSES } }, select: sel, orderBy: { updatedAt: "desc" }, take: 4000 })
      .catch(() => [] as Array<{ id: string; requestCode: string | null; title: string | null; customerName: string | null; priceFrom: number | null; priceTo: number | null; areaNamesJson: string | null; updatedAt: Date | null }>);
    const seen = new Set(rows.map((r) => r.id));
    rows = rows.concat(recent.filter((r) => !seen.has(r.id)));
  }
  return rows
    .filter((r) =>
      normFa(r.requestCode ?? "").includes(nq) ||
      normFa(r.title ?? "").includes(nq) ||
      normFa(r.customerName ?? "").includes(nq) ||
      normFa(r.areaNamesJson ?? "").includes(nq)
    )
    .slice(0, limit)
    .map((r) => {
      let regions: string[] = [];
      try {
        const v = JSON.parse(r.areaNamesJson ?? "[]");
        if (Array.isArray(v)) regions = v.filter((x) => typeof x === "string");
      } catch { /* لایهٔ خام */ }
      return {
        code: r.requestCode ?? r.id,
        title: r.title ?? null,
        customerName: r.customerName ?? null,
        region: regions.slice(0, 3).join("، ") || null,
        price: null,
        priceFrom: r.priceFrom,
        priceTo: r.priceTo,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : null,
      };
    });
}
