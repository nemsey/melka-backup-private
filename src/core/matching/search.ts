/**
 * جست‌وجوی هوشمند ورودی تطبیق — PN-014 (لایهٔ سرویس)
 * ---------------------------------------------------------------------------
 * الگوریتم: عین جست‌وجوی کاشی فایل‌یابی — نرمال‌سازی فارسی (ارقام فارسی/عربی
 * → لاتین، آ/أ/إ → ا، حذف فاصله/نیم‌فاصله) + تطبیق زیررشته‌ای روی فیلدهای
 * معنادار. منطق دامنه اینجاست (قانون لایه‌ای روت‌های لاغر — بند ۱.۲ ن۰۱۲).
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

export const MATCH_SEARCH_LIMIT = 8;

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

  if (direction === "listing") {
    const rows = await db.propertyRecord.findMany({
      where: { status: "منتشر شده" },
      select: { propertyCode: true, title: true, areaName: true, lineName: true, price: true, ownerName: true, syncedAt: true },
      orderBy: { syncedAt: "desc" },
      take: 4000,
    });
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

  const rows = await db.requestRecord.findMany({
    where: { status: { in: ACTIVE_REQUEST_STATUSES } },
    select: { id: true, requestCode: true, title: true, customerName: true, priceFrom: true, priceTo: true, areaNamesJson: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 4000,
  });
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
