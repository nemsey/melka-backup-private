/**
 * p6530-settings-order.test.ts — سوئیت گام ۶ (تنظیمات عمومی — دستور مالک ۱۴۰۵/۰۷/۹)
 * =============================================================================
 * §۱ ترتیب الزامی پنج بخش اتصال (بند اصلی)
 * §۲ دیمون پایدار اتصال و انتقال داده (نکتهٔ بسیار مهم ۱)
 * §۳ مرتب‌سازی ارقام ۰-۹ و حروف فارسی/عربی در فهرست‌ها (نکتهٔ بسیار مهم ۲)
 * §۴ رفع خطای 502/504 در بروزرسانی فهرست‌ها (نکتهٔ بسیار مهم ۳)
 */
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const SRC = "/home/z/my-project/src";
const TILES = "/home/z/my-project/src/core/tiles/tiles";

/* ==========================================================================
 * §۱ — ترتیب الزامی بخش‌های تنظیمات عمومی (P6546/گام صفر — ساختار جدید هفت‌بخشی)
 * بازنویسی P6546: ساختار قدیمی پنج‌بخشی جای خود را به پیکرهٔ یکپارچهٔ
 * «اتصال به ملک تبریز» + بخش ادغامی «حساب کاربری و تنظیمات کلی» داده است.
 * ========================================================================== */

describe("گام صفر P6546 — ترتیب هفت‌بخشی تنظیمات عمومی", () => {
  test("۱-۱) هفت بخش به ترتیب عین دستور مالک", async () => {
    const s = readFileSync(`${TILES}/settings/SettingsPage.tsx`, "utf8");
    const order = [
      { name: "اتصال به ملک تبریز", idx: s.indexOf("<MelkTabrizConnectionSection />") },
      { name: "اتصال به دیوار", idx: s.indexOf("<DivarConnectionSection />") },
      { name: "اتصال به اینستاگرام", idx: s.indexOf("<InstagramConnectionSection />") },
      { name: "مغز هوشمند", idx: s.indexOf("<BrainStatusSection />") },
      { name: "هشدار فرصت و کارهای پس‌زمینه", idx: s.indexOf("<OpportunityJobsSection />") },
      { name: "حساب کاربری و تنظیمات کلی", idx: s.indexOf("<AccountGeneralSection />") },
    ];
    for (const { name, idx } of order) expect(idx, `بخش ${name} باید در صفحه باشد`).toBeGreaterThan(-1);
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i].idx, `بخش «${order[i].name}» باید بعد از «${order[i - 1].name}» باشد`).toBeGreaterThan(order[i - 1].idx);
    }
  });

  test("۱-۲) کارت مالک در ابتدا و پیکرهٔ اتصال به ملک تبریز بلافاصله پس از آن", async () => {
    const s = readFileSync(`${TILES}/settings/SettingsPage.tsx`, "utf8");
    const ownerIdx = s.indexOf("مالک و برنامه نویس و طراح");
    const melkIdx = s.indexOf("<MelkTabrizConnectionSection />");
    const divarIdx = s.indexOf("<DivarConnectionSection />");
    expect(ownerIdx).toBeGreaterThan(-1);
    expect(melkIdx).toBeGreaterThan(ownerIdx);
    expect(melkIdx).toBeLessThan(divarIdx);
  });

  test("۱-۳) پیکرهٔ یکپارچهٔ اتصال به ملک تبریز: مدیریت + ARM + PM + سامانه عمومی (الگوی دیوار — جلسهٔ ۰۳۳: GAP حذف)", async () => {
    const s = readFileSync(`${TILES}/settings/MelkTabrizConnectionSection.tsx`, "utf8");
    expect(s).toContain('id="settings-connection-hub"');
    expect(s).toContain("اتصال به ملک تبریز");
    // ترتیب توکار: مدیریت → ARM → PM → رابط سامانه عمومی (GAP به دستور مالک جلسهٔ ۰۳۳ حذف شد)
    const order = [
      s.indexOf('id="settings-connection-hub"'),
      s.indexOf("<ArmConnectionSection embedded />"),
      s.indexOf("<PmConnectionSection embedded />"),
      s.indexOf('aria-label="رابط سامانه عمومی ملک تبریز"'),
    ];
    for (const idx of order) expect(idx).toBeGreaterThan(-1);
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });

  test("۱-۴) بخش ادغامی حساب کاربری و تنظیمات کلی شامل هر چهار بخش پیشین", async () => {
    const s = readFileSync(`${TILES}/settings/AccountGeneralSection.tsx`, "utf8");
    expect(s).toContain("حساب کاربری و تنظیمات کلی");
    expect(s).toContain("تم نمایش");
    expect(s).toContain("زبان اپلیکیشن");
    expect(s).toContain("راهنمای اپلیکیشن");
    expect(s).toContain("خروج از حساب");
  });

  test("۱-۵) جلسهٔ ۰۳۳ (دستور مالک): بخش GAP از تنظیمات حذف شده — روت API باقی و صفر ارجاع UI", async () => {
    // مؤلفهٔ UI حذف شده و پیکرهٔ اتصال ارجاعی به آن ندارد
    const melk = readFileSync(`${TILES}/settings/MelkTabrizConnectionSection.tsx`, "utf8");
    expect(melk).not.toContain("GapConnectionSection");
    expect(melk).not.toContain('aria-label="اتصال به سامانه GAP"');
    // روت بک‌اند دست‌نخورده می‌ماند (سرویس gapApi و API v1 پابرجا — حذف فقط UI بود)
    const route = readFileSync(`${SRC}/app/api/gap/connection/route.ts`, "utf8");
    expect(route).toContain("start-otp");
    expect(route).toContain("REQUEST_OTP_GAP");
    expect(route).toContain('requireRole(request, "OWNER"');
  });

  test("۱-۶) رابط سامانهٔ عمومی (apu) در endpoints + کتابخانهٔ استخراج + روت", async () => {
    const ep = readFileSync(`${SRC}/lib/melk-api/endpoints.ts`, "utf8");
    expect(ep).toContain("melkPublic:");
    expect(ep).toContain("properties/list");
    expect(ep).toContain("properties/info/by-code");
    const lib = readFileSync(`${SRC}/lib/melk-api/melk-public.ts`, "utf8");
    expect(lib).toContain("syncMelkPublicCatalog");
    expect(lib).toContain("merge-non-null");
    const route = readFileSync(`${SRC}/app/api/melk-public/sync/route.ts`, "utf8");
    expect(route).toContain("syncMelkPublicCatalog");
  });

  test("۱-۷) نُه نشانگر اتصال شامل سامانه عمومی و API GAP + نمایش پایدار در کاشی‌ها (جلسهٔ ۰۳۳: حساب GAP حذف)", async () => {
    const ind = readFileSync(`${SRC}/lib/indicators.ts`, "utf8");
    expect(ind).toContain('"melkPublicApi"');
    expect(ind).not.toContain('"gapAccount"');
    expect(ind).toContain('"gapApi"');
    const comp = readFileSync(`${SRC}/components/app/ConnectionIndicators.tsx`, "utf8");
    expect(comp).toContain('variant="compact"');
    expect(comp).toContain("سامانه عمومی ملک تبریز");
    const shell = readFileSync(`${SRC}/components/app/TileShell.tsx`, "utf8");
    expect(shell).toContain('variant="compact"');
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

  test("۲-۲) PN-010 فاز ۲: چرخهٔ کاتالوگ در Worker اجرا می‌شود (instrumentation → Supervisor → Worker)", async () => {
    const s = readFileSync(`${SRC}/instrumentation.ts`, "utf8");
    expect(s).toContain("RuntimeSupervisor"); // نقطهٔ اتصال Web
    expect(s).toContain("supervisor.start()");
    // رجیستری کارهای Worker — چرخهٔ کاتالوگ با همان فاصلهٔ قبلی
    const jobs = readFileSync(`${SRC}/core/runtime/jobs.ts`, "utf8");
    expect(jobs).toContain("catalog-cycle");
    expect(jobs).toContain("catalogDaemonTick"); // همان تیک واحدِ دیمن قبلی
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
    // PN-011 اولاً — ایزوله‌سازی از Worker زندهٔ تولیدی: catalogDaemonStatus ابتدا
    // کانال مشترک Worker (upload/.runtime/runtime-status.json — مقیم MELKA_REPO_DIR)
    // را می‌خواند؛ بدون این ایزولاسیون «قبل» از فایلِ زنده و «بعد» از state
    // درون‌فرایندی می‌آمد و هر بار که Worker تولیدی تیک زده باشد تست می‌شکست
    // (شکست محیطی مستند — نه کد؛ عین درس ن۰۰۶: اصلاح تست).
    const savedRepoDir = process.env.MELKA_REPO_DIR;
    const isolatedDir = mkdtempSync(join(tmpdir(), "p6530-daemon-"));
    process.env.MELKA_REPO_DIR = isolatedDir;
    try {
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
      // P6546/گام پنجم-پ-۴ — پایدارساز: سه برش تازه (tx-info + PM + سامانهٔ عمومی) + خنک‌ساز
      expect(after.lastResult).toMatchObject({ listingsPages: 0, requestsPages: 0, listingsEnriched: 0, requestsEnriched: 0, txInfoEnriched: 0, pmInfoEnriched: 0, melkPublicNewCodes: 0 });
    } finally {
      if (savedRepoDir === undefined) delete process.env.MELKA_REPO_DIR;
      else process.env.MELKA_REPO_DIR = savedRepoDir;
      rmSync(isolatedDir, { recursive: true, force: true });
    }
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

  // P6545/BLOCK 0.3 (تصمیم شورا ۰۳۳) — انتظار قدیمی این تست غلط ریاضی بود:
  // «۵۹۱۱۵ < ۱۰۰۲۰» نادرست است (عددی: ۱۰۰۲۰ < ۵۹۱۱۵). ترتیب عددی صحیح:
  // ۹۹ < ۱۰۰ < ۱۰۰۲۰ < ۵۹۱۱۵. پیاده‌سازی (faCompareCode) از ابتدا درست بود؛
  // انتظار تست از کامیت 76ed3d4 بیرون از محدودهٔ پرونده‌های بعدی بود.
  test("۳-۳) ترتیب عددی کدها: ۰ تا ۹ — عددی نه لغتی (۹۹ < ۱۰۰ < ۱۰۰۲۰ < ۵۹۱۱۵)", async () => {
    const { faCompareCode } = await import("@/lib/fa-sort");
    const codes = ["۱۰۰۲۰", "۵۹۱۱۵", "۹۹", "۱۰۰"];
    const sorted = [...codes].sort((a, b) => faCompareCode(a, b));
    expect(sorted).toEqual(["۹۹", "۱۰۰", "۱۰۰۲۰", "۵۹۱۱۵"]);
    // فارسی = لاتین
    const latin = ["10020", "59115", "99", "100"].sort((a, b) => faCompareCode(a, b));
    expect(latin).toEqual(["99", "100", "10020", "59115"]);
  });

  test("۳-۴) ترتیب الفبای فارسی: ا < ب < پ < ت …", async () => {
    const { faCompare } = await import("@/lib/fa-sort");
    expect(faCompare("ابراهیم", "بابک")).toBeLessThan(0);
    expect(faCompare("بابک", "پرهام")).toBeLessThan(0);
    expect(faCompare("پرهام", "تورج")).toBeLessThan(0);
    // P6545/BLOCK 0.3 (تصمیم شورا ۰۳۳) — انتظار قدیمی «آمنه ≤ احمد» غلط الفبایی بود:
    // در الفبای فارسی ح < م، پس «احمد» پیش از «آمنه» می‌آید (آ↦ا فقط هم‌ارزی می‌سازد).
    expect(faCompare("احمد", "آمنه")).toBeLessThan(0); // ح < م ⇒ احمد اول
    expect(faCompare("آمنه", "امنه")).toBe(0); // آ↦ا برای مرتب‌سازی — هم‌ارزی
  });

  test("۳-۵) یکسان‌سازی ي/ی و ك/ک در مرتب‌سازی: رشته‌های هم‌ارز کنار هم", async () => {
    const { faCompare } = await import("@/lib/fa-sort");
    expect(faCompare("كاظمی", "کاظمی")).toBe(0); // ك عربی = ک فارسی
    expect(faCompare("علي", "علی")).toBe(0); // ي عربی = ی فارسی
  });

  test("۳-۶) فهرست کارشناسان M4 با اولویت سه‌گانهٔ P6546 مرتب می‌شود (مبایعه‌نامه ← اجاره‌نامه ← کدپرسنلی/شعبه)", async () => {
    const s = readFileSync(`${TILES}/experts/ExpertsPage.tsx`, "utf8");
    // P6546/گام چهارم-۱ — مرتب‌سازی الفبایی جای خود را به سه‌اولویتهٔ دستور داد
    expect(s).not.toContain("faSortBy");
    expect(s).toContain("b.saleCount - a.saleCount"); // اولویت ۱
    expect(s).toContain("b.rentCount - a.rentCount"); // اولویت ۲
    expect(s).toContain("a.personnelCode && a.branchTitle ? 1 : 0"); // اولویت ۳ — فیلدهای نسل تازهٔ PN-008
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
