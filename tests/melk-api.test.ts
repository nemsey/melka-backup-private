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

// ==========================================================================
// آداپتورهای نگاشت داده واقعی — عین ستون‌های صفحات خود سامانه ARM
// ==========================================================================

describe("آداپتور گزارش تطابق معاملات (TradedStatisticsPage)", () => {
  test("نگاشت ردیف واقعی: کد ملک/درخواست/هولوگرام/تاریخ/شمارش‌ها", async () => {
    const { mapArmTradedRow } = await import("@/lib/melk-api/adapters");
    const row = {
      _id: "665f1a2b3c4d5e6f70819203",
      propertyCode: "94123",
      propertyCustomer: "محمد مالک",
      requestCode: "31567",
      requestCustomer: "خانم احمدی",
      contractDate: "1405/06/21",
      contractHolo: "98765",
      suggestedPropertyCount: 3,
      eventsCount: 2,
    };
    const tx = mapArmTradedRow(row, 0, 1, 100);
    expect(tx).not.toBeNull();
    expect(tx!.propertyCode).toBe("94123");
    expect(tx!.propertyCustomer).toBe("محمد مالک");
    expect(tx!.requestCode).toBe("31567");
    expect(tx!.requestCustomer).toBe("خانم احمدی");
    expect(tx!.contractHolo).toBe("98765");
    expect(tx!.suggestedPropertyCount).toBe(3);
    expect(tx!.eventsCount).toBe(2);
    // تاریخ جلالی سامانه → ISO معتبر
    const d = new Date(tx!.contractDate);
    expect(Number.isNaN(d.getTime())).toBe(false);
  });
  test("ردیف فاقد درخواست → requestCode تهی", async () => {
    const { mapArmTradedRow } = await import("@/lib/melk-api/adapters");
    const tx = mapArmTradedRow({ propertyCode: "1", contractDate: "2026-09-12T00:00:00Z" }, 0, 1, 10);
    expect(tx!.requestCode).toBeNull();
    expect(tx!.requestCustomer).toBeNull();
    expect(tx!.contractHolo).toBeNull();
  });
  test("خلاصه چهارگانه از پاسخ سامانه", async () => {
    const { mapArmTradedSummary } = await import("@/lib/melk-api/adapters");
    const s = mapArmTradedSummary({ totalCount: 40, hasRequestEvent: 12, hasSuggestedProperty: 9, hasBoth: 4 });
    expect(s).toEqual({ totalCount: 40, hasRequestEvent: 12, hasSuggestedProperty: 9, hasBoth: 4 });
    expect(mapArmTradedSummary({ foo: 1 })).toBeNull();
    expect(mapArmTradedSummary(null)).toBeNull();
  });
});

describe("آداپتور فهرست کاربران (users-list)", () => {
  test("نگاشت ردیف واقعی: نقش/کسب‌وکار/ثبت‌کننده", async () => {
    const { mapArmRealtorRow } = await import("@/lib/melk-api/adapters");
    const row = {
      _id: "u1",
      code: "410031320",
      fullName: "سید نعمت اله سیدی",
      mobile: "09141234567",
      role: { name: "کارشناس و مشاور فروش" },
      businessId: { title: "ملک تبریز — شعبه مرکزی" },
      creator: { fullName: "مدیر سامانه" },
      active: true,
      createdAt: "2024-03-20T10:00:00Z",
    };
    const e = mapArmRealtorRow(row, 0);
    expect(e!.fullName).toBe("سید نعمت اله سیدی");
    expect(e!.role).toBe("کارشناس و مشاور فروش");
    expect(e!.businessTitle).toBe("ملک تبریز — شعبه مرکزی");
    expect(e!.creator).toBe("مدیر سامانه");
    expect(e!.personnelCode).toBe("410031320");
    expect(e!.active).toBe(true);
  });
  test("کاربر غیرفعال با رشته وضعیت", async () => {
    const { mapArmRealtorRow } = await import("@/lib/melk-api/adapters");
    const e = mapArmRealtorRow({ fullName: "الف", status: "inactive" }, 1);
    expect(e!.active).toBe(false);
  });
});

describe("آداپتور تعاملات مشاوران (realtor-interactions)", () => {
  test("نگاشت ردیف واقعی: مشاور درخواست × مشاور آگهی × تعداد", async () => {
    const { mapArmInteractionRow } = await import("@/lib/melk-api/adapters");
    const r = mapArmInteractionRow({ requestRealtorName: "علی رضایی", propertyRealtorName: "مهدی نجاتی", count: 7 }, 0);
    expect(r!.requestRealtorName).toBe("علی رضایی");
    expect(r!.propertyRealtorName).toBe("مهدی نجاتی");
    expect(r!.count).toBe(7);
  });
  test("ردیف بی‌نام → null", async () => {
    const { mapArmInteractionRow } = await import("@/lib/melk-api/adapters");
    expect(mapArmInteractionRow({ count: 1 }, 0)).toBeNull();
  });
});

describe("استخراج لیست صفحه‌بندی‌شده از پوشه NestJS", () => {
  test("قالب data.list + count", async () => {
    const { extractPagedList } = await import("@/lib/melk-api/adapters");
    const payload = { data: { list: [{ a: 1 }, { a: 2 }, { a: 3 }], count: 3, totalPages: 1 } };
    const { rows, total, totalPages } = extractPagedList(payload, (r) => ({ a: (r as { a: number }).a }));
    expect(rows.length).toBe(3);
    expect(total).toBe(3);
    expect(totalPages).toBe(1);
  });
  test("قالب آرایه مستقیم data", async () => {
    const { extractPagedList } = await import("@/lib/melk-api/adapters");
    const { rows, total } = extractPagedList({ data: [{ x: "1" }] }, (r) => ({ x: String((r as { x: string }).x) }));
    expect(rows.length).toBe(1);
    expect(total).toBe(1);
  });
});
