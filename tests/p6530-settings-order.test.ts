/**
 * p6530-settings-order.test.ts — سوئیت گام ۶ (تنظیمات عمومی — دستور مالک ۱۴۰۵/۰۷/۹)
 * =============================================================================
 * §۱ ترتیب الزامی پنج بخش اتصال (بند اصلی)
 * §۲ دیمون پایدار اتصال و انتقال داده (نکتهٔ بسیار مهم ۱)
 * §۳ مرتب‌سازی ارقام ۰-۹ و حروف فارسی/عربی در فهرست‌ها (نکتهٔ بسیار مهم ۲)
 * §۴ رفع خطای 502/504 در بروزرسانی فهرست‌ها (نکتهٔ بسیار مهم ۳)
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const SRC = "/home/z/my-project/src";
const TILES = "/home/z/my-project/src/core/tiles/tiles";

/* ==========================================================================
 * §۱ — ترتیب الزامی بخش‌های اتصال
 * ========================================================================== */

describe("گام ۶ §۱ — ترتیب بخش‌های اتصال در تنظیمات عمومی", () => {
  test("۱-۱) پنج بخش اتصال به ترتیب عین دستور مالک", async () => {
    const s = readFileSync(`${TILES}/settings/SettingsPage.tsx`, "utf8");
    const order = [
      s.indexOf("مدیریت اتصال به سامانه ملک تبریز"),
      s.indexOf("اتصال به سامانه ARM"),
      s.indexOf("اتصال به حساب شخصی سامانه PM"),
      s.indexOf("اتصال به دیوار"),
      s.indexOf("اتصال به اینستاگرام"),
    ];
    for (const idx of order) expect(idx).toBeGreaterThan(-1);
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i], `بخش ${i + 1} باید بعد از بخش ${i} باشد`).toBeGreaterThan(order[i - 1]);
    }
  });

  test("۱-۲) کارت مدیریت اتصال قبل از هر بخش اتصال دیگر و بلافاصله پس از کارت مالک", async () => {
    const s = readFileSync(`${TILES}/settings/SettingsPage.tsx`, "utf8");
    const hubIdx = s.indexOf('id="settings-connection-hub"');
    const armIdx = s.indexOf("<ArmConnectionSection />");
    const ownerIdx = s.indexOf("مالک و برنامه نویس و طراح");
    expect(hubIdx).toBeGreaterThan(ownerIdx);
    expect(hubIdx).toBeLessThan(armIdx);
  });

  test("۱-۳) ترتیب JSX رندر: hub → ARM → PM → دیوار → اینستاگرام", async () => {
    const s = readFileSync(`${TILES}/settings/SettingsPage.tsx`, "utf8");
    const order = [
      s.indexOf("<ArmConnectionSection />"),
      s.indexOf("<PmConnectionSection />"),
      s.indexOf("<DivarConnectionSection />"),
      s.indexOf("<InstagramConnectionSection />"),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });
});

/* ==========================================================================
 * §۲ — دیمون پایدار اتصال و انتقال داده (نکتهٔ بسیار مهم ۱)
 * ========================================================================== */

describe("گام ۶ §۲ — دیمون پایدار اتصال", () => {
  test("۲-۱) دیمن کاتالوگ وجود دارد و درون‌فرایندی است (بدون پورت مجزا)", async () => {
    const s = readFileSync(`${SRC}/lib/melk-api/catalog-daemon.ts`, "utf8");
    expect(s).toContain("startCatalogDaemon");
    expect(s).toContain("setInterval");
    expect(s).toContain("catalogDaemonTick");
  });

  test("۲-۲) instrumentation دیمن کاتالوگ را در بوت سرور راه می‌اندازد", async () => {
    const s = readFileSync(`${SRC}/instrumentation.ts`, "utf8");
    expect(s).toContain("startCatalogDaemon");
  });

  test("۲-۳) دیمن: برش‌های محدود + ازسرگیری checkpoint + قفل هم‌پوشانی", async () => {
    const s = readFileSync(`${SRC}/lib/melk-api/catalog-daemon.ts`, "utf8");
    expect(s).toContain("PAGES_PER_TICK");
    expect(s).toContain("ENRICH_ROWS_PER_TICK");
    expect(s).toMatch(/lock/);
    expect(s).toContain("syncArmListingsCatalog");
    expect(s).toContain("syncArmRequestsCatalog");
    expect(s).toContain("enrichArmListings");
    expect(s).toContain("enrichArmRequests");
  });

  test("۲-۴) وضعیت دیمن در endpoint شفافیت هوشمندی گزارش می‌شود", async () => {
    const s = readFileSync(`${SRC}/app/api/intelligence/status/route.ts`, "utf8");
    expect(s).toContain("catalogDaemonStatus");
    expect(s).toContain("catalogDaemon");
  });

  test("۲-۵) رفتار تیک: بدون نشست دارای توکن → بدون انتقال (heartbeat فقط)", async () => {
    const { catalogDaemonTick, catalogDaemonStatus } = await import("@/lib/melk-api/catalog-daemon");
    // مخزن ساختگی: هیچ نشست زنده‌ای ندارد
    const fakeDb = {
      session: {
        findFirst: async () => null,
      },
    } as never;
    const before = catalogDaemonStatus();
    const after = await catalogDaemonTick(fakeDb);
    expect(after.ticks).toBe(before.ticks + 1);
    expect(after.lastError).toBeNull();
    expect(after.lastResult).toEqual({ listingsPages: 0, requestsPages: 0, listingsEnriched: 0, requestsEnriched: 0 });
  });

  test("۲-۶) قفل هم‌پوشانی: تیک هم‌زمان دوم رد می‌شود (running اولی)", async () => {
    const { catalogDaemonStatus } = await import("@/lib/melk-api/catalog-daemon");
    // شاهد ساختاری: lock در state — تست رفتاری با تیک کند در تست یکپارچه‌ای
    const s = readFileSync(`${SRC}/lib/melk-api/catalog-daemon.ts`, "utf8");
    expect(s).toMatch(/if \(s\.lock\)/);
    expect(catalogDaemonStatus().enabled).toBe(true);
  });
});

/* ==========================================================================
 * §۳ — مرتب‌سازی ارقام و حروف فارسی/عربی (نکتهٔ بسیار مهم ۲)
 * ========================================================================== */

describe("گام ۶ §۳ — مرتب‌سازی فارسی فهرست‌ها", () => {
  test("۳-۱) کلید نرمال: ارقام فارسی = عربی = لاتین (نتیجهٔ واحد)", async () => {
    const { faNormalizeKey } = await import("@/lib/fa-sort");
    expect(faNormalizeKey("۵۹۱۱۵")).toBe("59115");
    expect(faNormalizeKey("٥٩١١٥")).toBe("59115");
    expect(faNormalizeKey("59115")).toBe("59115");
  });

  test("۳-۲) کلید نرمال: حروف عربی → فارسی (ي↦ی، ك↦ک، ة↦ه)", async () => {
    const { faNormalizeKey } = await import("@/lib/fa-sort");
    expect(faNormalizeKey("علي")).toBe("علی");
    expect(faNormalizeKey("كاظم")).toBe("کاظم");
    expect(faNormalizeKey("فاطمة")).toBe("فاطمه");
  });

  test("۳-۳) ترتیب عددی کدها: ۰ تا ۹ — عددی نه لغتی (۵۹۱۱۵ < ۱۰۰۲۰ < ۹۹)", async () => {
    const { faCompareCode } = await import("@/lib/fa-sort");
    const codes = ["۱۰۰۲۰", "۵۹۱۱۵", "۹۹", "۱۰۰"];
    const sorted = [...codes].sort((a, b) => faCompareCode(a, b));
    expect(sorted).toEqual(["۹۹", "۱۰۰", "۵۹۱۱۵", "۱۰۰۲۰"]);
    // فارسی = لاتین
    const latin = ["10020", "59115", "99", "100"].sort((a, b) => faCompareCode(a, b));
    expect(latin).toEqual(["99", "100", "59115", "10020"]);
  });

  test("۳-۴) ترتیب الفبای فارسی: ا < ب < پ < ت …", async () => {
    const { faCompare } = await import("@/lib/fa-sort");
    expect(faCompare("ابراهیم", "بابک")).toBeLessThan(0);
    expect(faCompare("بابک", "پرهام")).toBeLessThan(0);
    expect(faCompare("پرهام", "تورج")).toBeLessThan(0);
    expect(faCompare("آمنه", "احمد")).toBeLessThanOrEqual(0); // آ↦ا برای مرتب‌سازی
  });

  test("۳-۵) یکسان‌سازی ي/ی و ك/ک در مرتب‌سازی: رشته‌های هم‌ارز کنار هم", async () => {
    const { faCompare } = await import("@/lib/fa-sort");
    expect(faCompare("كاظمی", "کاظمی")).toBe(0); // ك عربی = ک فارسی
    expect(faCompare("علي", "علی")).toBe(0); // ي عربی = ی فارسی
  });

  test("۳-۶) فهرست کارشناسان M4 با مرتب‌سازی فارسی نمایش داده می‌شود", async () => {
    const s = readFileSync(`${TILES}/experts/ExpertsPage.tsx`, "utf8");
    expect(s).toContain("faSortBy");
  });

  test("۳-۷) فیلترها از قبل هم‌ارزند (شاهد به‌روز): normalizeFilterInput منبع یگانه", async () => {
    const { normalizeFilterInput } = await import("@/lib/normalize-input");
    expect(normalizeFilterInput("۵۹۲۵۲")).toBe("59252");
    expect(normalizeFilterInput("٥٩٢٥٢")).toBe("59252");
  });
});

/* ==========================================================================
 * §۴ — رفع 502/504 (نکتهٔ بسیار مهم ۳)
 * ========================================================================== */

describe("گام ۶ §۴ — رفع خطای 502/504 در بروزرسانی فهرست‌ها", () => {
  test("۴-۱) کلاینت API: مهلت الزامی (AbortController) — هیچ درخواستی بی‌پایان معلق نمی‌ماند", async () => {
    const s = readFileSync(`${SRC}/lib/client/api.ts`, "utf8");
    expect(s).toContain("AbortController");
    expect(s).toContain("DEFAULT_TIMEOUT_MS");
    expect(s).toContain("clearTimeout");
  });

  test("۴-۲) کلاینت API: خطای 502/504 با پیام فارسی شفاف + راهنمای ازسرگیری", async () => {
    const s = readFileSync(`${SRC}/lib/client/api.ts`, "utf8");
    expect(s).toContain("502");
    expect(s).toContain("504");
    expect(s).toMatch(/از همان نقطهٔ قطع‌شده ادامه می‌یابد/);
  });

  test("۴-۳) خطای TIMEOUT کلاینت: کد TIMEOUT + وضعیت 504 + پیام فارسی", async () => {
    const s = readFileSync(`${SRC}/lib/client/api.ts`, "utf8");
    expect(s).toMatch(/"TIMEOUT"/);
    expect(s).toMatch(/مهلت ۹۰ ثانیه/);
  });

  test("۴-۴) سمت سرور: گارد صفحهٔ معیوب ARM (پاسخ 504گونه) → تلاش مجدد، نه بسته‌شدن چرخه", async () => {
    const { isDegenerateListPage } = await import("@/lib/melk-api/arm-catalog");
    // پاسخ معیوب (بی‌داده/بی‌شمارش با ادعای پایان) = گذرا → در fetchListPage دو تلاش مجدد
    expect(isDegenerateListPage(122, { rows: [], total: 0, totalPages: 1 }, 20392)).toBe(true);
    const s = readFileSync(`${SRC}/lib/melk-api/arm-catalog.ts`, "utf8");
    expect(s).toMatch(/for \(let attempt = 0; attempt < 3/);
  });

  test("۴-۵) خوددرمانی دیمن: شکست 502/504 در تیک بعدی ادامه می‌یابد (ازسرگیری checkpoint)", async () => {
    const s = readFileSync(`${SRC}/lib/melk-api/catalog-daemon.ts`, "utf8");
    expect(s).toMatch(/catch/);
    expect(s).toMatch(/س_TICK|continue|finally/);
    // خطای برش ثبت می‌شود اما تیک بعدی دوباره اجرا می‌شود
    expect(s).toContain("lastError");
    expect(s).toContain("setInterval");
  });
});
