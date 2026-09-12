/**
 * تست تحلیل‌گرهای آماری ایجنت — منطق هسته تحلیل (خالص)
 * اجرا: bun test tests/analyzers.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  monthlySeries,
  growthRate,
  detectAnomalies,
  expertStats,
  topByCount,
  topByValue,
  groupBy,
  conversionRate,
  expertPerformance,
  concentrationIndex,
  droppedExperts,
} from "@/core/agent/analyzers";

// ساخت رکوردهای شبیه Prisma (شکل یکسان با TransactionRecordGetPayload)
type Tx = Parameters<typeof monthlySeries>[0][number];
type Ex = Parameters<typeof expertPerformance>[1][number];

function tx(partial: Partial<Tx> & { dealDate: Date; price: number; expertCode: string }): Tx {
  return {
    id: "t" + Math.random().toString(36).slice(2),
    dealDate: partial.dealDate,
    listingCode: partial.listingCode ?? "MT-1",
    requestCode: partial.requestCode ?? null,
    expertCode: partial.expertCode,
    expertName: partial.expertName ?? "کارشناس تست",
    price: partial.price,
    district: partial.district ?? "ولیعصر",
    propertyType: partial.propertyType ?? "آپارتمان",
    area: partial.area ?? 100,
    commission: partial.commission ?? partial.price * 0.005,
    syncedAt: new Date(),
  } as Tx;
}

function ex(partial: Partial<Ex> & { personnelCode: string; fullName: string }): Ex {
  return {
    id: "e" + Math.random().toString(36).slice(2),
    personnelCode: partial.personnelCode,
    fullName: partial.fullName,
    mobile: partial.mobile ?? "09140000000",
    address: partial.address ?? "تبریز",
    branch: partial.branch ?? "شعبه مرکزی",
    active: partial.active ?? true,
    joinedAt: partial.joinedAt ?? new Date(Date.now() - 3 * 365 * 86400000),
    syncedAt: new Date(),
  } as Ex;
}

const d = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000);

describe("سری ماهانه و روند", () => {
  test("تجمیع صحیح تعداد و ارزش در هر ماه", () => {
    const rows = [
      tx({ dealDate: d(5), price: 1_000_000_000, expertCode: "A" }),
      tx({ dealDate: d(7), price: 2_000_000_000, expertCode: "A" }),
      tx({ dealDate: d(40), price: 500_000_000, expertCode: "B" }),
    ];
    const series = monthlySeries(rows);
    expect(series.length).toBeGreaterThanOrEqual(2);
    const thisMonth = series[series.length - 1];
    expect(thisMonth.count).toBe(2);
    expect(thisMonth.totalValue).toBe(3_000_000_000);
    expect(thisMonth.avgPrice).toBe(1_500_000_000);
  });

  test("growthRate: مثبت با رشد، null با داده ناکافی", () => {
    expect(growthRate([])).toBeNull();
    expect(growthRate([monthlySeries([])[0] ?? { key: "2026-01", count: 1, totalValue: 1, avgPrice: 1 }])).toBeNull();
    const series = [
      { key: "2026-01", count: 1, totalValue: 100, avgPrice: 100 },
      { key: "2026-02", count: 1, totalValue: 200, avgPrice: 200 },
    ];
    expect(growthRate(series)).toBe(100);
  });
});

describe("تشخیص ناهنجاری z-score", () => {
  test("ماه جهش‌یافته شناسایی می‌شود", () => {
    const series = Array.from({ length: 6 }, (_, i) => ({
      key: `2026-0${i + 1}`,
      count: 5,
      totalValue: 1_000_000_000 + i * 100_000_000,
      avgPrice: 0,
    }));
    series[5].totalValue = 5_000_000_000; // جهش شدید
    const anomalies = detectAnomalies(series);
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0].direction).toBe("spike");
  });
  test("داده کم → بدون ناهنجاری", () => {
    expect(detectAnomalies([{ key: "1", count: 1, totalValue: 1, avgPrice: 1 }])).toHaveLength(0);
  });
});

describe("آمار کارشناسان", () => {
  test("expertStats: شمارش، ارزش، آخرین معامله", () => {
    const rows = [
      tx({ dealDate: d(10), price: 1_000_000_000, expertCode: "A", expertName: "علی" }),
      tx({ dealDate: d(1), price: 3_000_000_000, expertCode: "A", expertName: "علی" }),
      tx({ dealDate: d(50), price: 2_000_000_000, expertCode: "B", expertName: "رضا" }),
    ];
    const stats = expertStats(rows);
    const a = stats.find((s) => s.expertCode === "A")!;
    expect(a.dealCount).toBe(2);
    expect(a.totalValue).toBe(4_000_000_000);
    expect(a.avgPrice).toBe(2_000_000_000);
    expect(a.lastDealAt?.getTime()).toBe(d(1).getTime());
  });
  test("topByCount / topByValue", () => {
    const rows = [
      tx({ dealDate: d(1), price: 100, expertCode: "A" }),
      tx({ dealDate: d(2), price: 100, expertCode: "A" }),
      tx({ dealDate: d(3), price: 100, expertCode: "A" }),
      tx({ dealDate: d(4), price: 999, expertCode: "B" }),
    ];
    const stats = expertStats(rows);
    expect(topByCount(stats, 1)[0].expertCode).toBe("A");
    expect(topByValue(stats, 1)[0].expertCode).toBe("B");
  });
});

describe("گروه‌بندی و نرخ تبدیل", () => {
  test("groupBy بر اساس محله با مرتب‌سازی ارزش", () => {
    const rows = [
      tx({ dealDate: d(1), price: 100, expertCode: "A", district: "X" }),
      tx({ dealDate: d(2), price: 900, expertCode: "A", district: "Y" }),
    ];
    const g = groupBy(rows, (t) => t.district);
    expect(g[0].name).toBe("Y");
    expect(g[0].totalValue).toBe(900);
  });
  test("conversionRate: نسبت معاملات دارای کد درخواست", () => {
    const rows = [
      tx({ dealDate: d(1), price: 1, expertCode: "A", requestCode: "RF-1" }),
      tx({ dealDate: d(2), price: 1, expertCode: "A", requestCode: "RF-2" }),
      tx({ dealDate: d(3), price: 1, expertCode: "A", requestCode: null }),
      tx({ dealDate: d(4), price: 1, expertCode: "A", requestCode: null }),
    ];
    expect(conversionRate(rows)).toBe(50);
  });
});

describe("عملکرد و ریسک کارشناسان", () => {
  test("segment=inactive برای بدون معامله ۹۰ روزه", () => {
    const experts = [ex({ personnelCode: "A", fullName: "علی" })];
    const txs = [tx({ dealDate: d(200), price: 1e9, expertCode: "A" })];
    const perfs = expertPerformance(txs, experts);
    expect(perfs[0].segment).toBe("inactive");
  });
  test("droppedExperts: افت شدید نسبت به روند شخصی", () => {
    const experts = [ex({ personnelCode: "A", fullName: "علی" })];
    // ۱۰ معامله در گذشته دور، هیچ‌چیز در ۹۰ روز اخیر
    const txs = Array.from({ length: 10 }, (_, i) =>
      tx({ dealDate: d(150 + i * 15), price: 1e9, expertCode: "A" })
    );
    const perfs = expertPerformance(txs, experts);
    expect(perfs[0].dealCount).toBe(10);
    expect(droppedExperts(perfs)).toHaveLength(1);
  });
  test("concentrationIndex: سهم ۵ نفر برتر", () => {
    const stats = [
      { expertCode: "1", expertName: "a", dealCount: 1, totalValue: 80, avgPrice: 80, lastDealAt: null },
      { expertCode: "2", expertName: "b", dealCount: 1, totalValue: 10, avgPrice: 10, lastDealAt: null },
      { expertCode: "3", expertName: "c", dealCount: 1, totalValue: 10, avgPrice: 10, lastDealAt: null },
    ];
    expect(concentrationIndex(stats, 1)).toBe(80);
  });
});

describe("آداپتور نگاشت داده واقعی سامانه ملک تبریز", () => {
  test(" نگاشت ردیف گزارش معاملات با نام فیلدهای رایج", async () => {
    const { mapArmTradedRow, mapArmRealtorRow, anyDateStringToIso, isoToJalaliString, gregorianToJalali, jalaliToGregorian, extractPagedList } = await import("@/lib/melk-api/adapters");
    const t = mapArmTradedRow(
      {
        _id: "665f1a2b3c4d5e6f70819203",
        realtor: { fullName: "سید نعمت اله سیدی", code: "410031320" },
        propertyCode: "AD-1001",
        requestCode: "RQ-88",
        tradedAt: "1403/05/21",
        price: 5_000_000_000,
        district: "ولیعصر",
        propertyType: "آپارتمان",
        area: 105,
        commission: 25_000_000,
      },
      0, 1, 100
    );
    expect(t).not.toBeNull();
    expect(t!.expertName).toBe("سید نعمت اله سیدی");
    expect(t!.expertCode).toBe("410031320");
    expect(t!.listingCode).toBe("AD-1001");
    expect(t!.requestCode).toBe("RQ-88");
    expect(t!.price).toBe(5_000_000_000);
    expect(t!.district).toBe("ولیعصر");
    expect(t!.propertyType).toBe("آپارتمان");

    // تاریخ جلالی → ISO و بازگشت
    const iso = anyDateStringToIso("1403/05/21");
    expect(iso).toContain("2024-08");
    expect(isoToJalaliString(iso!)).toBe("1403/05/21");

    // اعداد فارسی در تاریخ
    expect(anyDateStringToIso("۱۴۰۳/۰۵/۲۱")).toBe(iso);

    // تبدیل رفت‌وبرگشت جلالی
    const [jy, jm, jd] = gregorianToJalali(2024, 8, 11);
    expect([jy, jm, jd]).toEqual([1403, 5, 21]);
    expect(jalaliToGregorian(jy, jm, jd)).toEqual([2024, 8, 11]);

    // نگاشت کارشناس
    const e = mapArmRealtorRow({ _id: "r1", fullName: "کارشناس الف", code: "12345678", mobile: "09141234567", address: "تبریز", active: true, createdAt: "1402/01/15" }, 0);
    expect(e!.fullName).toBe("کارشناس الف");
    expect(e!.personnelCode).toBe("12345678");
    expect(e!.mobile).toBe("09141234567");
    expect(e!.active).toBe(true);

    // استخراج صفحه‌بندی از پوشه‌های مختلف
    const p1 = extractPagedList({ data: { docs: [{ _id: "1" }, { _id: "2" }], totalDocs: 2, totalPages: 1 } }, (r) => ({ id: String(r._id) }));
    expect(p1.rows.map((r) => r.id)).toEqual(["1", "2"]);
    expect(p1.total).toBe(2);
    const p2 = extractPagedList({ data: [{ _id: "3" }] }, (r) => ({ id: String(r._id) }));
    expect(p2.rows).toHaveLength(1);
    expect(p2.total).toBe(1);
  });
});
