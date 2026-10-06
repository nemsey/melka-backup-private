/**
 * /api/market-index — GET (P6545/گام۲ BLOCK 2.2)
 * شاخص بازار ملک تبریز:
 *  ۱) روند قیمت ماهانه (شمسی — از فروردین ۱۴۰۴)
 *  ۲) قیمت به تفکیک منطقه (۱۰ منطقه پرتقاضا)
 *  ۳) قیمت به تفکیک نوع ملک (آپارتمان/ویلا/زمین/مغازه)
 *  ۴) مقایسهٔ قیمت معاملات واقعی با آگهی‌های فعال
 *  ۵) سری سه‌گانهٔ حجم: معاملات / آگهی‌ها / درخواست‌ها (ماهانه)
 * داده: معاملات واقعی (TransactionRecord + غنی‌سازی) + آگهی‌های ARM + درخواست‌ها.
 */
import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { dateToJalali, JALALI_MONTHS } from "@/lib/jalali";

/** P6545 — db تنبل (الگوی P2-03: روت‌ها هرگز import مستقیم @/lib/db ندارند) */
async function getDb() {
  const mod = (await import("@/lib/db")) as { db: import("@prisma/client").PrismaClient };
  return mod.db;
}


export const dynamic = "force-dynamic";

/** متر مربع — تبدیل ریال به میلیون تومان برای خوانایی */
const rialToMilionToman = (rial: number) => Math.round((rial / 10 / 1_000_000) * 10) / 10;

export async function GET(request: NextRequest) {
  const db = await getDb();
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    /* ── ۱) روند قیمت ماهانهٔ معاملات (شمسی) ── */
    const txRows = await db.transactionRecord.findMany({
      select: { contractDate: true, id: true },
      orderBy: { contractDate: "asc" },
    });
    const enrichments = await db.transactionEnrichment.findMany({ select: { txId: true, contractPrice: true, contractType: true } });
    const priceByTx = new Map(enrichments.filter((e) => e.contractPrice).map((e) => [e.txId, e.contractPrice!]));

    const monthly = new Map<string, { prices: number[]; count: number }>();
    for (const t of txRows) {
      const price = priceByTx.get(t.id);
      if (!price) continue;
      const j = dateToJalali(new Date(t.contractDate));
      const key = `${j.jy}-${String(j.jm).padStart(2, "0")}`;
      const bucket = monthly.get(key) ?? { prices: [], count: 0 };
      bucket.prices.push(price);
      bucket.count += 1;
      monthly.set(key, bucket);
    }
    // از فروردین ۱۴۰۴ به بعد
    const monthlyTrend = [...monthly.entries()]
      .filter(([k]) => k >= "1404-01")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => {
        const sorted = [...v.prices].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
        return {
          month: k,
          monthLabel: `${JALALI_MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`,
          medianPriceMilionToman: rialToMilionToman(median),
          transactions: v.count,
        };
      });

    /* ── ۲) قیمت به تفکیک منطقه (۱۰ منطقه پرتقاضا — آگهی‌های فعال) ── */
    const areaAgg = await db.propertyRecord.groupBy({
      by: ["areaName"],
      where: { areaName: { not: null }, status: "منتشر شده", price: { not: null }, meterage: { not: null } },
      _count: true,
    });
    const topAreas = areaAgg.sort((a, b) => b._count - a._count).slice(0, 10).map((a) => a.areaName!);
    const byArea: Array<{ area: string; listings: number; medianPricePerMeterMilionToman: number }> = [];
    for (const area of topAreas) {
      const rows = await db.propertyRecord.findMany({
        where: { areaName: area, status: "منتشر شده", price: { not: null }, meterage: { not: null } },
        select: { price: true, meterage: true },
        take: 500,
      });
      const ppm = rows.map((r) => r.price! / Math.max(r.meterage!, 1)).sort((a, b) => a - b);
      const median = ppm[Math.floor(ppm.length / 2)] ?? 0;
      byArea.push({ area, listings: rows.length, medianPricePerMeterMilionToman: rialToMilionToman(median) });
    }
    byArea.sort((a, b) => b.medianPricePerMeterMilionToman - a.medianPricePerMeterMilionToman);

    /* ── ۳) قیمت به تفکیک نوع ملک ── */
    const wantedTypes = ["آپارتمان", "ویلا", "زمین", "مغازه"];
    const byType: Array<{ type: string; listings: number; medianPricePerMeterMilionToman: number }> = [];
    for (const type of wantedTypes) {
      const rows = await db.propertyRecord.findMany({
        where: { propertyTypeName: { contains: type }, status: "منتشر شده", price: { not: null }, meterage: { not: null } },
        select: { price: true, meterage: true },
        take: 800,
      });
      if (rows.length === 0) { byType.push({ type, listings: 0, medianPricePerMeterMilionToman: 0 }); continue; }
      const ppm = rows.map((r) => r.price! / Math.max(r.meterage!, 1)).sort((a, b) => a - b);
      byType.push({ type, listings: rows.length, medianPricePerMeterMilionToman: rialToMilionToman(ppm[Math.floor(ppm.length / 2)] ?? 0) });
    }

    /* ── ۴) معاملات واقعی در برابر آگهی‌های فعال ── */
    const txPrices = [...priceByTx.values()].sort((a, b) => a - b);
    const activeListings = await db.propertyRecord.findMany({
      where: { status: "منتشر شده", price: { not: null }, meterage: { not: null } },
      select: { price: true, meterage: true },
      take: 2000,
    });
    const listingPpm = activeListings.map((r) => r.price! / Math.max(r.meterage!, 1)).sort((a, b) => a - b);
    const txVsListing = {
      transactions: { count: txPrices.length, medianTotalPriceMilionToman: rialToMilionToman(txPrices[Math.floor(txPrices.length / 2)] ?? 0) },
      activeListings: { count: activeListings.length, medianPricePerMeterMilionToman: rialToMilionToman(listingPpm[Math.floor(listingPpm.length / 2)] ?? 0) },
    };

    /* ── ۵) سری سه‌گانهٔ حجم ماهانه ── */
    const reqRows = await db.requestRecord.findMany({ select: { createdAt: true } });
    const listingRows = await db.propertyRecord.findMany({ select: { createdAt: true } });
    const volumeSeries = new Map<string, { transactions: number; listings: number; requests: number }>();
    const bump = (key: string, field: "transactions" | "listings" | "requests") => {
      const b = volumeSeries.get(key) ?? { transactions: 0, listings: 0, requests: 0 };
      b[field] += 1;
      volumeSeries.set(key, b);
    };
    for (const t of txRows) { const j = dateToJalali(new Date(t.contractDate)); bump(`${j.jy}-${String(j.jm).padStart(2, "0")}`, "transactions"); }
    for (const l of listingRows) { if (l.createdAt) { const j = dateToJalali(new Date(l.createdAt)); bump(`${j.jy}-${String(j.jm).padStart(2, "0")}`, "listings"); } }
    for (const r of reqRows) { const j = dateToJalali(new Date(r.createdAt)); bump(`${j.jy}-${String(j.jm).padStart(2, "0")}`, "requests"); }
    const volume = [...volumeSeries.entries()]
      .filter(([k]) => k >= "1404-01")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => {
        const jy = Number(month.slice(0, 4)); const jm = Number(month.slice(5));
        return { month, monthLabel: `${JALALI_MONTHS[jm - 1]} ${jy}`, ...v };
      });

    return Response.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      dataSources: {
        transactions: txRows.length,
        transactionsWithPrice: priceByTx.size,
        listings: await db.propertyRecord.count(),
        activeListings: activeListings.length,
        requests: reqRows.length,
      },
      monthlyTrend,
      byArea,
      byType,
      txVsListing,
      volume,
    });
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}
