/**
 * تست قالب‌بندی فارسی — ارقام، مبالغ، تاریخ
 * اجرا: bun test tests/format.test.ts
 */

import { describe, expect, test } from "bun:test";
import { faDigits, enDigits, faToman, faNumber, faMonthLabel } from "@/lib/format";

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

describe("برچسب ماه شمسی", () => {
  test("ژانویه ۲۰۲۶ → دی/بهمن ۱۴۰۴", () => {
    const label = faMonthLabel("2026-01");
    expect(label).toContain("۱۴۰۴");
  });
  test("کلید نامعتبر → خودش برمی‌گردد", () => {
    expect(faMonthLabel("bad")).toBe("bad");
  });
});
