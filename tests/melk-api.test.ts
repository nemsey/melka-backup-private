/**
 * تست لایه اتصال واقعی به سامانه‌های ملک تبریز
 * - پوشه پاسخ NestJS و تشخیص خطاها
 * - رمزنگاری توکن ARM (AES-256-GCM)
 * - اعتبارسنجی فرمت OTP ۴ رقمی و کد مدیر ۸ رقمی
 * - کوئری‌سازی بدون مقادیر خالی
 * اجرا: bun test tests/melk-api.test.ts
 */

import { describe, expect, test } from "bun:test";

// ==========================================================================
// ابزارهای خالص client
// ==========================================================================

describe("ساخت کوئری (buildQuery)", () => {
  test("مقادیر خالی حذف می‌شوند", async () => {
    const { buildQuery } = await import("@/lib/melk-api/client");
    const qs = buildQuery({ page: 1, limit: 100, startDate: undefined, endDate: "", token: null });
    expect(qs).toBe("?page=1&limit=100");
  });
  test("بدون مقدار → رشته خالی", async () => {
    const { buildQuery } = await import("@/lib/melk-api/client");
    expect(buildQuery(undefined)).toBe("");
  });
  test("مقدار فارسی کدگذاری می‌شود", async () => {
    const { buildQuery } = await import("@/lib/melk-api/client");
    expect(buildQuery({ name: "تبریز" })).toContain(encodeURIComponent("تبریز"));
  });
});

// ==========================================================================
// فرمت‌های اعتبارسنجی
// ==========================================================================

describe("فرمت OTP و کدها (مطابق سامانه واقعی)", () => {
  test("OTP سامانه ARM ۴ رقمی است", async () => {
    const { isValidOtpFormat } = await import("@/lib/auth/crypto");
    expect(isValidOtpFormat("1234")).toBe(true);
    expect(isValidOtpFormat("123456")).toBe(false); // ۶ رقم = نامعتبر (سامانه واقعی ۴ رقم است)
    expect(isValidOtpFormat("12a4")).toBe(false);
    expect(isValidOtpFormat("")).toBe(false);
  });
  test("کد مدیر ۸ رقمی است", async () => {
    const { isValidMasterCodeFormat } = await import("@/lib/auth/crypto");
    expect(isValidMasterCodeFormat("41372895")).toBe(true);
    expect(isValidMasterCodeFormat("1372")).toBe(false);
  });
  test("کد پرسنلی ۶ تا ۱۲ رقم", async () => {
    const { isValidPersonnelCodeFormat } = await import("@/lib/auth/crypto");
    expect(isValidPersonnelCodeFormat("410031320")).toBe(true);
    expect(isValidPersonnelCodeFormat("12345")).toBe(false);
    expect(isValidPersonnelCodeFormat("1234567890123")).toBe(false);
  });
});

// ==========================================================================
// رمزنگاری توکن ARM
// ==========================================================================

describe("رمزنگاری توکن ARM (AES-256-GCM)", () => {
  test("رمزگذاری و رمزگشایی رفت‌وبرگشت", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/auth/crypto");
    const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.arm-token-test";
    const enc = encryptSecret(token);
    expect(enc).not.toContain(token);
    expect(enc).not.toBe(token);
    expect(decryptSecret(enc)).toBe(token);
  });
  test("بدنه دستکاری‌شده → null (مقاومت در برابر Tamper)", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/auth/crypto");
    const enc = encryptSecret("secret-arm-token");
    const tampered = enc.slice(0, -4) + (enc.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(decryptSecret(tampered)).toBeNull();
  });
  test("ورودی نامعتبر → null", async () => {
    const { decryptSecret } = await import("@/lib/auth/crypto");
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret("")).toBeNull();
    expect(decryptSecret("not-base64!!!")).toBeNull();
  });
});

// ==========================================================================
// پیکربندی واقعی
// ==========================================================================

describe("پیکربندی اتصال واقعی", () => {
  test("آدرس‌های API کشف‌شده سامانه‌های ملک تبریز", async () => {
    const { getMelkApiConfig } = await import("@/lib/melk-api/config");
    const cfg = getMelkApiConfig();
    expect(cfg.mode).toBe("real");
    expect(cfg.armApiBase).toBe("https://arus-api.melketabriz.ir/api/apm/");
    expect(cfg.armPublicApiBase).toBe("https://arus-api.melketabriz.ir/api/public/");
    expect(cfg.pmApiBase).toBe("https://pm-api.melketabriz.ir/api/");
  });
  test("نقاط اتصال واقعی", async () => {
    const { MELK_ENDPOINTS } = await import("@/lib/melk-api/endpoints");
    expect(MELK_ENDPOINTS.arm.requestOtp("410031320")).toBe("authentication/otp/410031320");
    expect(MELK_ENDPOINTS.arm.verifyOtp).toBe("authentication/otp/login");
    expect(MELK_ENDPOINTS.arm.tradedTotal).toBe("realtor-reports/traded-count-total");
    expect(MELK_ENDPOINTS.arm.realtorsList).toBe("realtors/list");
    expect(MELK_ENDPOINTS.pm.portalInfo).toBe("public/portalInfo");
  });
});

// ==========================================================================
// Provider واقعی (بدون فراخوانی شبکه — فقط نوع/رابط)
// ==========================================================================

describe("Provider واقعی", () => {
  test("همیشه real است و اینترفیس کامل دارد", async () => {
    const { getMelkProvider } = await import("@/lib/melk-api/provider");
    const provider = getMelkProvider();
    expect(provider.mode).toBe("real");
    expect(typeof provider.requestOtp).toBe("function");
    expect(typeof provider.verifyOtp).toBe("function");
    expect(typeof provider.refreshArmToken).toBe("function");
    expect(typeof provider.listTransactions).toBe("function");
    expect(typeof provider.listExperts).toBe("function");
    expect(typeof provider.testConnection).toBe("function");
    expect(typeof provider.pmPortalInfo).toBe("function");
  });
});
