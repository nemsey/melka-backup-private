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
    expect(src).toContain("rawOwnerName: ownerEnrich?.owner_name?.trim() ?? (f.ownerName?.trim() || null)");
    expect(src).toContain("customerName: p.contactName?.trim() || null");
  });
});
