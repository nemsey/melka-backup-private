/**
 * تست کاشی‌های جدید: استخراج اطلاعات، بازدیدها، عرضه و تقاضا
 * - آداپتورهای نگاشت (عین ساختار کشف‌شده از باندل رسمی سامانه ARM)
 * - استخراج اطلاعات تماس (مالک/درخواست‌دهنده) از ساختار user سامانه
 * - تحلیل‌گرهای آماری جدید
 * - ثبت و ایجنت‌های کاشی‌های جدید در رجیستری
 * - زنجیره استعلام زنده کدآگهی/کددرخواست با fetch شبیه‌سازی‌شده
 * اجرا: bun test tests/new-tiles.test.ts
 */

import { describe, expect, test } from "bun:test";

// ==========================================================================
// آداپتورهای بازدیدها و عرضه و تقاضا
// ==========================================================================

describe("نگاشت ردیف بازدید (mapArmVisitRow)", () => {
  test("ستون‌های عین خود سامانه نگاشت می‌شوند", async () => {
    const { mapArmVisitRow } = await import("@/lib/melk-api/adapters");
    const row = {
      _id: "66f0a1",
      propertyCode: "12345",
      requesterName: "علی رضایی",
      checkerName: "مریم احمدی",
      propertyRealtorName: "سید نعمت اله سیدی",
      createdAt: "1404/06/21 14:30",
      checkTime: "1404/06/25 10:00",
      status: "تأیید شده",
    };
    const v = mapArmVisitRow(row, 0);
    expect(v).not.toBeNull();
    expect(v!.propertyCode).toBe("12345");
    expect(v!.requesterName).toBe("علی رضایی");
    expect(v!.checkerName).toBe("مریم احمدی");
    expect(v!.status).toBe("تأیید شده");
    expect(v!.checkTime).not.toBeNull();
    expect(v!.createdAt).not.toBeNull();
  });

  test("ردیف بدون هیچ نام/کد رد می‌شود", async () => {
    const { mapArmVisitRow } = await import("@/lib/melk-api/adapters");
    expect(mapArmVisitRow({ _id: "x" }, 1)).toBeNull();
  });

  test("زمان بررسی خالی → null", async () => {
    const { mapArmVisitRow } = await import("@/lib/melk-api/adapters");
    const v = mapArmVisitRow({ propertyCode: "1", requesterName: "r", createdAt: "2026-01-01" }, 0);
    expect(v!.checkTime).toBeNull();
  });
});

describe("نگاشت ردیف عرضه و تقاضا (mapArmSupplyDemandRow)", () => {
  test("ستون‌های عین گزارش خود سامانه", async () => {
    const { mapArmSupplyDemandRow } = await import("@/lib/melk-api/adapters");
    const r = mapArmSupplyDemandRow({ _id: "s1", range: "۰ تا ۵۰ میلیون", propertyCount: 120, requestPercent: 78, status: "تقاضای بالا" }, 0);
    expect(r).not.toBeNull();
    expect(r!.rangeTitle).toBe("۰ تا ۵۰ میلیون");
    expect(r!.propertyCount).toBe(120);
    expect(r!.requestPercent).toBe(78);
    expect(r!.status).toBe("تقاضای بالا");
  });

  test("درصد اعشاری ۰ تا ۱ → نرمال به درصد", async () => {
    const { mapArmSupplyDemandRow } = await import("@/lib/melk-api/adapters");
    const r = mapArmSupplyDemandRow({ range: "بازه ۱", requestRatio: 0.45, propertyCount: 10 }, 0);
    expect(r!.requestPercent).toBe(45);
  });

  test("ردیف بدون عنوان بازه رد می‌شود", async () => {
    const { mapArmSupplyDemandRow } = await import("@/lib/melk-api/adapters");
    expect(mapArmSupplyDemandRow({ propertyCount: 5 }, 0)).toBeNull();
  });
});

// ==========================================================================
// استخراج اطلاعات تماس (ساختار user سامانه ARM)
// ==========================================================================

describe("استخراج اطلاعات شخص (extractPersonInfo)", () => {
  test("مسیر مستقیم: نام + موبایل", async () => {
    const { extractPersonInfo } = await import("@/lib/melk-api/adapters");
    const p = extractPersonInfo({ _id: "u1", firstName: "حسین", lastName: "کریمی", mobileNumber: "09141234567" });
    expect(p).not.toBeNull();
    expect(p!.fullName).toBe("حسین کریمی");
    expect(p!.mobile).toBe("09141234567");
    expect(p!.isRegisteredUser).toBe(true);
  });

  test("مسیر extraUserInfo[].infos[0] — عین ساختار خود سامانه", async () => {
    const { extractPersonInfo } = await import("@/lib/melk-api/adapters");
    const p = extractPersonInfo({
      _id: "u2",
      mobileNumber: "۰۹۱۴۱۲۳۴۵۶۷",
      extraUserInfo: [
        {
          infos: [{ firstName: "زهرا", lastName: "محمدی", mobileNumber: 9141234567, userId: "u2" }],
        },
      ],
    });
    expect(p).not.toBeNull();
    expect(p!.fullName).toBe("زهرا محمدی");
    expect(p!.mobile).toBe("09141234567");
  });

  test("پاسخ خالی/نامعتبر → null", async () => {
    const { extractPersonInfo } = await import("@/lib/melk-api/adapters");
    expect(extractPersonInfo(null)).toBeNull();
    expect(extractPersonInfo("text")).toBeNull();
    expect(extractPersonInfo({ random: 1 })).toBeNull();
  });
});

describe("نرمال‌سازی شماره موبایل (normalizeMobile)", () => {
  test("ارقام فارسی → لاتین", async () => {
    const { normalizeMobile } = await import("@/lib/melk-api/adapters");
    expect(normalizeMobile("۰۹۱۴۱۲۳۴۵۶۷")).toBe("09141234567");
  });
  test("پیشوند +۹۸ → ۰", async () => {
    const { normalizeMobile } = await import("@/lib/melk-api/adapters");
    expect(normalizeMobile("+989141234567")).toBe("09141234567");
  });
  test("پیشوند ۹۸ دوازده‌رقمی → ۰", async () => {
    const { normalizeMobile } = await import("@/lib/melk-api/adapters");
    expect(normalizeMobile("989141234567")).toBe("09141234567");
  });
  test("عدد خام سامانه (۹۱۴…) → همان", async () => {
    const { normalizeMobile } = await import("@/lib/melk-api/adapters");
    expect(normalizeMobile("9141234567")).toBe("9141234567");
  });
});

// ==========================================================================
// جزئیات ساختاری و آدرس
// ==========================================================================

describe("استخراج جزئیات و آدرس", () => {
  test("جزئیات label/value/unit نگاشت می‌شوند", async () => {
    const { extractDetailItems } = await import("@/lib/melk-api/adapters");
    const items = extractDetailItems({
      details: [
        { label: "متراژ", value: "۱۲۰", unit: "متر" },
        { label: "تعداد اتاق", value: "۲" },
        { title: "قیمت کل", value: "۵۰۰" },
      ],
    });
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ label: "متراژ", value: "۱۲۰", unit: "متر" });
  });

  test("آدرس ترکیبی از address + مکان‌های تو در تو", async () => {
    const { extractAddress } = await import("@/lib/melk-api/adapters");
    const a = extractAddress({ address: "خیابان ارتش جنوبی", state: { name: "آذربایجان شرقی" }, city: { name: "تبریز" }, area: { name: "چهارمنار" } }, null);
    expect(a).toContain("خیابان ارتش جنوبی");
    expect(a).toContain("تبریز");
    expect(a).toContain("چهارمنار");
  });

  test("آدرس از fallback ردیف (عنوان + مکان‌ها)", async () => {
    const { extractAddress } = await import("@/lib/melk-api/adapters");
    const a = extractAddress(null, { title: "آپارتمان چناران", city: { name: "تبریز" } });
    expect(a).toContain("آپارتمان چناران");
    expect(a).toContain("تبریز");
  });
});

// ==========================================================================
// تحلیل‌گرهای جدید (خالص)
// ==========================================================================

describe("تحلیل بازدیدها (visitStats و رفقا)", () => {
  test("نرخ بررسی و شمارش متمایز", async () => {
    const { visitStats } = await import("@/core/agent/analyzers");
    const visits = [
      { id: "1", propertyCode: "A", requesterName: "r1", checkerName: "c1", propertyRealtorName: "p", checkTime: new Date(), createdAt: new Date(), status: "تأیید" },
      { id: "2", propertyCode: "A", requesterName: "r2", checkerName: "c1", propertyRealtorName: "p", checkTime: new Date(), createdAt: new Date(), status: "تأیید" },
      { id: "3", propertyCode: "B", requesterName: "r1", checkerName: "c2", propertyRealtorName: "p", checkTime: null, createdAt: new Date(), status: "" },
    ] as Parameters<typeof visitStats>[0];
    const s = visitStats(visits);
    expect(s.total).toBe(3);
    expect(s.checked).toBe(2);
    expect(s.pending).toBe(1);
    expect(s.checkedRate).toBeCloseTo(66.7, 1);
    expect(s.distinctProperties).toBe(2);
    expect(s.distinctRequesters).toBe(2);
  });

  test("رتبه‌بندی بررسی‌کنندگان فقط موارد بررسی‌شده", async () => {
    const { checkerLeaderboard } = await import("@/core/agent/analyzers");
    const visits = [
      { propertyCode: "A", requesterName: "r", checkerName: "c1", propertyRealtorName: "p", checkTime: new Date(), createdAt: new Date(), status: "" },
      { propertyCode: "B", requesterName: "r", checkerName: "c1", propertyRealtorName: "p", checkTime: new Date(), createdAt: new Date(), status: "" },
      { propertyCode: "C", requesterName: "r", checkerName: "c2", propertyRealtorName: "p", checkTime: null, createdAt: new Date(), status: "" },
    ] as Parameters<typeof checkerLeaderboard>[0];
    const board = checkerLeaderboard(visits);
    expect(board[0].name).toBe("c1");
    expect(board[0].count).toBe(2);
    expect(board.find((b) => b.name === "c2")).toBeUndefined();
  });
});

describe("تحلیل عرضه و تقاضا (supplyDemandStats)", () => {
  test("بازه‌های گرم/سرد و شاخص تعادل", async () => {
    const { supplyDemandStats } = await import("@/core/agent/analyzers");
    const rows = [
      { id: "1", rangeTitle: "۰-۵۰", propertyCount: 100, requestPercent: 80, status: "", syncedAt: new Date() },
      { id: "2", rangeTitle: "۵۰-۱۰۰", propertyCount: 60, requestPercent: 45, status: "", syncedAt: new Date() },
      { id: "3", rangeTitle: "۱۰۰-۲۰۰", propertyCount: 30, requestPercent: 10, status: "", syncedAt: new Date() },
    ] as Parameters<typeof supplyDemandStats>[0];
    const s = supplyDemandStats(rows);
    expect(s.rangeCount).toBe(3);
    expect(s.totalAds).toBe(190);
    expect(s.avgRequestPercent).toBeCloseTo(45, 1);
    expect(s.highDemand).toHaveLength(1);
    expect(s.topDemand!.rangeTitle).toBe("۰-۵۰");
    expect(s.lowDemand).toHaveLength(1);
    expect(s.topSupply!.rangeTitle).toBe("۰-۵۰");
  });
});

describe("تحلیل استعلام‌ها (lookupStats)", () => {
  test("نرخ موفقیت و کدهای پرتکرار", async () => {
    const { lookupStats } = await import("@/core/agent/analyzers");
    const logs = [
      { id: "1", kind: "PROPERTY", code: "111", found: true, personName: "نام یک", personMobile: "0914...", actorCode: "410", errorNote: null, createdAt: new Date(), personName_: null, address: null },
      { id: "2", kind: "PROPERTY", code: "111", found: true, personName: "نام یک", personMobile: "0914...", actorCode: "410", errorNote: null, createdAt: new Date(), address: null },
      { id: "3", kind: "REQUEST", code: "9", found: false, personName: null, personMobile: null, actorCode: "410", errorNote: "یافت نشد", createdAt: new Date(), address: null },
    ] as Parameters<typeof lookupStats>[0];
    const s = lookupStats(logs);
    expect(s.total).toBe(3);
    expect(s.found).toBe(2);
    expect(s.successRate).toBeCloseTo(66.7, 1);
    expect(s.topCodes[0].code).toBe("111");
    expect(s.topCodes[0].count).toBe(2);
    expect(s.notFound).toBe(1);
  });
});

// ==========================================================================
// ثبت کاشی‌ها و ایجنت‌های جدید
// ==========================================================================

describe("کاشی‌ها و ایجنت‌های جدید", () => {
  test("هر سه کاشی جدید در رجیستری با ایجنت ثبت‌شده‌اند", async () => {
    await import("@/core/tiles/bootstrap");
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const { getAgent } = await import("@/core/agent");

    for (const id of ["extraction", "visits", "supply-demand"]) {
      const tile = tileRegistry.get(id);
      expect(tile).not.toBeNull();
      expect(tile!.agent).not.toBeNull();
      expect(tile!.agent!.tileId).toBe(id);
      const agent = getAgent(id);
      expect(agent).not.toBeNull();
      expect(agent!.tileId).toBe(id);
    }
  });

  test("ایجنت استخراج اطلاعات دامنه‌های LOOKUP/COVERAGE/QUALITY/SECURITY دارد", async () => {
    const { getAgent } = await import("@/core/agent");
    const agent = getAgent("extraction");
    expect(agent!.insightDomains).toContain("LOOKUP");
    expect(agent!.insightDomains).toContain("SECURITY");
  });
});

// ==========================================================================
// زنجیره استعلام زنده با fetch شبیه‌سازی‌شده
// ==========================================================================

describe("زنجیره استعلام زنده (RealProvider)", () => {
  test("کدآگهی: by-code → details → owner با هم‌نشانی خطای غیربحرانی", async () => {
    const { getMelkProvider, resetMelkProvider } = await import("@/lib/melk-api/provider");
    resetMelkProvider();

    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("properties/info/by-code/777")) {
        return new Response(
          JSON.stringify({ statusCode: 200, status: true, data: { _id: "prop-777", title: "آپارتمان چناران", relatedRealtor: "مشاور تست" } }),
          { status: 200 }
        );
      }
      if (u.includes("properties/details/prop-777")) {
        return new Response(
          JSON.stringify({
            statusCode: 200,
            status: true,
            data: {
              details: [{ label: "متراژ", value: "۱۲۰", unit: "متر" }],
              address: "خیابان ارتش جنوبی",
              city: { name: "تبریز" },
            },
          }),
          { status: 200 }
        );
      }
      if (u.includes("properties/owner/prop-777")) {
        return new Response(
          JSON.stringify({
            statusCode: 200,
            status: true,
            data: { _id: "u9", firstName: "رضا", lastName: "زمانی", mobileNumber: "۰۹۱۴۱۲۳۴۵۶۷" },
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ statusCode: 404, status: false, message: "not found" }), { status: 404 });
    }) as unknown as typeof fetch;

    try {
      const provider = getMelkProvider();
      const result = await provider.lookupPropertyByCode("token", "777");
      expect(result.armId).toBe("prop-777");
      expect(result.title).toBe("آپارتمان چناران");
      expect(result.owner!.fullName).toBe("رضا زمانی");
      expect(result.owner!.mobile).toBe("09141234567");
      expect(result.address).toContain("خیابان ارتش جنوبی");
      expect(result.address).toContain("تبریز");
      expect(result.details).toHaveLength(1);
      expect(calls.some((c) => c.includes("properties/info/by-code/777"))).toBe(true);
      expect(calls.some((c) => c.includes("properties/details/prop-777"))).toBe(true);
      expect(calls.some((c) => c.includes("properties/owner/prop-777"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      resetMelkProvider();
    }
  });

  test("کدآگهی ناموجود → خطای فارسی NOT_FOUND", async () => {
    const { getMelkProvider, resetMelkProvider } = await import("@/lib/melk-api/provider");
    resetMelkProvider();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ statusCode: 200, status: true, data: {} }), { status: 200 })) as unknown as typeof fetch;

    try {
      const provider = getMelkProvider();
      let code = "";
      try {
        await provider.lookupPropertyByCode("token", "000");
      } catch (err) {
        code = (err as { code: string }).code;
      }
      expect(code).toBe("NOT_FOUND");
    } finally {
      globalThis.fetch = originalFetch;
      resetMelkProvider();
    }
  });

  test("کددرخواست: requests/list با فیلتر کد + تطبیق + applicant", async () => {
    const { getMelkProvider, resetMelkProvider } = await import("@/lib/melk-api/provider");
    resetMelkProvider();

    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("requests/details/req-55")) {
        return new Response(JSON.stringify({ statusCode: 200, status: true, data: { details: [{ label: "بودجه", value: "۵۰۰", unit: "میلیون" }] } }), { status: 200 });
      }
      if (u.includes("requests/applicant/req-55")) {
        return new Response(
          JSON.stringify({ statusCode: 200, status: true, data: { _id: "u55", firstName: "سارا", lastName: "قنبری", mobileNumber: "09351234567" } }),
          { status: 200 }
        );
      }
      if (u.includes("/requests")) {
        return new Response(
          JSON.stringify({
            statusCode: 200,
            status: true,
            data: {
              docs: [
                { _id: "req-55", code: "55", title: "درخواست آپارتمان ۱۲۰ متری", businessId: { title: "ملک تبریز — مرکزی" } },
                { _id: "req-56", code: "56", title: "درخواست دیگر" },
              ],
              totalDocs: 2,
              totalPages: 1,
            },
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ statusCode: 404, status: false, message: "not found" }), { status: 404 });
    }) as unknown as typeof fetch;

    try {
      const provider = getMelkProvider();
      const result = await provider.lookupRequestByCode("token", "55");
      expect(result.armId).toBe("req-55");
      expect(result.applicant!.fullName).toBe("سارا قنبری");
      expect(result.applicant!.mobile).toBe("09351234567");
      expect(result.businessTitle).toBe("ملک تبریز — مرکزی");
      expect(result.details).toHaveLength(1);
      // فیلتر کد باید در URL فرستاده شده باشد (قالب خود سامانه)
      expect(calls.some((c) => c.includes("code=55") || c.includes("code%5B%5D=55"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      resetMelkProvider();
    }
  });
});
