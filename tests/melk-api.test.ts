/**
 * تست لایه انتزاعی API — Provider شبیه‌ساز (Mock)
 * اجرا: bun test tests/melk-api.test.ts
 */

import { describe, expect, test, beforeAll } from "bun:test";
import { getMelkProvider } from "@/lib/melk-api/provider";
import { MelkApiError } from "@/lib/melk-api/types";

const provider = getMelkProvider();

describe("فلوی احراز هویت شبیه‌ساز", () => {
  const validCode = "410031320";
  let issuedOtp = "";

  beforeAll(async () => {
    const res = await provider.requestOtp(validCode);
    issuedOtp = res.demoOtp ?? "";
  });

  test("صدور OTP برای کد پرسنلی معتبر", async () => {
    const res = await provider.requestOtp("410031321");
    expect(res.ok).toBe(true);
    expect(res.expiresInSeconds).toBe(180);
    expect(res.demoOtp).toMatch(/^\d{6}$/);
  });

  test("کد پرسنلی ناموجود → خطای INVALID_PERSONNEL_CODE", async () => {
    try {
      await provider.requestOtp("999999999");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(MelkApiError);
      expect((err as MelkApiError).code).toBe("INVALID_PERSONNEL_CODE");
    }
  });

  test("تأیید OTP صحیح → توکن و اطلاعات کاربر", async () => {
    const res = await provider.verifyOtp(validCode, issuedOtp);
    expect(res.ok).toBe(true);
    expect(res.token).toContain(validCode);
    expect(res.user.personnelCode).toBe(validCode);
    expect(res.user.role).toBe("CONSULTANT");
    expect(res.user.displayName.length).toBeGreaterThan(1);
  });

  test("کد پیامکی غلط → خطای OTP_INVALID", async () => {
    await provider.requestOtp("410031322"); // صدور مجدد
    try {
      await provider.verifyOtp("410031322", "000000");
      expect.unreachable();
    } catch (err) {
      expect((err as MelkApiError).code).toBe("OTP_INVALID");
    }
  });

  test("OTP مصرف‌شده دوباره قابل استفاده نیست (Single-use)", async () => {
    const res = await provider.requestOtp("410031323");
    const code = res.demoOtp!;
    await provider.verifyOtp("410031323", code);
    try {
      await provider.verifyOtp("410031323", code);
      expect.unreachable();
    } catch (err) {
      expect((err as MelkApiError).code).toBe("OTP_EXPIRED");
    }
  });
});

describe("فیلترهای معاملات", () => {
  test("فیلتر نام کارشناس", async () => {
    const all = await provider.listTransactions("t", { limit: 2000, offset: 0 });
    expect(all.total).toBeGreaterThan(100);
    const name = all.rows[0].expertName;
    const filtered = await provider.listTransactions("t", { limit: 100, offset: 0, expertName: name });
    expect(filtered.total).toBeGreaterThan(0);
    for (const r of filtered.rows) expect(r.expertName).toBe(name);
  });

  test("فیلتر کد آگهی و کد درخواست", async () => {
    const all = await provider.listTransactions("t", { limit: 500, offset: 0 });
    const withReq = all.rows.find((r) => r.requestCode);
    const f1 = await provider.listTransactions("t", { limit: 10, offset: 0, listingCode: withReq!.listingCode });
    expect(f1.rows.every((r) => r.listingCode === withReq!.listingCode)).toBe(true);
    const f2 = await provider.listTransactions("t", { limit: 10, offset: 0, requestCode: withReq!.requestCode! });
    expect(f2.rows.every((r) => r.requestCode === withReq!.requestCode)).toBe(true);
  });

  test("فیلتر بازه مبلغ", async () => {
    const res = await provider.listTransactions("t", {
      limit: 100,
      offset: 0,
      priceMin: 5_000_000_000,
      priceMax: 10_000_000_000,
    });
    for (const r of res.rows) {
      expect(r.price).toBeGreaterThanOrEqual(5_000_000_000);
      expect(r.price).toBeLessThanOrEqual(10_000_000_000);
    }
  });

  test("صفحه‌بندی: total ≥ مجموع صفحات", async () => {
    const p1 = await provider.listTransactions("t", { limit: 10, offset: 0 });
    const p2 = await provider.listTransactions("t", { limit: 10, offset: 10 });
    expect(p1.total).toBe(p2.total);
    expect(p1.rows[0].id).not.toBe(p2.rows[0].id);
  });

  test("مرتب‌سازی نزولی تاریخ", async () => {
    const res = await provider.listTransactions("t", { limit: 50, offset: 0, sortBy: "dealDate", sortDir: "desc" });
    for (let i = 1; i < res.rows.length; i++) {
      expect(Date.parse(res.rows[i - 1].dealDate)).toBeGreaterThanOrEqual(Date.parse(res.rows[i].dealDate));
    }
  });
});

describe("فیلترهای کارشناسان", () => {
  test("فیلتر نام و کد پرسنلی", async () => {
    const all = await provider.listExperts("t", { limit: 100, offset: 0 });
    const expert = all.rows[0];
    const byName = await provider.listExperts("t", { limit: 10, offset: 0, fullName: expert.fullName });
    expect(byName.rows.some((e) => e.personnelCode === expert.personnelCode)).toBe(true);
    const byCode = await provider.listExperts("t", { limit: 10, offset: 0, personnelCode: expert.personnelCode });
    expect(byCode.rows).toHaveLength(1);
  });

  test("فیلتر موبایل و وضعیت", async () => {
    const byMobile = await provider.listExperts("t", { limit: 10, offset: 0, mobile: "0914" });
    expect(byMobile.total).toBe(allExpertCount());
    const inactive = await provider.listExperts("t", { limit: 100, offset: 0, active: false });
    for (const e of inactive.rows) expect(e.active).toBe(false);
  });

  function allExpertCount(): number {
    // helper — همه شماره‌های موبایل شبیه‌ساز با 0914 شروع می‌شوند
    return 24;
  }
});

describe("تست اتصال", () => {
  test("وضعیت اتصال شبیه‌ساز همیشه ok", async () => {
    const status = await provider.testConnection();
    expect(status.ok).toBe(true);
    expect(status.mode).toBe("mock");
    expect(status.latencyMs).toBeGreaterThan(0);
  });
});
