import { describe, expect, test } from "bun:test";
import { formatPriceInput, parsePriceInput, priceDigits } from "@/lib/format";

/**
 * PN-058 — کاما-گذاری زندهٔ فیلترهای قیمت (دستور مالک ۱۴۰۵/۰۸/۰۵)
 * فیلدهای قیمت در فیلترهای فهرست‌های داشبورد ملک تبریز و ملکتون باید هنگام ورود، کاما داشته باشند.
 */

describe("PN-058 · کاما-گذاری زندهٔ فیلتر قیمت", () => {
  test("۱) ارقام لاتین: کاما هر سه رقم از راست", () => {
    expect(formatPriceInput("9000000000")).toBe("9,000,000,000");
    expect(formatPriceInput("1250000")).toBe("1,250,000");
    expect(formatPriceInput("12")).toBe("12");
    expect(formatPriceInput("123")).toBe("123");
    expect(formatPriceInput("1234")).toBe("1,234");
  });

  test("۲) ارقام فارسی ورودی کاربر هم کاما می‌گیرند", () => {
    expect(formatPriceInput("۹۰۰۰۰۰۰۰۰۰")).toBe("9,000,000,000");
    expect(formatPriceInput("۱۲۵۰")).toBe("1,250");
  });

  test("۳) ورودی ناقص/پاک‌شده: تهی می‌ماند (بدون NaN)", () => {
    expect(formatPriceInput("")).toBe("");
    expect(formatPriceInput("،")).toBe("");
    expect(formatPriceInput("abc")).toBe("");
  });

  test("۴) ویرایش میانی: ارقام موجود دوباره گروه می‌شوند", () => {
    // کاربر کاما را پاک می‌کند: "9,000,000,000" → "9000000000" با یک کامای حذف‌شده
    expect(formatPriceInput("9,000,000,00")).toBe("900,000,000");
    expect(formatPriceInput("1,25")).toBe("125");
  });

  test("۵) ارسال به API: کاما و نویسه‌های اضافه حذف می‌شوند", () => {
    expect(parsePriceInput("9,000,000,000")).toBe("9000000000");
    expect(parsePriceInput("۱۲,۵۰۰")).toBe("12500");
    expect(parsePriceInput("")).toBe("");
  });

  test("۶) priceDigits: ارقام فارسی/عربی → لاتین، فقط رقم", () => {
    expect(priceDigits("۹۰۰٠")).toBe("9000");
    expect(priceDigits("12-34")).toBe("1234");
  });

  test("۷) رفتار گرد: مقدار کاما‌دار، خامِ بدون‌کاما — سازگاری حقیقت‌نما (truthy)", () => {
    // چیپ «فیلتر فعال» روی truthiness کار می‌کند — مقدار کاما‌دار هم truthy است
    expect(Boolean(formatPriceInput("125"))).toBe(true);
    expect(Boolean(formatPriceInput(""))).toBe(false);
  });
});
