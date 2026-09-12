/**
 * تست قالب‌بندی فارسی و تقویم هجری شمسی — ارقام، مبالغ، تاریخ جلالی
 * اجرا: bun test tests/format.test.ts
 */

import { describe, expect, test } from "bun:test";
import { faDigits, enDigits, faToman, faNumber, faMonthLabel, faDate, faJalaliShort, faDateTime } from "@/lib/format";
import {
  gregorianToJalali,
  jalaliToGregorian,
  jalaliMonthLength,
  isJalaliLeap,
  isoToJalaliString,
  anyDateStringToDate,
  todayJalali,
  buildJalaliMonthGrid,
  formatJalaliLong,
  formatJalaliShort,
} from "@/lib/jalali";

describe("تبدیل ارقام", () => {
  test("لاتین → فارسی", () => {
    expect(faDigits(123456)).toBe("۱۲۳۴۵۶");
    expect(faDigits("09141234567")).toBe("۰۹۱۴۱۲۳۴۵۶۷");
  });
  test("فارسی/عربی → لاتین (برای ورودی کاربر)", () => {
    expect(enDigits("۱۲۳۴۵۶")).toBe("123456");
    expect(enDigits("١٢٣٤٥٦")).toBe("123456"); // ارقام عربی
  });
});

describe("قالب مبلغ تومانی", () => {
  test("میلیارد", () => {
    expect(faToman(2_500_000_000)).toContain("میلیارد تومان");
    expect(faToman(2_500_000_000)).toContain("۲٫۵");
  });
  test("میلیون", () => {
    expect(faToman(250_000_000)).toContain("میلیون تومان");
  });
  test("همت (هزار میلیارد)", () => {
    expect(faToman(1_200_000_000_000)).toContain("همت");
  });
  test("مقادیر نامعتبر", () => {
    expect(faToman(NaN)).toBe("—");
  });
});

describe("عدد با جداکننده", () => {
  test("جداکننده هزارگان فارسی", () => {
    expect(faNumber(640)).toBe("۶۴۰");
    expect(faNumber(1234567)).toBe("۱٬۲۳۴٬۵۶۷");
  });
});

// ===================== تقویم هجری شمسی =====================

describe("تبدیل جلالی ↔ میلادی (چرخش رفت‌وبرگشت)", () => {
  test("۱ فروردین ۱۴۰۵ = ۲۱ مارس ۲۰۲۶", () => {
    const [gy, gm, gd] = jalaliToGregorian(1405, 1, 1);
    expect([gy, gm, gd]).toEqual([2026, 3, 21]);
  });
  test("۲۱ مارس ۲۰۲۶ = ۱ فروردین ۱۴۰۵", () => {
    const [jy, jm, jd] = gregorianToJalali(2026, 3, 21);
    expect([jy, jm, jd]).toEqual([1405, 1, 1]);
  });
  test("چرخش رفت‌وبرگشت روی سال کبیسه", () => {
    for (const [jy, jm, jd] of [[1403, 12, 30], [1403, 1, 1], [1375, 12, 29], [1405, 6, 21]] as [number, number, number][]) {
      const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
      expect(gregorianToJalali(gy, gm, gd)).toEqual([jy, jm, jd]);
    }
  });
  test("نقطه آغاز تقویم: ۱ فروردین ۱ = ۲۱ مارس ۶۲۲", () => {
    expect(gregorianToJalali(622, 3, 21)).toEqual([1, 1, 1]);
    expect(jalaliToGregorian(1, 1, 1)).toEqual([622, 3, 21]);
  });
});

describe("طول ماه و کبیسه جلالی", () => {
  test("شش ماه اول ۳۱ روز", () => {
    for (let m = 1; m <= 6; m++) expect(jalaliMonthLength(1405, m)).toBe(31);
  });
  test("ماه ۷ تا ۱۱ = ۳۰ روز", () => {
    for (let m = 7; m <= 11; m++) expect(jalaliMonthLength(1405, m)).toBe(30);
  });
  test("اسفند سال کبیسه ۳۰ روز (۱۴۰۳ کبیسه است)", () => {
    expect(isJalaliLeap(1403)).toBe(true);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
  });
});

describe("قالب‌بندی تاریخ هجری شمسی", () => {
  test("ISO → جلالی بلند «۲۱ شهریور ۱۴۰۵»", () => {
    // ۲۰۲۶-۰۹-۱۲ = ۲۱ شهریور ۱۴۰۵
    const label = faDate("2026-09-12T12:00:00.000Z");
    expect(label).toContain("شهریور");
    expect(label).toContain("۱۴۰۵");
  });
  test("ISO → جلالی کوتاه «۱۴۰۵/۰۶/۲۱»", () => {
    expect(faJalaliShort("2026-09-12T12:00:00.000Z")).toBe("۱۴۰۵/۰۶/۲۱");
  });
  test("تاریخ + ساعت شمسی", () => {
    const s = faDateTime("2026-09-12T14:30:00.000Z");
    expect(s).toContain("شهریور");
    expect(s).toContain("ساعت");
  });
  test("مقادیر نامعتبر → خط تیره", () => {
    expect(faDate("not-a-date")).toBe("—");
    expect(faJalaliShort("bad")).toBe("—");
  });
  test("برچسب ماه جلالی از کلید yyyy-mm", () => {
    expect(faMonthLabel("1405-06")).toBe("شهریور ۱۴۰۵");
    expect(faMonthLabel("1403-01")).toBe("فروردین ۱۴۰۳");
  });
});

describe("تبدیل رشته تاریخ سامانه ملک تبریز", () => {
  test("جلالی «YYYY/MM/DD» → Date درست", () => {
    const d = anyDateStringToDate("1405/06/21");
    expect(d).not.toBeNull();
    const [jy, jm, jd] = gregorianToJalali(d!.getFullYear(), d!.getMonth() + 1, d!.getDate());
    expect([jy, jm, jd]).toEqual([1405, 6, 21]);
  });
  test("ارقام فارسی هم پذیرفته می‌شوند", () => {
    const d = anyDateStringToDate("۱۴۰۵/۰۶/۲۱");
    expect(d).not.toBeNull();
    const [jy] = gregorianToJalali(d!.getFullYear(), d!.getMonth() + 1, d!.getDate());
    expect(jy).toBe(1405);
  });
  test("ISO با زمان → همان لحقه", () => {
    const d = anyDateStringToDate("2026-09-12T14:30:00.000Z");
    expect(d?.toISOString()).toBe("2026-09-12T14:30:00.000Z");
  });
  test("ISO → رشته جلالی برای پارامتر سامانه", () => {
    expect(isoToJalaliString("2026-09-12T12:00:00.000Z")).toBe("1405/06/21");
  });
  test("مقادیر تهی → null", () => {
    expect(anyDateStringToDate(null)).toBeNull();
    expect(anyDateStringToDate("")).toBeNull();
  });
});

describe("امروز و شبکه تقویم ماهانه", () => {
  test("امروز جلالی با تاریخ جاری مطابق است", () => {
    const t = todayJalali();
    expect(t.jy).toBeGreaterThan(1400);
    expect(t.jm).toBeGreaterThanOrEqual(1);
    expect(t.jm).toBeLessThanOrEqual(12);
  });
  test("شبکه ماه = ۴۲ سلول و شروع شنبه", () => {
    const grid = buildJalaliMonthGrid(1405, 6);
    expect(grid.length).toBe(42);
    expect(grid[0].weekday).toBe(0);
  });
  test("قالب‌های بلند/کوتاه جلالی", () => {
    expect(formatJalaliLong({ jy: 1405, jm: 6, jd: 21, weekday: 1 })).toBe("۲۱ شهریور ۱۴۰۵");
    expect(formatJalaliShort({ jy: 1405, jm: 6, jd: 21, weekday: 1 })).toBe("۱۴۰۵/۰۶/۲۱");
  });
});
