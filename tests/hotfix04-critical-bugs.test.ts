/**
 * تست‌های HOTFIX-04 — رفع باگ‌های بحرانی (B1, B2, B3, B7)
 * ------------------------------------------------------
 * B1) try/catch روت‌ها: تزریق خطای DB → پاکت فارسی استاندارد (نه 500 خام)
 * B2) قفل خود-تمدیدشونده RATE_LIMITED: تلاش ردشده نباید رکورد جدید بسازد
 * B3) JSON.parse خراب در رکورد → 422 فارسی (نه 500)
 * B7) ناسازگاری 200+ok:false → کد وضعیت صحیح (502/400)
 */

import { describe, expect, test, afterAll } from "bun:test";
import { createHash } from "crypto";

const { db } = await import("@/lib/db");

const createdSessions: string[] = [];
async function makeSession(role: "OWNER" | "CONSULTANT" = "OWNER") {
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode: role === "OWNER" ? "930001" : "930002", displayName: `تست B ${role}`, role },
    { ip: "127.0.0.1" },
    null
  );
  createdSessions.push(token);
  return token;
}

const TEST_PERSONNEL = ["940001", "940002", "940003"];
const TEST_LISTING_IDS: string[] = [];

afterAll(async () => {
  for (const t of createdSessions) {
    await db.session.deleteMany({ where: { tokenHash: createHash("sha256").update(t).digest("hex") } }).catch(() => undefined);
  }
  await db.otpAttempt.deleteMany({ where: { personnelCode: { in: TEST_PERSONNEL } } }).catch(() => undefined);
  await db.listingRecord.deleteMany({ where: { id: { in: TEST_LISTING_IDS } } }).catch(() => undefined);
  await db.$disconnect();
});

// ==========================================================================
// B1 — پاکت خطای استاندارد هنگام خطای DB
// ==========================================================================

describe("HOTFIX-04/B1 — try/catch روت‌ها با پاکت فارسی", () => {
  test("auth/session PATCH با خطای DB → 500 استاندارد با پیام فارسی (نه crash)", async () => {
    const { NextRequest } = await import("next/server");
    const token = await makeSession();
    const route = await import("@/app/api/auth/session/route");

    // تزریق خطای DB: update نشست fail می‌شود
    const original = db.session.update.bind(db.session);
    (db.session as unknown as { update: unknown }).update = () => {
      throw new Error("SIMULATED_DB_DOWN");
    };
    try {
      const req = new NextRequest("http://localhost/api/auth/session", {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}` },
      });
      const res = await route.PATCH(req);
      expect(res.status).toBe(500);
      const body = (await res.json()) as { ok: boolean; code: string; message: string };
      expect(body.ok).toBe(false);
      expect(body.message).toContain("ناموفق"); // پیام فارسی، نه stack انگلیسی
    } finally {
      (db.session as unknown as { update: unknown }).update = original;
    }
  });

  test("auth/session GET با خطای DB → 500 استاندارد فارسی", async () => {
    const { NextRequest } = await import("next/server");
    const token = await makeSession();
    const route = await import("@/app/api/auth/session/route");

    const original = db.session.findUnique.bind(db.session);
    (db.session as unknown as { findUnique: unknown }).findUnique = () => {
      throw new Error("SIMULATED_DB_DOWN");
    };
    try {
      const req = new NextRequest("http://localhost/api/auth/session", {
        headers: { authorization: `Bearer ${token}` },
      });
      const res = await route.GET(req);
      expect(res.status).toBe(500);
      const body = (await res.json()) as { ok: boolean; message: string };
      expect(body.ok).toBe(false);
      expect(body.message).toContain("نشست");
    } finally {
      (db.session as unknown as { findUnique: unknown }).findUnique = original;
    }
  });

  test("auth/session DELETE با خطای DB → 500 استاندارد فارسی", async () => {
    const { NextRequest } = await import("next/server");
    const token = await makeSession();
    const route = await import("@/app/api/auth/session/route");

    const original = db.session.update.bind(db.session);
    (db.session as unknown as { update: unknown }).update = () => {
      throw new Error("SIMULATED_DB_DOWN");
    };
    try {
      const req = new NextRequest("http://localhost/api/auth/session", {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const res = await route.DELETE(req);
      expect(res.status).toBe(500);
      const body = (await res.json()) as { ok: boolean; message: string };
      expect(body.ok).toBe(false);
    } finally {
      (db.session as unknown as { update: unknown }).update = original;
    }
  });
});

// ==========================================================================
// B2 — قفل خود-تمدیدشونده RATE_LIMITED
// ==========================================================================

describe("HOTFIX-04/B2 — قفل RATE_LIMITED خودش را تمدید نمی‌کند", () => {
  test("request-otp: ۵ تلاش سریع → ۳ اول موفق، ۴ و ۵ RATE_LIMITED و رکورد شکست جدید ساخته نمی‌شود", async () => {
    const { NextRequest } = await import("next/server");
    const { getMelkProvider } = await import("@/lib/melk-api/provider");
    const route = await import("@/app/api/auth/request-otp/route");
    const code = TEST_PERSONNEL[0];
    await db.otpAttempt.deleteMany({ where: { personnelCode: code } });

    // شبیه‌سازی موفقیت ارسال پیامک (بدون شبکه واقعی)
    const provider = getMelkProvider();
    const original = provider.requestOtp;
    provider.requestOtp = async () => ({ ok: true, expiresInSeconds: 120, message: "شبیه‌سازی تست" });

    const statuses: number[] = [];
    try {
      for (let i = 0; i < 5; i++) {
        const req = new NextRequest("http://localhost/api/auth/request-otp", {
          method: "POST",
          body: JSON.stringify({ personnelCode: code }),
        });
        const res = await route.POST(req);
        statuses.push(res.status);
      }
    } finally {
      provider.requestOtp = original;
    }

    // پیکربندی: otpRequestMax=3 در پنجره ۱۰ دقیقه
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
    expect(statuses[4]).toBe(429);

    // هسته رفع باگ: تلاش‌های «ردشده توسط محدودساز» رکورد جدید نساخته‌اند
    const attempts = await db.otpAttempt.count({ where: { personnelCode: code, kind: "REQUEST_OTP" } });
    expect(attempts).toBe(3); // قبل از رفع: 5 می‌شد (قفل خود-تمدیدشونده)

    // تلاش ششم و هفتم هم RATE_LIMITED (قفل جدیدی ایجاد نشد ولی قفل موجود پابرجاست)
    for (let i = 0; i < 2; i++) {
      const req = new NextRequest("http://localhost/api/auth/request-otp", {
        method: "POST",
        body: JSON.stringify({ personnelCode: code }),
      });
      const res = await route.POST(req);
      expect(res.status).toBe(429);
    }
    const attemptsAfter = await db.otpAttempt.count({ where: { personnelCode: code, kind: "REQUEST_OTP" } });
    expect(attemptsAfter).toBe(3); // همچنان ۳ — پنجره لغزان ثابت مانده
  });

  test("verify-otp: ۵ شکست متوالی → قفل؛ تلاش‌های بیشتر در حالت قفل رکورد نمی‌سازند", async () => {
    const { NextRequest } = await import("next/server");
    const { getMelkProvider } = await import("@/lib/melk-api/provider");
    const { MelkApiError } = await import("@/lib/melk-api/types");
    const route = await import("@/app/api/auth/verify-otp/route");
    const code = TEST_PERSONNEL[1];
    await db.otpAttempt.deleteMany({ where: { personnelCode: code } });

    // شبیه‌سازی کد اشتباه (خطای معتبر، نه شبکه)
    const provider = getMelkProvider();
    const original = provider.verifyOtp;
    provider.verifyOtp = async () => {
      throw new MelkApiError("OTP_INVALID", "کد پیامکی نادرست است.", 401, false);
    };

    const statuses: number[] = [];
    try {
      for (let i = 0; i < 7; i++) {
        const req = new NextRequest("http://localhost/api/auth/verify-otp", {
          method: "POST",
          body: JSON.stringify({ personnelCode: code, otp: "1234" }),
        });
        const res = await route.POST(req);
        statuses.push(res.status);
      }
    } finally {
      provider.verifyOtp = original;
    }

    // ۵ شکست واقعی (401) سپس قفل (429)
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
    expect(statuses[6]).toBe(429);

    // هسته رفع باگ: فقط ۵ رکورد شکست وجود دارد — تلاش ۶ و ۷ (RATE_LIMITED) رکورد نساخته‌اند
    const fails = await db.otpAttempt.count({ where: { personnelCode: code, kind: "VERIFY_OTP", success: false } });
    expect(fails).toBe(5); // قبل از رفع: 7 می‌شد
  });
});

// ==========================================================================
// B3 — JSON خراب روی رکورد → 422
// ==========================================================================

describe("HOTFIX-04/B3 — JSON.parse خراب → 422 فارسی", () => {
  test("PATCH فایل با inputsJson خراب → 422 با پیام راهنما (نه 500)", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/listings/[id]/route");
    const token = await makeSession();

    // رکورد با JSON خراب (عین سناریوی واقعی: نوشتن ناقص/دستکاری)
    const id = `test-corrupt-${Date.now()}`;
    TEST_LISTING_IDS.push(id);
    await db.listingRecord.create({
      data: {
        id,
        customerName: "مشتری تست",
        tradeTypeId: "sell",
        propertyTypeId: "apartment",
        inputsJson: `{"قیمت": "خراب`, // JSON ناقص
        actorCode: "930001",
      } as never,
    });

    const req = new NextRequest(`http://localhost/api/listings/${id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ customerName: "مشتری تست به‌روزرسانی‌شده" }),
    });
    const res = await route.PATCH(req, { params: Promise.resolve({ id }) });
    expect(res.status).toBe(422); // نه 500
    const body = (await res.json()) as { ok: boolean; code: string; message: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("UNPROCESSABLE");
    expect(body.message).toContain("خراب");
  });

  test("PATCH فایل با JSON سالم → رفتار عادی حفظ شده", async () => {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/listings/[id]/route");
    const token = await makeSession();

    const id = `test-clean-${Date.now()}`;
    TEST_LISTING_IDS.push(id);
    await db.listingRecord.create({
      data: {
        id,
        customerName: "مشتری تست",
        tradeTypeId: "sell",
        propertyTypeId: "apartment",
        inputsJson: `{"قیمت": "۱۰۰۰۰۰۰۰۰"}`,
        actorCode: "930001",
      } as never,
    });

    const req = new NextRequest(`http://localhost/api/listings/${id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ customerName: "به‌روزرسانی" }),
    });
    const res = await route.PATCH(req, { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

// ==========================================================================
// B7 — کد وضعیت صحیح برای ok:false
// ==========================================================================

describe("HOTFIX-04/B7 — حذف ناسازگاری 200+ok:false", () => {
  test("divar/connection start-phone با شماره نامعتبر → 502 (نه 200 با ok:false)", async () => {
    const { NextRequest } = await import("next/server");
    const token = await makeSession("OWNER"); // HOTFIX-03: فقط OWNER
    const route = await import("@/app/api/divar/connection/route");

    const req = new NextRequest("http://localhost/api/divar/connection", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "start-phone", phone: "12345" }), // نامعتبر → بدون شبکه
    });
    const res = await route.POST(req);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toContain("۰۹");
  });

  test("divar/connection save-kenar با کلید کوتاه → 400 (نه 200 با ok:false)", async () => {
    const { NextRequest } = await import("next/server");
    const token = await makeSession("OWNER");
    const route = await import("@/app/api/divar/connection/route");

    const req = new NextRequest("http://localhost/api/divar/connection", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "save-kenar", apiKey: "short" }), // < 10 نویسه → نامعتبر بدون شبکه
    });
    const res = await route.POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  test("requests/meta/form با خطای بالادستی → 502 (نه 200 با ok:false)", async () => {
    const { NextRequest } = await import("next/server");
    const token = await makeSession();
    const route = await import("@/app/api/requests/meta/form/route");

    // شبیه‌سازی قطعی سامانه آرم: fetch سراسری فوراً fail می‌شود
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    try {
      const req = new NextRequest(
        "http://localhost/api/requests/meta/form?tradeType=sell&buildingType=residential&propertyType=apartment",
        { headers: { authorization: `Bearer ${token}` } }
      );
      const res = await route.GET(req);
      expect(res.status).toBe(502); // قبل از رفع: 200 با ok:false
      const body = (await res.json()) as { ok: boolean; fields: unknown[] };
      expect(body.ok).toBe(false);
      expect(body.fields).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("requests/meta/form بدون پارامتر کامل → 200 با ok:true و فیلد خالی (قرارداد موفق unchanged)", async () => {
    const { NextRequest } = await import("next/server");
    const token = await makeSession();
    const route = await import("@/app/api/requests/meta/form/route");

    const req = new NextRequest("http://localhost/api/requests/meta/form?tradeType=sell", {
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; fields: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.fields).toEqual([]);
  });
});
