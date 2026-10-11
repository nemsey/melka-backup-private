/**
 * p6530-architecture-guards.test.ts — نگهبان‌های سراسری (جانشین بخش‌های سراسری p6526)
 * =============================================================================
 * پس از حذف کامل سوئیت p6526 (دستور گام‌های ۱-۴: تست‌های قبلی هر کاشی حذف و
 * بازطراحی می‌شوند)، این بخش‌های «سراسری» (متعلق به هیچ کاشی واحدی نیستند)
 * در این فایل نگهداری می‌شوند:
 *   §۰ معماری — نام‌ها و ترتیب کاشی‌ها (هوم ۵ کاشی + داشبورد M1 تا M4)
 *   §۶ قانون فهرست — پریمیتیوها + هر فهرست فعال + روت‌های فهرست
 *   §۸ گارد همیشگی یکسان‌سازی — باگ تاریخی ۴/۵ هرگز بازنمی‌گردد
 *   §۹ نصب اپلیکیشن (PWA) روی لینک publish
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "bun:test";

const SRC = "/home/z/my-project/src";
const TILES = "/home/z/my-project/src/core/tiles/tiles";

let OWNER_TOKEN: string | null = null;

async function ownerToken(): Promise<string> {
  if (OWNER_TOKEN) return OWNER_TOKEN;
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode: "950030", displayName: "تست P6530", role: "OWNER" },
    { ip: "127.0.0.1" },
    null
  );
  OWNER_TOKEN = token;
  return token;
}

async function callRoute(routeModule: string, query: string): Promise<{ status: number; body: any }> {
  const route = await import(routeModule);
  const { NextRequest } = await import("next/server");
  const token = await ownerToken();
  const req = new NextRequest(`http://localhost${query}`, { headers: { authorization: `Bearer ${token}` } });
  const segs = query.split("?")[0].split("/").filter(Boolean);
  const tileId = segs[2] && segs[1] === "agent" ? segs[2] : undefined;
  const res = await route.GET(req, tileId ? { params: Promise.resolve({ tileId }) } : undefined);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/* ==========================================================================
 * §۰ — معماری: نام‌ها و ترتیب کاشی‌ها (هوم ۵ + داشبورد M1-M4)
 * ========================================================================== */

describe("P6530 §۰ — نام و ترتیب کاشی‌ها", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("۰-۱) صفحه هوم — دقیقاً پنج کاشی با نام‌ها و ترتیب الزامی مالک", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const roots = tileRegistry.listRoot("OWNER");
    expect(roots.map((t) => t.title)).toEqual([
      "فایل یابی ملکا",
      "آگهی ملکا",
      "درخواست ملکا",
      "تنظیمات عمومی",
      "داشبورد مدیریتی ملک تبریز",
    ]);
  });

  test("۰-۲) نمای مشاور همان ترتیب هوم را دارد (تنظیمات/داشبورد عمومی‌اند)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const ownerRoots = tileRegistry.listRoot("OWNER").map((t) => t.title);
    const consultantRoots = tileRegistry.listRoot("CONSULTANT").map((t) => t.title);
    expect(consultantRoots).toEqual(ownerRoots);
  });

  // P6545/گام۲ (جلسه ۰۳۳): چهار کاشی تازهٔ M5-M8 به داشبورد مدیریتی افزوده شدند
  test("۰-۳) داشبورد مدیریتی — هشت کاشی M1 تا M8 با نام‌ها و ترتیب (PN-003: m5 تطبیق + m6 یادگیری)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const children = tileRegistry.listChildren("management-dashboard", "OWNER");
    expect(children.map((t) => t.title)).toEqual([
      "آگهی ملک تبریز",
      "درخواست ملک تبریز",
      "معاملات ملک تبریز",
      "کارشناسان ملک تبریز",
      "تطبیق هوشمند ملک تبریز",
      "شاخص بازار ملک تبریز", // PN-030/گام دوم (شورا-ن۰۳۵): شاخص ششم
      "پوشش اطلاعات ملک تبریز", // PN-030/گام دوم (شورا-ن۰۳۵): پوشش هفتم
      "مغز ملکا — یادگیری و Tier",
    ]);
    expect(children.map((t) => t.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("۰-۴) کاشی‌های M5/M6/M7 در رجیستری فعال ثبت نشده‌اند (حذف نما — فاز ۷/۸/۹)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    for (const id of ["price-index", "supply-demand", "extraction"]) {
      expect(tileRegistry.get(id)).toBeUndefined();
    }
  });
});

/* ==========================================================================
 * §۶ — قانون فهرست در همهٔ فهرست‌های فعال
 * ========================================================================== */

describe("P6530 §۶ — قانون فهرست در همهٔ فهرست‌ها", () => {
  const LIST_PAGES = [
    "arm-listing/ArmListingsPage.tsx",
    "arm-request/ArmRequestsPage.tsx",
    "transactions-contracts/TransactionsTab.tsx",
    "experts/ExpertsPage.tsx",
  ];

  test("۶-۱) پریمیتیوهای جدول = منبع قانون: ظرف max-h + سرستون sticky + cv-row + وسط‌چین + text-xs", async () => {
    const table = readFileSync(`${SRC}/components/ui/table.tsx`, "utf8");
    expect(table).toContain("max-h-[32rem]"); // ظرف اسکرول یگانه — اسکرول سریع
    expect(table).toContain("sticky top-0"); // سرستون ثابت در اسکرول
    expect(table).toContain("cv-row"); // content-visibility — رندر سریع
    expect(table).toMatch(/TableHead[\s\S]{0,400}text-center/); // سرستون وسط‌چین
    expect(table).toMatch(/TableCell[\s\S]{0,300}text-center[\s\S]{0,200}text-xs/); // سلول وسط‌چین + فونت یکدست
  });

  test("۶-۲) هر فهرست فعال: بدون صفحه‌بندی، بدون سرستون غیروسط‌چین، بدون فونت غیرقانونی در سلول", async () => {
    for (const rel of LIST_PAGES) {
      const s = readFileSync(`${TILES}/${rel}`, "utf8");
      expect(s, `${rel}: صفحه‌بندی`).not.toMatch(/Pagination|pageSize|currentPage/);
      expect(s, `${rel}: سرستون text-right`).not.toMatch(/<TableHead[^>]*text-right/);
      expect(s, `${rel}: سلول text-sm`).not.toMatch(/<TableCell[^>]*text-sm/);
      expect(s, `${rel}: جدول دستی`).not.toContain("<table");
    }
  });

  test("۶-۳) هر فهرست فعال: بدون ظرف اسکرول تکراری دور جدول (ظرف یگانه = پریمیتیو)", async () => {
    for (const rel of LIST_PAGES) {
      const s = readFileSync(`${TILES}/${rel}`, "utf8");
      const wrap = s.match(/<(div|CardContent)[^>]*(max-h-\[|overflow-y-auto|overflow-auto)[^>]*>\s*(?:<div[^>]*>\s*)?<Table/);
      expect(wrap, `${rel}: ظرف تکراری → ${wrap?.[0].slice(0, 60)}`).toBeNull();
    }
  });

  test("۶-۴) روت‌های فهرست: پیش‌فرض و سقف ۲۵٬۰۰۰ (تمام ردیف‌ها — سقف = گارد ایمنی)", async () => {
    for (const routeFile of ["arm-catalog/listings", "arm-catalog/requests", "transactions"]) {
      const s = readFileSync(`${SRC}/app/api/crm/${routeFile}/route.ts`, "utf8");
      expect(s, `${routeFile}: پیش‌فرض ۲۵۰۰۰`).toContain("?? 25000");
      expect(s, `${routeFile}: سقف ۲۵۰۰۰ (گارد ایمنی)`).toMatch(/,\s*25000\)/);
    }
  });

  test("۶-۵) صفحات M1/M2/M3: عنوان فهرست وسط‌چین + Badge تک‌صفحه‌ای (الگوی M3)", async () => {
    const m1 = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
    const m2 = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
    const m3 = readFileSync(`${TILES}/transactions-contracts/TransactionsTab.tsx`, "utf8");
    for (const [name, s] of [["M1", m1], ["M2", m2], ["M3", m3]] as const) {
      expect(s, `${name}: عنوان وسط‌چین`).toMatch(/CardTitle[^>]*text-center/);
      expect(s, `${name}: Badge تک‌صفحه‌ای`).toMatch(/تک‌صفحه‌ای/);
    }
  });

  test("۶-۶) روت M1/M2/M3 زنده: 200 + rows آرایه + total عددی (قرارداد پایدار)", async () => {
    const r1 = await callRoute("@/app/api/crm/arm-catalog/listings/route", "/api/crm/arm-catalog/listings?limit=5");
    const r2 = await callRoute("@/app/api/crm/arm-catalog/requests/route", "/api/crm/arm-catalog/requests?limit=5");
    const r3 = await callRoute("@/app/api/crm/transactions/route", "/api/crm/transactions?limit=5");
    for (const [name, r] of [["M1", r1], ["M2", r2], ["M3", r3]] as const) {
      expect(r.status, `${name}: status`).toBe(200);
      expect(Array.isArray(r.body.rows), `${name}: rows`).toBe(true);
      expect(typeof r.body.total, `${name}: total`).toBe("number");
    }
  });
});

/* ==========================================================================
 * §۸ — گارد همیشگی یکسان‌سازی (منبع یگانهٔ normalize-input)
 * ========================================================================== */

describe("P6530 §۸ — گارد همیشگی یکسان‌سازی", () => {
  test("۸-۱) هر ۱۰ رقم فارسی/عربی → لاتین درست — به‌ویژه ۴↦4 و ۵↦5", async () => {
    const { normalizeFilterInput } = await import("@/lib/normalize-input");
    expect(normalizeFilterInput("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(normalizeFilterInput("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });

  test("۸-۲) شاهد زندهٔ باگ: «۵۹۲۵۲» = 59252 و «۵۹۱۵» = 5915", async () => {
    const { normalizeFilterInput } = await import("@/lib/normalize-input");
    expect(normalizeFilterInput("۵۹۲۵۲")).toBe("59252");
    expect(normalizeFilterInput("۵۹۱۵")).toBe("5915");
  });

  test("۸-۳) حروف: ي↦ی، ك↦ک + مخلوط با ارقام", async () => {
    const { normalizeFilterInput } = await import("@/lib/normalize-input");
    expect(normalizeFilterInput("علي")).toBe("علی");
    expect(normalizeFilterInput("كاظم")).toBe("کاظم");
    expect(normalizeFilterInput("۵۹ك")).toBe("59ك".replace("ك", "ک"));
  });

  test("۸-۴) گارد ابدی: هیچ رشتهٔ ده‌رقمیِ جایگشت‌نامرتب (ارقام متمایز) در src وجود ندارد", async () => {
    const { execSync } = await import("node:child_process");
    let hits = "";
    try {
      hits = execSync(
        `grep -rnoE '["\\x27][0-9]{10}["\\x27]' ${SRC}/lib ${SRC}/app ${SRC}/core ${SRC}/components --include='*.ts' --include='*.tsx' | grep -v normalize-input || true`,
        { encoding: "utf8" }
      );
    } catch {
      hits = "";
    }
    const bad = hits
      .split("\n")
      .filter(Boolean)
      .filter((line) => {
        const m = line.match(/["'](\d{10})["']/);
        if (!m) return false;
        const digits = m[1].split("");
        return new Set(digits).size === digits.length; // ارقام متمایز = جایگشت نمونهٔ باگ
      });
    expect(bad).toEqual([]);
  });
});

/* ==========================================================================
 * §۹ — نصب اپلیکیشن (PWA) روی لینک publish
 * ========================================================================== */

describe("P6530 §۹ — نصب اپلیکیشن (PWA)", () => {
  test("۹-۱) مانیفست: standalone + آیکن‌های any/maskable ۱۹۲/۵۱۲ + start_url نسبی", async () => {
    const manifest = JSON.parse(readFileSync("/home/z/my-project/public/manifest.json", "utf8"));
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toMatch(/^\.?\//);
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes).join(",");
    expect(sizes).toContain("192");
    expect(sizes).toContain("512");
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  });

  test("۹-۲) دکمهٔ نصب: beforeinstallprompt بومی + راهنمای iOS + مخفی در حالت نصب‌شده", async () => {
    const s = readFileSync(`${SRC}/components/app/InstallButton.tsx`, "utf8");
    expect(s).toContain("beforeinstallprompt");
    expect(s).toContain("display-mode: standalone");
  });

  test("۹-۳) متاتگ‌های نصب iOS/اندروید در layout", async () => {
    const s = readFileSync(`${SRC}/app/layout.tsx`, "utf8");
    expect(s).toContain("appleWebApp"); // فرادادهٔ Next.js → apple-mobile-web-app-*
    expect(s).toContain("manifest");
    expect(s).toContain("viewportFit"); // ناحیهٔ امن iOS
  });
});
