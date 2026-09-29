/**
 * p6530-m1-arm-listing.test.ts — سوئیت تازهٔ کاشی M1 «آگهی ملک تبریز» (گام ۱)
 * =============================================================================
 * نکتهٔ بسیار مهم ۲ (گام ۱): «کلیه تست‌های کاشی آگهی ملک تبریز (ایجنت، تنظیمات،
 * بینش، فهرست، فیلتر، بروزرسانی و ...) حذف شود؛ تست‌های جدید طراحی، پیاده‌سازی
 * و اعمال واقعی شود و در انتها راستی‌آزمایی شود.»
 *
 * حذف‌شده‌ها: سوئیت p6526-m123 (۶۹ تست) — بخش‌های سراسری آن به
 * p6530-architecture-guards.test.ts منتقل شدند.
 *
 * این سوئیت تازه — ۸ بخش:
 *   §۱ ایجنت (رجیستری، نام، قرارداد، حلقهٔ بازخورد، سیاست)
 *   §۲ تنظیمات کاشی (سوییچ عنوان، نسخهٔ ۲٫۰٫۰)
 *   §۳ وضعیت ده‌حالته (نکته ۳ — طبقه‌بندی + توزیع)
 *   §۴ فهرست ده‌ستونی (بند ۱ — ستون‌ها/ترتیب/قیمت کاما/موبایل زیر نام/شعبه)
 *   §۵ فیلتر تمام ستون‌ها (بند ۲)
 *   §۶ بینش توزیع وضعیت (بند ۳)
 *   §۷ بروزرسانی (بند ۴ — checkpoint + تاریخ دقیق + ادامه از نقطهٔ قطع)
 *   §۸ رنگ بخش M1 (گام صفر — سبز یشمی)
 */
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, test } from "bun:test";

const P = "p6530m1";
const SRC = "/home/z/my-project/src";
const TILES = "/home/z/my-project/src/core/tiles/tiles";

let OWNER_TOKEN: string | null = null;

async function ownerToken(): Promise<string> {
  if (OWNER_TOKEN) return OWNER_TOKEN;
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode: "950031", displayName: "تست M1", role: "OWNER" },
    { ip: "127.0.0.1" },
    null
  );
  OWNER_TOKEN = token;
  return token;
}

async function callRoute(query: string): Promise<{ status: number; body: any }> {
  const route = await import("@/app/api/crm/arm-catalog/listings/route");
  const { NextRequest } = await import("next/server");
  const token = await ownerToken();
  const req = new NextRequest(`http://localhost${query}`, { headers: { authorization: `Bearer ${token}` } });
  const res = await route.GET(req);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/* ==========================================================================
 * §۱ — ایجنت کاشی M1
 * ========================================================================== */

describe("گام ۱/M1 §۱ — ایجنت هوشمند", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("۱-۱) ایجنت در رجیستری ثبت شده و شناسهٔ کاشی درست دارد", async () => {
    const { getAgent } = await import("@/core/agent");
    const m1 = getAgent("arm-listings");
    expect(m1).toBeDefined();
    expect(m1!.tileId).toBe("arm-listings");
    expect(m1!.name).toBe("ایجنت آگهی ملک تبریز");
  });

  test("۱-۲) قرارداد کاشی ↔ ایجنت: insightDomains و capabilities عین هم", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const { getAgent } = await import("@/core/agent");
    const tile = tileRegistry.get("arm-listings")!;
    const agent = getAgent("arm-listings")!;
    expect(tile.agent).toBeDefined();
    expect([...tile.agent!.insightDomains].sort()).toEqual([...agent.insightDomains].sort());
    expect(tile.agent!.capabilities).toContain("memory");
    expect(tile.agent!.capabilities).toContain("feedback");
    expect(tile.agent!.capabilities).toContain("policy-versions");
    expect(tile.agent!.capabilities).toContain("rollback");
  });

  test("۱-۳) حلقهٔ یادگیری: ثبت بازخورد → حافظهٔ Append-only + شمارش کل", async () => {
    const { getAgent } = await import("@/core/agent");
    const agent = getAgent("arm-listings")!;
    const before = await agent.submitFeedback({ insightKey: `${P}-warmup`, insightTitle: "پیش‌گرمایش", domain: "VOLUME", rating: 1 });
    const after = await agent.submitFeedback({ insightKey: `${P}-fb1`, insightTitle: "تست بازخورد گام ۱", domain: "VOLUME", rating: 1, comment: "بازخورد آزمایشی سوئیت M1" });
    expect(after.totalFeedback).toBe(before.totalFeedback + 1);
    const hits = await agent.retrieveRelevant("تست بازخورد گام ۱", 5);
    expect(hits.length).toBeGreaterThan(0);
  });

  test("۱-۴) سیاست نسخه‌بندی‌شده: سیاست فعلی ≥ نسخهٔ ۱ و فهرست نسخه‌ها", async () => {
    const { getAgent } = await import("@/core/agent");
    const agent = getAgent("arm-listings")!;
    const policy = await agent.getActivePolicy();
    expect(policy.version).toBeGreaterThanOrEqual(1);
    expect(policy.content.weights).toBeDefined();
    const versions = await agent.listPolicyVersions();
    expect(versions.length).toBeGreaterThanOrEqual(1);
  });
});

/* ==========================================================================
 * §۲ — تنظیمات کاشی M1
 * ========================================================================== */

describe("گام ۱/M1 §۲ — تنظیمات کاشی", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("۲-۱) کاشی M1: نسخهٔ ۲٫۰٫۰ (بازطراحی گام ۱) با تنظیمات معتبر", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const tile = tileRegistry.get("arm-listings")!;
    expect(tile.version).toBe("2.0.0");
    expect(Array.isArray(tile.settings)).toBe(true);
    expect(tile.settings.length).toBeGreaterThan(0);
  });

  test("۲-۲) تنظیم «نمایش عنوان آگهی زیر کد» — سوییچ با پیش‌فرض روشن و hint فارسی", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const tile = tileRegistry.get("arm-listings")!;
    const st = tile.settings.find((s) => s.key === "showTitles");
    expect(st).toBeDefined();
    expect(st!.type).toBe("switch");
    expect(st!.defaultValue).toBe(true);
    expect(st!.hint.length).toBeGreaterThan(5);
  });

  test("۲-۳) صفحه M1 از تنظیم showTitles پیروی می‌کند (عنوان زیر کد فقط با فعال‌بودن)", async () => {
    const s = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
    expect(s).toContain("settings.showTitles !== false");
    expect(s).toMatch(/showTitles && r\.title/);
  });
});

/* ==========================================================================
 * §۳ — وضعیت ده‌حالته (نکته ۳)
 * ========================================================================== */

describe("گام ۱/M1 §۳ — وضعیت ده‌حالته", () => {
  test("۳-۱) دقیقاً ده حالت با برچسب‌های عین دستور مالک (به ترتیب)", async () => {
    const { LISTING_STATES } = await import("@/lib/listing-status");
    expect(LISTING_STATES.length).toBe(10);
    expect(LISTING_STATES.map((s) => s.label)).toEqual([
      "معامله شده",
      "منتشر شده",
      "نمایش خصوصی",
      "منقضی شده",
      "رد توسط مدیر",
      "در انتظار تایید مدیر",
      "در انتظار تایید مشاور",
      "در انتظار بررسی مشاور",
      "فایل قابل احیا",
      "فایل غیر قابل احیا",
    ]);
  });

  test("۳-۲) طبقه‌بندی مقادیر خام واقعی DB (شاهد ۱۱٬۴۵۶ رکورد) → ده حالت", async () => {
    const { classifyListingStatus } = await import("@/lib/listing-status");
    const cases: Array<[string, string | null]> = [
      ["معامله شده", "traded"],
      ["منتشر شده", "published"],
      ["اکران خصوصی", "private"],
      ["منقضی شده", "expired"],
      ["رد شده توسط مدیر", "rejectedByAdmin"],
      ["در انتظار تایید مدیر", "pendingAdmin"],
      ["در انتظار تایید مشاور", "pendingConsultant"],
      ["در انتظار بررسی مشاوران", "pendingReview"],
      [" فایل قابل احیا", "recoverable"], // فاصلهٔ ابتدایی خام DB
      ["فایل غیر قابل احیا", "unrecoverable"],
      ["در انتظار معامله", null], // خارج از ده‌گانه → سایر
      [null, null],
    ];
    for (const [raw, expected] of cases) {
      expect(classifyListingStatus(raw)).toBe(expected);
    }
  });

  test("۳-۳) rollupStatusCounts: هر ده کلید + other + total — تجمیع صحیح", async () => {
    const { rollupStatusCounts } = await import("@/lib/listing-status");
    const out = rollupStatusCounts([
      ["معامله شده", 10],
      ["منتشر شده", 20],
      ["اکران خصوصی", 5],
      ["منقضی شده", 15],
      ["رد شده توسط مدیر", 3],
      ["در انتظار تایید مدیر", 2],
      ["در انتظار تایید مشاور", 7],
      ["در انتظار بررسی مشاوران", 12],
      [" فایل قابل احیا", 4],
      ["فایل غیر قابل احیا", 21],
      ["در انتظار معامله", 1],
    ]);
    expect(out.traded).toBe(10);
    expect(out.published).toBe(20);
    expect(out.private).toBe(5);
    expect(out.expired).toBe(15);
    expect(out.rejectedByAdmin).toBe(3);
    expect(out.pendingAdmin).toBe(2);
    expect(out.pendingConsultant).toBe(7);
    expect(out.pendingReview).toBe(12);
    expect(out.recoverable).toBe(4);
    expect(out.unrecoverable).toBe(21);
    expect(out.other).toBe(1);
    expect(out.total).toBe(100);
  });

  test("۳-۴) فیلتر وضعیت: کلیدهای canonical → مقادیر خام (parse + rawValues رفت‌وبرگشت)", async () => {
    const { parseListingStateFilter, listingStateRawValues } = await import("@/lib/listing-status");
    const keys = parseListingStateFilter("traded,pendingAdmin,recoverable,bogus");
    expect(keys).toEqual(["traded", "pendingAdmin", "recoverable"]);
    const raws = listingStateRawValues(keys);
    expect(raws).toContain("معامله شده");
    expect(raws).toContain("در انتظار تایید مدیر");
    expect(raws).toContain("فایل قابل احیا");
  });
});

/* ==========================================================================
 * §۴ — فهرست ده‌ستونی (بند ۱ + نکات ۱ و ۲ و ۳ و ۴ و نکتهٔ بسیار مهم ۳ و ۴)
 * ========================================================================== */

describe("گام ۱/M1 §۴ — فهرست ده‌ستونی", () => {
  test("۴-۱) سرستون‌ها عین ترتیب دستور مالک: ردیف تا آخرین فعالیت", async () => {
    const s = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
    const heads = [...s.matchAll(/<TableHead[^>]*>([^<]+)<\/TableHead>/g)].map((m) => m[1].trim());
    expect(heads).toEqual([
      "ردیف",
      "کد آگهی",
      "کارشناس",
      "شعبه",
      "مالک",
      "قیمت ملک",
      "آدرس ملک",
      "دسته‌بندی",
      "وضعیت",
      "آخرین فعالیت",
    ]);
  });

  test("۴-۲) ستون مالک: نام + موبایل «زیر نام» عین الگوی فروشنده/خریدار M3 (نکته ۱ + مهم ۴)", async () => {
    const s = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
    // الگوی M3: div ستونی + نام truncate + لینک tel موبایل زیر آن
    expect(s).toMatch(/flex flex-col items-center gap-0\.5/);
    expect(s).toMatch(/href=\{`tel:\$\{r\.ownerMobile\}`\}/);
    expect(s).toMatch(/موبایل ثبت‌نشده/);
    // ستون جدا برای موبایل مالک حذف شده (ادغام زیر نام)
    expect(s).not.toContain("شماره تماس مالک");
  });

  test("۴-۳) قیمت ملک: نمایش با کاما و واحد تومان (نکتهٔ بسیار مهم ۳ — faAmountFull)", async () => {
    const s = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
    expect(s).toContain("faAmountFull(r.price)");
    const { faAmountFull } = await import("@/lib/format");
    // شاهد: ۹٬۰۰۰٬۰۰۰٬۰۰۰ تومان عین نمونهٔ دستور
    expect(faAmountFull(9_000_000_000)).toBe("۹،۰۰۰،۰۰۰،۰۰۰ تومان");
    expect(faAmountFull(1_500_000)).toBe("۱،۵۰۰،۰۰۰ تومان");
  });

  test("۴-۴) ستون شعبه: چهار شعبهٔ ملک تبریز عین نکته ۲ + حالت تعیین‌نشدهٔ صادقانه", async () => {
    const { TABRIZ_BRANCHES, BRANCH_UNSET, resolveExpertBranch, matchTabrizBranch } = await import("@/lib/branches");
    expect(TABRIZ_BRANCHES).toEqual(["ارتش", "باغلارباغی", "ملکی تبریزی", "هتل مرمر"]);
    expect(BRANCH_UNSET).toBe("تعیین نشده");
    // زنجیرهٔ تفکیک: نقشهٔ مالک > سامانه > تعیین‌نشده
    expect(resolveExpertBranch("کارشناس الف", { "کارشناس الف": "ارتش" }, "شعبه مرکزی").branch).toBe("ارتش");
    expect(resolveExpertBranch("کارشناس ب", null, "باغلارباغی").branch).toBe("باغلارباغی");
    expect(resolveExpertBranch("کارشناس ج", null, "شعبه مرکزی").branch).toBe(BRANCH_UNSET);
    expect(resolveExpertBranch("کارشناس د", null, "ملک تبریز").branch).toBe(BRANCH_UNSET);
    // مقادیر سامانه که شعبه نیستند به‌عنوان شعبه جعل نمی‌شوند
    expect(matchTabrizBranch("شعبه مرکزی")).toBeNull();
    expect(matchTabrizBranch("ملک تبریز")).toBeNull();
    expect(matchTabrizBranch("هتل مرمر")).toBe("هتل مرمر");
  });

  test("۴-۵) دسته‌بندی آگهی: چهار دستهٔ عین نکته ۴", async () => {
    const s = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
    expect(s).toContain('["فروش", "پیش فروش", "رهن و اجاره", "مشارکت در ساخت"]');
  });

  test("۴-۶) روت زندهٔ M1: ردیف کامل با ستون‌های جدید (شعبه/قیمت/دسته‌بندی) برمی‌گردد", async () => {
    const { getPropertyRecordRepository } = await import("@/core/repositories");
    const repo = getPropertyRecordRepository();
    await repo.upsertBulk(
      [
        {
          id: `${P}r1`, propertyCode: `${P}99001`, title: "فروش آپارتمان",
          ownerName: "کارشناس تست گام یک", rawOwnerName: "مالک تست", ownerMobile: "09140001111",
          price: 9_000_000_000, tradeTypeName: "فروش",
          address: "تبریز، خاوران، کوی صفایی، پلاک ۷", areaName: "خاوران",
          status: "منتشر شده", createdAt: new Date("2026-09-28T10:00:00Z"),
        },
      ],
      { sourceRunId: `${P}-seed` }
    );
    const r = await callRoute(`/api/crm/arm-catalog/listings?code=${P}99001`);
    expect(r.status).toBe(200);
    expect(r.body.rows.length).toBe(1);
    const row = r.body.rows[0];
    expect(row.price).toBe(9_000_000_000);
    expect(row.tradeTypeName).toBe("فروش");
    expect(row.ownerName).toBe("مالک تست");
    expect(row.ownerMobile).toBe("09140001111");
    expect(row.branch).toBeDefined();
    expect(row.realtorName).toBe("کارشناس تست گام یک");
    // lastUpdate همیشه حاضر (بند ۴.۲)
    expect(r.body.lastUpdate).not.toBeUndefined();
    expect(r.body.branches.registry).toEqual(["ارتش", "باغلارباغی", "ملکی تبریزی", "هتل مرمر"]);
    // پاک‌سازی همین تست — نشت به سوئیت‌های بعدی ممنوع
    const { db: dbx } = await import("@/lib/db");
    await dbx.propertyRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
  });
});

/* ==========================================================================
 * §۵ — فیلتر بر اساس تمام ستون‌ها (بند ۲)
 * ========================================================================== */

describe("گام ۱/M1 §۵ — فیلتر تمام ستون‌ها", () => {
  let repo: any;

  beforeAll(async () => {
    const { getPropertyRecordRepository } = await import("@/core/repositories");
    const { db } = await import("@/lib/db");
    // پاک‌سازی idempotent اجراهای قبلی (شامل هر ردیف با پیشوند همین سوئیت)
    await db.propertyRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    repo = getPropertyRecordRepository();
    await repo.upsertBulk(
      [
        {
          id: `${P}f1`, propertyCode: `${P}4515`, title: "فروش آپارتمان خاوران",
          ownerName: "سید یاسین کاظمی", rawOwnerName: "علی محمدی", ownerMobile: "09141112233",
          price: 5_000_000_000, tradeTypeName: "فروش",
          address: "تبریز، خاوران، کوی صفایی، پلاک ۳", areaName: "خاوران",
          status: "منتشر شده", createdAt: new Date("2026-09-25T10:00:00Z"),
        },
        {
          id: `${P}f2`, propertyCode: `${P}5925`, title: "رهن و اجاره ویلا ولیعصر",
          ownerName: "مهدی شجاع زاده احمد طهماسبي", rawOwnerName: "زهرا رضایی", ownerMobile: "09142223344",
          price: 450_000_000, tradeTypeName: "رهن و اجاره",
          address: "تبریز، ولیعصر، خیابان نظامی", areaName: "ولیعصر",
          status: "منقضی شده", createdAt: new Date("2026-09-24T10:00:00Z"),
        },
        {
          id: `${P}f3`, propertyCode: `${P}1020`, ownerName: "کارشناس سوم تست",
          price: 12_000_000_000, tradeTypeName: "پیش فروش",
          status: "در انتظار تایید مدیر", createdAt: new Date("2026-09-23T10:00:00Z"),
        },
      ],
      { sourceRunId: `${P}-fseed` }
    );
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.propertyRecord.deleteMany({ where: { id: { startsWith: `${P}f` } } }).catch(() => undefined);
    await db.propertyRecord.deleteMany({ where: { id: `${P}r1` } }).catch(() => undefined);
    await db.$disconnect();
  });

  test("۵-۱) کد آگهی: فارسی = عربی = لاتین (رگرسیون باگ ۴/۵)", async () => {
    const fa = await repo.listArmCatalog({ code: `${P}۴۵۱۵` }, 100);
    const ar = await repo.listArmCatalog({ code: `${P}٤٥١٥` }, 100);
    const latin = await repo.listArmCatalog({ code: `${P}4515` }, 100);
    expect(latin.rows.length).toBe(1);
    expect(fa.rows.length).toBe(1);
    expect(ar.rows.length).toBe(1);
  });

  test("۵-۲) مالک — نام (نرمال‌شده) و موبایل: هر دو مسیر فیلتر می‌شوند", async () => {
    const byName = await repo.listArmCatalog({ ownerName: "علی محمدی" }, 100);
    expect(byName.rows.length).toBe(1);
    expect(byName.rows[0].propertyCode).toBe(`${P}4515`);
    const byMobile = await repo.listArmCatalog({ ownerName: "09142223344" }, 100);
    expect(byMobile.rows.length).toBe(1);
    expect(byMobile.rows[0].propertyCode).toBe(`${P}5925`);
  });

  test("۵-۳) قیمت — بازهٔ از/تا (تومان): مرزها فراگیرند", async () => {
    const mid = await repo.listArmCatalog({ code: P, priceFrom: 400_000_000, priceTo: 5_000_000_000 }, 100);
    const codes = mid.rows.map((r: any) => r.propertyCode).sort();
    expect(codes).toEqual([`${P}4515`, `${P}5925`].sort());
    const onlyHigh = await repo.listArmCatalog({ code: P, priceFrom: 6_000_000_000 }, 100);
    expect(onlyHigh.rows.map((r: any) => r.propertyCode)).toEqual([`${P}1020`]);
    const onlyLow = await repo.listArmCatalog({ code: P, priceTo: 500_000_000 }, 100);
    expect(onlyLow.rows.map((r: any) => r.propertyCode)).toEqual([`${P}5925`]);
  });

  test("۵-۴) آدرس/منطقه: تطبیق روی متن آدرس یا نام منطقه", async () => {
    const byArea = await repo.listArmCatalog({ code: P, address: "خاوران" }, 100);
    expect(byArea.rows.length).toBe(1);
    const byStreet = await repo.listArmCatalog({ code: P, address: "نظامی" }, 100);
    expect(byStreet.rows.length).toBe(1);
    const byKooi = await repo.listArmCatalog({ code: P, address: "کوی صفایی" }, 100);
    expect(byKooi.rows.length).toBe(1);
  });

  test("۵-۵) دسته‌بندی: تک و ترکیبی", async () => {
    const sale = await repo.listArmCatalog({ code: P, tradeTypes: ["فروش"] }, 100);
    expect(sale.rows.map((r: any) => r.propertyCode)).toEqual([`${P}4515`]);
    const combo = await repo.listArmCatalog({ code: P, tradeTypes: ["فروش", "رهن و اجاره"] }, 100);
    expect(combo.rows.length).toBe(2);
  });

  test("۵-۶) وضعیت ده‌حالته در فیلتر: pendingAdmin فقط ردیف‌های همان حالت", async () => {
    const { listingStateRawValues } = await import("@/lib/listing-status");
    const raws = listingStateRawValues(["pendingAdmin"]);
    const out = await repo.listArmCatalog({ code: P, statuses: raws }, 100);
    expect(out.rows.map((r: any) => r.propertyCode)).toEqual([`${P}1020`]);
  });

  test("۵-۷) بازهٔ آخرین فعالیت: از/تا — شامل مرز روز", async () => {
    const fromOnly = await repo.listArmCatalog({ code: P, activityFrom: "2026-09-25" }, 100);
    expect(fromOnly.rows.map((r: any) => r.propertyCode)).toEqual([`${P}4515`]);
    const toOnly = await repo.listArmCatalog({ code: P, activityTo: "2026-09-23" }, 100);
    expect(toOnly.rows.map((r: any) => r.propertyCode)).toEqual([`${P}1020`]);
  });

  test("۵-۸) ترکیب چند ستون: کارشناس + دسته‌بندی + قیمت → اشتراک", async () => {
    const out = await repo.listArmCatalog(
      { code: P, realtorName: "یاسین", tradeTypes: ["فروش"], priceFrom: 1_000_000_000 },
      100
    );
    expect(out.rows.map((r: any) => r.propertyCode)).toEqual([`${P}4515`]);
  });

  test("۵-۹) روت زنده: فیلتر قیمت + وضعیت با ارقام فارسی ورودی همان لاتین", async () => {
    const faPrice = await callRoute(`/api/crm/arm-catalog/listings?code=${P}&priceFrom=۴۰۰۰۰۰۰۰۰&priceTo=۵۰۰۰۰۰۰۰۰۰`);
    const latinPrice = await callRoute(`/api/crm/arm-catalog/listings?code=${P}&priceFrom=400000000&priceTo=5000000000`);
    expect(faPrice.status).toBe(200);
    expect(faPrice.body.rows.length).toBe(latinPrice.body.rows.length);
    expect(faPrice.body.rows.length).toBe(2); // f1 و f2
  });

  test("۵-۱۰) فیلتر شعبه: نقشهٔ مالک → ردیف‌های همان شعبه + unset", async () => {
    // کاشت نقشهٔ مالک برای کارشناس تست
    const { writeOwnerBranchMap, readOwnerBranchMap } = await import("@/lib/branch-store");
    await writeOwnerBranchMap({ "سید یاسین کاظمی": "ارتش" });
    const r = await callRoute(`/api/crm/arm-catalog/listings?code=${P}4515`);
    expect(r.body.rows[0].branch).toBe("ارتش");
    // فیلتر شعبهٔ ارتش فقط همان ردیف
    const onlyArtesh = await callRoute(`/api/crm/arm-catalog/listings?code=${P}&branch=ارتش`);
    expect(onlyArtesh.body.rows.length).toBe(1);
    expect(onlyArtesh.body.rows[0].propertyCode).toBe(`${P}4515`);
    // فیلتر «تعیین نشده» — ردیف‌های بدون شعبه
    const unset = await callRoute(`/api/crm/arm-catalog/listings?code=${P}&branch=unset`);
    expect(unset.body.rows.every((row: any) => row.branch === "تعیین نشده")).toBe(true);
    // پاک‌سازی نقشهٔ تست
    const { removeOwnerBranchAssignments } = await import("@/lib/branch-store");
    await removeOwnerBranchAssignments(["سید یاسین کاظمی"]);
    expect((await readOwnerBranchMap())["سید یاسین کاظمی"]).toBeUndefined();
  });
});

/* ==========================================================================
 * §۶ — بینش توزیع وضعیت (بند ۳)
 * ========================================================================== */

describe("گام ۱/M1 §۶ — بینش‌ها", () => {
  test("۶-۱) روت M1: statusCounts ده‌حالته کامل + other + total برمی‌گردد", async () => {
    const r = await callRoute("/api/crm/arm-catalog/listings?limit=3");
    expect(r.status).toBe(200);
    const sc = r.body.statusCounts;
    expect(sc).toBeDefined();
    for (const k of [
      "traded", "published", "private", "expired", "rejectedByAdmin",
      "pendingAdmin", "pendingConsultant", "pendingReview", "recoverable", "unrecoverable", "other",
    ]) {
      expect(typeof sc[k]).toBe("number");
    }
    expect(sc.total).toBeGreaterThan(0);
  });

  test("۶-۲) بینش ایجنت M1 با دادهٔ کاشته‌شده: دامنه‌های هسته حاضر و معتبر (فارسی)", async () => {
    const { getAgent } = await import("@/core/agent");
    const { getPropertyRecordRepository } = await import("@/core/repositories");
    const repo = getPropertyRecordRepository();
    await repo.upsertBulk(
      [
        {
          id: `${P}i1`, propertyCode: `${P}77001`, title: "فروش واحد",
          ownerName: "کارشناس بینش تست", rawOwnerName: "مالک بینش", ownerMobile: "09140007777",
          address: "تبریز، خاوران", areaName: "خاوران",
          status: "منتشر شده",
          extractedAt: new Date("2026-09-28T10:00:00Z"),
          createdAt: new Date("2026-09-28T10:00:00Z"),
        },
      ],
      { sourceRunId: `${P}-iseed` }
    );
    const agent = getAgent("arm-listings")!;
    const result = await agent.renderInsights();
    expect(result.insights.length).toBeGreaterThan(0);
    for (const ins of result.insights) {
      expect(ins.title.length).toBeGreaterThan(3);
      expect(ins.body.length).toBeGreaterThan(20);
      expect(["info", "positive", "warning", "critical"]).toContain(ins.severity);
      expect(typeof ins.finalWeight).toBe("number");
    }
    const { db } = await import("@/lib/db");
    await db.propertyRecord.deleteMany({ where: { id: `${P}i1` } }).catch(() => undefined);
  });

  test("۶-۳) کارت توزیع وضعیت در صفحه: ده حالت کلیک‌پذیر → فیلتر", async () => {
    const s = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
    expect(s).toContain('id="arm-listing-states-insight"');
    expect(s).toMatch(/onClick=\{\(\) => toggleState\(s\.key\)\}/);
    expect(s).toContain("توزیع وضعیت آگهی‌ها (نظام ده‌حالته)");
  });
});

/* ==========================================================================
 * §۷ — بروزرسانی (بند ۴: زنجیرهٔ عین سامانه + checkpoint + تاریخ دقیق)
 * ========================================================================== */

describe("گام ۱/M1 §۷ — بروزرسانی", () => {
  test("۷-۱) lastUpdate در روت: تاریخ/ساعت دقیق آخرین بروزرسانی + نقطهٔ ادامه (بند ۴.۲)", async () => {
    // شاهد checkpoint نمونه (چرخهٔ کامل) — عین رفتار دیتابیس اصلی
    const { getIntegrationRepository } = await import("@/core/repositories");
    await getIntegrationRepository().upsertSyncCheckpoint({
      id: "listings", cycleId: "test-p6530-cycle", pageSize: 500,
      lastCompletedPage: 23, totalPages: 23, totalAtSource: 11456,
      phase: "complete", completedAt: new Date("2026-09-29T10:00:00Z"),
    });
    const r = await callRoute("/api/crm/arm-catalog/listings?limit=1");
    expect(r.status).toBe(200);
    const lu = r.body.lastUpdate;
    // checkpoint واقعی listings موجود است (شاهد زندهٔ چرخهٔ کامل)
    expect(lu).not.toBeNull();
    expect(typeof lu.lastCompletedPage).toBe("number");
    expect(typeof lu.totalPages).toBe("number");
    expect(typeof lu.updatedAt).toBe("string");
  });

  test("۷-۲) ادامه از نقطهٔ قطع: resolveCycleStart — سه قانون", async () => {
    const { resolveCycleStart } = await import("@/lib/melk-api/arm-catalog");
    // ۱) چرخهٔ ناتمام با همان pageSize → ادامه از lastCompletedPage+1
    const resumed = resolveCycleStart(
      { id: "listings", cycleId: "c1", pageSize: 500, lastCompletedPage: 3, totalPages: 23, totalAtSource: 11456, phase: "in-progress", updatedAt: new Date(), completedAt: null },
      500,
      1000
    );
    expect(resumed.resumed).toBe(true);
    expect(resumed.startPage).toBe(4);
    expect(resumed.cycleId).toBe("c1");
    // ۲) بدون checkpoint و بدون پیشرفت → چرخهٔ تازه از ۱
    const fresh = resolveCycleStart(null, 500, 0);
    expect(fresh.resumed).toBe(false);
    expect(fresh.startPage).toBe(1);
    // ۳) بوت‌استرپ: پیشرفت تاریخی بدون checkpoint → ادامه از بعد از آخرین صفحهٔ کامل
    const boot = resolveCycleStart(null, 500, 11000);
    expect(boot.resumed).toBe(true);
    expect(boot.startPage).toBe(23);
  });

  test("۷-۳) روت sync موجود: قرارداد entity=listings + mode (فهرست + غنی‌سازی)", async () => {
    const s = readFileSync(`${SRC}/app/api/crm/arm-catalog/sync/route.ts`, "utf8");
    expect(s).toContain('"listings"');
    expect(s).toContain('"enrich"');
    expect(s).toContain('"both"');
  });

  test("۷-۴) بخش بروزرسانی در صفحه M1: تاریخ دقیق + پوشش فهرست + ادامه از نقطهٔ قطع", async () => {
    const s = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
    expect(s).toContain('id="arm-listing-last-update"');
    expect(s).toContain("آخرین بروزرسانی فهرست");
    expect(s).toContain("در ادامه از همین نقطه");
    expect(s).toContain("بروزرسانی آگهی‌ها از سامانه‌های ملک تبریز");
    // زنجیرهٔ دو سامانه در توضیح بخش (بند ۴.۱)
    expect(s).toMatch(/ARM و PM|ARM و\s*PM/);
  });

  test("۷-۵) غنی‌سازی برشی خودکار: تا سقف برش در هر باز شدن + توقف با اتمام صف", async () => {
    const s = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
    expect(s).toContain("MAX_AUTO_SLICES");
    expect(s).toMatch(/enrichment\.pending > 0/);
    expect(s).toMatch(/\(e\.remaining \?\? 0\) === 0/);
  });
});

/* ==========================================================================
 * §۸ — رنگ بخش M1 (گام صفر — سبز یشمی)
 * ========================================================================== */

describe("گام ۱/M1 §۸ — رنگ بخش (سبز یشمی #10B981)", () => {
  test("۸-۱) کاشی M1: accent = m1 و صفحه از کلاس‌های sec-m1 استفاده می‌کند", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    await import("@/core/tiles/bootstrap");
    const tile = tileRegistry.get("arm-listings")!;
    expect(tile.accent).toBe("m1");
    const s = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
    expect(s).toContain("sec-m1-500");
    expect(s).toContain("sec-m1-700");
    expect(s).toContain("sec-m1-50");
  });
});
