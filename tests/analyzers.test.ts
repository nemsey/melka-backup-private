/**
 * تست تحلیل‌گرهای آماری ایجنت — منطق هسته تحلیل (خالص)
 * بازنویسی بر پایه داده واقعی سامانه ملک تبریز (گزارش تطابق، users-list، تعاملات).
 * اجرا: bun test tests/analyzers.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  monthlySeries,
  growthRate,
  detectAnomalies,
  matchComposition,
  topMonths,
  roleDistribution,
  businessDistribution,
  joinerSeries,
  realtorDegrees,
  topPairs,
  interactionConcentration,
  expertBaseStats,
  isolatedRealtors,
} from "@/core/agent/analyzers";

// ساخت رکوردهای شبیه Prisma — عین ساختار گزارش تطابق معاملات سامانه ARM
type Tx = Parameters<typeof monthlySeries>[0][number];
type Ex = Parameters<typeof roleDistribution>[0][number];
type In = Parameters<typeof realtorDegrees>[0][number];

function tx(partial: Partial<Tx> & { contractDate: Date }): Tx {
  return {
    id: "t" + Math.random().toString(36).slice(2),
    contractDate: partial.contractDate,
    propertyCode: partial.propertyCode ?? "P-100",
    propertyCustomer: partial.propertyCustomer ?? "مالک تست",
    requestCode: partial.requestCode ?? null,
    requestCustomer: partial.requestCustomer ?? null,
    contractHolo: partial.contractHolo ?? null,
    suggestedPropertyCount: partial.suggestedPropertyCount ?? 0,
    eventsCount: partial.eventsCount ?? 0,
    syncedAt: new Date(),
  } as Tx;
}

function ex(partial: Partial<Ex> & { fullName: string }): Ex {
  return {
    id: "e" + Math.random().toString(36).slice(2),
    personnelCode: partial.personnelCode ?? "410031320",
    fullName: partial.fullName,
    mobile: partial.mobile ?? "09140000000",
    role: partial.role ?? "کارشناس و مشاور فروش",
    businessTitle: partial.businessTitle ?? "ملک تبریز — مرکزی",
    creator: partial.creator ?? "سید نعمت اله سیدی",
    active: partial.active ?? true,
    createdAt: partial.createdAt ?? new Date("2025-06-15T12:00:00Z"),
    syncedAt: new Date(),
  } as Ex;
}

function inter(requestRealtorName: string, propertyRealtorName: string, count: number): In {
  return {
    id: `i-${requestRealtorName}-${propertyRealtorName}`,
    requestRealtorName,
    propertyRealtorName,
    count,
    syncedAt: new Date(),
  } as In;
}

const d = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000);

describe("سری ماهانه (ماه‌های هجری شمسی)", () => {
  test("تجمیع صحیح تعداد در هر ماه جلالی", () => {
    // ۲۰ روز پیش و ۵۰ روز پیش — معمولاً دو ماه شمسی متفاوت
    const rows = [tx({ contractDate: d(2) }), tx({ contractDate: d(3) }), tx({ contractDate: d(50) }), tx({ contractDate: d(51) }), tx({ contractDate: d(52) })];
    const series = monthlySeries(rows);
    expect(series.length).toBeGreaterThanOrEqual(2);
    expect(series.reduce((a, p) => a + p.count, 0)).toBe(5);
    // ترتیب کلیدهای ماه صعودی است
    for (let i = 1; i < series.length; i++) expect(series[i].key > series[i - 1].key).toBe(true);
  });
  test("کلید ماه جلالی درست ساخته می‌شود", () => {
    // ۲۰۲۶-۰۹-۱۲ = ۱۴۰۵/۰۶
    const series = monthlySeries([tx({ contractDate: new Date("2026-09-12T12:00:00Z") })]);
    expect(series[0].key).toBe("1405-06");
  });
});

describe("نرخ رشد ماهانه", () => {
  test("رشد مثبت", () => {
    expect(growthRate([{ key: "1405-05", count: 10 }, { key: "1405-06", count: 15 }])).toBe(50);
  });
  test("رشد منفی", () => {
    expect(growthRate([{ key: "1405-05", count: 20 }, { key: "1405-06", count: 10 }])).toBe(-50);
  });
  test("داده ناکافی → null", () => {
    expect(growthRate([{ key: "1405-05", count: 10 }])).toBeNull();
  });
});

describe("ترکیب گزارش تطابق (چهارگانه خود سامانه)", () => {
  test("شمارش رویداد/آگهی پیشنهادی/هر دو", () => {
    const rows = [
      tx({ contractDate: d(1), eventsCount: 2, suggestedPropertyCount: 3 }), // هر دو
      tx({ contractDate: d(2), eventsCount: 1, suggestedPropertyCount: 0 }), // فقط رویداد
      tx({ contractDate: d(3), eventsCount: 0, suggestedPropertyCount: 2 }), // فقط آگهی
      tx({ contractDate: d(4), eventsCount: 0, suggestedPropertyCount: 0 }), // هیچ
      tx({ contractDate: d(5), eventsCount: 5, suggestedPropertyCount: 0, requestCode: "R-9", contractHolo: "H-77" }), // رویداد + درخواست + هولوگرام
    ];
    const comp = matchComposition(rows);
    expect(comp.totalCount).toBe(5);
    expect(comp.hasRequestEvent).toBe(3);
    expect(comp.hasSuggestedProperty).toBe(2);
    expect(comp.hasBoth).toBe(1);
    expect(comp.neither).toBe(1);
    expect(comp.requestShare).toBe(20);
    expect(comp.holoShare).toBe(20);
  });
  test("مجموعه خالی", () => {
    const comp = matchComposition([]);
    expect(comp.totalCount).toBe(0);
    expect(comp.requestShare).toBe(0);
  });
});

describe("ماه‌های اوج", () => {
  test("پرشمارترین ماه اول است", () => {
    const top = topMonths(
      [
        { key: "1405-01", count: 3 },
        { key: "1405-02", count: 9 },
        { key: "1405-03", count: 5 },
      ],
      2
    );
    expect(top[0].key).toBe("1405-02");
    expect(top.length).toBe(2);
  });
});

describe("ناهنجاری آماری", () => {
  test("جهش ناهنجار شناسایی می‌شود", () => {
    const series = Array.from({ length: 8 }, (_, i) => ({ key: `1405-0${i + 1}`, count: 5 }));
    series[5].count = 40; // جهش
    const anomalies = detectAnomalies(series);
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    expect(anomalies[0].direction).toBe("spike");
  });
  test("سری کوتاه → بدون ناهنجاری", () => {
    expect(detectAnomalies([{ key: "1405-01", count: 1 }])).toEqual([]);
  });
});

describe("توزیع نقش و کسب‌وکار (users-list)", () => {
  test("گروه‌بندی نقش‌ها", () => {
    const experts = [
      ex({ fullName: "الف", role: "کارشناس و مشاور فروش" }),
      ex({ fullName: "ب", role: "کارشناس و مشاور فروش" }),
      ex({ fullName: "ج", role: "کارشناس دفتری" }),
    ];
    const roles = roleDistribution(experts);
    expect(roles[0]).toEqual({ name: "کارشناس و مشاور فروش", count: 2 });
    expect(roles.length).toBe(2);
  });
  test("گروه‌بندی کسب‌وکارها", () => {
    const experts = [
      ex({ fullName: "الف", businessTitle: "شعبه یک" }),
      ex({ fullName: "ب", businessTitle: "شعبه دو" }),
      ex({ fullName: "ج", businessTitle: "شعبه یک" }),
    ];
    expect(businessDistribution(experts)[0].count).toBe(2);
  });
});

describe("سری عضویت ماهانه", () => {
  test("کاربران با تاریخ نامعتبر نادیده گرفته می‌شوند", () => {
    const experts = [
      ex({ fullName: "الف", createdAt: new Date("2026-07-10T12:00:00Z") }),
      ex({ fullName: "ب", createdAt: new Date(0) }), // نامعتبر
    ];
    const series = joinerSeries(experts);
    expect(series.length).toBe(1);
  });
});

describe("تعاملات مشاوران (realtor-interactions)", () => {
  test("درجه همکاری دوطرفه تجمیع می‌شود", () => {
    const rows = [
      inter("علی", "رضا", 5),
      inter("علی", "سارا", 3),
      inter("رضا", "علی", 2),
    ];
    const degrees = realtorDegrees(rows);
    const ali = degrees.find((x) => x.name === "علی")!;
    expect(ali.total).toBe(10); // ۵+۳ طرف درخواست + ۲ طرف آگهی
    expect(ali.asRequester).toBe(8);
    expect(ali.asPropertyRealtor).toBe(2);
    expect(ali.partners).toBe(2); // رضا و سارا
  });
  test("جفت برتر", () => {
    const rows = [inter("الف", "ب", 1), inter("ج", "د", 9)];
    expect(topPairs(rows, 1)[0].count).toBe(9);
  });
  test("شاخص تمرکز شبکه", () => {
    const rows = [inter("الف", "ب", 8), inter("ج", "د", 1), inter("ه", "و", 1)];
    // ۵ جفت برتر = همه → ۱۰۰٪
    expect(interactionConcentration(rows, 5)).toBe(100);
  });
});

describe("آمار پایه کاربران", () => {
  test("نرخ فعال بودن", () => {
    const experts = [
      ex({ fullName: "الف", active: true }),
      ex({ fullName: "ب", active: true }),
      ex({ fullName: "ج", active: false }),
    ];
    const stats = expertBaseStats(experts);
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(2);
    expect(stats.activeRate).toBe(66.7);
  });
});

describe("مشاوران منزوی", () => {
  test("فعالِ بدون تعامل شناسایی می‌شود", () => {
    const experts = [
      ex({ fullName: "علی", active: true }), // در شبکه است
      ex({ fullName: "بهرام", active: true }), // منزوی
      ex({ fullName: "چهرزاد", active: false }), // غیرفعال → نمی‌شماریم
    ];
    const rows = [inter("علی", "رضا", 3)];
    const isolated = isolatedRealtors(experts, rows);
    expect(isolated.map((i) => i.fullName)).toEqual(["بهرام"]);
  });
});
