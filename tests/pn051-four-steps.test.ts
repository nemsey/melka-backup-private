// ============================================================================
// PN-051 — گارد چهارگام دستور شورا ۱۴۰۵/۰۸/۰۲
// ============================================================================
// گام اول-الف: «هرگونه محدودیت در ورود به حساب کاربری pm و arm لغو کنسل میشود»
//   · مسیر personnel-login نباید هیچ درگاه نرخی (checkRate) داشته باشد
//   · خطای شبکهٔ ارسال پیامک (ارسال کد ناموفق) باید راهنمای «گذرا — تلاش مجدد» بدهد
// گام اول-ب: کنترل دانلود/آپلود اکسل «کلیهٔ فهرست‌های چهارگانه» هر دو داشبورد
//   · ایمپورت در tenant فهرستِ بارگذاری‌شده ثبت می‌شود (ملکتون ⇒ ملکتون)
//   · فهرست کارشناسان (M4/M10) هم دکمهٔ بارگذاری اکسل دارد
// گام دوم: سینک ملکتون «دو-نمایی» — نمای خصوصی (مالک/متقاضی) با عمومی ادغام می‌شود
// ============================================================================
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dir, "..");

const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

// ─────────────── گام اول-الف: صفر محدودیت ورود PM/ARM ───────────────

describe("PN-051 · گام ۱-الف — لغو هرگونه محدودیت ورود PM/ARM", () => {
  test("۱-الف-۱) مسیر personnel-login هیچ درگاه نرخی ندارد (audit-only)", () => {
    const src = read("src/app/api/auth/personnel-login/route.ts");
    expect(src).not.toContain("checkRate(");
    expect(src).not.toContain("{ checkRate"); // نه در ایمپورت و نه در بدنه
    // حسابرسی می‌ماند — رد تلاش‌ها برای AuditLog/OtpAttempt
    expect(src).toContain("recordAttempt");
    expect(src).toContain("PN-051");
  });

  test("۱-الف-۲) مسیرهای request-otp/verify-otp (صفحهٔ ورود) بی‌درگاه می‌مانند", () => {
    const req = read("src/app/api/auth/request-otp/route.ts");
    const ver = read("src/app/api/auth/verify-otp/route.ts");
    expect(req).not.toContain("checkRate(");
    expect(ver).not.toContain("checkRate(");
  });

  test("۱-الف-۳) اتصال ARM/PM (تنظیمات): بدون درگاه + راهنمای خطای گذرا (شکایت «ارسال کد ناموفق»)", () => {
    const arm = read("src/app/api/arm/connection/route.ts");
    const pm = read("src/app/api/pm/connection/route.ts");
    expect(arm).not.toContain("checkRate(");
    expect(pm).not.toContain("checkRate(");
    // PN-051 — پیام شفاف: خطای شبکه گذراست، محدودیت نیست، تلاش مجدد آزاد
    expect(arm).toContain("خطای شبکه‌ای گذراست");
    expect(pm).toContain("خطای شبکه‌ای گذراست");
  });

  test("۱-الف-۴) فیوز مسیر ورود از PN-049 به بعد همچنان لغو است (حالت محک)", () => {
    const src = read("src/lib/melk-api/circuit-breaker.ts");
    expect(src).toContain("AUTH_PATH_PREFIXES");
    expect(src).toMatch(/isAuthPath/);
    expect(src).toContain("لغو کامل قانون Retry هوشمند PN-029");
  });
});

// ─────────────── گام اول-ب: اکسل هر ۸ فهرست (۴ موجودیت × ۲ داشبورد) ───────────────

describe("PN-051 · گام ۱-ب — دانلود/آپلود اکسل فهرست‌های چهارگانهٔ هر دو داشبورد", () => {
  test("۱-ب-۱) سرویس ایمپورت tenantId را می‌پذیرد و در رکوردهای تازه می‌نویسد", () => {
    const src = read("src/lib/services/crm-import.ts");
    expect(src).toContain("tenantKey?: string | null");
    expect(src).toContain("tenantDbValue");
    // هر چهار importer رکورد تازه را با tenant صریح می‌سازد
    expect(src.match(/tenantId, \.\.\.data/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src).toContain("tenantId,\n            createdAt: new Date()"); // experts
    expect(src).toContain("propertyCode, requestCode, rawDate, contractDate, tenantId, ...data"); // transactions
  });

  test("۱-ب-۱-ب) کلید طبیعی با قالب کامل حفظ می‌شود (ME####/POT#### ملکتون) — ریشهٔ خرابی round-trip", () => {
    const src = read("src/lib/services/crm-import.ts");
    // listings/requests/transactions: digitsOnly قبلی پیشوند حروفی را می‌بُرید و
    // رکورد تکراری می‌ساخت — PN-051 قالب کامل را نگه می‌دارد
    const listingsBlock = src.slice(src.indexOf("importListings"), src.indexOf("importRequests"));
    expect(listingsBlock).toContain('const code = cellText(row.get(H));');
    expect(listingsBlock).not.toContain("digitsOnly(cellText(row.get(H)))");
    const requestsBlock = src.slice(src.indexOf("importRequests"), src.indexOf("importTransactions"));
    expect(requestsBlock).toContain('const code = cellText(row.get(H));');
    const txBlock = src.slice(src.indexOf("importTransactions"), src.indexOf("importExperts"));
    expect(txBlock).toContain('const propertyCode = cellText(row.get("کد ملک"));');
  });

  test("۱-ب-۱-پ) ایمپورت کارشناسان: هر دو هدر نام + زنجیرهٔ تطبیق + ممنوعیت رکورد «بدون نام»", () => {
    const src = read("src/lib/services/crm-import.ts");
    const expertsBlock = src.slice(src.indexOf("importExperts"));
    // الگوی خروجی خودمان «کارشناس» + الگوی قدیمی «نام و نام خانوادگی»
    expect(expertsBlock).toContain('cellText(row.get("نام و نام خانوادگی")) ||');
    expect(expertsBlock).toContain('cellText(row.get("کارشناس")) ||');
    // زنجیرهٔ تطبیق سه‌مرحله‌ای: کد خام → ارقام → نام نرمال‌شده (منبع یگانه)
    expect(expertsBlock).toContain("byRawCode");
    expect(expertsBlock).toContain("byDigitCode");
    expect(expertsBlock).toContain("byNormName");
    expect(expertsBlock).toContain("normalizeFilterInput");
    // قانون دادهٔ مقدس: بدون کلیدِ منطبق و بدون نام، ایجاد ممنوع
    expect(expertsBlock).toContain("if (!existingId && !fullName)");
    expect(expertsBlock).toContain("هرگز رکورد");
  });

  test("۱-ب-۲) روت ایمپورت tenantId را از query می‌خواند", () => {
    const src = read("src/app/api/crm/import/[entity]/route.ts");
    expect(src).toContain('searchParams.get("tenantId")');
    expect(src).toContain("runImport(entity as ImportEntity, sheet, file.name, tenantKey)");
  });

  test("۱-ب-۳) دکمهٔ بارگذاری اکسل tenant را می‌فرستد (ملکتون ⇒ ?tenantId=melketun)", () => {
    const src = read("src/components/app/shared/excel-import-button.tsx");
    expect(src).toContain('tenantId?: "tabriz" | "melketun"');
    expect(src).toContain("?tenantId=melketun");
  });

  test("۱-ب-۴) هر چهار فهرست دکمهٔ بارگذاری اکسل دارد (آگهی/درخواست/معاملات/کارشناسان)", () => {
    const listings = read("src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx");
    const requests = read("src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx");
    const tx = read("src/core/tiles/tiles/transactions-contracts/TransactionsTab.tsx");
    const experts = read("src/core/tiles/tiles/experts/ExpertsPage.tsx");
    for (const [name, src, entity] of [
      ["آگهی", listings, '"listings"'],
      ["درخواست", requests, '"requests"'],
      ["معاملات", tx, '"transactions"'],
      ["کارشناسان", experts, '"experts"'],
    ] as const) {
      expect(src).toContain(`ExcelImportButton entity=${entity}`);
      expect(src).toContain('tenantId={tenantId ?? "tabriz"}');
      void name;
    }
  });

  test("۱-ب-۵) خروجی اکسل هر ۸ مسیر tenant را می‌پذیرد (۴ موجودیت × ۲ داشبورد)", () => {
    const crmExport = read("src/app/api/crm/export/[entity]/route.ts");
    expect(crmExport).toContain('sp.get("tenantId")');
    expect(crmExport).toContain("tenantDbValue");
    const expertsExport = read("src/app/api/experts/export/route.ts");
    expect(expertsExport).toContain("tenantId");
  });
});

// ─────────────── گام دوم: سینک دو-نمایی (مالک ملک/متقاضی) ───────────────

describe("PN-051 · گام ۲ — سینک ملکتون دو-نمایی: تکمیل ستون مالک ملک/متقاضی", () => {
  test("۲-۱) سینک نمای خصوصی filings را واکشی می‌کند (مالک واقعی + موبایل)", () => {
    const src = read("src/lib/integrations/melketun/sync.ts");
    expect(src).toContain("`/Melketunfilingplus${n > 1 ? `/${n}` : \"\"}`");
    expect(src).toContain("privFilingById");
    expect(src).toContain("privFilingByCode");
  });

  test("۲-۲) سینک نمای خصوصی potentials را واکشی می‌کند (متقاضی + موبایل از contacts)", () => {
    const src = read("src/lib/integrations/melketun/sync.ts");
    expect(src).toContain("`/Potentials${n > 1 ? `/${n}` : \"\"}`");
    expect(src).toContain("`/contacts/potentials${n > 1 ? `/${n}` : \"\"}`");
    expect(src).toContain("`/contacts/filings${n > 1 ? `/${n}` : \"\"}`");
    expect(src).toContain("phoneOfPotContact");
    expect(src).toContain("phoneOfFilingContact");
  });

  test("۲-۳) ادغام افزودنی است — شکست نمای خصوصی سینک عمومی را نمی‌شکند", () => {
    const src = read("src/lib/integrations/melketun/sync.ts");
    // شکست نمای خصوصی فقط رویداد لاگ می‌سازد (best-effort) — سینک عمومی ادامه می‌یابد
    expect(src).toContain("PRIVATE_VIEW_SKIPPED");
    expect(src).not.toContain("console.warn"); // تنها نقطهٔ لاگ: src/lib/logger (گارد P2-05)
  });

  test("۲-۴) نگاشت فیلدها: ownerName خصوصی → rawOwnerName (ستون مالک ملک UI)", () => {
    const src = read("src/lib/integrations/melketun/sync.ts");
    // PN-056/نکتهٔ ۲ مالک: fallback عمومی فایلر (f.ownerName = «کارشناس واگذارشده») حذف شد —
    // fountain انحصاراً از منابع خصوصی CRM می‌نویسد (ownerEnrich + privateOwnerName از ادغام نمای خصوصی)
    expect(src).toContain('rawOwnerName: ownerEnrich?.owner_name?.trim() ?? (String((f as unknown as InertiaRow).privateOwnerName ?? "").trim() || null)');
    expect(src).toContain('ownerMobile: ownerEnrich?.owner_phone?.replace(/\\D/g, "") ?? (String((f as unknown as InertiaRow).privateOwnerPhone ?? "").replace(/\\D/g, "") || null)');
    expect(src).not.toContain("?? (f.ownerName?.trim() || null)");
    expect(src).toContain("customerName: p.contactName?.trim() || null");
  });
});
