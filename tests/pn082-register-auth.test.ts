/**
 * تست‌های PN-082 — ریشهٔ شکست ثبت آگهی کاشی فایل‌یابی (گزارش مالک ۱۴۰۵/۰۸/۲۰)
 * ---------------------------------------------------------------------------
 * حادثه: پنج ثبت شکست‌خورده (۰۰:۴۷–۰۰:۵۴ تهران) — توکن دسترسی آرم ۴۸ ساعته
 * از ۱۹:۰۴ روز قبل منقضی شده بود؛ زنجیرهٔ تمدید مرده بود و خطای خام سامانه
 * («عدم احراز هویت! لطفاً دوباره وارد شوید») بدون راهنما به مالک می‌رسید.
 *
 * پوشش:
 *  ۱) خوانش محلی exp توکن (JWT واقعی حادثه به‌عنوان نمونه)
 *  ۲) پیش‌پرواز نشست آرم: غایب / معتبر / منقضی+تمدید موفق / منقضی+زنجیرهٔ مرده /
 *     منقضی+رلهٔ آفلاین
 *  ۳) مجری توکن‌دار: شکست تمدید → پیام اقدام‌پذیر (نه خطای خام آرم)
 *
 * صفر وابستگی DB — provider و updateSessionArmTokens با mock.module خنثی
 * می‌شوند (الگوی request-agent.intelligent.test.ts؛ mock پیش از import زنجیره).
 */

import { describe, expect, test, mock } from "bun:test";
import { MelkApiError } from "../src/lib/melk-api/types"; // ماژول خالص — پیش از mock ها بی‌خطر است

// ---------- نمونهٔ JWT واقعی حادثه (exp=1794238476 → ۱۴۰۵/۰۸/۱۸ ۱۹:۰۴ تهران) ----------
const b64 = (obj: Record<string, unknown>) =>
  btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const incidentJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64({
  id: "6a2841ba02eb57f832ee46f8",
  iat: 1794065676,
  exp: 1794238476,
})}.S9iFpvUoSzYZcovt9_MSrytirOxm87hC_emM`;
const futureJwt = `x.${b64({ id: "u1", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 })}.y`;

// ---------- خوانش exp (ماژول خالص — بدون mock) ----------
const { armTokenExpiresAtMs, isArmTokenLikelyValid, ARM_RELOGIN_MESSAGE } = await import(
  "@/lib/auth/arm-token-exp"
);

// ---------- خنثی‌سازی provider و نشست (پیش از بارگذاری زنجیرهٔ وابسته) ----------
const refreshCalls: string[] = [];
let refreshBehavior: "ok" | "dead" | "relay" = "ok";
const realProvider = await import("@/lib/melk-api/provider");
mock.module("@/lib/melk-api/provider", () => ({
  ...realProvider,
  getMelkProvider: () => ({
    refreshArmToken: async (rt: string) => {
      refreshCalls.push(rt);
      if (refreshBehavior === "dead") {
        const err = new Error("400") as Error & { code?: string };
        err.code = "UNAUTHORIZED";
        throw err;
      }
      if (refreshBehavior === "relay") {
        const e = new Error("رلهٔ موبایل (Poco F3) متصل نیست — اسکریپت رله روی گوشی اجرا نیست.");
        e.name = "RelayOfflineError";
        throw e;
      }
      return {
        accessToken: "NEW_ACCESS",
        refreshToken: "NEW_REFRESH",
        userType: "realtor",
      };
    },
  }),
}));

const realSession = await import("@/lib/auth/session");
const sessionUpdates: unknown[] = [];
mock.module("@/lib/auth/session", () => ({
  ...realSession,
  updateSessionArmTokens: async (sessionId: string, armTokens: unknown, vault?: unknown) => {
    sessionUpdates.push({ sessionId, armTokens, vault });
  },
}));

const { assessArmSession } = await import("@/lib/auth/arm-session-check");
const { execWithArmToken } = await import("@/lib/listing/crm-transfer");

/** نشست آزمایشی با توکن‌های دلخواه */
const sessionWith = (accessToken: string | null, refreshToken?: string | null) =>
  ({
    sessionId: "sess-test-1",
    personnelCode: "410031320",
    role: "OWNER",
    armTokens: accessToken ? { accessToken, refreshToken: refreshToken ?? null } : null,
  }) as Parameters<typeof assessArmSession>[0];

// ===================== ۱) خوانش محلی exp =====================

describe("خوانش محلی انقضای توکن آرم", () => {
  test("JWT واقعی حادثه → exp دقیق (۱۷۹۴۲۳۸۴۷۶۰۰۰)", () => {
    expect(armTokenExpiresAtMs(incidentJwt)).toBe(1794238476000);
  });

  test("توکن منقضی → isArmTokenLikelyValid=false", () => {
    expect(isArmTokenLikelyValid(incidentJwt)).toBe(false);
  });

  test("توکن با انقضای فردا → true", () => {
    expect(isArmTokenLikelyValid(futureJwt)).toBe(true);
  });

  test("رشتهٔ غیر JWT / توکن خام → null (بی‌طرف)", () => {
    expect(armTokenExpiresAtMs("garbage")).toBeNull();
    expect(armTokenExpiresAtMs(null)).toBeNull();
    expect(armTokenExpiresAtMs(undefined)).toBeNull();
    expect(isArmTokenLikelyValid("opaque-token")).toBeNull();
  });
});

// ===================== ۲) پیش‌پرواز نشست آرم =====================

describe("پیش‌پرواز نشست آرم (assessArmSession)", () => {
  test("بدون توکن → ثبت غیرفعال با پیام ورود کد پرسنلی", async () => {
    const r = await assessArmSession(sessionWith(null));
    expect(r.ok).toBe(false);
    expect(r.message).toContain("کد پرسنلی");
  });

  test("توکن معتبر → مجاز", async () => {
    const r = await assessArmSession(sessionWith(futureJwt, "RT_OK"));
    expect(r.ok).toBe(true);
    expect(refreshCalls.length).toBe(0); // تماس تمدید لازم نیست
  });

  test("توکن منقضی + تمدید موفق → مجاز + تمدید در نشست و صندوقچه", async () => {
    refreshBehavior = "ok";
    refreshCalls.length = 0;
    sessionUpdates.length = 0;
    const r = await assessArmSession(sessionWith(incidentJwt, "RT_ALIVE"));
    expect(r.ok).toBe(true);
    expect(r.message).toContain("خودکار تمدید شد");
    expect(refreshCalls).toEqual(["RT_ALIVE"]);
    expect(sessionUpdates.length).toBe(1);
    expect((sessionUpdates[0] as { armTokens: { accessToken: string } }).armTokens.accessToken).toBe("NEW_ACCESS");
  });

  test("توکن منقضی + زنجیرهٔ مرده → ثبت غیرفعال با پیام اقدام‌پذیر ورود مجدد", async () => {
    refreshBehavior = "dead";
    const r = await assessArmSession(sessionWith(incidentJwt, "RT_DEAD"));
    expect(r.ok).toBe(false);
    expect(r.message).toBe(ARM_RELOGIN_MESSAGE);
    expect(r.message).toContain("کد پرسنلی");
    expect(r.message).not.toContain("عدم احراز");
  });

  test("توکن منقضی + رلهٔ آفلاین → پیام مخصوص رله", async () => {
    refreshBehavior = "relay";
    const r = await assessArmSession(sessionWith(incidentJwt, "RT_X"));
    expect(r.ok).toBe(false);
    expect(r.message).toContain("رلهٔ موبایل");
  });

  test("توکن منقضی بدون توکن تمدید → پیام ورود مجدد", async () => {
    const r = await assessArmSession(sessionWith(incidentJwt, null));
    expect(r.ok).toBe(false);
    expect(r.message).toBe(ARM_RELOGIN_MESSAGE);
  });
});

// ===================== ۳) مجری توکن‌دار =====================

describe("execWithArmToken — مرگ زنجیرهٔ تمدید", () => {
  test("شکست ۴۰۱ آرم + تمدید مرده → پیام اقدام‌پذیر (نه «عدم احراز هویت» خام)", async () => {
    refreshBehavior = "dead";
    refreshCalls.length = 0;
    const guard = sessionWith(incidentJwt, "RT_DEAD") as Parameters<typeof execWithArmToken>[0];
    let thrown: unknown;
    try {
      await execWithArmToken(guard, async () => {
        // عین پاسخ خام سامانه آرم در حادثه
        throw new MelkApiError("OTP_INVALID", "عدم احراز هویت! لطفاً دوباره وارد شوید", 401, false);
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(MelkApiError);
    const e = thrown as MelkApiError;
    expect(e.code).toBe("UNAUTHORIZED");
    expect(e.message).toBe(ARM_RELOGIN_MESSAGE);
    expect(e.message).toContain("کد پرسنلی");
    expect(refreshCalls.length).toBe(1); // تلاش تمدید انجام شد
  });

  test("شکست ۴۰۱ + تمدید موفق → اجرای مجدد fn با توکن تازه", async () => {
    refreshBehavior = "ok";
    refreshCalls.length = 0;
    sessionUpdates.length = 0;
    const guard = sessionWith(incidentJwt, "RT_ALIVE") as Parameters<typeof execWithArmToken>[0];
    let calls = 0;
    const result = await execWithArmToken(guard, async (token) => {
      calls++;
      if (token === incidentJwt) {
        throw new MelkApiError("OTP_INVALID", "عدم احراز هویت! لطفاً دوباره وارد شوید", 401, false);
      }
      return `ok:${token}`;
    });
    expect(result).toBe("ok:NEW_ACCESS");
    expect(calls).toBe(2);
    expect(sessionUpdates.length).toBe(1);
  });

  test("خطای غیراحراز (شبکه) → عیناً بازتاب (بدون تلاش تمدید)", async () => {
    refreshBehavior = "ok";
    refreshCalls.length = 0;
    const guard = sessionWith(futureJwt, "RT_ALIVE") as Parameters<typeof execWithArmToken>[0];
    let thrown: unknown;
    try {
      await execWithArmToken(guard, async () => {
        throw new MelkApiError("NETWORK_ERROR", "ارتباط با سامانه ملک تبریز برقرار نشد.", 0, true);
      });
    } catch (err) {
      thrown = err;
    }
    expect((thrown as MelkApiError).code).toBe("NETWORK_ERROR");
    expect(refreshCalls.length).toBe(0);
  });
});
