/**
 * تست‌های PHASE 1 — P1-02: توابع دامنه منتقل‌شده به analyzers
 * ------------------------------------------------------
 * برای هر تابع منتقل‌شده از UI: fixture ثابت + مقدار انتظاری ثابت
 * + ادعای ساختاری: پنج صفحه فقط فرمت نمایش دارند، نه محاسبه دامنه.
 */

import { describe, expect, test } from "bun:test";
import {
  monthlyCounts,
  demandLevel,
  marketTilt,
  cooperationDegree,
  areaTrendMatrix,
  parseFaAmount,
} from "@/core/agent/analyzers";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("P1-02 / monthlyCounts — سری ماهانه جلالی (معاملات + بازدیدها)", () => {
  test("گروه‌بندی و مرتب‌سازی ماه‌های جلالی", () => {
    const out = monthlyCounts([
      "2026-06-21T10:00:00.000Z",
      "2026-06-25T10:00:00.000Z",
      "2026-07-13T10:00:00.000Z",
      "2026-08-01T10:00:00.000Z",
      "2026-08-02T10:00:00.000Z",
      "2026-08-03T10:00:00.000Z",
      "2025-03-11T10:00:00.000Z",
    ]);
    // ماه‌های جلالی: 2025-03-11 → ۱۴۰۳-۱۲ | 2026-06-21..25 → ۱۴۰۵-۰۳ | 2026-07-13 → ۱۴۰۵-۰۴ | 2026-08-01..03 → ۱۴۰۵-۰۴/۰۵
    expect(out.length).toBeGreaterThanOrEqual(4);
    expect(out).toEqual([...out].sort((a, b) => a.key.localeCompare(b.key)));
    expect(out.reduce((s, p) => s + p.count, 0)).toBe(7);
    const june = out.find((p) => p.count === 2);
    expect(june).toBeDefined();
  });

  test("skipInvalid: تاریخ نامعتبر نادیده گرفته می‌شود (سبک بازدیدها)", () => {
    const out = monthlyCounts(["2026-06-01T10:00:00.000Z", "not-a-date", "2026-06-10T10:00:00.000Z"], { skipInvalid: true });
    // هر دو تاریخ در ماه جلالی یکسان (خرداد ۱۴۰۵)
    expect(out.length).toBe(1);
    expect(out[0]?.count).toBe(2);
  });

  test("بدون skipInvalid: تاریخ نامعتبر کلید NaN می‌سازد (عین رفتار قبلی معاملات)", () => {
    const out = monthlyCounts(["not-a-date"]);
    expect(out.length).toBe(1);
    expect(out[0].key).toContain("NaN");
  });

  test("takeLast: فقط N ماه آخر (سبک نمودار بازدیدها: ۹)", () => {
    const dates = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2025, i, 15)).toISOString());
    const out = monthlyCounts(dates, { skipInvalid: true, takeLast: 9 });
    expect(out.length).toBe(9);
    expect(out).toEqual([...out].sort((a, b) => a.key.localeCompare(b.key)));
    expect(out.reduce((s, p) => s + p.count, 0)).toBe(9);
  });

  test("ورودی خالی → خروجی خالی", () => {
    expect(monthlyCounts([])).toEqual([]);
    expect(monthlyCounts([null, undefined])).toEqual([]);
  });
});

describe("P1-02 / demandLevel — آستانه‌های رسمی ۶۰/۴۰ گزارش عرضه و تقاضا", () => {
  test("مرزهای دقیق آستانه‌ها", () => {
    expect(demandLevel(0)).toBe("NONE");
    expect(demandLevel(0.5)).toBe("LOW");
    expect(demandLevel(39.9)).toBe("LOW");
    expect(demandLevel(40)).toBe("BALANCED");
    expect(demandLevel(59.9)).toBe("BALANCED");
    expect(demandLevel(60)).toBe("HIGH");
    expect(demandLevel(100)).toBe("HIGH");
  });
});

describe("P1-02 / marketTilt — جهت بازار بر پایه شاخص تعادل", () => {
  test("مرزهای دقیق آستانه‌ها", () => {
    expect(marketTilt(0)).toBe("SUPPLY_LED");
    expect(marketTilt(39.9)).toBe("SUPPLY_LED");
    expect(marketTilt(40)).toBe("BALANCED");
    expect(marketTilt(59.9)).toBe("BALANCED");
    expect(marketTilt(60)).toBe("DEMAND_LED");
  });
});

describe("P1-02 / cooperationDegree — درجه همکاری مشاور (۲۰/۵)", () => {
  test("مرزهای دقیق آستانه‌ها", () => {
    expect(cooperationDegree(0)).toBe("NONE");
    expect(cooperationDegree(1)).toBe("RARE");
    expect(cooperationDegree(4)).toBe("RARE");
    expect(cooperationDegree(5)).toBe("FREQUENT");
    expect(cooperationDegree(19)).toBe("FREQUENT");
    expect(cooperationDegree(20)).toBe("CORE");
    expect(cooperationDegree(250)).toBe("CORE");
  });
});

describe("P1-02 / areaTrendMatrix — ماتریس روند چند-منطقه‌ای (شاخص قیمت)", () => {
  const TREND = [
    { areaName: "آب‌رسان", recordedAt: "2026-09-01T00:00:00.000Z", medianPerMeter: 5_000_000 },
    { areaName: "آب‌رسان", recordedAt: "2026-09-02T00:00:00.000Z", medianPerMeter: 5_100_000 },
    { areaName: "آب‌رسان", recordedAt: "2026-09-03T00:00:00.000Z", medianPerMeter: 4_900_000 },
    { areaName: "ولیعصر", recordedAt: "2026-09-01T00:00:00.000Z", medianPerMeter: 7_000_000 },
    { areaName: "ولیعصر", recordedAt: "2026-09-02T00:00:00.000Z", medianPerMeter: 7_200_000 },
    { areaName: "باغمیشه", recordedAt: "2026-09-03T00:00:00.000Z", medianPerMeter: 6_000_000 },
  ];

  test("۵ منطقه برتر + پرکردن تاریخ گمشده با صفر", () => {
    const out = areaTrendMatrix(TREND);
    expect(out).toEqual([
      { date: "2026-09-01", "آب‌رسان": 5_000_000, "ولیعصر": 7_000_000, "باغمیشه": 0 },
      { date: "2026-09-02", "آب‌رسان": 5_100_000, "ولیعصر": 7_200_000, "باغمیشه": 0 },
      { date: "2026-09-03", "آب‌رسان": 4_900_000, "ولیعصر": 0, "باغمیشه": 6_000_000 },
    ]);
  });

  test("topN سفارشی: فقط پرنمونه‌ترین منطقه", () => {
    const out = areaTrendMatrix(TREND, 1);
    expect(out).toEqual([
      { date: "2026-09-01", "آب‌رسان": 5_000_000 },
      { date: "2026-09-02", "آب‌رسان": 5_100_000 },
      { date: "2026-09-03", "آب‌رسان": 4_900_000 },
    ]);
  });

  test("ورودی خالی → خروجی خالی", () => {
    expect(areaTrendMatrix([])).toEqual([]);
  });
});

describe("P1-02 / parseFaAmount — تجزیه مبلغ فارسی (مالی و کمیسیون)", () => {
  test("ارقام فارسی با جداکننده‌های ترکیبی", () => {
    expect(parseFaAmount("۱٬۲۰۰٬۰۰۰")).toBe(1200000);
    expect(parseFaAmount("2,000,000,000")).toBe(2000000000);
    expect(parseFaAmount(" ۵۰۰۰۰۰۰۰۰ ")).toBe(500000000);
  });

  test("رقم عربی (٥) پشتیبانی نمی‌شود — عین رفتار قبلی (فقط فارسی)", () => {
    expect(parseFaAmount("۱٥٬۰۰۰")).toBeUndefined();
  });

  test("خالی/نامعتبر → undefined", () => {
    expect(parseFaAmount("")).toBeUndefined();
    expect(parseFaAmount("   ")).toBeUndefined();
    expect(parseFaAmount("abc")).toBeUndefined();
    expect(parseFaAmount("٬")).toBeUndefined();
  });

  test("اعشار و صفر", () => {
    expect(parseFaAmount("۰")).toBe(0);
    expect(parseFaAmount("4.5")).toBe(4.5);
  });
});

describe("P1-02 / ادعاهای ساختاری — پنج صفحه فقط فرمت نمایش", () => {
  const TILES = "/home/z/my-project/src/core/tiles/tiles";

  test("صفحات از analyzers import می‌کنند (نه محاسبه محلی)", () => {
    const checks: Array<[string, string]> = [
      ["transactions-contracts/TransactionsTab.tsx", "monthlyCounts"],
      ["experts/ExpertsPage.tsx", "cooperationDegree"],
      ["supply-demand/SupplyDemandPage.tsx", "demandLevel"],
      ["price-index/PriceIndexPage.tsx", "areaTrendMatrix"],
    ];
    for (const [page, fn] of checks) {
      const c = readFileSync(join(TILES, page), "utf8");
      expect(c).toContain(`@/core/agent/analyzers`);
      expect(c).toContain(fn);
    }
  });

  test("صفر آستانه خام عددی در tsx عرضه/تقاضا و کارشناسان (آستانه‌ها به analyzers رفتند)", () => {
    const sd = readFileSync(join(TILES, "supply-demand/SupplyDemandPage.tsx"), "utf8");
    expect(sd).not.toMatch(/percent >= 60|percent >= 40/);
    const ex = readFileSync(join(TILES, "experts/ExpertsPage.tsx"), "utf8");
    expect(ex).not.toMatch(/total >= 20|total >= 5/);
  });

  test("حلقه گروه‌بندی ماه جلالی در tsxها حذف شده (منطق به analyzers رفت)", () => {
    const tx = readFileSync(join(TILES, "transactions-contracts/TransactionsTab.tsx"), "utf8");
    expect(tx).not.toContain("new Map<string, number>()");
  });

  test("منطق گروه‌بندی روند منطقه‌ای از PriceIndexPage حذف شده", () => {
    const pi = readFileSync(join(TILES, "price-index/PriceIndexPage.tsx"), "utf8");
    expect(pi).not.toContain("byArea");
    expect(pi).not.toContain("topAreas");
  });
});
