/**
 * تست رمزنگاری و اعتبارسنجی فرمت — هسته امنیتی احراز هویت
 * اجرا: bun test tests/crypto.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  generateSessionToken,
  hashToken,
  safeEqual,
  isValidPersonnelCodeFormat,
  isValidOtpFormat,
  isValidMasterCodeFormat,
} from "@/lib/auth/crypto";

describe("تولید و هش توکن", () => {
  test("توکن ۶۴ کاراکتر هگز است و آنتروپی کافی دارد", () => {
    const t1 = generateSessionToken();
    const t2 = generateSessionToken();
    expect(t1).toMatch(/^[a-f0-9]{64}$/);
    expect(t2).toMatch(/^[a-f0-9]{64}$/);
    expect(t1).not.toBe(t2);
  });

  test("هش توکن قطعی (deterministic) و غیرقابل بازگشت است", () => {
    const t = generateSessionToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(t)).not.toBe(t);
  });
});

describe("مقایسه زمان-ثابت (ضد Timing Attack)", () => {
  test("رشته‌های برابر → true", () => {
    expect(safeEqual("41372895", "41372895")).toBe(true);
  });
  test("رشته‌های نابرابر → false", () => {
    expect(safeEqual("41372895", "41372896")).toBe(false);
  });
  test("طول متفاوت → false (بدون خطا)", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("اعتبارسنجی فرمت ورودی‌ها", () => {
  test("کد پرسنلی: ۶ تا ۱۲ رقم معتبر", () => {
    expect(isValidPersonnelCodeFormat("410031320")).toBe(true);
    expect(isValidPersonnelCodeFormat("123456")).toBe(true);
    expect(isValidPersonnelCodeFormat("12345")).toBe(false);
    expect(isValidPersonnelCodeFormat("1234567890123")).toBe(false);
    expect(isValidPersonnelCodeFormat("041-0031320")).toBe(false); // خط تیره
    expect(isValidPersonnelCodeFormat("")).toBe(false);
  });
  test("کد پیامکی: دقیقاً ۶ رقم", () => {
    expect(isValidOtpFormat("123456")).toBe(true);
    expect(isValidOtpFormat("12345")).toBe(false);
    expect(isValidOtpFormat("1234567")).toBe(false);
    expect(isValidOtpFormat("abc123")).toBe(false);
  });
  test("کد مدیر: دقیقاً ۸ رقم", () => {
    expect(isValidMasterCodeFormat("41372895")).toBe(true);
    expect(isValidMasterCodeFormat("4137289")).toBe(false);
    expect(isValidMasterCodeFormat("413728955")).toBe(false);
  });
});
