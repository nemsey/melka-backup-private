/**
 * تست‌های P6.5-07 — «اتصال ARM با کد پیامکی» در تنظیمات عمومی
 * ------------------------------------------------------
 * دستور مالک (۱۴۰۵/۰۶/۳۰): در کاشی تنظیمات عمومی، اتصال به ARM با
 * کد پیامکی تعبیه شود تا ورود با کد مستر هم بتواند به ARM متصل شود.
 *
 * روت هدف: /api/arm/connection (GET وضعیت · POST start-otp|verify|disconnect)
 *
 * پوشش (بدون هیچ تماس شبکه — مرز اعتبارسنجی/DB):
 *  A) GET بدون نشست → 401
 *  B) GET نشست بدون توکن ARM (ورود کد مستر) → disconnected
 *  C) GET نشست با توکن ARM (ورود OTP) → connected + userType
 *  D) POST عملیات نامعتبر → 400
 *  E) POST start-otp با کد پرسنلی کوتاه → 400 (قبل از تماس شبکه)
 *  F) POST verify با کد ۵ رقمی/غیرعدد → 400 (قبل از تماس شبکه)
 *  G) POST disconnect: توکن‌های نشست پاک می‌شوند، نشست زنده می‌ماند
 *  H) شبیه‌سازی اتصال موفق: updateSessionArmTokens → GET connected + userType
 *     (همان کاری که verify موفق انجام می‌دهد — بدون تماس شبکه)
 *  I) جریان کامل مالک: نشست بدون توکن → attach → connected → disconnect → disconnected
 *
 * P6.5-11 (بند ث) — اتصال ماندگار ARM:
 *  · صندوقچهٔ ArmConnection باید بین تست‌ها پاک شود (ایزوله‌سازی)
 *  · تست جدید L: ورود کد مستر پس از اتصال قبلی ⇒ بازیابی خودکار توکن (بدون پیامک)
 */

import { describe, expect, test, afterAll } from "bun:test";
import { createHash } from "crypto";

const { db } = await import("@/lib/db");

// P6.5-11 (بند ث) — صندوقچهٔ اتصال ماندگار: خالی در شروع و پایان (ایزوله‌سازی تست‌ها)
await db.armConnection.deleteMany({}).catch(() => undefined);

const created: string[] = [];

/** نشست آزمایشی — عین الگوی hotfix03 */
async function makeSession(
  role: "OWNER" | "CONSULTANT",
  armTokens?: { accessToken: string; refreshToken?: string; userType?: string } | null
) {
  const { createSession } = await import("@/lib/auth/session");
  const code = role === "OWNER" ? "930001" : "930002";
  const { token, context } = await createSession(
    { personnelCode: code, displayName: `تست ${role}`, role },
    { ip: "127.0.0.1" },
    armTokens ? { accessToken: armTokens.accessToken, refreshToken: armTokens.refreshToken ?? "", userType: armTokens.userType } : null
  );
  created.push(token);
  return { token, context, code };
}

function getReq(token: string) {
  return new Request("http://localhost/api/arm/connection", {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
}

function postReq(token: string | null, body: unknown) {
  return new Request("http://localhost/api/arm/connection", {
    method: "POST",
    headers: {
      authorization: token ? `Bearer ${token}` : "",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

afterAll(async () => {
  for (const t of created) {
    await db.session.deleteMany({ where: { tokenHash: createHash("sha256").update(t).digest("hex") } }).catch(() => undefined);
  }
  await db.armConnection.deleteMany({}).catch(() => undefined);
  await db.auditLog.deleteMany({ where: { actor: { in: ["930001", "930002"] } } }).catch(() => undefined);
  await db.otpAttempt.deleteMany({ where: { personnelCode: { in: ["930001", "930002", "123", "1234567890123"] } } }).catch(() => undefined);
  await db.$disconnect();
});

describe("P6.5-07 /api/arm/connection — گارد و وضعیت", () => {
  test("A) GET بدون نشست → 401", async () => {
    const { GET } = await import("@/app/api/arm/connection/route");
    const res = await GET(new Request("http://localhost/api/arm/connection") as never);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("UNAUTHORIZED");
  });

  test("B) GET نشست بدون توکن ARM (سناریوی ورود با کد مستر) → disconnected", async () => {
    const { GET } = await import("@/app/api/arm/connection/route");
    const s = await makeSession("OWNER", null);
    const res = await GET(getReq(s.token) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; connection: { status: string; hasToken: boolean; role: string } };
    expect(body.ok).toBe(true);
    expect(body.connection.status).toBe("disconnected");
    expect(body.connection.hasToken).toBe(false);
    expect(body.connection.role).toBe("OWNER");
  });

  test("C) GET نشست با توکن ARM (سناریوی ورود OTP) → connected + userType", async () => {
    const { GET } = await import("@/app/api/arm/connection/route");
    const s = await makeSession("CONSULTANT", { accessToken: "arm-token-test-abc", refreshToken: "arm-refresh-test", userType: "realtor" });
    const res = await GET(getReq(s.token) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; connection: { status: string; hasToken: boolean; userType: string | null } };
    expect(body.connection.status).toBe("connected");
    expect(body.connection.hasToken).toBe(true);
    expect(body.connection.userType).toBe("realtor");
  });
});

describe("P6.5-07 /api/arm/connection — اعتبارسنجی ورودی (مرز قبل از شبکه)", () => {
  test("D) POST عملیات نامعتبر → 400", async () => {
    const { POST } = await import("@/app/api/arm/connection/route");
    const s = await makeSession("OWNER", null);
    const res = await POST(postReq(s.token, { action: "nonsense" }) as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  test("D2) POST بدون بدنه JSON → 400", async () => {
    const { POST } = await import("@/app/api/arm/connection/route");
    const s = await makeSession("OWNER", null);
    const res = await POST(
      new Request("http://localhost/api/arm/connection", {
        method: "POST",
        headers: { authorization: `Bearer ${s.token}` },
        body: "not-json{{",
      }) as never
    );
    expect(res.status).toBe(400);
  });

  test("E) start-otp با کد پرسنلی کوتاه → 400 INVALID_PERSONNEL_CODE", async () => {
    const { POST } = await import("@/app/api/arm/connection/route");
    const s = await makeSession("OWNER", null);
    const res = await POST(postReq(s.token, { action: "start-otp", personnelCode: "123" }) as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(body.code).toBe("INVALID_PERSONNEL_CODE");
  });

  test("E2) start-otp بدون کد پرسنلی → 400", async () => {
    const { POST } = await import("@/app/api/arm/connection/route");
    const s = await makeSession("OWNER", null);
    const res = await POST(postReq(s.token, { action: "start-otp" }) as never);
    expect(res.status).toBe(400);
  });

  test("F) verify با کد ۵ رقمی → 400 OTP_INVALID (ARM فقط ۴ رقم)", async () => {
    const { POST } = await import("@/app/api/arm/connection/route");
    const s = await makeSession("OWNER", null);
    const res = await POST(postReq(s.token, { action: "verify", personnelCode: "410031320", otp: "12345" }) as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(body.code).toBe("OTP_INVALID");
  });

  test("F2) verify با ارقام فارسی ناقص («۱۲») → 400", async () => {
    const { POST } = await import("@/app/api/arm/connection/route");
    const s = await makeSession("OWNER", null);
    const res = await POST(postReq(s.token, { action: "verify", personnelCode: "410031320", otp: "۱۲" }) as never);
    expect(res.status).toBe(400);
  });

  test("F3) verify با کد پرسنلی نامعتبر → 400 INVALID_PERSONNEL_CODE", async () => {
    const { POST } = await import("@/app/api/arm/connection/route");
    const s = await makeSession("OWNER", null);
    const res = await POST(postReq(s.token, { action: "verify", personnelCode: "12", otp: "1234" }) as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_PERSONNEL_CODE");
  });

  test("F4) POST بدون نشست → 401 (حتی قبل از اعتبارسنجی بدنه)", async () => {
    const { POST } = await import("@/app/api/arm/connection/route");
    const res = await POST(postReq(null, { action: "verify", personnelCode: "410031320", otp: "1234" }) as never);
    expect(res.status).toBe(401);
  });
});

describe("P6.5-07 — چرخه اتصال نشست (بدون تماس شبکه — عین اثر verify موفق)", () => {
  test("G) disconnect: توکن پاک می‌شود، نشست زنده می‌ماند", async () => {
    const { POST, GET } = await import("@/app/api/arm/connection/route");
    const { validateSession } = await import("@/lib/auth/session");
    const s = await makeSession("OWNER", { accessToken: "arm-token-x", refreshToken: "arm-refresh-x", userType: "realtor" });

    // قبل: متصل
    let body = (await (await GET(getReq(s.token) as never)).json()) as { connection: { status: string } };
    expect(body.connection.status).toBe("connected");

    // قطع اتصال
    const res = await POST(postReq(s.token, { action: "disconnect" }) as never);
    expect(res.status).toBe(200);
    const rb = (await res.json()) as { ok: boolean };
    expect(rb.ok).toBe(true);

    // بعد: قطع — اما نشست همچنان معتبر
    body = (await (await GET(getReq(s.token) as never)).json()) as { connection: { status: string } };
    expect(body.connection.status).toBe("disconnected");
    const still = await validateSession(s.token);
    expect(still).not.toBeNull();
    expect(still?.armTokens).toBeNull();
  });

  test("H) updateSessionArmTokens (اثر verify موفق): توکن + userType متصل می‌شود", async () => {
    const { GET } = await import("@/app/api/arm/connection/route");
    const { updateSessionArmTokens } = await import("@/lib/auth/session");
    // ایزوله‌سازی از اتصال ماندگار تست‌های قبلی (این تست چرخهٔ نشست را می‌سنجد نه بند ث را)
    await db.armConnection.deleteMany({ where: { ownerKey: "master" } }).catch(() => undefined);
    // مالکِ واردشده با کد مستر — بدون توکن
    const s = await makeSession("OWNER", null);
    let body = (await (await GET(getReq(s.token) as never)).json()) as {
      connection: { status: string; hasToken?: boolean; userType?: string | null };
    };
    expect(body.connection.status).toBe("disconnected");

    // اتصال — همان کاری که verify موفق با توکن‌های SAM انجام می‌دهد
    await updateSessionArmTokens(s.context.sessionId, {
      accessToken: "arm-token-from-verify",
      refreshToken: "arm-refresh-from-verify",
      userType: "realtor",
    });

    body = (await (await GET(getReq(s.token) as never)).json()) as {
      connection: { status: string; hasToken?: boolean; userType?: string | null };
    };
    expect(body.connection.status).toBe("connected");
    expect(body.connection.hasToken).toBe(true);
    expect(body.connection.userType).toBe("realtor");
  });

  test("I) جریان کامل مالک: کد مستر → بدون توکن → attach(verify) → متصل → disconnect → قطع", async () => {
    const { GET } = await import("@/app/api/arm/connection/route");
    const { updateSessionArmTokens, clearSessionArmTokens } = await import("@/lib/auth/session");

    // ایزوله‌سازی از اتصال ماندگار تست‌های قبلی (این تست چرخهٔ نشست را می‌سنجد نه بند ث را)
    await db.armConnection.deleteMany({ where: { ownerKey: "master" } }).catch(() => undefined);
    const s = await makeSession("OWNER", null);
    const status = async () =>
      ((await (await GET(getReq(s.token) as never)).json()) as { connection: { status: string } }).connection.status;

    expect(await status()).toBe("disconnected");

    await updateSessionArmTokens(s.context.sessionId, { accessToken: "t1", refreshToken: "r1", userType: "realtor" });
    expect(await status()).toBe("connected");

    await clearSessionArmTokens(s.context.sessionId);
    expect(await status()).toBe("disconnected");
  });

  test("J) توکن ARM هرگز به نشست دیگری نشت نمی‌کند (SEC-3) — نشست دوم بدون توکن می‌ماند", async () => {
    const { GET } = await import("@/app/api/arm/connection/route");
    const { updateSessionArmTokens } = await import("@/lib/auth/session");
    // ایزوله‌سازی: مشاور ۹۳۰۰۰۰۲ هیچ اتصال ماندگاری ندارد (صندوقچهٔ خودش خالی)
    await db.armConnection.deleteMany({ where: { ownerKey: "930002" } }).catch(() => undefined);
    const owner = await makeSession("OWNER", null);
    const other = await makeSession("CONSULTANT", null);

    await updateSessionArmTokens(owner.context.sessionId, { accessToken: "owner-token", refreshToken: "owner-refresh", userType: "realtor" });

    const ownerBody = (await (await GET(getReq(owner.token) as never)).json()) as { connection: { status: string } };
    const otherBody = (await (await GET(getReq(other.token) as never)).json()) as { connection: { status: string } };
    expect(ownerBody.connection.status).toBe("connected");
    expect(otherBody.connection.status).toBe("disconnected");
  });

  test("L) P6.5-11 (بند ث) — اتصال ماندگار: ورود مجدد کد مستر ⇒ بازیابی خودکار توکن ARM (بدون پیامک)", async () => {
    const { GET } = await import("@/app/api/arm/connection/route");
    const { updateSessionArmTokens } = await import("@/lib/auth/session");
    // مالک با کد مستر وارد و از تنظیمات به ARM وصل می‌شود
    const first = await makeSession("OWNER", null);
    await updateSessionArmTokens(first.context.sessionId, { accessToken: "durable-token-1", refreshToken: "durable-refresh-1", userType: "realtor" }, { ownerKey: "master", personnelCode: "410031320" });

    // خروج (نشست باطل؛ صندوقچه ماندگار می‌ماند)
    const { revokeSession } = await import("@/lib/auth/session");
    await revokeSession(first.token, "USER_LOGOUT");

    // ورود مجدد با کد مستر ⇒ توکن ARM خودکار بازیابی می‌شود — بدون پیامک مجدد
    const second = await makeSession("OWNER", null);
    const body = (await (await GET(getReq(second.token) as never)).json()) as {
      connection: { status: string };
      vault: { durable: boolean } | null;
    };
    expect(body.connection.status).toBe("connected");
    expect(body.vault?.durable).toBe(true);
  });
});

describe("P6.5-07 — رجیستری UI", () => {
  test("K) (ن۰۵۵) ArmConnectionSection احیا شد — فرم مستقیم اتصال ARM بدون قفل (PN-034) · OtpReloginSection مرده", async () => {
    const fs = await import("fs");
    // PN-034 (شورا-ن۰۵۵ · قانون مالک: صفر محدودیت): بخش «ورود مجدد» حذف کامل؛
    // فرم مستقیم «اتصال به حساب شخصی ARM» (همان روت /api/arm/connection) احیا شد
    const unifiedSrc = fs.readFileSync("src/core/tiles/tiles/settings/MelkTabrizConnectionSection.tsx", "utf8");
    expect(unifiedSrc.includes("ArmConnectionSection")).toBe(true);
    expect(unifiedSrc.includes("OtpReloginSection")).toBe(false);
    expect(fs.existsSync("src/core/tiles/tiles/settings/OtpReloginSection.tsx")).toBe(false);
    const settingsSrc = fs.readFileSync("src/core/tiles/tiles/settings/SettingsPage.tsx", "utf8");
    expect(settingsSrc.includes("MelkTabrizConnectionSection")).toBe(true);
    // کامپوننت و روت پابرجا هستند — بدون هیچ سقف نرخ محلی
    expect(fs.existsSync("src/app/api/arm/connection/route.ts")).toBe(true);
    expect(fs.existsSync("src/core/tiles/tiles/settings/ArmConnectionSection.tsx")).toBe(true);
    const routeSrc = fs.readFileSync("src/app/api/arm/connection/route.ts", "utf8");
    expect(routeSrc.includes("checkRate")).toBe(false);
  });
});
