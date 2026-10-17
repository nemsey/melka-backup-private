/**
 * PN-011 ثانیاً/ثالثاً — گاردهای رجیستری رنگ و فیلترهای چیپی
 * ---------------------------------------------------------------------------
 * قانون مالک (PN-009 یادداشت معماری، بازتأکید در PN-011):
 *   «در فهرست‌ها هیچ ستونی دارای موارد تکراری تک رنگ نباشد»
 *
 * این تست با «مقادیر واقعی DB» (کشف زندهٔ ۱۴۰۵/۰۷/۱۵ — scripts/pn011/
 * explore-column-values.ts) گارد می‌کند که هر ستونِ رنگ‌دار فهرست‌های چهارگانه
 * مقادیرش رنگ یکتا دارند؛ + نرمال‌سازی فاصله + ظاهر چیپی شعبه (ثالثاً).
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hasDistinctColors, valueSoftClass, valueHue } from "../src/lib/value-colors";

const ROOT = path.resolve(import.meta.dir, "..");

/** ۲۳ مقدار واقعی ستون «نوع ملک» M1+M2 (کشف زندهٔ DB — با نرمال‌سازی فاصله) */
const REAL_PROPERTY_TYPES = [
  "آپارتمان", "خانه،حیاط،ویلایی", "مغازه", "زمین یا ملک کلنگی", "دفترکار",
  "ساختمان", "خانه،حیاط", "زیرزمین", "ویلا", "زمین", "زمین تجاری",
  "کارخانه", "زمین خدماتی تجاری", "کارگاه", "زمین خدماتی", "سوله",
  "باغ", "پاساژ", "هتل", "انباری", "گلخانه", "پرورش ماهی", "جایگاه سوخت",
];

/** انواع ساختمان M2 (سه مقدار واقعی DB + مقادیر برشسمی فرم ARM) */
const REAL_BUILDING_TYPES = ["مسکونی", "تجاری-خدماتی", "مسکونی با تجاری", "اداری", "مسکونی-اداری", "باغ و ویلا", "صنعتی", "مزروعی-کشاورزی", "دامداری-شیلات"];

/** ۱۸ سمت پرسنلی واقعی M4 (کشف زندهٔ DB) */
const REAL_POSITIONS = [
  "کارشناس و مشاور فروش", "مشاور فروش", "مشاور ارشد فروش", "کارشناس فروش",
  "مدیر فایل و crm", "کارشناس برنامه نویس", "مدیر قرارداد", "مسئول خدمات",
  "کارشناس نظارت بر سیستم", "مدیر شعبه", "کارشناس شبکه های مجـازی", "کارشناس تولید محتوا",
  "مسئول پشتیبانی", "مسئول هماهنگی", "مسئول امور قراردادها", "مدیر مالی",
  "مدیر فناوری", "مدیر بازرگانی",
];

const TABRIZ_BRANCHES = ["ارتش", "باغلارباغی", "ملکی تبریزی", "هتل مرمر"];
const M1_TRADES = ["فروش", "پیش فروش", "رهن و اجاره", "مشارکت در ساخت"];
const M2_TRADES = ["خرید", "پیش خرید", "رهن و اجاره", "مشارکت در ساخت"];
const M3_KINDS = ["مبایعه‌نامه", "اجاره", "پیش‌فروش", "تمدید اجاره", "ثبت‌نشده"];

describe("PN-011 ثانیاً — قانون عدم تکرار تک‌رنگ در ستون‌های فهرست", () => {
  test("۱) ستون نوع ملک M1/M2: ۲۳ مقدار واقعی DB همه رنگ یکتا دارند", () => {
    expect(REAL_PROPERTY_TYPES.length).toBe(23);
    expect(hasDistinctColors(REAL_PROPERTY_TYPES)).toBe(true);
  });

  test("۲) ستون نوع ساختمان M2: مقادیر واقعی + برشسمی رنگ یکتا", () => {
    expect(hasDistinctColors(REAL_BUILDING_TYPES)).toBe(true);
  });

  test("۳) ستون سمت پرسنلی M4: ۱۸ مقدار واقعی DB رنگ یکتا", () => {
    expect(REAL_POSITIONS.length).toBe(18);
    expect(hasDistinctColors(REAL_POSITIONS)).toBe(true);
  });

  test("۴) ستون شعبه (هر چهار فهرست): چهار شعبه + تعیین‌نشده رنگ یکتا", () => {
    expect(hasDistinctColors([...TABRIZ_BRANCHES, "تعیین نشده"])).toBe(true);
  });

  test("۵) فیلتر دسته‌بندی M1: چهار دسته رنگ یکتا", () => {
    expect(hasDistinctColors(M1_TRADES)).toBe(true);
  });

  test("۶) فیلتر دسته‌بندی M2: چهار دسته رنگ یکتا", () => {
    expect(hasDistinctColors(M2_TRADES)).toBe(true);
  });

  test("۷) فیلتر نوع قرارداد M3: پنج نوع رنگ یکتا", () => {
    expect(hasDistinctColors(M3_KINDS)).toBe(true);
  });

  test("۸) نرمال‌سازی فاصله: «زمین » و «زمین» یک رنگ‌اند (دادهٔ خام DB)", () => {
    expect(valueSoftClass("زمین ")).toBe(valueSoftClass("زمین"));
    expect(valueSoftClass("ساختمان ")).toBe(valueSoftClass("ساختمان"));
  });

  test("۹) پرمتداول‌های نوع ملک در خاندان‌های چشمی متفاوت‌اند (آپارتمان≠مغازه≠زمین)", () => {
    const hues = new Set(["آپارتمان", "مغازه", "زمین یا ملک کلنگی", "دفترکار", "خانه،حیاط،ویلایی"].map(valueHue));
    expect(hues.size).toBe(5);
  });

  test("۱۰) منبع رجیستری: پالت ۲۴خانه‌ای (۱۲ خاندان × دو تُن) مستند است", () => {
    const src = readFileSync(path.join(ROOT, "src/lib/value-colors.ts"), "utf8");
    expect(src).toContain("۲۳ — خاکستری تُند");
    expect(src).toContain("PN-011 ثانیاً");
  });
});

describe("PN-011 ثانیاً — صفحات فهرست از رجیستری رنگ می‌خوانند (اسکن منبع)", () => {
  const TILES = "src/core/tiles/tiles";

  test("۱۱) M1 ستون نوع ملک از valueSoftClass (نه رنگ هاردکد ماژول)", () => {
    const page = readFileSync(path.join(ROOT, TILES, "arm-listing/ArmListingsPage.tsx"), "utf8");
    expect(page).toContain("valueSoftClass(r.propertyTypeName)");
    expect(page).not.toContain("bg-sec-m1-50 text-sec-m1-700\">\n                              <Building2");
  });

  test("۱۲) M2 ستون نوع ملک و نوع ساختمان از valueSoftClass", () => {
    const page = readFileSync(path.join(ROOT, TILES, "arm-request/ArmRequestsPage.tsx"), "utf8");
    expect(page).toContain("valueSoftClass(r.propertyTypeName)");
    expect(page).toContain("valueSoftClass(r.buildingTypeName)");
  });

  test("۱۳) M4 ستون سمت پرسنلی از valueSoftClass", () => {
    const page = readFileSync(path.join(ROOT, TILES, "experts/ExpertsPage.tsx"), "utf8");
    expect(page).toContain("valueSoftClass(r.roleTitle)");
  });

  test("۱۴) جدول پوشش اطلاعات: توضیحات زیر عنوان حذف شد (رابعاً)", () => {
    const cov = readFileSync(path.join(ROOT, "src/components/app/shared/coverage-table.tsx"), "utf8");
    expect(cov).not.toContain("{c.fillPath}</span>");
    // مسیر همچنان به‌صورت اشاره‌گر (tooltip) سطر در دسترس است
    expect(cov).toContain('title={c.fillPath}');
  });
});

describe("PN-011 ثالثاً — ظاهر چیپی فیلترهای چندگانه (همانند دسته‌بندی)", () => {
  const TILES = "src/core/tiles/tiles";

  test("۱۵) M1 فیلتر شعبه چیپ چندانتخابی است (نه Select)", () => {
    const page = readFileSync(path.join(ROOT, TILES, "arm-listing/ArmListingsPage.tsx"), "utf8");
    expect(page).toContain('id="arm-listing-branches-filter"');
    expect(page).toContain("toggleBranch");
    expect(page).toContain('params.append("branch", b)');
    expect(page).not.toContain('Select value={filters.branch');
  });

  test("۱۶) M2 فیلتر شعبه چیپ چندانتخابی است", () => {
    const page = readFileSync(path.join(ROOT, TILES, "arm-request/ArmRequestsPage.tsx"), "utf8");
    expect(page).toContain('id="arm-request-branches-filter"');
    expect(page).toContain('params.append("branch", b)');
  });

  test("۱۷) M3 فایل قرارداد چیپ چندانتخابی است", () => {
    const page = readFileSync(path.join(ROOT, TILES, "transactions-contracts/TransactionsTab.tsx"), "utf8");
    expect(page).toContain("hasContracts");
    expect(page).not.toContain('Select value={filters.hasContract}');
  });

  test("۱۸) M4 شعبه/سمت/همکاری/وضعیت/مدیر/شهر همه چیپ چندانتخابی‌اند", () => {
    const page = readFileSync(path.join(ROOT, TILES, "experts/ExpertsPage.tsx"), "utf8");
    expect(page).toContain('id="exf-org-chips"');
    expect(page).toContain('params.append("branchTitle", b)');
    expect(page).toContain('params.append("roleTitle", r)');
    expect(page).toContain('params.append("active", a)');
    expect(page).not.toContain('Select value={filters.branchTitle');
    expect(page).not.toContain('Select value={filters.roleTitle');
  });

  test("۱۹) API فهرست آگهی: شعبه چندمقداری را می‌فهمد", () => {
    const route = readFileSync(path.join(ROOT, "src/app/api/crm/arm-catalog/listings/route.ts"), "utf8");
    expect(route).toContain('sp.getAll("branch")');
  });

  test("۲۰) API فهرست درخواست: شعبه چندمقداری را می‌فهمد", () => {
    const route = readFileSync(path.join(ROOT, "src/app/api/crm/arm-catalog/requests/route.ts"), "utf8");
    expect(route).toContain('sp.getAll("branch")');
  });

  test("۲۱) API کارشناسان: شش فیلتر چندمقداری را می‌فهمد", () => {
    const route = readFileSync(path.join(ROOT, "src/app/api/experts/route.ts"), "utf8");
    expect(route).toContain('sp.getAll("branchTitle")');
    expect(route).toContain('sp.getAll("roleTitle")');
    expect(route).toContain('sp.getAll("employmentType")');
    expect(route).toContain('sp.getAll("headManager")');
    expect(route).toContain('sp.getAll("city")');
    expect(route).toContain('sp.getAll("active")');
  });
});

describe("PN-011 خامسا — کاشی تطبیق: توضیحات توسعه‌یافته + هوشمندی + پیوند کاشی‌ها", () => {
  const TILES = "src/core/tiles/tiles";

  test("۲۲) موتور تطبیق: کارشناس/شعبه در اطلاعات هر گزینه (دوطرفه)", () => {
    const engine = readFileSync(path.join(ROOT, "src/core/matching/matching-engine.ts"), "utf8");
    expect(engine).toContain("expertName: string | null");
    expect(engine).toContain("expertBranch: string | null");
    expect(engine).toContain("actorName && ctx ? ctx.branchOf(r.actorName)");
    expect(engine).toContain("row.ownerName && ctx ? ctx.branchOf(row.ownerName)");
  });

  test("۲۳) موتور تطبیق: جستجو با کد درخواست M2 (requestCode) پذیرفته می‌شود", () => {
    const engine = readFileSync(path.join(ROOT, "src/core/matching/matching-engine.ts"), "utf8");
    expect(engine).toContain("{ requestCode: requestIdOrCode }");
  });

  test("۲۴) موتور تطبیق: متراژ از فرم پویای ARM (inputsJson) خوانده می‌شود", () => {
    const engine = readFileSync(path.join(ROOT, "src/core/matching/matching-engine.ts"), "utf8");
    expect(engine).toContain('inputs["متراژ از"]');
  });

  test("۲۵) ماژول یادگیری وزن‌ها موجود و محافظه‌کارانه است", () => {
    const learn = readFileSync(path.join(ROOT, "src/core/matching/weights-learning.ts"), "utf8");
    expect(learn).toContain("MIN_FEEDBACK = 3");
    expect(learn).toContain("CLAMP = { min: 0.5, max: 1.5 }");
  });

  test("۲۶) روت تطبیق: وزن آموخته + منشأ وزن را برمی‌گرداند", () => {
    const route = readFileSync(path.join(ROOT, "src/app/api/matching/route.ts"), "utf8");
    expect(route).toContain("computeLearnedMatchWeights");
    expect(route).toContain('weightsSource = learned ? "learned" : "base"');
  });

  test("۲۷) روت تطبیق: همان زنجیرهٔ تفکیک شعبهٔ M1/M2 (کد مشترک)", () => {
    const route = readFileSync(path.join(ROOT, "src/app/api/matching/route.ts"), "utf8");
    expect(route).toContain("readPmBranchMap");
    expect(route).toContain("resolveExpertBranch");
  });

  test("۲۸) صفحهٔ M5: کارشناس + شعبه + دکمهٔ مشاهده در کاشی دیگر", () => {
    // PN-014 — عملکرد به کارت/گفت‌وگو مهاجرت کرد (همان تضمین، مسیر تازه):
    // صفحه + MatchCard + MatchDetailsDialog با هم «کاشی تطبیق» را می‌سازند.
    const page = readFileSync(path.join(ROOT, TILES, "smart-matching/SmartMatchingPage.tsx"), "utf8");
    const card = readFileSync(path.join(ROOT, TILES, "smart-matching/MatchCard.tsx"), "utf8");
    const dialog = readFileSync(path.join(ROOT, TILES, "smart-matching/MatchDetailsDialog.tsx"), "utf8");
    const tileWhole = page + card + dialog;
    expect(tileWhole).toContain("info?.expertName");
    expect(tileWhole).toContain("info.expertBranch");
    expect(tileWhole).toContain("مشاهده در کاشی");
    expect(page).toContain('openTile(tileId, null, { code })'); // PN-038/فاز ۲: ظرف حذف شد — بازگشت به هوم
  });

  test("۲۹) صفحهٔ M5: تنظیم showReasons فعال شد (تنظیم مرده زنده شد)", () => {
    const page = readFileSync(path.join(ROOT, TILES, "smart-matching/SmartMatchingPage.tsx"), "utf8");
    expect(page).toContain("settings.showReasons");
  });

  test("۳۰) پیوند عمیق: M1/M2 بار کاشی (کد) را مصرف می‌کنند", () => {
    const m1 = readFileSync(path.join(ROOT, TILES, "arm-listing/ArmListingsPage.tsx"), "utf8");
    const m2 = readFileSync(path.join(ROOT, TILES, "arm-request/ArmRequestsPage.tsx"), "utf8");
    expect(m1).toContain('consumeTileParams("arm-listings")');
    expect(m2).toContain('consumeTileParams("arm-requests")');
  });

  test("۳۱) store: مکانیزم tileParams (یک‌بارمصرف)", () => {
    const store = readFileSync(path.join(ROOT, "src/lib/client/store.ts"), "utf8");
    expect(store).toContain("tileParamsFor");
    expect(store).toContain("consumeTileParams");
  });

  test("۳۲) روت بازخورد: زمینهٔ عوامل کلاینت merge می‌شود (سوخت یادگیری)", () => {
    const route = readFileSync(path.join(ROOT, "src/app/api/agent/[tileId]/feedback/route.ts"), "utf8");
    expect(route).toContain("...(body.context ?? {})");
  });

  test("۳۳) ایجنت کاشی تطبیق در رجیستری ثبت شد (رفع شکاف نهفته — پیش‌تر 404)", () => {
    const idx = readFileSync(path.join(ROOT, "src/core/agent/index.ts"), "utf8");
    expect(idx).toContain("smartMatchingAgent.tileId, smartMatchingAgent");
    const agent = readFileSync(path.join(ROOT, "src/core/agent/smart-matching-agent.ts"), "utf8");
    expect(agent).toContain('tileId = "smart-matching"');
  });
});
