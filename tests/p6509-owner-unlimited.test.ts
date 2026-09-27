/**
 * تست‌های P6.5-09 — دستور مالک شش‌بندی (۱۴۰۵/۰۶/۳۱)
 * ------------------------------------------------------
 *  بند ۵ — رفع باگ سهمیهٔ مشترک پیامک PM/ARM:
 *    A) سبد سهمیهٔ مستقل: REQUEST_OTP / REQUEST_OTP_PM / REQUEST_OTP_ARM
 *       و VERIFY_* جدا شمرده می‌شوند (PM سپس ARM دیگر همدیگر را نمی‌بندند)
 *    B) گارد نرخ PM فعال است (قبلاً هیچ گارد محلی نداشت)
 *  بند ۵ — دسته‌بندی خطای پیامک (خالص):
 *    C) «قبلاً ارسال شده» ⇒ ALREADY_SENT · «سقف» ⇒ LIMIT_REACHED · سایر ⇒ OTHER
 *  بند ۶ — کلید ریست ARM:
 *    D) POST /api/arm/connection action=reset ⇒ توکن پاک + رد ARM_RESET + پیام فارسی
 *  بند ۴ — لیست‌های بدون صفحه‌بندی (شاهد ساختاری روی سورس، عین الگوی تست‌های رجیستری):
 *    E) TransactionsPage بدون دکمه صفحه/pageState · ContractsPage با limit=5000
 *       · Requests/Listings بدون slice(0, pageSize) · تعریف pageSize از هر ۴ کاشی حذف
 *       · سقف API: قرارداد ۵۰۰۰ · lookup ۱۰۰۰ · دیوار ۱۰۰۰
 *  بند ۳ — قانون مالک (تکرارپذیر روی DB تست):
 *    F) مالک همهٔ موجودیت‌ها را بدون هیچ فیلتری می‌بیند (۷۲۸/۲۹۱ عین مقیاس واقعی)
 */

import { describe, expect, test, afterAll, beforeAll } from "bun:test";
import { createHash } from "crypto";
import { readFileSync } from "fs";

const { db } = await import("@/lib/db");

const OWNER_CODE = "940001";
const EXPERT_CODE = "940002";
const ARM_CODE = "940010"; // کد پرسنلی آزمون سهمیه

const createdSessions: string[] = [];
const attemptCodes = [OWNER_CODE, EXPERT_CODE, ARM_CODE, "940100", "940200", "940300"];

afterAll(async () => {
  for (const t of createdSessions) {
    await db.session.deleteMany({ where: { tokenHash: createHash("sha256").update(t).digest("hex") } }).catch(() => undefined);
  }
  await db.auditLog.deleteMany({ where: { actor: { in: [OWNER_CODE, EXPERT_CODE] } } }).catch(() => undefined);
  await db.otpAttempt.deleteMany({ where: { personnelCode: { in: attemptCodes } } }).catch(() => undefined);
  await db.$disconnect();
});

async function makeSession(role: "OWNER" | "CONSULTANT") {
  const { createSession } = await import("@/lib/auth/session");
  const code = role === "OWNER" ? OWNER_CODE : EXPERT_CODE;
  const { token } = await createSession({ personnelCode: code, displayName: `تست ${role}`, role }, { ip: "127.0.0.1" }, null);
  createdSessions.push(token);
  return { token, code };
}

function postReq(token: string, body: unknown, path = "/api/arm/connection") {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("P6.5-09 بند ۵-الف — سبدهای سهمیهٔ مستقل ورود/PM/ARM", () => {
  test("A1) سه سبد REQUEST_OTP کاملاً مستقل‌اند: ۳ تلاش ورود، سبد ARM همچنان آزاد", async () => {
    const { checkRate, recordAttempt } = await import("@/lib/auth/rate-limiter");
    // سبد صفحهٔ ورود پر می‌شود (۳/۱۰ دقیقه)
    for (let i = 0; i < 3; i++) await recordAttempt(ARM_CODE, "REQUEST_OTP", true);
    const login = await checkRate(ARM_CODE, "REQUEST_OTP");
    expect(login.allowed).toBe(false);
    // سبد ARM و PM دست‌نخورده‌اند — این همان باگ «PM سپس ARM می‌بندد» بود
    const arm = await checkRate(ARM_CODE, "REQUEST_OTP_ARM");
    const pm = await checkRate(ARM_CODE, "REQUEST_OTP_PM");
    expect(arm.allowed).toBe(true);
    expect(pm.allowed).toBe(true);
  });

  test("A2) سبد ARM پر می‌شود، سبد PM و ورود آزاد می‌مانند (حالت بالعکس دستور مالک)", async () => {
    const { checkRate, recordAttempt } = await import("@/lib/auth/rate-limiter");
    for (let i = 0; i < 3; i++) await recordAttempt(ARM_CODE, "REQUEST_OTP_ARM", true);
    const arm = await checkRate(ARM_CODE, "REQUEST_OTP_ARM");
    expect(arm.allowed).toBe(false);
    const pm = await checkRate(ARM_CODE, "REQUEST_OTP_PM");
    const login = await checkRate(ARM_CODE, "REQUEST_OTP");
    expect(pm.allowed).toBe(true);
    expect(login.allowed).toBe(false); // سبد ورود از A1 پر مانده — مستقل از ARM
  });

  test("A3) قفل تأیید (VERIFY) هم به تفکیک جریان است: ۵ شکست PM، سبد ARM قفل نیست", async () => {
    const { checkRate, recordAttempt } = await import("@/lib/auth/rate-limiter");
    for (let i = 0; i < 5; i++) await recordAttempt("940100", "VERIFY_OTP_PM", false);
    const pm = await checkRate("940100", "VERIFY_OTP_PM");
    const arm = await checkRate("940100", "VERIFY_OTP_ARM");
    expect(pm.allowed).toBe(false);
    expect(arm.allowed).toBe(true);
  });

  test("A4) گارد نرخ PM در مسیر فعال است: ۳ درخواست ثبت‌شده ⇒ درخواست چهارم 429 (بدون تماس شبکه)", async () => {
    const { recordAttempt } = await import("@/lib/auth/rate-limiter");
    for (let i = 0; i < 3; i++) await recordAttempt("940200", "REQUEST_OTP_PM", true);
    const s = await makeSession("OWNER");
    const { POST } = await import("@/app/api/pm/connection/route");
    const res = await POST(postReq(s.token, { action: "start-otp", personnelCode: "940200" }, "/api/pm/connection") as never);
    expect(res.status).toBe(429);
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("RATE_LIMITED");
  });

  test("A5) مسیر ARM از سبد ARM می‌پرسد: سبد ARM پر ⇒ 429؛ سبد ورودِ پرِ همان کد عامل نیست", async () => {
    const { recordAttempt } = await import("@/lib/auth/rate-limiter");
    // هر دو سبدِ ورود و ARM برای این کد پر می‌شوند — پاسخ 429 یعنی گاردِ «ARM» آن را داده
    // (صفر تماس شبکه: پاسخ پیش از provider صادر می‌شود)
    for (let i = 0; i < 3; i++) {
      await recordAttempt("940300", "REQUEST_OTP", true);
      await recordAttempt("940300", "REQUEST_OTP_ARM", true);
    }
    const s = await makeSession("OWNER");
    const { POST } = await import("@/app/api/arm/connection/route");
    const res = await POST(postReq(s.token, { action: "start-otp", personnelCode: "940300" }) as never);
    expect(res.status).toBe(429);
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(body.code).toBe("RATE_LIMITED");
  });

  test("A6) سورس‌گارد: مسیر ARM فقط از سبد‌های *_ARM و مسیر PM فقط از سبد‌های *_PM می‌پرسد", async () => {
    const armSrc = readFileSync("src/app/api/arm/connection/route.ts", "utf8");
    const pmSrc = readFileSync("src/app/api/pm/connection/route.ts", "utf8");
    expect(armSrc).toContain('"REQUEST_OTP_ARM"');
    expect(armSrc).toContain('"VERIFY_OTP_ARM"');
    expect(armSrc).not.toContain('checkRate(code, "REQUEST_OTP"');
    expect(armSrc).not.toContain('checkRate(code, "VERIFY_OTP"');
    expect(pmSrc).toContain('"REQUEST_OTP_PM"');
    expect(pmSrc).toContain('"VERIFY_OTP_PM"');
  });
});

describe("P6.5-09 بند ۵-ب — دسته‌بندی خطای پیامک (خالص)", () => {
  test("C1) «پیامک قبلاً ارسال شده» ⇒ ALREADY_SENT با راهنمای استفاده از همان کد", async () => {
    const { classifySmsSendFailure } = await import("@/lib/melk-api/sms");
    const r = classifySmsSendFailure("پیامک قبلاً ارسال شده است");
    expect(r.kind).toBe("ALREADY_SENT");
    expect(r.userMessage).toContain("همان کد");
  });

  test("C2) «به سقف پیامک رسیدید» ⇒ LIMIT_REACHED با راهنمای انتظار", async () => {
    const { classifySmsSendFailure } = await import("@/lib/melk-api/sms");
    const r = classifySmsSendFailure("به سقف پیامک رسیده‌اید");
    expect(r.kind).toBe("LIMIT_REACHED");
    expect(r.userMessage).toContain("چند دقیقه");
  });

  test("C3) سایر خطاها ⇒ OTHER بدون تغییر پیام", async () => {
    const { classifySmsSendFailure } = await import("@/lib/melk-api/sms");
    expect(classifySmsSendFailure("پایگاه داده قطع است").kind).toBe("OTHER");
    expect(classifySmsSendFailure("connection refused").kind).toBe("OTHER");
    expect(classifySmsSendFailure("").kind).toBe("OTHER");
  });

  test("C4) الگوهای لاتین و «کد قبلا» هم پوشش داده می‌شوند", async () => {
    const { classifySmsSendFailure } = await import("@/lib/melk-api/sms");
    expect(classifySmsSendFailure("SMS already sent").kind).toBe("ALREADY_SENT");
    expect(classifySmsSendFailure("کد پیامک قبلا برای این شماره ارسال گردیده").kind).toBe("ALREADY_SENT");
    expect(classifySmsSendFailure("too many requests").kind).toBe("LIMIT_REACHED");
  });
});

describe("P6.5-09 بند ۶ — کلید ریست اتصال ARM", () => {
  test("D1) reset: توکن نشست پاک می‌شود، نشست زنده می‌ماند، رد ARM_RESET ثبت می‌شود", async () => {
    const { createSession, validateSession } = await import("@/lib/auth/session");
    const { token } = await createSession(
      { personnelCode: OWNER_CODE, displayName: "تست OWNER", role: "OWNER" },
      { ip: "127.0.0.1" },
      { accessToken: "arm-tok-p6509", refreshToken: "arm-ref", userType: "realtor" }
    );
    createdSessions.push(token);

    const { POST, GET } = await import("@/app/api/arm/connection/route");
    const getReq = () =>
      new Request("http://localhost/api/arm/connection", { method: "GET", headers: { authorization: `Bearer ${token}` } });

    // قبل: متصل
    const before = (await (await GET(getReq() as never)).json()) as { connection: { status: string } };
    expect(before.connection.status).toBe("connected");

    // ریست
    const res = await POST(postReq(token, { action: "reset" }) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(true);
    expect(body.message).toContain("بازنشانی");

    // بعد: قطع — نشست زنده
    const after = (await (await GET(getReq() as never)).json()) as { connection: { status: string } };
    expect(after.connection.status).toBe("disconnected");
    const ctx = await validateSession(token);
    expect(ctx).not.toBeNull();

    // شاهد حسابرسی
    const row = await db.auditLog.findFirst({ where: { actor: OWNER_CODE, action: "ARM_RESET" }, orderBy: { createdAt: "desc" } });
    expect(row).not.toBeNull();
  });
});

describe("P6.5-09 بند ۴ — لیست‌های بدون صفحه‌بندی (شاهد ساختاری سورس)", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  test("E1) جدول معاملات: بدون page state، بدون دکمه صفحه، همهٔ ردیف‌ها رندر می‌شوند", () => {
    const src = read("src/core/tiles/tiles/transactions-contracts/TransactionsTab.tsx");
    expect(src).not.toContain("useState(0)");
    expect(src).not.toContain("صفحه قبل");
    expect(src).not.toContain("صفحه بعد");
    expect(src).not.toContain("pageRows");
    // P6527 — رندر پنجره‌ای: کل ردیف‌ها در یک اسکرول (rows به TableBodyVirtual)،
    // بدون صفحه‌بندی؛ فرزند تابعی عین نقش قبلی rows.map دارد
    expect(src).toContain("<TableBodyVirtual rows={rows}");
    expect(src).toMatch(/\{\(t, i\) => \{/);
    expect(src).not.toMatch(/rows\.slice\(0,\s*\d+\)/);
  });

  test("E2) قراردادها: مسیر تک‌صفحه‌ای برقرار است (P6.5-12: تب قراردادها حذف شد — روت و داده ماندگار)", () => {
    const def = read("src/core/tiles/tiles/transactions-contracts/index.ts");
    expect(def).not.toContain('"pageSize"');
    expect(read("src/app/api/crm/contracts/route.ts")).toContain(", 5000)");
  });

  test("E3) درخواست‌ها و آگهی‌ها: بدون slice(0, pageSize) و بدون تعریف pageSize", () => {
    const reqPage = read("src/core/tiles/tiles/request/RequestsPage.tsx");
    const reqDef = read("src/core/tiles/tiles/request/index.ts");
    const lstPage = read("src/core/tiles/tiles/listing/ListingsPage.tsx");
    const lstDef = read("src/core/tiles/tiles/listing/index.ts");
    for (const src of [reqPage, lstPage]) {
      expect(src).not.toContain("filtered.slice(0, pageSize)");
      expect(src).not.toContain("pageSize");
    }
    for (const def of [reqDef, lstDef]) expect(def).not.toContain("pageSize");
    expect(lstPage).not.toContain("تعداد فایل در هر صفحه");
  });

  test("E4) تعاملات و عرضه‌تقاضا و شاخص قیمت: بدون سقف نمایشی", () => {
    expect(read("src/core/tiles/tiles/experts/ExpertsPage.tsx")).not.toContain("interactions.slice(0, 100)");
    expect(read("src/core/tiles/tiles/supply-demand/SupplyDemandPage.tsx")).not.toContain("rows.slice(0, 12)");
    const pi = read("src/core/tiles/tiles/price-index/PriceIndexPage.tsx");
    expect(pi).not.toContain("areaStats.slice(0, 18)");
    expect(pi).not.toContain("idx.areas.slice(0, 10)");
  });

  test("E5) تاریخچه استخراج و دیوار: سقف سرور ۱۰۰۰ و درخواست کامل", () => {
    expect(read("src/core/tiles/tiles/extraction/ExtractionPage.tsx")).toContain("limit=1000");
    expect(read("src/app/api/crm/lookup/route.ts")).toContain(", 1000)");
    expect(read("src/core/tiles/tiles/file-finder/FileFinderPage.tsx")).toContain("limit=1000");
    expect(read("src/app/api/divar/ads/route.ts")).toContain(", 1000)");
    expect(read("src/core/tiles/tiles/file-finder/FileFinderPage.tsx")).not.toContain("scanLogs.slice(0, 5)");
  });

  test("E6) کارشناسان: سقف سرور ۵۰۰۰ و درخواست کامل (تک‌صفحه‌ای) — P6.5-11: کاشی بازدیدها حذف شد", () => {
    expect(read("src/app/api/crm/experts/route.ts")).toContain(", 5000)");
    expect(read("src/core/tiles/tiles/experts/ExpertsPage.tsx")).toContain('"limit", "5000"');
  });
});

describe("P6.5-09 بند ۳ — قانون مالک: صفر محدودیت رویت (تکرار روی DB تست)", () => {
  const P = "p6509-"; // پیشوند شناسه‌های آزمون — عین الگوی p6504i
  const txIds = Array.from({ length: 728 }, (_, i) => `${P}tx-${i}`);

  beforeAll(async () => {
    // ۷۲۸ معامله عین مقیاس واقعی — مالک باید همه را ببیند
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } });
    await db.transactionRecord.createMany({
      data: txIds.map((id, i) => ({
        id,
        contractDate: new Date(2024, i % 12, (i % 28) + 1),
        propertyCode: `${P}PC-${i}`,
        contractHolo: i % 3 === 0 ? `${P}H-${i}` : null,
        suggestedPropertyCount: i % 5,
        eventsCount: i % 3,
      })),
    });
  });

  afterAll(async () => {
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
  });

  test("F1) owner-sees-all — مالک همهٔ ۷۲۸ معامله (دادهٔ همگی) را می‌بیند", async () => {
    const { resolveEntityAccess } = await import("@/lib/access/scope");
    const session = { personnelCode: OWNER_CODE, role: "OWNER", accessScope: "OWNER" };
    const access = resolveEntityAccess(session, "transaction");
    expect(access.clause.kind).toBe("ALL");
    expect(access.isOwnerRead).toBe(true);
    const count = await db.transactionRecord.count({ where: { id: { startsWith: P } } });
    expect(count).toBe(728);
  });

  test("F2) حتی با اتصال ARM به کد پرسنلی کارشناس دیگر، نقش نشست مالک دست‌نخورده می‌ماند", async () => {
    // عین کاری که «اتصال ARM از تنظیمات» می‌کند: فقط توکن به نشست می‌چسبد
    const { createSession, updateSessionArmTokens, validateSession } = await import("@/lib/auth/session");
    const { token } = await createSession({ personnelCode: OWNER_CODE, displayName: "مالک", role: "OWNER" }, { ip: "127.0.0.1" }, null);
    createdSessions.push(token);
    await updateSessionArmTokens(
      (await db.session.findFirst({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } }))!.id,
      { accessToken: "expert-arm-token", refreshToken: "r", userType: "realtor" }
    );
    const ctx = await validateSession(token);
    expect(ctx?.role).toBe("OWNER"); // قانون مالک: اتصال با کد دیگران، دسترسی مالک را محدود نمی‌کند
    const { resolveEntityAccess } = await import("@/lib/access/scope");
    expect(resolveEntityAccess(ctx!, "listing").clause.kind).toBe("ALL"); // حتی موجودیت‌های شخصی
    expect(resolveEntityAccess(ctx!, "request").clause.kind).toBe("ALL");
    expect(resolveEntityAccess(ctx!, "visit").clause.kind).toBe("ALL");
  });
});
