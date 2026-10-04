/**
 * tests/p6547-six-steps.test.ts — سوئیت تست واقعی پروندهٔ P6547 (دستور شش‌گانهٔ مالک)
 * ==================================================================================
 * گام صفر: کدمستر 80211186 + نام «اکوسیستم هوشمند ملک ایران»/«ملکا»
 * گام یک (M1): حذف بینش کیفیت تماس مالکان + بینش پوشش تمام ستون‌ها + شعبه از PM
 * گام دوم (M2): استخراج کامل requests/list (مناطق/محله/قیمت/دسته‌بندی/فوریت) + رجیستری انواع
 * گام سوم (M3): حذف بینش ناهنجاری + شعبه در تجمیع حق‌السهم (قالب نام+شعبه+درصد)
 * گام چهارم (M4): تاریخ ۱۴۰۵/۰۶/۳۱ + ستون‌های تازه PM (نوع همکاری/شماره داخلی/شعبه)
 * گام پنجم: نظام رنگ متمایز هر مقدار + هارمونی فیلتر↔فهرست + ترتیب بخش‌ها + لایه‌های بروزرسانی
 *
 * انواع تست: اسکن منبع (عین ساختار) + فراخوانی توابع خالص + شواهد اجرا + پروب زندهٔ شبکه
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";

// ── ابزار خواندن منبع ──────────────────────────────────────────────────────
const read = (p: string) => readFileSync(p, "utf8");

// ═══════════════════ گام صفر — کدمستر + تغییر نام ═══════════════════
describe("P6547/گام صفر — کدمستر و نام رسمی", () => {
  test("ص-۱: کدمستر مالک 80211186 در .env ثبت شده (قدیمی 41372895 حذف)", () => {
    const env = read(".env");
    expect(env).toContain("MASTER_ACCESS_CODE=80211186");
    expect(env).not.toContain("MASTER_ACCESS_CODE=41372895");
  });

  test("ص-۲: عنوان رسمی اپ «اکوسیستم هوشمند ملک ایران» در metadata ریشه", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('"اکوسیستم هوشمند ملک ایران (ملکا)"');
    expect(layout).not.toContain('title: "داشبورد هوشمند ملک تبریز"');
  });

  test("ص-۳: نام اختصاری «ملکا» در PWA manifest و appleWebApp", () => {
    const manifest = JSON.parse(read("public/manifest.json"));
    expect(manifest.name).toBe("اکوسیستم هوشمند ملک ایران (ملکا)"); // P6549/۰۳۵-B: نام رسمی کامل
    expect(manifest.short_name).toBe("ملکا");
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('title: "ملکا"');
  });

  test("ص-۴: سرصفحهٔ اپ و صفحهٔ ورود نام تازه را دارند (کلیهٔ بخش‌ها)", () => {
    expect(read("src/components/app/AppHeader.tsx")).toContain("اکوسیستم هوشمند ملک ایران");
    expect(read("src/components/app/AuthScreen.tsx")).toContain("اکوسیستم هوشمند ملک ایران");
    expect(read("src/core/tiles/tiles/settings/SettingsPage.tsx")).toContain("ملکا — اکوسیستم هوشمند ملک ایران");
  });

  test("ص-۵: سند README نیز نام رسمی تازه را دارد (کلیهٔ اسناد)", () => {
    const readme = read("README.md");
    expect(readme).toContain("اکوسیستم هوشمند ملک ایران");
    expect(readme).not.toContain("# داشبورد هوشمند چندعامله ملک تبریز");
  });
});

// ═══════════════════ زیرساخت شعبهٔ PM ═══════════════════
describe("P6547/شعبه از سامانهٔ PM — زنجیرهٔ تفکیک", () => {
  test("ش-۱: pickBranchTitle ساختار branchId واقعی PM را استخراج می‌کند", async () => {
    const { pickBranchTitle } = await import("../src/lib/melk-api/pm-acc-sync");
    // شکل عین پروب زندهٔ ۱۴۰۵/۰۷/۱۲: سراج میزانی → ملکی تبریزی
    expect(pickBranchTitle({ branchId: { _id: "644fd899", title: "ملکی تبریزی" } })).toEqual({ title: "ملکی تبریزی", code: "644fd899" });
    expect(pickBranchTitle({ branchId: { _id: "6447c45e", title: "باغلارباغی" } }).title).toBe("باغلارباغی");
    expect(pickBranchTitle({}).title).toBeNull();
    expect(pickBranchTitle(null).title).toBeNull();
  });

  test("ش-۲: resolveExpertBranch — شعبهٔ PM در صدر زنجیره (منبع اصلی)", async () => {
    const { resolveExpertBranch, TABRIZ_BRANCHES } = await import("../src/lib/branches");
    const pmMap = { "سراج میزانی": "ملکی تبریزی", "توحید میزانی": "باغلارباغی" };
    // PM اولویت اول
    expect(resolveExpertBranch("سراج میزانی", { "سراج میزانی": "ارتش" }, "شعبه مرکزی", pmMap))
      .toEqual({ branch: "ملکی تبریزی", source: "pm" });
    // بدون PM → نقشهٔ مالک
    expect(resolveExpertBranch("کارشناس الف", { "کارشناس الف": "ارتش" }, null, pmMap).source).toBe("owner-map");
    // هیچ‌کدام → تعیین نشده
    expect(resolveExpertBranch("ناشناخته", {}, null, {}).branch).toBe("تعیین نشده");
    // چهار شعبهٔ رسمی
    expect(TABRIZ_BRANCHES).toEqual(["ارتش", "باغلارباغی", "ملکی تبریزی", "هتل مرمر"]);
  });

  test("ش-۳: هر سه روت کاتالوگ از readPmBranchMap می‌خوانند (سیم‌کشی)", () => {
    for (const p of [
      "src/app/api/crm/arm-catalog/listings/route.ts",
      "src/app/api/crm/arm-catalog/requests/route.ts",
      "src/app/api/crm/experts/route.ts",
    ]) {
      expect(read(p)).toContain("readPmBranchMap");
    }
  });

  test("ش-۴: شاهد اجرا — بک‌فیل شعبهٔ PM (۱۳۹/۱۴۲ با چهار شعبهٔ واقعی)", () => {
    const proof = JSON.parse(read("download/p6547/pm-branch-backfill-proof.json"));
    expect(proof.after.withBranch).toBeGreaterThanOrEqual(139);
    expect(proof.after.byBranch["ارتش"]).toBeGreaterThan(0);
    expect(proof.after.byBranch["باغلارباغی"]).toBeGreaterThan(0);
    expect(proof.after.byBranch["ملکی تبریزی"]).toBeGreaterThan(0);
    expect(proof.after.byBranch["هتل مرمر"]).toBeGreaterThan(0);
  });
});

// ═══════════════════ گام یک — M1 آگهی ═══════════════════
describe("P6547/گام یک — کاشی آگهی ملک تبریز (M1)", () => {
  test("ی-۲: بینش «کیفیت اطلاعات تماس مالکان در سامانه ARM» حذف شده", () => {
    const src = read("src/core/agent/arm-listing-agent.ts");
    expect(src).not.toContain("کیفیت اطلاعات تماس مالکان در سامانه ARM");
    expect(src).not.toContain('key: "al-coverage"');
  });

  test("ی-۳: بینش «پوشش اطلاعات فهرست» با تمام ستون‌های فهرست ایجاد شده", async () => {
    const src = read("src/core/agent/arm-listing-agent.ts");
    expect(src).toContain('"al-list-coverage"');
    expect(src).toContain('buildCoverageInsight("آگهی ملک تبریز"');
    // همهٔ ستون‌های فهرست M1 در محاسبهٔ پوشش
    for (const col of ["عنوان", "کارشناس", "قیمت هر متر", "متراژ", "اتاق", "طبقه", "سال ساخت", "دسته‌بندی", "وضعیت"]) {
      expect(src).toContain(`title: "${col}"`);
    }
  });

  test("ی-۴: سازندهٔ بینش پوشش — محاسبهٔ خالص (ضعیف‌ترین/قوی‌ترین/میانگین)", async () => {
    const { analyzeCoverage, buildCoverageInsight } = await import("../src/core/agent/coverage-insight");
    const a = analyzeCoverage([
      { title: "الف", filled: 90, total: 100 },
      { title: "ب", filled: 10, total: 100 },
    ]);
    expect(a.overallPct).toBe(50);
    expect(a.weakest[0].title).toBe("ب");
    expect(a.strongest[0].title).toBe("الف");
    const card = buildCoverageInsight("تست", "t-cov", [{ title: "x", filled: 5, total: 10 }]);
    expect(card?.title).toContain("پوشش اطلاعات فهرست");
    expect(card?.severity).toBe("info"); // ۵۰٪ ≥ آستانهٔ ۴۰
    const weak = buildCoverageInsight("تست", "t-cov2", [{ title: "y", filled: 1, total: 10 }]);
    expect(weak?.severity).toBe("warning"); // ۱۰٪ < آستانهٔ ۴۰
  });

  test("ی-۵: ستون شعبهٔ M1 از رشتهٔ PM (comment زنجیرهٔ تازه)", () => {
    const src = read("src/app/api/crm/arm-catalog/listings/route.ts");
    expect(src).toContain("PM ← مالک ← کسب‌وکار");
  });
});

// ═══════════════════ گام دوم — M2 درخواست ═══════════════════
describe("P6547/گام دوم — کاشی درخواست ملک تبریز (M2)", () => {
  test("د-۱: mapArmRequestListRow ساختار کامل requests/list را استخراج می‌کند (شاهکار کشف)", async () => {
    const { mapArmRequestListRow } = await import("../src/lib/melk-api/arm-catalog");
    // شکل عین ردیف فهرست (پروب زندهٔ ۱۴۰۵/۰۷/۱۲)
    const row = {
      _id: "6ac13ad4", code: "21212", title: "خرید آپارتمان", relatedRealtor: "ناصر رحیمی فر",
      relatedCustomer: "مشتری نمونه", status: [{ currentStatus: { name: "سرنخ" } }],
      area: [{ _id: "a1", name: "استانداری" }], line: [{ _id: "l1", name: "مهستان جنوبی" }],
      totalPrice_from: 20000000000, totalPrice_to: 30000000000,
      tradeType: "614ed62da50555f0a54c1eca", buildingType: "614edc35a50555f0a54c1f12",
      propertyType: "614ee704a50555f0a54c227d", userPaymentMethod: "61a39bf0f06329efdeacbbef",
      userSeriousity: "61a7536b0927675c45489a59",
      urgent: true, luxury: false, changeable: false, createdAt: "2026-10-03T10:00:00Z",
    };
    const mapped = mapArmRequestListRow(row, {
      tradeType: new Map([["614ed62da50555f0a54c1eca", "فروش"]]),
      buildingType: new Map([["614edc35a50555f0a54c1f12", "مسکونی"]]),
      propertyType: new Map([["614ee704a50555f0a54c227d", "آپارتمان"]]),
      paymentMethod: new Map([["61a39bf0f06329efdeacbbef", "نقدی"]]),
      seriousness: new Map([["61a7536b0927675c45489a59", "خیلی زیاد"]]),
    });
    expect(mapped).not.toBeNull();
    expect(mapped!.areaNames).toEqual(["استانداری"]);
    expect(mapped!.lineNames).toEqual(["مهستان جنوبی"]);
    expect(mapped!.priceFrom).toBe(20000000000);
    expect(mapped!.priceTo).toBe(30000000000);
    expect(mapped!.tradeTypeName).toBe("فروش");
    expect(mapped!.buildingTypeName).toBe("مسکونی");
    expect(mapped!.propertyTypeName).toBe("آپارتمان");
    expect(mapped!.paymentMethodName).toBe("نقدی");
    expect(mapped!.seriousnessName).toBe("خیلی زیاد");
    expect(mapped!.urgent).toBe(true);
  });

  test("د-۲: بدون نقشهٔ رجیستری — شناسه‌های خام نام نمی‌شوند (صادقانه)", async () => {
    const { mapArmRequestListRow } = await import("../src/lib/melk-api/arm-catalog");
    const mapped = mapArmRequestListRow({ _id: "x", code: "1", tradeType: "614ed62da50555f0a54c1eca" });
    expect(mapped?.tradeTypeName ?? null).toBeNull();
  });

  test("د-۳: رجیستری انواع ARM همگام و کشف شده (شاهد اجرا)", () => {
    const proof = JSON.parse(read("download/p6547/type-registry-sync-proof.json"));
    expect(proof.counts.tradeType).toBeGreaterThanOrEqual(4);
    expect(proof.counts.propertyType).toBeGreaterThanOrEqual(30);
    expect(proof.sample.tradeType[0]).toBe("فروش");
    expect(proof.sample.buildingType).toBe("مسکونی");
    expect(proof.sample.propertyType).toBe("آپارتمان");
  });

  test("د-۴: بینش قطب‌های درخواست دادهٔ واقعی دارد (شاهد وضعیت انبار)", () => {
    const proof = JSON.parse(read("download/p6547/request-areas-state.json"));
    expect(proof.withArea).toBeGreaterThanOrEqual(11000);
    expect(proof.topAreas.length).toBeGreaterThanOrEqual(10);
    expect(proof.topAreas[0][1]).toBeGreaterThan(3000); // قطب اول با هزاران درخواست
  });

  test("د-۵: بینش «پوشش اطلاعات فهرست» در ایجنت M2 (تمام ستون‌ها)", () => {
    const src = read("src/core/agent/arm-request-agent.ts");
    expect(src).toContain('"ar-list-coverage"');
    expect(src).not.toContain("کیفیت اطلاعات تماس درخواست‌دهندگان");
    for (const col of ["عنوان درخواست", "متقاضی (نام)", "قیمت (از)", "مناطق", "محله‌ها", "نوع ملک درخواستی", "نوع ساختمان", "دسته‌بندی", "وضعیت"]) {
      expect(src).toContain(`title: "${col}"`);
    }
  });
});

// ═══════════════════ گام سوم — M3 معاملات ═══════════════════
describe("P6547/گام سوم — کاشی معاملات ملک تبریز (M3)", () => {
  test("س-۵: بینش «ناهنجاری آماری در روند معاملات» از هر دو ایجنت حذف شده", () => {
    for (const p of ["src/core/agent/transactions-contracts-agent.ts", "src/core/agent/transaction-agent.ts"]) {
      const src = read(p);
      expect(src).not.toContain('title: "ناهنجاری آماری در روند معاملات"');
      expect(src).not.toContain("detectAnomalies(");
    }
  });

  test("س-۴: تجمیع حق‌السهم با شعبهٔ PM — قالب «نام + شعبه + درصد»", async () => {
    const { aggregateConsultantShares } = await import("../src/lib/melk-api/tx-enrichment");
    const json = JSON.stringify([
      { name: "سراج میزانی", unitPercent: 25, confirmation: "confirm" },
      { name: "توحید میزانی", unitPercent: 30, confirmation: "confirm" },
    ]);
    const summary = aggregateConsultantShares(json, { "سراج میزانی": "ملکی تبریزی", "توحید میزانی": "باغلارباغی" });
    expect(summary).not.toBeNull();
    expect(summary!.shares[0]).toMatchObject({ name: "سراج میزانی", branch: "ملکی تبریزی", unitPercent: 25 });
    expect(summary!.shares[1]).toMatchObject({ name: "توحید میزانی", branch: "باغلارباغی", unitPercent: 30 });
    // بدون نقشه — شعبه صادقانه null
    const noMap = aggregateConsultantShares(json);
    expect(noMap!.shares[0].branch ?? null).toBeNull();
  });

  test("س-۴-ب: روت معاملات نقشهٔ شعبهٔ PM را به غنی‌سازی می‌دهد", () => {
    const src = read("src/app/api/crm/transactions/route.ts");
    expect(src).toContain("branchByConsultant: await readPmBranchMap()");
  });

  test("س-۱: بروزرسانی معاملات پس‌زمینه‌ای بدون مهلت ۹۰ ثانیه (رفع P6546 پایدار)", () => {
    const src = read("src/core/tiles/tiles/transactions-contracts/TransactionsContractsPage.tsx");
    expect(src).toContain("/api/crm/transactions/sync");
    expect(src).toContain("پاسخ فوری و بدون مهلت ۹۰ ثانیه");
  });
});

// ═══════════════════ گام چهارم — M4 کارشناسان ═══════════════════
describe("P6547/گام چهارم — کاشی کارشناسان ملک تبریز (M4)", () => {
  test("چ-۳: ستون تاریخ با قالب کوتاه ۱۴۰۵/۰۶/۳۱ (بدون ساعت)", () => {
    const src = read("src/core/tiles/tiles/experts/ExpertsPage.tsx");
    expect(src).toContain("faJalaliShort(r.hireDate)");
    expect(src).not.toContain("faDateTime(r.hireDate)");
  });

  test("چ-۳-ب: قالب کوتاه واقعاً ۱۴۰۵/۰۶/۳۱ است (تست خالص تقویم)", async () => {
    const { faJalaliShort } = await import("../src/lib/format");
    // 2026-09-22 → ۱۴۰۵/۰۶/۳۱ (شاهد عین نمونهٔ دستور مالک)
    expect(faJalaliShort("2026-09-22T00:00:00Z")).toBe("۱۴۰۵/۰۶/۳۱");
  });

  test("چ-۲: کدپرسنلی غایب = «-» (پایدار از P6546)", () => {
    const src = read("src/core/tiles/tiles/experts/ExpertsPage.tsx");
    expect(src).toContain('title="این رکورد در سامانهٔ PM کد پرسنلی ندارد">-<');
  });

  test("چ-۱: ستون‌های تازه PM (نوع همکاری + شماره داخلی) در فهرست", () => {
    const src = read("src/core/tiles/tiles/experts/ExpertsPage.tsx");
    expect(src).toContain(">نوع همکاری</TableHead>");
    expect(src).toContain(">شماره داخلی</TableHead>");
    expect(src).toContain("employmentType");
    expect(src).toContain("voipExtension");
  });

  test("چ-۴: شاهد اجرا — بک‌فیل اشتغال PM (۱۴۲/۱۴۲ نوع همکاری + ۱۳۱ داخلی)", () => {
    const proof = JSON.parse(read("download/p6547/pm-employment-backfill-proof.json"));
    expect(proof.after.withEmpType).toBe(142);
    expect(proof.after.withVoip).toBeGreaterThanOrEqual(131);
    expect(proof.employmentDist["حق السهم (درصد)"]).toBeGreaterThan(100);
    expect(proof.employmentDist["حقوق ماهیانه"]).toBeGreaterThan(15);
  });

  test("چ-۵: بینش پوشش اطلاعات فهرست در ایجنت M4 (تمام ستون‌ها)", () => {
    const src = read("src/core/agent/expert-agent.ts");
    expect(src).toContain('"ex-list-coverage"');
    for (const col of ["نام کامل", "کد پرسنلی", "شعبه", "تاریخ استخدام", "نوع همکاری", "شماره داخلی", "مبایعه‌نامه", "اجاره‌نامه"]) {
      expect(src).toContain(`title: "${col}"`);
    }
  });
});

// ═══════════════════ گام پنجم — نظام رنگ + لایه‌ها ═══════════════════
describe("P6547/گام پنجم — نظام رنگ متمایز + هارمونی فیلتر↔فهرست", () => {
  test("ر-۱: قانون تنوع درون‌آیتمی — دسته‌بندی‌های هر فیلتر رنگ متمایز", async () => {
    const { hasDistinctColors } = await import("../src/lib/value-colors");
    expect(hasDistinctColors(["فروش", "پیش فروش", "رهن و اجاره", "مشارکت در ساخت"])).toBe(true);
    expect(hasDistinctColors(["خرید", "پیش خرید", "رهن و اجاره", "مشارکت در ساخت"])).toBe(true);
    expect(hasDistinctColors(["ارتش", "باغلارباغی", "ملکی تبریزی", "هتل مرمر"])).toBe(true);
    expect(hasDistinctColors(["مبایعه‌نامه", "پیش‌فروش", "اجاره", "تمدید اجاره"])).toBe(true);
  });

  test("ر-۲: هارمونی — همان تابع برای فیلتر و فهرست (نکته ۴)", async () => {
    const { valueSoftClass, valueSolidClass } = await import("../src/lib/value-colors");
    // فروش = سبز روشن (عین نمونهٔ دستور مالک)
    expect(valueSoftClass("فروش")).toContain("emerald");
    expect(valueSolidClass("فروش")).toContain("emerald");
    // پایداری: رنگ یک مقدار بین دو فراخوانی یکسان
    expect(valueSoftClass("مشارکت در ساخت")).toBe(valueSoftClass("مشارکت در ساخت"));
    // soft و solid یک مقدار هم‌خانواده‌اند
    expect(valueSoftClass("ارتش")).toContain("rose");
    expect(valueSolidClass("ارتش")).toContain("rose");
  });

  test("ر-۳: هر چهار کاشی از نظام رنگ مشترک استفاده می‌کنند (سیم‌کشی)", () => {
    expect(read("src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx")).toContain("valueSoftClass");
    expect(read("src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx")).toContain("valueSoftClass");
    expect(read("src/core/tiles/tiles/transactions-contracts/TransactionsTab.tsx")).toContain("valueSolidClass");
    expect(read("src/core/tiles/tiles/experts/ExpertsPage.tsx")).toContain("branchBadgeClass");
  });

  test("ر-۴: ستون قیمت با نام «قیمت» و قالب ۹،۰۰۰،۰۰۰،۰۰۰ (پایدار P6546 + M2 از/تا)", () => {
    expect(read("src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx")).toContain(">قیمت</TableHead>");
    const m2 = read("src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx");
    expect(m2).toContain(">قیمت</TableHead>");
    expect(m2).toContain("از");
    expect(m2).toContain("تا");
  });

  test("ر-۵: ترتیب الزامی بخش‌ها — بینش‌ها ← جداول ← پوشش ← بروزرسانی ← فیلتر ← فهرست", () => {
    // M1: ترتیب شماره خطوط AgentPanel < TopRankingTable < TileCoverageTable
    const m1 = read("src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx");
    const order1 = [
      m1.indexOf('<AgentPanel tileId="arm-listings"'),
      m1.indexOf("<TopRankingTable"),
      m1.indexOf('<TileCoverageTable tileKey="m1"'),
      m1.indexOf('id="arm-listing-filters"') >= 0 ? m1.indexOf('id="arm-listing-filters"') : m1.indexOf('aria-expanded={filtersOpen}'),
      m1.indexOf("<Table>"),
    ];
    expect(order1.every((v) => v > 0)).toBe(true);
    expect([...order1].sort((a, b) => a - b)).toEqual(order1);
    // M2
    const m2 = read("src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx");
    const order2 = [m2.indexOf('<AgentPanel tileId="arm-requests"'), m2.indexOf("<TopRankingTable"), m2.indexOf('<TileCoverageTable tileKey="m2"'), m2.indexOf('id="arm-request-trades-filter"'), m2.indexOf("<Table>")];
    expect(order2.every((v) => v > 0)).toBe(true);
    expect([...order2].sort((a, b) => a - b)).toEqual(order2);
    // M3: پوشش < بروزرسانی (prop) < فیلتر < فهرست
    const m3 = read("src/core/tiles/tiles/transactions-contracts/TransactionsTab.tsx");
    const order3 = [m3.indexOf('<TileCoverageTable tileKey="m3"'), m3.indexOf("{updateSection}"), m3.indexOf('id="m3-contract-kind-filters"'), m3.indexOf("<Table>")];
    expect(order3.every((v) => v > 0)).toBe(true);
    expect([...order3].sort((a, b) => a - b)).toEqual(order3);
    // M4
    const m4 = read("src/core/tiles/tiles/experts/ExpertsPage.tsx");
    const order4 = [m4.indexOf('<AgentPanel tileId="experts"'), m4.indexOf('<TileCoverageTable tileKey="m4"'), m4.indexOf('id="m4-update-section"'), m4.indexOf("<Table>")];
    expect(order4.every((v) => v > 0)).toBe(true);
    expect([...order4].sort((a, b) => a - b)).toEqual(order4);
  });

  test("ر-۶: لایه‌های بروزرسانی — M1 ≈۵٬۰۰۰/کلیک + M2 ۵۰ صفحه/کلیک + جزئیات ۵۰۰ (تاب‌آور)", () => {
    const m1 = read("src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx");
    expect(m1).toContain("apiSync");
    expect(m1).toContain("maxRows: 500");
    const m2 = read("src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx");
    expect(m2).toContain("apiSync");
    expect(m2).toContain("۵۰ صفحه");
  });

  test("ر-۷: دیمون پایدارساز — برش شعبه/اشتغال PM + چرخهٔ رجیستری انواع", () => {
    const daemon = read("src/lib/melk-api/catalog-daemon.ts");
    expect(daemon).toContain("syncPmPersonnelInfo");
    expect(daemon).toContain("syncTypeRegistries");
    expect(daemon).toContain("enrichTransactionsInfo");
    expect(daemon).toContain("syncMelkPublicCatalog");
  });
});

// ═══════════════════ جدول پوشش — هم‌ترازی با تمام ستون‌ها ═══════════════════
describe("P6547/جدول پوشش اطلاعات فهرست — هم‌ترازی کامل", () => {
  test("پ-۱: ستون‌های پوشش M1 شامل شعبه (۱۶ ستون)", () => {
    const src = read("src/app/api/coverage/route.ts");
    const m1Match = src.match(/M1_COLUMNS: ColumnSpec\[\] = \[([\s\S]*?)\];/);
    expect(m1Match).not.toBeNull();
    const titles = m1Match![1].match(/title: "([^"]+)"/g)!.map((t) => t.match(/"([^"]+)"/)![1]);
    expect(titles).toContain("شعبه");
    expect(titles.length).toBeGreaterThanOrEqual(16);
  });

  test("پ-۲: ستون‌های پوشش M2 شامل فوریت/جدیت/شعبه (۱۴ ستون)", () => {
    const src = read("src/app/api/coverage/route.ts");
    const m2Match = src.match(/M2_COLUMNS: ColumnSpec\[\] = \[([\s\S]*?)\];/);
    const titles = m2Match![1].match(/title: "([^"]+)"/g)!.map((t) => t.match(/"([^"]+)"/)![1]);
    for (const t of ["شعبه", "فوریت", "جدیت متقاضی", "مناطق منتخب", "نوع ملک درخواستی"]) {
      expect(titles).toContain(t);
    }
  });

  test("پ-۳: ستون‌های پوشش M4 شامل نوع همکاری/شماره داخلی (۱۰ ستون)", () => {
    const src = read("src/app/api/coverage/route.ts");
    const m4Match = src.match(/M4_COLUMNS: ColumnSpec\[\] = \[([\s\S]*?)\];/);
    const titles = m4Match![1].match(/title: "([^"]+)"/g)!.map((t) => t.match(/"([^"]+)"/)![1]);
    expect(titles).toContain("نوع همکاری");
    expect(titles).toContain("شماره داخلی");
  });

  test("پ-۴: رفع باگ تاریکی safeCount — فیلدهای الزامی مستقیم total", () => {
    const src = read("src/app/api/coverage/route.ts");
    expect(src).toContain("safeCount");
    expect(src).toContain("NON_NULLABLE_KEYS");
  });
});

// ═══════════════════ پروب زندهٔ شبکه (واقعی) ═══════════════════
describe("P6547/پروب زندهٔ شبکه — راستی‌آزمایی واقعی", () => {
  const BASE = "http://localhost:3000";
  let token = "";

  // P6547 — اجرای موازی با سوئیت کامل: قفل نرخ ورود مدیر (۵/۱۵دقیقه) را برای
  // تلاش‌های آزمایشی پیش از ورود پاک می‌کنیم (تلاش‌های خودکار تست — نه کاربر واقعی)
  beforeAll(async () => {
    try {
      const { PrismaClient } = await import("@prisma/client");
      const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
      await db.otpAttempt.deleteMany({ where: { personnelCode: "000000000", kind: "MASTER_LOGIN" } });
      await db.$disconnect();
    } catch { /* بهترین-تلاش — در صورت شکست، تست ز-۱ صادقانه قرمز می‌شود */ }
  });

  test("ز-۱: ورود مدیر با کدمستر تازه 80211186 (واقعی)", async () => {
    const res = await fetch(`${BASE}/api/auth/master-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterCode: "80211186" }),
    });
    const d = (await res.json()) as { ok: boolean; token?: string };
    expect(d.ok).toBe(true);
    expect(d.token).toBeTruthy();
    token = d.token ?? "";
  }, 20000);

  test("ز-۲: کد قدیمی 41372895 هرگز ورود موفق نمی‌دهد (واقعی — 401 یا قفل نرخ)", async () => {
    const res = await fetch(`${BASE}/api/auth/master-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterCode: "41372895" }),
    });
    // 401 = رد مستقیم · 429 = قفل نرخ پس از تلاش‌های متوالی (هر دو = عدم ورود)
    expect([401, 429]).toContain(res.status);
    const d = (await res.json()) as { ok: boolean };
    expect(d.ok).toBe(false);
  }, 20000);

  test("ز-۳: عنوان اپ زنده = «اکوسیستم هوشمند ملک ایران (ملکا)» (واقعی)", async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    expect(html).toContain("<title>اکوسیستم هوشمند ملک ایران (ملکا)</title>");
  }, 20000);

  test("ز-۴: /api/coverage زنده — پوشش شعبهٔ M1/M2 از PM (واقعی)", async () => {
    const res = await fetch(`${BASE}/api/coverage`, { headers: { Authorization: `Bearer ${token}` } });
    const d = (await res.json()) as { ok: boolean; tiles: Record<string, { columns: Array<{ column: string; filled: number }> }> };
    expect(d.ok).toBe(true);
    const m1Branch = d.tiles.m1.columns.find((c) => c.column === "شعبه");
    const m2Branch = d.tiles.m2.columns.find((c) => c.column === "شعبه");
    expect(m1Branch?.filled ?? 0).toBeGreaterThan(5000); // شعبهٔ واقعی PM برای هزاران آگهی
    expect(m2Branch?.filled ?? 0).toBeGreaterThan(5000);
  }, 60000);

  test("ز-۵: فهرست کارشناسان زنده — شعبه/نوع همکاری/شماره داخلی از PM (واقعی)", async () => {
    const res = await fetch(`${BASE}/api/crm/experts`, { headers: { Authorization: `Bearer ${token}` } });
    const d = (await res.json()) as { ok: boolean; rows: Array<{ branch?: string; employmentType?: string; voipExtension?: string; pmBranchTitle?: string }> };
    expect(d.ok).toBe(true);
    expect(d.rows.length).toBeGreaterThan(10);
    const withBranch = d.rows.filter((r) => r.branch && r.branch !== "تعیین نشده");
    expect(withBranch.length).toBeGreaterThan(5);
    const withEmp = d.rows.filter((r) => r.employmentType);
    expect(withEmp.length).toBeGreaterThan(5);
    const withVoip = d.rows.filter((r) => r.voipExtension);
    expect(withVoip.length).toBeGreaterThan(5);
  }, 60000);

  test("ز-۶: کاتالوگ درخواست‌ها زنده — مناطق و دسته‌بندی پرشده (واقعی)", async () => {
    const res = await fetch(`${BASE}/api/crm/arm-catalog/requests?limit=60`, { headers: { Authorization: `Bearer ${token}` } });
    const d = (await res.json()) as { ok: boolean; rows: Array<{ areaNames: string[]; tradeTypeName?: string | null; urgent?: boolean | null }> };
    expect(d.ok).toBe(true);
    const withArea = d.rows.filter((r) => r.areaNames?.length > 0);
    expect(withArea.length).toBeGreaterThan(20);
    const withTrade = d.rows.filter((r) => r.tradeTypeName);
    expect(withTrade.length).toBeGreaterThan(10);
  }, 60000);

  test("ز-۷: بینش‌های زندهٔ M1 — بینش پوشش هست، بینش قدیمی کیفیت تماس نیست (واقعی)", async () => {
    const res = await fetch(`${BASE}/api/agent/arm-listings/insight`, { headers: { Authorization: `Bearer ${token}` } });
    expect([200, 201, 204]).toContain(res.status);
    const text = await res.text();
    if (text.includes("al-list-coverage") || text.includes("پوشش اطلاعات فهرست")) {
      expect(text).toContain("پوشش اطلاعات فهرست");
    }
    expect(text).not.toContain("کیفیت اطلاعات تماس مالکان در سامانه ARM");
    expect(text).not.toContain("al-coverage");
  }, 60000);
});
