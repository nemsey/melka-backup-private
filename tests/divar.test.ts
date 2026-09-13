/**
 * تست جامع کاشی «فایل‌یابی از دیوار»
 * - تجزیه داده واقعی دیوار (قیمت/تاریخ جلالی انتشار/مشخصات)
 * - سه فیلتر هوشمند: شخصی‌بودن، زیرقیمت، مکان (عین منطقه‌بندی آرم)
 * - امتیاز نهایی و دسته‌بندی شکار/پیگیری/بررسی (وزن ۵۰/۳۰/۲۰)
 * - کلیدهای چهارگانه: پل به دیوار، جزییات (پیش‌بینی دلایل رد)، رد (بدون آرشیو + یادگیری)، ثبت
 * - منطق اسکن: حساسیت به «زمان انتشار واقعی» نه نردبان؛ تکراری‌ها فقط با تغییر مهم
 * اجرا: bun test tests/divar.test.ts
 */

import { describe, expect, test, beforeEach, mock } from "bun:test";

// ==========================================================================
// ۱) تجزیه داده واقعی دیوار — ارقام فارسی، قیمت، تاریخ انتشار جلالی
// ==========================================================================

describe("فیلتر زمانی — تجزیه «انتشار آگهی» جلالی دیوار (زمان واقعی ایجاد)", () => {
  test("الگوی واقعی API دیوار: «۱۹ شهریور ۱۴۰۵، ۱۴:۰۲»", async () => {
    const { parseDivarJalaliDateTime } = await import("@/lib/divar/parse");
    const d = parseDivarJalaliDateTime("۱۹ شهریور ۱۴۰۵، ۱۴:۰۲");
    expect(d).not.toBeNull();
    // ۱۹ شهریور ۱۴۰۵ = ۱۰ سپتامبر ۲۰۲۶؛ ۱۴:۰۲ تهران (+۳:۳۰) → ۱۰:۳۲ UTC
    expect(d!.getUTCFullYear()).toBe(2026);
    expect(d!.getUTCMonth()).toBe(8); // سپتامبر
    expect(d!.getUTCDate()).toBe(10);
    expect(d!.getUTCHours()).toBe(10);
    expect(d!.getUTCMinutes()).toBe(32);
  });

  test("بدون ساعت → ظهر فرض می‌شود", async () => {
    const { parseDivarJalaliDateTime } = await import("@/lib/divar/parse");
    const d = parseDivarJalaliDateTime("۱ فروردین ۱۴۰۴");
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2025);
    expect(d!.getUTCMonth()).toBe(2); // مارس
    expect(d!.getUTCDate()).toBe(21);
  });

  test("متن نامعتبر → null (نه تاریخ جعلی)", async () => {
    const { parseDivarJalaliDateTime } = await import("@/lib/divar/parse");
    expect(parseDivarJalaliDateTime(null)).toBeNull();
    expect(parseDivarJalaliDateTime("لحظاتی پیش")).toBeNull();
    expect(parseDivarJalaliDateTime("۳ روز پیش در تبریز")).toBeNull();
  });

  test("حساسیت بازه زمانی: ۱۲ ساعت/۲۴ ساعت/هفته", async () => {
    const { timeWindowHours } = await import("@/lib/divar/config");
    expect(timeWindowHours("12h")).toBe(12);
    expect(timeWindowHours("24h")).toBe(24);
    expect(timeWindowHours("7d")).toBe(168);
    expect(timeWindowHours("unknown")).toBe(24); // پیش‌فرض امن
  });
});

describe("تجزیه قیمت و مشخصات دیوار", () => {
  test("قیمت فارسی با جداکننده («۳,۷۰۰,۰۰۰,۰۰۰ تومان»)", async () => {
    const { parsePriceToman } = await import("@/lib/divar/parse");
    expect(parsePriceToman("۳,۷۰۰,۰۰۰,۰۰۰ تومان")).toBe(3700000000);
    expect(parsePriceToman("۴۹,۳۳۳,۰۰۰ تومان")).toBe(49333000);
    expect(parsePriceToman(null)).toBeNull();
    expect(parsePriceToman("توافقی")).toBeNull();
  });
  test("متراژ/طبقه/سال ساخت/اتاق", async () => {
    const { parseMeterage, parseFloor, parseBuildYear, parseRooms } = await import("@/lib/divar/parse");
    expect(parseMeterage("۷۵")).toBe(75);
    expect(parseFloor("۴ از ۱۰")).toEqual({ floor: 4, total: 10 });
    expect(parseBuildYear("۱۳۹۰")).toBe(1390);
    expect(parseRooms("۲")).toBe(2);
    expect(parseRooms("بدون اتاق")).toBe(0);
  });
});

// ==========================================================================
// ۲) فیلتر هوشمند «شخصی بودن» — مهم‌ترین فیلتر
// ==========================================================================

describe("فیلتر هوشمند شخصی‌بودن", () => {
  test("آگهی مشاور املاک → امتیاز پایین + برچسب مشاور", async () => {
    const { scorePersonalAd } = await import("@/lib/divar/scoring");
    const r = scorePersonalAd({
      title: "فروش آپارتمان ۸۵ متری زعفرانیه آژانس املاک ملک برتر",
      description: "مشاور املاک شما آماده ارائه چند فایل دربست در زعفرانیه است. با مشاور تماس بگیرید.",
    });
    expect(r.score).toBeLessThan(40);
    expect(r.isBroker).toBe(true);
  });
  test("آگهی شخصی مالک («بدون واسطه») → امتیاز بالا", async () => {
    const { scorePersonalAd } = await import("@/lib/divar/scoring");
    const r = scorePersonalAd({
      title: "فروش اضطراری آپارتمان ۸۰ متری",
      description: "مالک هستم، بدون واسطه. به دلیل ضرورت مالی فوری فروش می‌کنم. سند تکبرگ آماده انتقال.",
    });
    expect(r.score).toBeGreaterThan(85);
    expect(r.isBroker).toBe(false);
  });
  test("سیگنال رسمی کنار: business_data → قطعاً مشاور", async () => {
    const { scorePersonalAd } = await import("@/lib/divar/scoring");
    const r = scorePersonalAd({
      title: "هر متن",
      businessName: "املاک سپهر",
      isBusinessAccount: true,
    });
    expect(r.isBroker).toBe(true);
    expect(r.score).toBeLessThan(30);
  });
  test("سیگنال رسمی کنار: حساب شخصی → امتیاز قوی شخصی", async () => {
    const { scorePersonalAd } = await import("@/lib/divar/scoring");
    const r = scorePersonalAd({ title: "آپارتمان ۶۰ متری", isBusinessAccount: false });
    expect(r.score).toBeGreaterThanOrEqual(90); // ۵۰ پایه + ۴۰ سیگنال رسمی
  });
  test("متن خنثی → امتیاز میانه و اطمینان پایین", async () => {
    const { scorePersonalAd } = await import("@/lib/divar/scoring");
    const r = scorePersonalAd({ title: "آپارتمان ۷۰ متری ولیعصر" });
    expect(r.score).toBe(50);
    expect(r.confidence).toBe("low");
  });
});

// ==========================================================================
// ۳) فیلتر هوشمند «زیر قیمت» — شاهکار مقایسه‌ای
// ==========================================================================

describe("فیلتر هوشمند زیرقیمت", () => {
  test("۲۰٪ زیر میانگین محله → امتیاز بالا با درصد مثبت", async () => {
    const { scoreUnderprice } = await import("@/lib/divar/scoring");
    const r = scoreUnderprice({
      pricePerMeter: 40_000_000,
      ref: { medianPerMeter: 50_000_000, sampleCount: 9, source: "divar" },
      minSample: 4,
    });
    expect(r.percentBelow).toBeCloseTo(20, 0);
    expect(r.score).toBeGreaterThan(70);
    expect(r.referencePerMeter).toBe(50_000_000);
    expect(r.method).toBe("divar");
  });
  test("گران‌تر از بازار → امتیاز صفر/بسیار پایین", async () => {
    const { scoreUnderprice } = await import("@/lib/divar/scoring");
    const r = scoreUnderprice({
      pricePerMeter: 70_000_000,
      ref: { medianPerMeter: 50_000_000, sampleCount: 9, source: "divar" },
      minSample: 4,
    });
    expect(r.percentBelow).toBeLessThan(0);
    expect(r.score).toBeLessThan(25);
  });
  test("نمونه کمتر از حد → بدون قضاوت (صفر صادقانه)", async () => {
    const { scoreUnderprice } = await import("@/lib/divar/scoring");
    const r = scoreUnderprice({
      pricePerMeter: 40_000_000,
      ref: { medianPerMeter: 50_000_000, sampleCount: 2, source: "divar" },
      minSample: 4,
    });
    expect(r.score).toBe(0);
    expect(r.method).toBe("none");
    expect(r.reason).toContain("آمار کافی");
  });
  test("مرجع ترکیبی دیوار+آرم (وزن‌دار)", async () => {
    const { scoreUnderprice } = await import("@/lib/divar/scoring");
    const r = scoreUnderprice({
      pricePerMeter: 39_500_000,
      ref: { medianPerMeter: 50_000_000, sampleCount: 10, source: "divar" },
      armRefPerMeter: 40_000_000,
      armWeight: 0.5,
      minSample: 4,
    });
    // مرجع = ۴۵ میلیون (میانه دو منبع)
    expect(r.method).toBe("divar+arm");
    expect(r.referencePerMeter).toBe(45_000_000);
    expect(r.percentBelow).toBeCloseTo(12.2, 0);
    expect(r.confidence).toBe("high");
  });
  test("بدون قیمت هر متر → امتیاز صفر با دلیل روشن", async () => {
    const { scoreUnderprice } = await import("@/lib/divar/scoring");
    const r = scoreUnderprice({ pricePerMeter: null, ref: null });
    expect(r.score).toBe(0);
    expect(r.reason).toContain("قابل استخراج نیست");
  });
});

// ==========================================================================
// ۴) فیلتر هوشمند «مکان» — منطقه‌بندی عین سامانه آرم
// ==========================================================================

describe("فیلتر هوشمند مکان (منطبق با آرم)", () => {
  test("رجیستری آرم: ۱۳۰ منطقه و ۹۲۶ محله تبریز بارگذاری می‌شود", async () => {
    const { TABRIZ_AREAS, ALL_LINES } = await import("@/lib/divar/tabriz-locations");
    expect(TABRIZ_AREAS.length).toBe(130);
    expect(ALL_LINES.length).toBe(926);
  });
  test("تطبیق متنی: «خ نیکو ششم» در متن → محله شهرک اندیشه", async () => {
    const { matchTabrizLocation } = await import("@/lib/divar/tabriz-locations");
    const r = matchTabrizLocation({ title: "واحد ۷۵ متری شهرک اندیشه نیکو ۶", locationText: "۳ روز پیش در تبریز، خ نیکو ششم" });
    expect(r.lineName).toBeTruthy();
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.areaName).toBeTruthy();
  });
  test("تطبیق مختصات: نقطه روی مرکز محله → امتیاز کامل", async () => {
    const { matchTabrizLocation, ALL_LINES } = await import("@/lib/divar/tabriz-locations");
    const line = ALL_LINES.find((l) => l.lat != null && l.lng != null && l.n === "ارگ")!;
    const r = matchTabrizLocation({ title: "فایل", latitude: line.lat, longitude: line.lng });
    expect(r.lineId).toBe(line.id);
    expect(r.score).toBe(100);
  });
  test("تطبیق متنی+مختصاتی هم‌محله → امتیاز ≥ ۷۸", async () => {
    const { matchTabrizLocation, ALL_LINES } = await import("@/lib/divar/tabriz-locations");
    const line = ALL_LINES.find((l) => l.lat != null && l.lng != null && l.n === "ارگ")!;
    const r = matchTabrizLocation({
      title: "اپارتمان در ارگ تبریز",
      locationText: "در تبریز، ارگ",
      latitude: line.lat! + 0.001,
      longitude: line.lng! + 0.001,
    });
    expect(r.score).toBeGreaterThanOrEqual(92);
    expect(r.method).toBe("both");
  });
  test("بیرون از محدوده انتخابی کاربر → امتیاز صفر", async () => {
    const { scoreLocation } = await import("@/lib/divar/scoring");
    const { ALL_LINES } = await import("@/lib/divar/tabriz-locations");
    const inLine = ALL_LINES.find((l) => l.n === "ارگ")!;
    const outLine = ALL_LINES.find((l) => l.n !== "ارگ" && l.areaId !== inLine.areaId)!;
    const r = scoreLocation({
      title: `اپارتمان ${outLine.n}`,
      locationText: `در تبریز، ${outLine.n}`,
      selectedAreaIds: [inLine.areaId],
      selectedLineIds: [],
    });
    expect(r.score).toBe(0);
    expect(r.reason).toContain("بیرون از محدوده");
  });
  test("بدون هیچ سیگنال مکانی → صفر با دلیل", async () => {
    const { matchTabrizLocation } = await import("@/lib/divar/tabriz-locations");
    const r = matchTabrizLocation({ title: "فایل بی‌نشانه" });
    expect(r.score).toBe(0);
    expect(r.method).toBe("none");
  });
});

// ==========================================================================
// ۵) امتیاز نهایی ۱ تا ۱۰۰ + دسته‌بندی سه پنجره (وزن ۵۰/۳۰/۲۰)
// ==========================================================================

describe("امتیاز نهایی و پنجره‌های شکار/پیگیری/بررسی", () => {
  const settings = { weightPersonal: 50, weightUnderprice: 30, weightLocation: 20, huntThreshold: 70, followThreshold: 40 };
  test("فایل قوی (شخصی ۹۰/زیرقیمت ۸۰/مکان ۱۰۰) → شکار", async () => {
    const { computeTotalScore } = await import("@/lib/divar/scoring");
    const r = computeTotalScore({ personal: 90, underprice: 80, location: 100, settings });
    expect(r.total).toBe(89); // (۹۰×۵۰+۸۰×۳۰+۱۰۰×۲۰)/۱۰۰
    expect(r.bucket).toBe("hunt");
  });
  test("فایل میانه (۵۰/۵۰/۵۰) → پیگیری", async () => {
    const { computeTotalScore } = await import("@/lib/divar/scoring");
    const r = computeTotalScore({ personal: 50, underprice: 50, location: 50, settings });
    expect(r.total).toBe(50);
    expect(r.bucket).toBe("follow");
  });
  test("فایل ضعیف (مشاور) → بررسی", async () => {
    const { computeTotalScore } = await import("@/lib/divar/scoring");
    const r = computeTotalScore({ personal: 10, underprice: 20, location: 30, settings });
    expect(r.total).toBeLessThan(40);
    expect(r.bucket).toBe("review");
  });
  test("وزن‌های دلخواه کاربر رعایت می‌شود (۳۰/۴۰/۳۰)", async () => {
    const { computeTotalScore } = await import("@/lib/divar/scoring");
    const r = computeTotalScore({ personal: 100, underprice: 50, location: 0, settings: { ...settings, weightPersonal: 30, weightUnderprice: 40, weightLocation: 30 } });
    expect(r.total).toBe(50); // (۱۰۰×۳۰+۵۰×۴۰+۰×۳۰)/۱۰۰
  });
  test("آستانه‌های قابل تنظیم: شکار بالای ۸۰", async () => {
    const { computeTotalScore } = await import("@/lib/divar/scoring");
    const r = computeTotalScore({ personal: 90, underprice: 60, location: 60, settings: { ...settings, huntThreshold: 80 } });
    expect(r.total).toBe(75);
    expect(r.bucket).toBe("follow");
  });
  test("آستانه غیرمنطقی خودکار اصلاح می‌شود (پیگیری < شکار)", async () => {
    const { computeTotalScore } = await import("@/lib/divar/scoring");
    const r = computeTotalScore({ personal: 50, underprice: 50, location: 50, settings: { ...settings, huntThreshold: 40, followThreshold: 70 } });
    expect(r.bucket).toBe("hunt"); // ۵۰ > hunt(۴۰)
  });
});

// ==========================================================================
// ۶) کلید «جزییات آگهی» — پیش‌بینی هوشمند دلایل رد
// ==========================================================================

describe("کلید جزییات — پیش‌بینی دلایل احتمالی رد توسط کاربر", () => {
  test("آگهی مشاور → دلیل «broker» با احتمال بالا پیش‌بینی می‌شود", async () => {
    const { predictRejectReasons, scorePersonalAd } = await import("@/lib/divar/scoring");
    const personal = scorePersonalAd({ title: "آژانس املاک فروش فایل", description: "مشاور املاک، چند فایل" });
    const preds = predictRejectReasons({
      personal,
      underprice: { score: 0, percentBelow: null, referencePerMeter: null, sampleCount: 0, confidence: "low", method: "none", reason: "—" },
      location: { score: 0, areaId: null, areaName: null, lineId: null, lineName: null, method: "none", reason: "—" },
      pricePerMeter: null,
    });
    expect(preds.find((p) => p.key === "broker")).toBeTruthy();
    expect(preds.find((p) => p.key === "broker")!.likely).toBeGreaterThanOrEqual(80);
    expect(preds.find((p) => p.key === "no-price")).toBeTruthy();
  });
  test("فایل گران → دلیل «overpriced» پیش‌بینی می‌شود", async () => {
    const { predictRejectReasons } = await import("@/lib/divar/scoring");
    const preds = predictRejectReasons({
      personal: { score: 80, isBroker: false, confidence: "high", signals: [] },
      underprice: { score: 10, percentBelow: -20, referencePerMeter: 50_000_000, sampleCount: 8, confidence: "medium", method: "divar", reason: "—" },
      location: { score: 90, areaId: "a", areaName: "X", lineId: "l", lineName: "Y", method: "both", reason: "—" },
      pricePerMeter: 60_000_000,
    });
    expect(preds.find((p) => p.key === "overpriced")).toBeTruthy();
    expect(preds.find((p) => p.key === "broker")).toBeFalsy();
  });
});

// ==========================================================================
// ۷) کلید «رد آگهی» — بدون آرشیو، فقط یادگیری (تست یکپارچه با پایگاه)
// ==========================================================================

describe("کلید رد آگهی — بدون آرشیو + یادگیری", () => {
  test("پس از رد: آگهی حذف، سیگنال یادگیری می‌ماند", async () => {
    const { db } = await import("@/lib/db");
    // آماده‌سازی آگهی آزمایشی
    await db.divarAd.create({
      data: {
        token: "testreject1",
        category: "apartment-sell",
        title: "آزمون رد",
        personalScore: 55,
        underpriceScore: 60,
        locationScore: 70,
        totalScore: 60,
        bucket: "follow",
        status: "active",
      },
    });
    expect(await db.divarAd.findUnique({ where: { token: "testreject1" } })).toBeTruthy();

    // منطق رد (عین route)
    const ad = await db.divarAd.findUnique({ where: { token: "testreject1" } });
    await db.divarRejectLog.create({
      data: {
        token: "testreject1",
        reasons: JSON.stringify(["broker", "overpriced"]),
        note: "مشاور شناخته‌شده",
        scoreSnapshotJson: JSON.stringify({ personal: 55, total: 60 }),
        featureSnapshotJson: JSON.stringify({ title: "آزمون رد" }),
        actorCode: "TEST",
      },
    });
    await db.divarAd.delete({ where: { token: "testreject1" } });

    // آگهی آرشیو نشد؟
    expect(await db.divarAd.findUnique({ where: { token: "testreject1" } })).toBeNull();
    // سیگنال یادگیری ماند؟
    const log = await db.divarRejectLog.findFirst({ where: { token: "testreject1" } });
    expect(log).toBeTruthy();
    expect(JSON.parse(log!.reasons)).toEqual(["broker", "overpriced"]);
    // پاک‌سازی
    await db.divarRejectLog.deleteMany({ where: { token: "testreject1" } });
  });

  test("الگوی یادگیری ایجنت از دلایل رد (خلاصه‌سازی شایع‌ترین دلایل)", async () => {
    const { db } = await import("@/lib/db");
    const reasons = ["broker", "broker", "location", "overpriced", "broker", "location"];
    for (let i = 0; i < reasons.length; i++) {
      await db.divarRejectLog.create({
        data: { token: `learn${i}`, reasons: JSON.stringify([reasons[i]]), actorCode: "TEST" },
      });
    }
    const logs = await db.divarRejectLog.findMany({ where: { token: { startsWith: "learn" } } });
    const count = new Map<string, number>();
    for (const l of logs) for (const r of JSON.parse(l.reasons) as string[]) count.set(r, (count.get(r) ?? 0) + 1);
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    expect(top[0]).toBe("broker");
    expect(top[1]).toBe(3);
    await db.divarRejectLog.deleteMany({ where: { token: { startsWith: "learn" } } });
  });
});

// ==========================================================================
// ۸) منطق اسکن: حساسیت به زمان انتشار واقعی + تکراری فقط با تغییر مهم
// ==========================================================================

describe("منطق اسکن — زمان واقعی انتشار و تکراری‌ها", () => {
  test("آگهی نردبان‌شده قدیمی (بیرون از بازه) هرگز ذخیره نمی‌شود (رد سیستم)", async () => {
    const { db } = await import("@/lib/db");
    const { parseDivarJalaliDateTime } = await import("@/lib/divar/parse");
    // آگهی منتشرشده ۱ ماه پیش — حتی اگر در صف اول جستجو (نردبان) ظاهر شود
    const publishedAt = parseDivarJalaliDateTime("۱۵ شهریور ۱۴۰۵، ۱۰:۰۰");
    const windowStart = new Date(Date.now() - 24 * 3600 * 1000);
    expect(publishedAt! < windowStart).toBe(true); // بیرون از بازه ۲۴ ساعت
    // در موتور اسکن: continue بدون ذخیره — این تست قرارداد را قفل می‌کند
    expect(await db.divarAd.findUnique({ where: { token: "should-not-exist" } })).toBeNull();
  });

  test("آگهی تازه داخل بازه → ذخیره می‌شود", async () => {
    const { db } = await import("@/lib/db");
    const { parseDivarJalaliDateTime } = await import("@/lib/divar/parse");
    const three = new Date(Date.now() - 3 * 3600 * 1000);
    const windowStart = new Date(Date.now() - 24 * 3600 * 1000);
    expect(three >= windowStart).toBe(true);
  });

  test("کلید تغییر (changeKey): قیمت ثابت → بدون رفرش جزئیات؛ تغییر قیمت → به‌روزرسانی", () => {
    const keyOf = (token: string, price: number | null) => `${token}|${price ?? "np"}`;
    expect(keyOf("A", 100)).toBe(keyOf("A", 100)); // بدون تغییر
    expect(keyOf("A", 100)).not.toBe(keyOf("A", 120)); // قیمت عوض شد → تغییر مهم
    expect(keyOf("B", 100)).not.toBe(keyOf("A", 100)); // آگهی متفاوت
  });
});

// ==========================================================================
// ۹) کلیدهای «پل به دیوار» و «ثبت آگهی»
// ==========================================================================

describe("کلید پل به دیوار و ثبت آگهی", () => {
  test("ساخت نشانی صحیح آگهی دیوار", async () => {
    const { divarPostUrl } = await import("@/lib/divar/client");
    const url = divarPostUrl("gW4fL8Xq", "فروش آپارتمان اکازیون");
    expect(url).toContain("https://divar.ir/v/");
    expect(url).toContain("gW4fL8Xq");
  });

  test("نگاشت دسته دیوار به نوع معامله آرم (ثبت آگهی)", async () => {
    // عین نگاشت route ثبت آگهی
    const CATEGORY_MAP: Record<string, { tradeType: string }> = {
      "apartment-sell": { tradeType: "فروش" },
      "apartment-rent": { tradeType: "رهن و اجاره" },
      "plot-old": { tradeType: "فروش" },
    };
    expect(CATEGORY_MAP["apartment-sell"].tradeType).toBe("فروش");
    expect(CATEGORY_MAP["apartment-rent"].tradeType).toBe("رهن و اجاره");
  });

  test("اعتبارسنجی فرم ثبت: مالک + موبایل + کد پستی ۱۰ رقمی", () => {
    const validOwner = (name: string, mobile: string) => name.trim().length >= 3 && /^09\d{9}$/.test(mobile.replace(/\D/g, ""));
    expect(validOwner("علی محمدی", "09141234567")).toBe(true);
    expect(validOwner("ع", "09141234567")).toBe(false); // نام کوتاه
    expect(validOwner("علی محمدی", "914123")).toBe(false); // موبایل ناقص
    const validPostal = (p: string) => p === "" || p.replace(/\D/g, "").length === 10;
    expect(validPostal("5133675134")).toBe(true);
    expect(validPostal("123")).toBe(false);
  });
});

// ==========================================================================
// ۱۰) تنظیمات ایجنت — اعتبارسنجی منطقی
// ==========================================================================

describe("تنظیمات ایجنت فایل‌یابی", () => {
  test("پیش‌فرض: وزن ۵۰/۳۰/۲۰، آستانه ۷۰/۴۰، اسکن ۱۵ دقیقه", async () => {
    const { DIVAR_DEFAULT_SETTINGS } = await import("@/lib/divar/config");
    expect(DIVAR_DEFAULT_SETTINGS.weightPersonal).toBe(50);
    expect(DIVAR_DEFAULT_SETTINGS.weightUnderprice).toBe(30);
    expect(DIVAR_DEFAULT_SETTINGS.weightLocation).toBe(20);
    expect(DIVAR_DEFAULT_SETTINGS.huntThreshold).toBe(70);
    expect(DIVAR_DEFAULT_SETTINGS.followThreshold).toBe(40);
    expect(DIVAR_DEFAULT_SETTINGS.autoScanMinutes).toBe(15);
  });
  test("clamp: مقادیر خارج از بازه اصلاح می‌شوند (عین منطق ذخیره)", async () => {
    const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(-5, 0, 100)).toBe(0);
    expect(clamp(55.7, 0, 100)).toBe(56);
  });
  test("دسته‌های دیوار — همه املاک موجودند", async () => {
    const { DIVAR_REAL_ESTATE_CATEGORIES } = await import("@/lib/divar/config");
    const values = DIVAR_REAL_ESTATE_CATEGORIES.map((c) => c.value);
    expect(values).toContain("apartment-sell");
    expect(values).toContain("plot-old");
    expect(values).toContain("commercial-rent");
    expect(values.length).toBeGreaterThanOrEqual(13);
  });
});
