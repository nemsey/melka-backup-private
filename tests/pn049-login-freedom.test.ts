// ============================================================================
// PN-049 — گارد آزادی ورود به حساب PM/ARM + فایل مناطق ملکتون (دستور شورا ۱۴۰۵/۰۸/۰۱)
// ============================================================================
// بخش A (گام ۱-ب): «هرگونه محدودیت در ورود به حساب کاربری pm و arm لغو کنسل
//   می‌شود؛ از جمله قانون Retry هوشمند PN-029». مسیرهای authentication/* باید:
//   ۱) حتی وقتی فیوز قفل سخت ۲۴ ساعته دارد، عبور کنند؛
//   ۲) شکست‌شان هرگز شمارندهٔ فیوز میزبان را نبارند.
// بخش B (گام ۱-الف): مناطق چندگانهٔ CRM ملکتون به آرایهٔ تمیز تجزیه می‌شوند تا
//   سلول «فایل مناطق» (>۳ — عین ملک تبریز P6526/ب) فعال شود.
// ============================================================================
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// ───────────────────── A) آزادی ورود (لغو PN-029 برای مسیر ورود) ─────────────────────

describe("PN-049 · A) لغو محدودیت ورود PM/ARM — قانون Retry هوشمند برای مسیر ورود", () => {
  beforeAll(() => {
    // فیوز در محیط تست خاموش است — برای این سنجه صریحاً روشن می‌شود (الگوی B-5)
    process.env.MELK_CIRCUIT_BREAKER = "on";
  });

  test("A-1) داوری خالص isAuthPath — مسیرهای ورود ARM و PM شناخته می‌شوند", async () => {
    const { isAuthPath } = await import("@/lib/melk-api/circuit-breaker");
    // هر دو سامانهٔ ARM و PM همین پیشوند را دارند (endpoints.ts)
    expect(isAuthPath("authentication/otp/123456789")).toBe(true); // ARM/PM ارسال پیامک
    expect(isAuthPath("authentication/otp/login")).toBe(true); // ARM/PM تأیید
    expect(isAuthPath("authentication/refreshToken")).toBe(true); // PM تمدید
    expect(isAuthPath("authentication/refresh-token")).toBe(true); // ARM تمدید
    // مسیرهای داده — فیوز همچنان صیانت می‌کند
    expect(isAuthPath("listings?page=2")).toBe(false);
    expect(isAuthPath("users/all")).toBe(false);
    expect(isAuthPath(undefined)).toBe(false);
    expect(isAuthPath("")).toBe(false);
  });

  test("A-2) با قفل سخت ۲۴ ساعتهٔ فعال، مسیر ورود باز است و مسیر داده بسته", async () => {
    const { recordBreakerFailure, checkCircuit } = await import("@/lib/melk-api/circuit-breaker");
    const target = `test-pn049-login-${Date.now()}.example`;
    // قفل سخت: ۳ شکست پیاپی ⇒ lockUntil ۲۴ ساعت
    for (let i = 0; i < 3; i++) await recordBreakerFailure(target);
    // مسیر داده (بدون path) — قفل سخت پابرجا (سپر پایداری داده دست‌نخورده)
    const dataGate = await checkCircuit(target);
    expect(dataGate.allowed).toBe(false);
    expect(dataGate.reason).toBe("locked");
    // مسیر ورود (authentication/*) — همیشه باز (دستور شورا PN-049)
    const authGate = await checkCircuit(target, { path: "authentication/otp/123456789" });
    expect(authGate.allowed).toBe(true);
    expect(authGate.reason).toBeUndefined();
    // پاک‌سازی میزبان تست
    const { db } = await import("@/lib/db");
    await db.circuitBreakerState.delete({ where: { target } }).catch(() => {});
  });

  test("A-3) شکست مسیر ورود شمارندهٔ فیوز را نمی‌بارد (skip در armCall)", () => {
    const client = readFileSync("src/lib/melk-api/client.ts", "utf8");
    // ورود: نه قفل می‌خورد، نه شمارنده می‌بارد
    expect(client).toContain("const isAuth = isAuthPath(opts.path)");
    expect(client).toContain("if (!isAuth) await recordBreakerSuccess(target)");
    expect(client).toContain("if (!isAuth && lastError && isBreakerFailure(lastError)) await recordBreakerFailure(target)");
  });

  test("A-4) سند قوانین — لغو در AGENTS.md ثبت شد (بخش ۸)", () => {
    const doc = readFileSync("AGENTS.md", "utf8");
    expect(doc).toContain("## ۸. لغو محدودیت‌های ورود به حساب PM و ARM (PN-049");
    expect(doc).toContain("قانون Retry هوشمند PN-029");
  });

  test("A-5) مسیرهای ورود بدون گارد نرخ محلی باقی می‌مانند (PN-034 پابرجا)", () => {
    const armRoute = readFileSync("src/app/api/arm/connection/route.ts", "utf8");
    const pmRoute = readFileSync("src/app/api/pm/connection/route.ts", "utf8");
    expect(armRoute).not.toContain("checkRate(");
    expect(pmRoute).not.toContain("checkRate(");
    // recordAttempt فقط رد حسابرسی است (سپر مسدودساز نیست)
    expect(armRoute).toContain("recordAttempt");
    expect(pmRoute).toContain("recordAttempt");
  });
});

// ───────────────────── B) فایل مناطق ملکتون (گام ۱-الف) ─────────────────────

describe("PN-049 · C) دادهٔ مقدس — شاهد یکپارچگی پس از backfill مناطق", () => {
  const real = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
  afterAll(async () => { await real.$disconnect(); });

  test("C-1) شمارش رکوردها عین شاهد G6 جلسهٔ قبل (بدون رگرسیون)", async () => {
    const [propertyTotal, propertyMelketun, requestTotal, requestMelketun] = await Promise.all([
      real.propertyRecord.count(),
      real.propertyRecord.count({ where: { tenantId: "melketun" } }),
      real.requestRecord.count(),
      real.requestRecord.count({ where: { tenantId: "melketun" } }),
    ]);
    // PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱): دادهٔ ملکتون حذف شد — شمارش tenant ملکتون باید
    // صفر باشد و کل تبریز دست‌نخورده بماند (کف = شاهد G6 منهای ردیف‌های ملکتون).
    expect(propertyMelketun).toBe(0);
    expect(requestMelketun).toBe(0);
    expect(propertyTotal).toBeGreaterThanOrEqual(27800);
    expect(requestTotal).toBeGreaterThanOrEqual(25500);
  });
});

// ───────────────────── D) گام ۲ — کنترل حساب کاربر و حساب مالک ─────────────────────

describe("PN-049 · D) قانون حساب کاربری — کاربر فقط رکوردهای خودش؛ مالک همه", () => {
  test("D-1) catalogUserScope — مالک ALL · کاربر OWN · نام تهی fail-closed", async () => {
    const { catalogUserScope } = await import("@/lib/access/scope");
    // مالک (ورود با کد مستر — role=OWNER): صفر فیلتر (قانون عدم محدودیت مالک)
    const owner = catalogUserScope({ personnelCode: "OWNER", role: "OWNER", displayName: "سید نعمت اله سیدی" });
    expect(owner.kind).toBe("ALL");
    // مالک از مسیر کد پرسنلی خودش (accessScope=OWNER): باز هم ALL (دفاع دو-لایه)
    const ownerViaExpert = catalogUserScope({ personnelCode: "410031320", role: "CONSULTANT", accessScope: "OWNER" });
    expect(ownerViaExpert.kind).toBe("ALL");
    // کاربر (مشاور): فقط رکوردهای خودش — نام نرمال‌شده
    const user = catalogUserScope({ personnelCode: "410031338", role: "CONSULTANT", displayName: "  سید امیرمحمد سیدی  " });
    expect(user.kind).toBe("OWN");
    if (user.kind === "OWN") expect(user.nameNorm).toBe("سید امیرمحمد سیدی");
    // نام تهی = fail-closed (هیچ ردیفی — نه دایرهٔ باز به روشنایی)
    const noName = catalogUserScope({ personnelCode: "123456", role: "CONSULTANT", displayName: null });
    expect(noName.kind).toBe("OWN");
    if (noName.kind === "OWN") expect(noName.nameNorm).toBe("");
  });

  test("D-2) قانون عدم محدودیت مالک — resolveEntityAccess روی «همهٔ» موجودیت‌ها ALL", async () => {
    const { resolveEntityAccess } = await import("@/lib/access/scope");
    const ownerSession = { personnelCode: "OWNER", role: "OWNER" };
    const entities = ["transaction", "expert", "contract", "interaction", "visit", "listing", "request", "customer", "supply-demand", "property", "arm-request"] as const;
    for (const e of entities) {
      const access = resolveEntityAccess(ownerSession, e);
      expect(access.clause.kind).toBe("ALL");
      expect(access.isOwnerRead).toBe(true); // شاهد owner.read در همهٔ فهرست‌ها
    }
  });

  test("D-3) سیم‌کشی روت‌ها — دامنهٔ حساب کاربری در فهرست/خروجی/باشگاه پاس می‌شود", () => {
    const reqRoute = readFileSync("src/app/api/crm/arm-catalog/requests/route.ts", "utf8");
    const listRoute = readFileSync("src/app/api/crm/arm-catalog/listings/route.ts", "utf8");
    const exportRoute = readFileSync("src/app/api/crm/export/[entity]/route.ts", "utf8");
    const clubRoute = readFileSync("src/app/api/crm/customer-club/route.ts", "utf8");
    for (const src of [reqRoute, listRoute, exportRoute, clubRoute]) {
      expect(src).toContain("catalogUserScope(guard)");
      // الگوی سیم‌کشی: inline (list/club) یا متغیر پیش‌محاسبه (export)
      const wired =
        src.includes('registrarNameNorm: catalogScope.kind === "OWN" ? catalogScope.nameNorm : undefined') ||
        src.includes('registrarNameNorm: clubScope.kind === "OWN" ? clubScope.nameNorm : undefined') ||
        src.includes("registrarNameNorm: exportRegistrar");
      expect(wired).toBe(true);
    }
    // مخازن: بند دامنه در SQL
    const reqRepo = readFileSync("src/core/repositories/prisma/request.repository.ts", "utf8");
    const propRepo = readFileSync("src/core/repositories/prisma/property.repository.ts", "utf8");
    expect(reqRepo).toContain("where.actorNameNorm = filter.registrarNameNorm");
    expect(propRepo).toContain("where.realtorNameNorm = filter.registrarNameNorm");
    // fail-closed نام تهی
    expect(reqRepo).toContain('__pn049_deny_all__');
    expect(propRepo).toContain('__pn049_deny_all__');
  });

  test("D-4) فایل اطلاعات (InfoDoc) — کنترل مالکیت رکورد برای غیر-مالک", () => {
    const infoRoute = readFileSync("src/app/api/info/[tenant]/[type]/[code]/route.ts", "utf8");
    expect(infoRoute).toContain("infoRecordRegistrarRaw");
    expect(infoRoute).toContain("registrarNorm !== infoScope.nameNorm");
    expect(infoRoute).toContain("PN-049");
  });

  test("D-5) UI — نشان «نمای شخصی» برای کاربر غیر-مالک در هر دو فهرست", () => {
    const reqPage = readFileSync("src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx", "utf8");
    const listPage = readFileSync("src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx", "utf8");
    expect(reqPage).toContain('userRole !== "OWNER"');
    expect(reqPage).toContain("نمای شخصی — فقط رکوردهای ثبت‌شده توسط شما");
    expect(listPage).toContain('userRole !== "OWNER"');
    expect(listPage).toContain("نمای شخصی — فقط رکوردهای ثبت‌شده توسط شما");
  });
});
