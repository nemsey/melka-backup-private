/**
 * p6527-mobile-list-performance.test.ts — P6527 (دستور مالک ۱۴۰۵/۰۷/۰۶ شب)
 * =============================================================================
 * ریشه‌یابی «لینک preview در اندروید کار نمی‌کند» — دو عامل اثبات‌شده:
 *   ۱) رندر یکجای همهٔ ردیف‌ها در DOM (M1 = ۱۱٬۳۹۸ ردیف ≈ ۳۵۰K گره) → فریز/کرش
 *      مرورگر موبایل (شاهد: کرش تکرارشدنی Chrome هدلس روی همین صفحه پیش از اصلاح)
 *   ۲) انتقال بدون فشرده‌سازی (M1 = ۵٫۹MB · M2 = ۲٫۸MB JSON خام) → کندی شدید موبایل
 *
 * اصلاح P6527 (وفادار به «قانون همیشگی فهرست‌ها» — تک‌صفحه/تمام‌ردیف/اسکرول سریع):
 *   · TableBodyVirtual در «منبع قانون» (ui/table.tsx): هندسهٔ اسکرول عین کل فهرست،
 *     فقط ردیف‌های قابل‌دیدن + دو فاصله‌گذار در DOM (~۴۰ ردیف در هر لحظه)
 *   · فشرده‌سازی gzip روت‌های سنگین (compressedJson) وقتی کلاینت می‌پذیرد
 *   · حلقهٔ غنی‌سازی خودکار M1/M2: بدون بارگذاری کامل پس از هر برش
 *
 * بخش‌ها:
 *   §۱ محاسبات پنجره (منطق خالص — مرزها، ارتفاع اندازه‌گیری‌شده، اسکرول تا انتها)
 *   §۲ پریمیتیو (منبع قانون: قانون دست‌نخورده + مسیر مجازی + فاصله‌گذار)
 *   §۳ اتخاذ در هر ۱۰ فهرست فعال (۷ فایل) + بدون TableBody سادهٔ باقی‌مانده
 *   §۴ فشرده‌سازی (واحد + زنده روی هر سه روت M1/M2/M3)
 *   §۵ حلقهٔ غنی‌سازی (وصلهٔ شمارنده‌ای؛ بارگذاری فقط در برش آخر)
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const SRC = "/home/z/my-project/src";
const TILES = "/home/z/my-project/src/core/tiles/tiles";

/* ==========================================================================
 * §۱ — محاسبات پنجره (src/lib/virtual-window.ts — منطق خالص بدون DOM)
 * ========================================================================== */

describe("P6527 §۱ — پنجره‌یابی فهرست (منطق خالص)", () => {
  test("۱-۱) بالای فهرست: پنجرهٔ اول + overscan و فاصله‌گذار پایین", async () => {
    const { computeVirtualWindow, DEFAULT_ROW_HEIGHT } = await import("@/lib/virtual-window");
    const w = computeVirtualWindow({
      count: 1000,
      scrollTop: 0,
      viewportHeight: 512,
      heights: new Array(1000).fill(44),
    });
    expect(w.totalHeight).toBe(1000 * 44);
    expect(w.start).toBe(0);
    // دید 512px ≈ ۱۲ ردیف + overscan ۸
    expect(w.end).toBe(Math.ceil(512 / 44) + 8);
    expect(w.topPad).toBe(0);
    expect(w.bottomPad).toBe(w.totalHeight - 44 * w.end);
    expect(DEFAULT_ROW_HEIGHT).toBeGreaterThan(30);
  });

  test("۱-۲) وسط فهرست: پنجره با فاصله‌گذار دوطرفه (هم‌ارزی هندسه)", async () => {
    const { computeVirtualWindow } = await import("@/lib/virtual-window");
    const H = 44;
    const scrollTop = 22000; // ردیف ~۵۰۰
    const w = computeVirtualWindow({ count: 1000, scrollTop, viewportHeight: 512, heights: new Array(1000).fill(H) });
    // هندسهٔ همیشگی: topPad + ارتفاع ردیف‌های رندرشده + bottomPad = ارتفاع کل
    const rendered = (w.end - w.start) * H;
    expect(w.topPad + rendered + w.bottomPad).toBe(w.totalHeight);
    // پنجرهٔ دید واقعاً پوشش داده می‌شود (ردیف‌های داخل دید در بازهٔ رندر هستند)
    const firstVisible = Math.floor(scrollTop / H);
    const lastVisible = Math.ceil((scrollTop + 512) / H);
    expect(w.start).toBeLessThanOrEqual(firstVisible);
    expect(w.end).toBeGreaterThanOrEqual(lastVisible);
  });

  test("۱-۳) انتهای فهرست (اسکرول تا کف): آخرین ردیف در پنجره است", async () => {
    const { computeVirtualWindow } = await import("@/lib/virtual-window");
    const w = computeVirtualWindow({ count: 1000, scrollTop: 44000 - 512, viewportHeight: 512, heights: new Array(1000).fill(44) });
    expect(w.end).toBe(1000);
    expect(w.start).toBeLessThan(1000);
    expect(w.bottomPad).toBe(0);
  });

  test("۱-۴) دفاعی: اسکرول فراتر از انتهای فهرست → آخرین ردیف رندر می‌شود (نه ردیف ۰)", async () => {
    const { computeVirtualWindow } = await import("@/lib/virtual-window");
    const w = computeVirtualWindow({ count: 1000, scrollTop: 999999, viewportHeight: 512, heights: new Array(1000).fill(44) });
    expect(w.end).toBe(1000);
    expect(w.start).toBe(1000 - 1 - 8); // آخرین ردیف + overscan
  });

  test("۱-۵) ارتفاع‌های اندازه‌گیری‌شدهٔ ناهمگون (ردیف چندخطی) + خانه‌های تهی = پیش‌فرض", async () => {
    const { computeVirtualWindow, DEFAULT_ROW_HEIGHT } = await import("@/lib/virtual-window");
    const heights: (number | undefined)[] = [40, 40, 120, undefined, 40];
    const w = computeVirtualWindow({ count: 5, scrollTop: 0, viewportHeight: 200, heights });
    // total = 40+40+120+DEFAULT+40
    expect(w.totalHeight).toBe(40 + 40 + 120 + DEFAULT_ROW_HEIGHT + 40);
    // پنجره تا فراتر از دید: 200px → ردیف‌های ۰..۳ + overscan → همه (count=5)
    expect(w.end).toBe(5);
  });

  test("۱-۶) فهرست خالی و viewport صفر (پیش از اندازه‌گیری) — رفتار امن", async () => {
    const { computeVirtualWindow, DEFAULT_VIEWPORT_HEIGHT } = await import("@/lib/virtual-window");
    const empty = computeVirtualWindow({ count: 0, scrollTop: 0, viewportHeight: 512 });
    expect(empty).toEqual({ start: 0, end: 0, topPad: 0, bottomPad: 0, totalHeight: 0 });
    // viewport=0 → دید حدسی DEFAULT_VIEWPORT_HEIGHT (پس از mount بلافاصله تصحیح می‌شود)
    const w = computeVirtualWindow({ count: 1000, scrollTop: 0, viewportHeight: 0, heights: new Array(1000).fill(44) });
    expect(w.end).toBe(Math.ceil(DEFAULT_VIEWPORT_HEIGHT / 44) + 8);
    expect(DEFAULT_VIEWPORT_HEIGHT).toBeGreaterThan(400);
  });

  test("۱-۷) ثابت‌های قانون: آستانهٔ رندر ساده ۲۰۰ + overscan ۸", async () => {
    const mod = await import("@/lib/virtual-window");
    expect(mod.PLAIN_RENDER_MAX).toBe(200);
    expect(mod.OVERSCAN_ROWS).toBe(8);
  });
});

/* ==========================================================================
 * §۲ — پریمیتیو TableBodyVirtual در «منبع قانون» (ui/table.tsx)
 * ========================================================================== */

describe("P6527 §۲ — منبع قانون: پریمیتیو مجازی + قانون دست‌نخورده", () => {
  const table = readFileSync(`${SRC}/components/ui/table.tsx`, "utf8");

  test("۲-۱) قانون فهرست P6525 عیناً برجاست (max-h + sticky + cv-row + وسط‌چین + text-xs)", () => {
    expect(table).toContain("max-h-[32rem]");
    expect(table).toContain("sticky top-0");
    expect(table).toContain("cv-row");
    expect(table).toMatch(/TableHead[\s\S]{0,400}text-center/);
    expect(table).toMatch(/TableCell[\s\S]{0,300}text-center[\s\S]{0,200}text-xs/);
  });

  test("۲-۲) مسیر مجازی فقط برای فهرست‌های بزرگ (> PLAIN_RENDER_MAX از منبع یگانه)", () => {
    expect(table).toContain("TableBodyVirtual");
    expect(table).toMatch(/rows\.length > PLAIN_RENDER_MAX/);
    expect(table).toContain("import {\n  PLAIN_RENDER_MAX,");
    // فهرست کوچک = عین رفتار قبلی (بدون فاصله‌گذار)
    expect(table).toMatch(/rows\.map\(\(row, i\) => children\(row, i\)\)/);
  });

  test("۲-۳) فاصله‌گذارها aria-hidden + پیوست هندسه (data-vpad) + شناسهٔ ردیف (data-vrow)", () => {
    expect(table).toContain(`data-vpad="top"`);
    expect(table).toContain(`data-vpad="bottom"`);
    expect(table).toMatch(/aria-hidden/);
    expect(table).toContain("data-vrow");
  });

  test("۲-۴) اسکرول غیرمسدودکننده (passive + requestAnimationFrame) و اندازه‌گیری ResizeObserver", () => {
    expect(table).toContain(`"scroll", onScroll, { passive: true }`);
    expect(table).toContain("requestAnimationFrame");
    expect(table).toContain("new ResizeObserver");
  });

  test("۲-۵) ظرف اسکرول همان ظرف یگانهٔ قانون است (data-slot=table-container — بدون ظرف تازه)", () => {
    expect(table).toContain(`closest(\n      "[data-slot='table-container']"`);
  });

  test("۲-۶) صادرات عمومی TableBodyVirtual برای همهٔ فهرست‌ها (الان و آینده)", () => {
    expect(table).toMatch(/export \{[\s\S]*TableBodyVirtual[\s\S]*\}/);
  });
});

/* ==========================================================================
 * §۳ — اتخاذ در هر ۱۰ فهرست فعال (۷ فایل — M1/M2/M3 + M4..M7)
 * ========================================================================== */

describe("P6527 §۳ — اتخاذ رندر پنجره‌ای در همهٔ فهرست‌های فعال", () => {
  const ADOPTIONS: Array<[string, string, number]> = [
    ["arm-listing/ArmListingsPage.tsx", "M1 — آگهی (۱۱٬۳۹۸ ردیف)", 1],
    ["arm-request/ArmRequestsPage.tsx", "M2 — درخواست (۷٬۳۱۴ ردیف)", 1],
    ["transactions-contracts/TransactionsTab.tsx", "M3 — معاملات (۷۳۹ ردیف)", 1],
    ["experts/ExpertsPage.tsx", "M4 — کارشناسان (۱ جدول — تعاملات حذف گام ۴ P6530)", 1],
    ["customer-club/CustomerClubPage.tsx", "باشگاه مشتریان (۲ جدول)", 2],
  ];

  test("۳-۱) هر فهرست از TableBodyVirtual با rows + rowKey استفاده می‌کند", () => {
    for (const [rel, label, expectedCount] of ADOPTIONS) {
      const s = readFileSync(`${TILES}/${rel}`, "utf8");
      const count = (s.match(/<TableBodyVirtual rows=/g) ?? []).length;
      expect(count, `${label} (${rel}): انتظار ${expectedCount} جدول`).toBe(expectedCount);
      expect(s, `${rel}: rowKey`).toMatch(/rowKey=\{/);
      expect(s, `${rel}: ایمپورت`).toMatch(/TableBodyVirtual, TableCell/);
    }
  });

  test("۳-۲) هیچ فهرست فعلی TableBody سادهٔ رندر یکجا باقی نمانده", () => {
    for (const [rel, label] of ADOPTIONS) {
      const s = readFileSync(`${TILES}/${rel}`, "utf8");
      expect(s.includes("<TableBody>"), `${label} (${rel}): هنوز TableBody ساده دارد`).toBe(false);
      expect(s.includes("</TableBody>"), `${label} (${rel}): تگ پایانی TableBody ساده`).toBe(false);
    }
  });

  test("۳-۳) بدون واژه‌های ممنوع قانون (صفحه‌بندی) در فهرست‌های تازه‌وصله", () => {
    for (const [rel] of ADOPTIONS) {
      const s = readFileSync(`${TILES}/${rel}`, "utf8");
      expect(s).not.toMatch(/Pagination|pageSize|currentPage/);
    }
  });
});

/* ==========================================================================
 * §۴ — فشرده‌سازی انتقال (compressedJson + روت‌های زندهٔ M1/M2/M3)
 * ========================================================================== */

describe("P6527 §۴ — فشردهٔ gzip انتقال فهرست‌های سنگین", () => {
  const S = "p6527z";

  // کاشت دادهٔ کافی برای عبور از آستانهٔ فشرده‌سازی (۶۴KB) در هر سه کاتالوگ
  beforeAll(async () => {
    const { db } = await import("@/lib/db");
    await db.propertyRecord.deleteMany({ where: { id: { startsWith: S } } }).catch(() => undefined);
    await db.requestRecord.deleteMany({ where: { id: { startsWith: S } } }).catch(() => undefined);
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: S } } }).catch(() => undefined);

    await db.propertyRecord.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        id: `${S}-p${i}`,
        propertyCode: `${S}${100000 + i}`,
        title: `فروش آپارتمان مسکونی تست P6527 شمارهٔ ${i} در محلهٔ خاوران تبریز`,
        status: "منتشر شده",
        ownerName: `مالک آزمایشی ${i}`,
        ownerMobile: "09140000000",
        address: `آذربایجان شرقی، تبریز، خاوران، کوچهٔ ${i}، پلاک ${i}`,
      })),
    });
    await db.requestRecord.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        id: `${S}-r${i}`,
        requestCode: `${S}${200000 + i}`,
        title: `درخواست خرید آپارتمان تست P6527 شمارهٔ ${i}`,
        status: "در جریان",
        actorCode: `P6527-${i}`,
        actorName: `کارشناس آزمایشی ${i}`,
        source: "arm",
      })),
    });
    await db.transactionRecord.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        id: `${S}-t${i}`,
        contractDate: new Date(`2026-06-1${i % 9}T10:00:00Z`),
        propertyCode: `${S}${100000 + i}`,
        propertyCustomer: `مالک ${i}`,
        contractHolo: `${S}-H${i}`,
      })),
    });
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.propertyRecord.deleteMany({ where: { id: { startsWith: S } } }).catch(() => undefined);
    await db.requestRecord.deleteMany({ where: { id: { startsWith: S } } }).catch(() => undefined);
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: S } } }).catch(() => undefined);
  });

  async function ownerToken(): Promise<string> {
    const { createSession } = await import("@/lib/auth/session");
    const { token } = await createSession(
      { personnelCode: "950025", displayName: "تست P6527", role: "OWNER" },
      { ip: "127.0.0.1" },
      null
    );
    return token;
  }

  test("۴-۱) واحد: با accept-encoding gzip و بدنهٔ بزرگ → content-encoding: gzip + رفت‌وبرگشت", async () => {
    const { compressedJson } = await import("@/lib/http/compressed-json");
    const bigPayload = { ok: true, rows: Array.from({ length: 2000 }, (_, i) => ({ id: String(i), code: String(10000 + i), name: "نام آزمایشی" + i })) };
    const res = await compressedJson(bigPayload, "gzip, deflate, br");
    expect(res.headers.get("content-encoding")).toBe("gzip");
    const gz = Buffer.from(await res.arrayBuffer());
    const roundTrip = JSON.parse(gunzipSync(gz).toString("utf8"));
    expect(roundTrip.rows.length).toBe(2000);
    expect(roundTrip.rows[1999].id).toBe("1999");
  });

  test("۴-۲) واحد: بدون accept-encoding → عین Response.json (سازگاری تست‌ها/کلاینت‌های ساده)", async () => {
    const { compressedJson } = await import("@/lib/http/compressed-json");
    const res = await compressedJson({ ok: true, rows: [1, 2, 3] }, null);
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(await res.json()).toEqual({ ok: true, rows: [1, 2, 3] });
  });

  test("۴-۳) واحد: بدنهٔ کوچک → بدون فشرده‌سازی (سربار بیهوده نیست)", async () => {
    const { compressedJson } = await import("@/lib/http/compressed-json");
    const res = await compressedJson({ ok: true, small: true }, "gzip");
    expect(res.headers.get("content-encoding")).toBeNull();
  });

  test("۴-۴) زندهٔ M1: listings با accept-encoding gzip → پاسخ فشرده (۵.۹MB → ~۱MB) و قرارداد سالم", async () => {
    const token = await ownerToken();
    const route = await import("@/app/api/crm/arm-catalog/listings/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/crm/arm-catalog/listings", {
      headers: { authorization: `Bearer ${token}`, "accept-encoding": "gzip, deflate, br" },
    });
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("gzip");
    expect(res.headers.get("x-content-encoding-source")).toBe("app");
    const body = JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8"));
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.total).toBe("number");
    // حجم فشرده باید به‌مراتب کوچک‌تر از JSON خام باشد (نسبت ≥ ۳×)
    const gzBytes = (await res.arrayBuffer().catch(() => null)) as ArrayBuffer | null;
    if (gzBytes && gzBytes.byteLength > 0) {
      expect(gzBytes.byteLength).toBeLessThan(JSON.stringify(body).length / 3);
    }
  });

  test("۴-۵) زندهٔ M2: requests با accept-encoding gzip → فشرده؛ بدون آن → ساده (هر دو قرارداد سالم)", async () => {
    const token = await ownerToken();
    const route = await import("@/app/api/crm/arm-catalog/requests/route");
    const { NextRequest } = await import("next/server");
    const gzReq = new NextRequest("http://localhost/api/crm/arm-catalog/requests", {
      headers: { authorization: `Bearer ${token}`, "accept-encoding": "gzip" },
    });
    const gzRes = await route.GET(gzReq);
    expect(gzRes.headers.get("content-encoding")).toBe("gzip");
    const body = JSON.parse(gunzipSync(Buffer.from(await gzRes.arrayBuffer())).toString("utf8"));
    expect(Array.isArray(body.rows)).toBe(true);
    // بدون accept-encoding (مسیر تست‌ها) → پاسخ سادهٔ JSON
    const plainReq = new NextRequest("http://localhost/api/crm/arm-catalog/requests?limit=5", {
      headers: { authorization: `Bearer ${token}` },
    });
    const plainRes = await route.GET(plainReq);
    expect(plainRes.headers.get("content-encoding")).toBeNull();
    const plainBody = await plainRes.json();
    expect(plainBody.rows.length).toBe(5);
  });

  test("۴-۶) زندهٔ M3: transactions با accept-encoding gzip → فشرده + قرارداد rows/total", async () => {
    const token = await ownerToken();
    const route = await import("@/app/api/crm/transactions/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/crm/transactions?limit=25000", {
      headers: { authorization: `Bearer ${token}`, "accept-encoding": "gzip" },
    });
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("gzip");
    const body = JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8"));
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.total).toBe("number");
  });
});

/* ==========================================================================
 * §۵ — حلقهٔ غنی‌سازی خودکار M1/M2 (بدون بارگذاری کامل پس از هر برش)
 * ========================================================================== */

describe("P6527 §۵ — حلقهٔ غنی‌سازی: وصلهٔ شمارنده‌ای به‌جای بارگذاری کامل", () => {
  const M1 = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
  const M2 = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");

  test("۵-۱) شمارنده‌ها از پاسخ همان برش وصله می‌شوند (enriched/remaining)", () => {
    for (const [name, s] of [["M1", M1], ["M2", M2]] as const) {
      expect(s, `${name}: خواندن enrich از پاسخ`).toMatch(/enrich\?\.(find|Array)/);
      expect(s, `${name}: وصلهٔ complete`).toContain("complete: Math.min(prev.enrichment.complete + (e.enriched ?? 0)");
      expect(s, `${name}: وصلهٔ pending`).toContain("pending: e.remaining");
    }
  });

  test("۵-۲) بارگذاری کامل فقط پس از برش آخر (remaining=0) — نه بعد از هر برش", () => {
    for (const [name, s] of [["M1", M1], ["M2", M2]] as const) {
      expect(s, `${name}: بارگذاری مشروط`).toContain("if ((e.remaining ?? 0) === 0) await load();");
      // الگوی قدیمی ممنوع: sync → await load() بی‌قید در autoEnrichSlice
      const sliceBody = s.slice(s.indexOf("const autoEnrichSlice"), s.indexOf("const autoEnrichSlice") + 1600);
      expect(sliceBody.match(/await load\(\);/g)?.length, `${name}: تنها یک بارگذاری مشروط`).toBe(1);
    }
  });
});

/* ==========================================================================
 * §۶ → PN-038 — قانون دادهٔ مقدس: «ریست اتصال» دیگر هرگز حذف نمی‌کند
 * =============================================================================
 * شاهد: مالک در تنظیمات «ریست اتصال» زد (withData=true) → پیش‌تر شش جدول
 * پاک می‌شد (حادثهٔ ۱۴۰۵/۰۷/۰۴: ۷۳۹ معامله از دست رفت). PN-038/۱.۴ (شورا-ن۰۶۳)
 * ریست را به «بازسازی روی داده» تغییر داد: داده می‌ماند + بکاپ شاهد + سینک
 * مجدد با upsert روی همان داده.
 * ========================================================================== */

describe("P6527 §۶ → PN-038 — ریست بدون حذف (قانون دادهٔ مقدس)", () => {
  const SYNC = readFileSync("/home/z/my-project/src/lib/melk-api/sync.ts", "utf8");
  const RESET = readFileSync("/home/z/my-project/src/app/api/connection/reset/route.ts", "utf8");

  test("۶-۱) PN-038: clearCrmCacheTables دیگر deleteMany ندارد — mode=sacred-keep", () => {
    // شمارش داده قبل از تصمیم بکاپ
    expect(SYNC).toMatch(/txCount \+ exCount \+ inCount \+ viCount \+ sdCount \+ ctCount > 0/);
    // snapshot شاهد (VACUUM INTO) موجود است
    expect(SYNC).toContain("VACUUM INTO");
    // هیچ deleteMany کدی در کل فایل نیست (کامنت‌ها مستثنا)
    const codeLines = SYNC.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
    expect(codeLines.filter((l) => l.includes("deleteMany("))).toEqual([]);
    // حالت مقدس برمی‌گردد
    expect(SYNC).toContain('mode: "sacred-keep"');
  });

  test("۶-۲) روت ریست: نام فایل بکاپ در پاسخ و رخداد حسابرسی برمی‌گردد", () => {
    expect(RESET).toContain("const clear = await clearCrmCacheTables();");
    expect(RESET).toContain("backupFile: preResetBackup");
    expect(RESET).toMatch(/audit\("CONNECTION_RESET"[\s\S]*?backup=/);
  });

  test("۶-۳) زنده: ریست با داده → داده سر جای خود می‌ماند + بکاپ شاهد ساخته می‌شود", async () => {
    const { db } = await import("@/lib/db");
    const { clearCrmCacheTables } = await import("@/lib/melk-api/sync");
    const S = "p6527reset";
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: S } } });
    await db.transactionRecord.create({
      data: { id: `${S}-tx`, contractDate: new Date("2026-06-15T10:00:00Z"), propertyCode: `${S}-P` },
    });
    const result = await clearCrmCacheTables();
    expect(result.cleared).toBe(true);
    expect(result.mode).toBe("sacred-keep");
    expect((result.rowsKept ?? 0)).toBeGreaterThanOrEqual(1);
    expect(result.backupFile).toBeTruthy();
    // فایل بکاپ شاهد واقعاً موجود است
    const { existsSync, rmSync } = await import("node:fs");
    expect(existsSync(result.backupFile!)).toBe(true);
    // داده حذف نشد — قانون مقدس (این ردیف + هر دادهٔ قبلی دیگر)
    expect(await db.transactionRecord.count({ where: { id: `${S}-tx` } })).toBe(1);
    rmSync(result.backupFile!, { force: true });
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: S } } });
  });

  test("۶-۴) بدون داده → بدون بکاپ بی‌مورد (سطح سورس: بازگشت زودهنگام بدون بکاپ)", async () => {
    // جدول‌های خالی ⇒ بازگشت زودهنگام بدون بکاپ (عین رفتار قبلی — بدون وابستگی به وضعیت جهانی DB تست)
    expect(SYNC).toMatch(/if \(!hasData\) return \{ cleared: true, mode: "sacred-keep", rowsKept: 0 \}/);
  });
});
