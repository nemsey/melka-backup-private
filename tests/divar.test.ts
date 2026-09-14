/**
 * تست جامع کاشی «فایل‌یابی از دیوار»
 * - تجزیه داده واقعی دیوار (قیمت/تاریخ جلالی انتشار/مشخصات)
 * - چهار فیلتر هوشمند: شخصی‌بودن، زیرقیمت، سایر فاکتورهای بهینه، مکان (عین منطقه‌بندی آرم)
 * - امتیاز نهایی و دسته‌بندی شکار/پیگیری/بررسی (وزن ۵۰/۲۰/۲۰/۱۰ — قوانین مالک نسخه ۳)
 * - قانون مالک: رد کامل فایل غیرشخصی (shouldAutoReject) — فقط فایل‌های شخصی امتیازدهی می‌شوند
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
// ۲-ب) برچسب آگهی‌دهنده — عین بخش زیر نقشه دیوار (مشاور املاک/دپارتمان املاک/شخصی)
// ساختارها از پاسخ‌های واقعی و زنده API دیوار استخراج شده‌اند.
// ==========================================================================

describe("تشخیص آگهی‌دهنده از برچسب زیر نقشه دیوار", () => {
  test("طبقه‌بندی نوع کسب‌وکار از نام — نام‌های واقعی تبریز", async () => {
    const { classifyPublisherKind } = await import("@/lib/divar/client");
    // مشاور تکی
    expect(classifyPublisherKind("مشاور حسن رحمتی")).toBe("agent");
    expect(classifyPublisherKind("مشاور یونس شیرینی اتا")).toBe("agent");
    // گروه/شعبه/آژانس → دپارتمان
    expect(classifyPublisherKind("گروه مشاورین املاک طاهری")).toBe("department");
    expect(classifyPublisherKind("ملک تبریز ۰۴۱۴۱۰۱ شعبه باغلارباغی")).toBe("department");
    expect(classifyPublisherKind("املاک اطلس")).toBe("department");
    expect(classifyPublisherKind("املاک ابهری")).toBe("department");
    // نام نامشخص
    expect(classifyPublisherKind(null)).toBe("business");
    expect(classifyPublisherKind("")).toBe("business");
  });

  test("تجزیه تعداد آگهی فعال («۸ آگهی فعال» → 8)", async () => {
    const { parseActiveAdCount } = await import("@/lib/divar/client");
    expect(parseActiveAdCount("۸ آگهی فعال")).toBe(8);
    expect(parseActiveAdCount("۵۱۲ آگهی فعال")).toBe(512);
    expect(parseActiveAdCount(null)).toBeNull();
    expect(parseActiveAdCount("بدون متن عددی")).toBeNull();
  });

  test("تجزیه پاسخ lazy کارت کسب‌وکار زیر نقشه — EVENT_ROW واقعی دیوار", async () => {
    const { parseBusinessLazyResponse } = await import("@/lib/divar/client");
    const raw = {
      widget_list: [
        { widget_type: "SECTION_DIVIDER_ROW", data: { "@type": "type.googleapis.com/widgets.SectionDividerRowData" } },
        {
          widget_type: "EVENT_ROW",
          data: {
            "@type": "type.googleapis.com/widgets.EventRowData",
            title: "گروه مشاورین املاک طاهری",
            subtitle: "۸ آگهی فعال",
            image_url: "https://s100.divarcdn.com/static/imgs/widget-icons/light/icon_secondary/v1/business_real_estate_agency.png",
            label: "همه آگهی‌ها",
            action: { type: "PREMIUM_PANEL_BRAND_LANDING", payload: { "@type": "type.googleapis.com/widgets.PremiumPanelBrandLandingPayload", brand_token: "xDiClpnF", is_public: true } },
            type: "NORMAL",
          },
        },
      ],
    };
    const r = parseBusinessLazyResponse(raw);
    expect(r).not.toBeNull();
    expect(r!.name).toBe("گروه مشاورین املاک طاهری");
    expect(r!.adCountText).toBe("۸ آگهی فعال");
    expect(r!.brandUrl).toBe("https://divar.ir/pro/xDiClpnF");
    expect(parseBusinessLazyResponse({ widget_list: [] })).toBeNull();
    expect(parseBusinessLazyResponse(null)).toBeNull();
  });

  test("تجزیه جزئیات آگهی مشاور: BUSINESS_SECTION موجود است و درخواست lazy استخراج می‌شود", async () => {
    const { parsePostDetailResponse } = await import("@/lib/divar/client");
    const raw = {
      city: { name: "تبریز" },
      contact: { chat_enabled: true },
      sections: [
        { section_name: "TITLE", widgets: [{ widget_type: "LEGEND_TITLE_ROW", data: { title: "آپارتمان ۶۷متر شهرک اندیشه املاک طاهری فروش فوری" } }] },
        { section_name: "MAP", widgets: [{ widget_type: "MAP_ROW", data: { location: { exact_data: { point: { latitude: 38.079, longitude: 46.376 } } } } }] },
        {
          section_name: "BUSINESS_SECTION",
          widgets: [
            {
              widget_type: "LAZY_SECTION",
              data: {
                rest_request_path: "/v8/premium-user/post-page/business-data/gaFak0ZB/lazy",
                request_data: {
                  "@type": "type.googleapis.com/premium_panel.GetPostBusinessLazyWidgetsRequest.RequestData",
                  post_token: "gaFak0ZB",
                  hashed_post_owner_user_id: "1f6ce13d",
                  post_business_type: "premium-panel",
                },
              },
            },
          ],
        },
      ],
    };
    const d = parsePostDetailResponse(raw, "gaFak0ZB");
    expect(d.title).toBe("آپارتمان ۶۷متر شهرک اندیشه املاک طاهری فروش فوری");
    expect(d.publisherType).toBe("business"); // پیش از واکشی نام
    expect(d.businessRequest).not.toBeNull();
    expect(d.businessRequest!.post_token).toBe("gaFak0ZB");
  });

  test("تجزیه جزئیات آگهی شخصی: بدون BUSINESS_SECTION → شخصی (مالک)", async () => {
    const { parsePostDetailResponse } = await import("@/lib/divar/client");
    const raw = {
      city: { name: "تبریز" },
      sections: [
        { section_name: "TITLE", widgets: [{ widget_type: "LEGEND_TITLE_ROW", data: { title: "آپارتمان نقلی با وام شنب غازان" } }] },
        { section_name: "DESCRIPTION", widgets: [{ widget_type: "DESCRIPTION_ROW", data: { text: "آپارتمان دوطبقه" } }] },
        { section_name: "MAP", widgets: [{ widget_type: "MAP_ROW", data: { location: { exact_data: { point: { latitude: 38.08, longitude: 46.23 } } } } }] },
      ],
    };
    const d = parsePostDetailResponse(raw, "galQkF2u");
    expect(d.publisherType).toBe("personal");
    expect(d.businessRequest).toBeNull();
    expect(d.publisherName).toBeNull();
  });
});

describe("سیگنال رسمی برچسب دیوار در امتیاز شخصی‌بودن", () => {
  test("آگهی با برچسب «مشاور املاک» زیر نقشه → قطعاً مشاور؛ حتی با متن «مالک هستم بدون واسطه»", async () => {
    const { scorePersonalAd } = await import("@/lib/divar/scoring");
    const r = scorePersonalAd({
      title: "فروش فوری آپارتمان ۱۵۰ متر بهار",
      description: "مالک هستم، بدون واسطه، مستقیم از مالک، ضرورت مالی فوری — سند تکبرگ",
      publisherType: "agent",
      publisherName: "مشاور حسن رحمتی",
    });
    expect(r.score).toBeLessThanOrEqual(8); // سقف قطعی
    expect(r.isBroker).toBe(true);
    const sig = r.signals.find((s) => s.key === "divar:publisher");
    expect(sig).toBeDefined();
    expect(sig!.hit).toBe(true);
    expect(sig!.label).toContain("مشاور املاک");
    expect(sig!.label).toContain("مشاور حسن رحمتی");
    expect(sig!.evidence).toContain("BUSINESS_SECTION");
  });

  test("آگهی با برچسب «دپارتمان املاک» (گروه/شعبه) → قطعاً مشاور", async () => {
    const { scorePersonalAd } = await import("@/lib/divar/scoring");
    const r = scorePersonalAd({
      title: "واحد ۲۱۰ متری در خاوران تبریز",
      publisherType: "department",
      publisherName: "ملک تبریز ۰۴۱۴۱۰۱ شعبه باغلارباغی",
    });
    expect(r.score).toBeLessThanOrEqual(8);
    expect(r.isBroker).toBe(true);
    expect(r.signals.find((s) => s.key === "divar:publisher")!.label).toContain("دپارتمان املاک");
  });

  test("آگهی کسب‌وکار بدون نام («business») → باز هم مشاور", async () => {
    const { scorePersonalAd } = await import("@/lib/divar/scoring");
    const r = scorePersonalAd({ title: "پیش‌فروش", publisherType: "business" });
    expect(r.isBroker).toBe(true);
    expect(r.score).toBeLessThanOrEqual(8);
  });

  test("برچسب «شخصی» (فاقد کسب‌وکار املاک) → امتیاز تقویت‌شده", async () => {
    const { scorePersonalAd } = await import("@/lib/divar/scoring");
    const r = scorePersonalAd({ title: "آپارتمان ۷۰ متری ولیعصر", publisherType: "personal" });
    expect(r.score).toBe(80); // ۵۰ پایه + ۳۰ برچسب شخصی
    expect(r.isBroker).toBe(false);
    const sig = r.signals.find((s) => s.key === "divar:publisher");
    expect(sig!.label).toContain("شخصی");
  });

  test("فقدان برچسب ( داده قدیمی/کنار ) → رفتار پیشین حفظ می‌شود (خنثی ۵۰)", async () => {
    const { scorePersonalAd } = await import("@/lib/divar/scoring");
    const r = scorePersonalAd({ title: "آپارتمان ۷۰ متری ولیعصر" });
    expect(r.score).toBe(50);
    expect(r.signals.find((s) => s.key === "divar:publisher")).toBeUndefined();
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
// ۵) امتیاز نهایی ۱ تا ۱۰۰ + دسته‌بندی سه پنجره (وزن ۵۰/۲۰/۲۰/۱۰ — چهار معیار مالک)
// ==========================================================================

describe("امتیاز نهایی و پنجره‌های شکار/پیگیری/بررسی (چهار معیار مالک ۵۰/۲۰/۲۰/۱۰)", () => {
  const settings = { weightPersonal: 50, weightUnderprice: 20, weightOther: 20, weightLocation: 10, huntThreshold: 70, followThreshold: 40 };
  test("فایل قوی (شخصی ۹۰/زیرقیمت ۸۰/سایر ۷۰/مکان ۱۰۰) → شکار", async () => {
    const { computeTotalScore } = await import("@/lib/divar/scoring");
    const r = computeTotalScore({ personal: 90, underprice: 80, other: 70, location: 100, settings });
    expect(r.total).toBe(85); // (۹۰×۵۰+۸۰×۲۰+۷۰×۲۰+۱۰۰×۱۰)/۱۰۰
    expect(r.bucket).toBe("hunt");
    expect(r.breakdown.other).toBe(70);
  });
  test("فایل میانه (۵۰/۵۰/۵۰/۵۰) → پیگیری", async () => {
    const { computeTotalScore } = await import("@/lib/divar/scoring");
    const r = computeTotalScore({ personal: 50, underprice: 50, other: 50, location: 50, settings });
    expect(r.total).toBe(50);
    expect(r.bucket).toBe("follow");
  });
  test("فایل ضعیف (۱۰/۲۰/۳۰/۲۰) → بررسی", async () => {
    const { computeTotalScore } = await import("@/lib/divar/scoring");
    const r = computeTotalScore({ personal: 10, underprice: 20, other: 30, location: 20, settings });
    expect(r.total).toBeLessThan(40);
    expect(r.bucket).toBe("review");
  });
  test("وزن‌های دلخواه کاربر رعایت می‌شود (۳۰/۴۰/۲۰/۱۰)", async () => {
    const { computeTotalScore } = await import("@/lib/divar/scoring");
    const r = computeTotalScore({ personal: 100, underprice: 50, other: 0, location: 0, settings: { ...settings, weightPersonal: 30, weightUnderprice: 40, weightOther: 20, weightLocation: 10 } });
    expect(r.total).toBe(50); // (۱۰۰×۳۰+۵۰×۴۰+۰×۲۰+۰×۱۰)/۱۰۰
  });
  test("وزن مکان فقط با سهم خودش (۱۰) اثر می‌گذارد — مکان ۱۰۰ بقیه ۵۰ → ۵۵", async () => {
    const { computeTotalScore } = await import("@/lib/divar/scoring");
    const r = computeTotalScore({ personal: 50, underprice: 50, other: 50, location: 100, settings });
    expect(r.total).toBe(55); // ۵۰×۰٫۹ + ۱۰۰×۰٫۱
  });
  test("آستانه‌های قابل تنظیم: شکار بالای ۸۰", async () => {
    const { computeTotalScore } = await import("@/lib/divar/scoring");
    const r = computeTotalScore({ personal: 90, underprice: 60, other: 60, location: 60, settings: { ...settings, huntThreshold: 80 } });
    expect(r.total).toBe(75);
    expect(r.bucket).toBe("follow");
  });
  test("آستانه غیرمنطقی خودکار اصلاح می‌شود (پیگیری < شکار)", async () => {
    const { computeTotalScore } = await import("@/lib/divar/scoring");
    const r = computeTotalScore({ personal: 50, underprice: 50, other: 50, location: 50, settings: { ...settings, huntThreshold: 40, followThreshold: 70 } });
    expect(r.bucket).toBe("hunt"); // ۵۰ > hunt(۴۰)
  });
});

// ==========================================================================
// ۵-ب) قانون مالک: رد کامل فایل‌های غیرشخصی — فقط شخصی‌ها امتیاز می‌گیرند
// ==========================================================================

describe("قانون مالک — رد کامل فایل غیرشخصی (shouldAutoReject)", () => {
  test("برچسب رسمی دیوار «مشاور املاک» → کامل رد", async () => {
    const { scorePersonalAd, shouldAutoReject } = await import("@/lib/divar/scoring");
    const p = scorePersonalAd({ title: "اپارتمان ۸۵ متری ولیعصر", description: "بدون واسطه از مالک", publisherType: "agent" });
    expect(shouldAutoReject(p, "agent")).toBe(true);
  });
  test("برچسب «دپارتمان املاک» و «کسب‌وکار املاک» → کامل رد", async () => {
    const { scorePersonalAd, shouldAutoReject } = await import("@/lib/divar/scoring");
    const pDept = scorePersonalAd({ title: "فایل دربست ولیعصر" });
    expect(shouldAutoReject(pDept, "department")).toBe(true);
    const pBiz = scorePersonalAd({ title: "موقعیت عالی سرمایه‌گذاری" });
    expect(shouldAutoReject(pBiz, "business")).toBe(true);
  });
  test("برچسب «شخصی» + متن قوی شخصی → هرگز رد نمی‌شود", async () => {
    const { scorePersonalAd, shouldAutoReject } = await import("@/lib/divar/scoring");
    const p = scorePersonalAd({ title: "فروش فوری اپارتمان ولیعصر", description: "بدون واسطه مستقیم از مالک، ضرورت مالی", publisherType: "personal" });
    expect(p.score).toBeGreaterThanOrEqual(65);
    expect(shouldAutoReject(p, "personal")).toBe(false);
  });
  test("بدون برچسب + سیگنال متنی قوی مشاور (املاک/آژانس) → رد (isBroker)", async () => {
    const { scorePersonalAd, shouldAutoReject } = await import("@/lib/divar/scoring");
    const p = scorePersonalAd({ title: "املاک ثامن — چند فایل دربست", description: "مشاور املاک شما در تبریز، همکاران ما" });
    expect(p.isBroker).toBe(true);
    expect(shouldAutoReject(p, null)).toBe(true);
  });
  test("بدون برچسب + متن خنثی بدون سیگنال مشاور → رد نمی‌شود (مرزی — به امتیازدهی می‌رسد)", async () => {
    const { scorePersonalAd, shouldAutoReject } = await import("@/lib/divar/scoring");
    const p = scorePersonalAd({ title: "اپارتمان ۸۵ متری سالم", description: "طبقه دوم، نور خوب" });
    expect(shouldAutoReject(p, null)).toBe(false);
  });
});

// ==========================================================================
// ۵-پ) شاهکار ایجنت — سایر فاکتورهای فایل بهینه
// ==========================================================================

describe("شاهکار ایجنت — سایر فاکتورهای فایل بهینه (scoreOtherFactors)", () => {
  test("شش فاکتور با وزن‌های مجموع ۱۰۰ ارزیابی می‌شوند", async () => {
    const { scoreOtherFactors } = await import("@/lib/divar/scoring");
    const r = scoreOtherFactors({ title: "اپارتمان ولیعصر", description: "توضیحات", publishedAt: new Date() });
    expect(r.factors.length).toBe(6);
    expect(r.factors.reduce((s, f) => s + f.weight, 0)).toBe(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
  test("فایل بهینه کامل (فوریت + تازه + داده کامل + توضیحات مستند + سند) → امتیاز بالا", async () => {
    const { scoreOtherFactors } = await import("@/lib/divar/scoring");
    const r = scoreOtherFactors({
      title: "فروش فوری اپارتمان ۸۵ متری",
      description: "ملک خودم است، به دلیل ضرورت مالی و بدهی بانکی فوری می‌فروشم. سند تک‌برگ شش‌دانگ آماده انتقال، خالی قابل تحویل فوری. ساختمان ۱۴۰۲، واحد طبقه دوم با آسانسور. قیمت با توجه به نیاز مالی تخفیف داده شده و قابل مذاکره است. اطلاعات کامل: متراژ ۸۵، دو خواب، یک پارکینگ.",
      priceTotal: 2_000_000_000,
      pricePerMeter: 23_500_000,
      meterage: 85,
      rooms: 2,
      floor: 2,
      buildYear: 1402,
      photoCount: 8,
      publishedAt: new Date(Date.now() - 60 * 60 * 1000),
      location: { score: 90, reason: "تطبیق قوی" },
    });
    expect(r.score).toBeGreaterThanOrEqual(65);
    const byKey = new Map(r.factors.map((f) => [f.key, f]));
    expect(byKey.get("urgency")!.score).toBeGreaterThanOrEqual(70);
    expect(byKey.get("freshness")!.score).toBe(100);
    expect(byKey.get("completeness")!.score).toBeGreaterThanOrEqual(85);
  });
  test("فایل کهنه و کم‌داده → امتیاز پایین", async () => {
    const { scoreOtherFactors } = await import("@/lib/divar/scoring");
    const r = scoreOtherFactors({
      title: "اپارتمان",
      description: "تماس بگیرید",
      publishedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000),
    });
    expect(r.score).toBeLessThan(45);
    const byKey = new Map(r.factors.map((f) => [f.key, f]));
    expect(byKey.get("freshness")!.score).toBe(10);
    expect(byKey.get("completeness")!.score).toBeLessThanOrEqual(10);
  });
  test("صداقت در عیب‌ها امتیاز اصالت محتوا را بالا می‌برد؛ ادبیات تبلیغاتی پایین می‌آورد", async () => {
    const { scoreOtherFactors } = await import("@/lib/divar/scoring");
    const honest = scoreOtherFactors({ title: "کلنگی قدیمی", description: "ملک فرسوده است و نیاز به تعمیر دارد؛ اما موقعیت عالی دارد" });
    const noisy = scoreOtherFactors({ title: "فرصت سرمایه‌گذاری دردنیافتنی", description: "موقعیت استثنایی، ارزان‌ترین قیمت بازار، فرصت سرمایه‌گذاری موقعیت عالی" });
    const hKey = new Map(honest.factors.map((f) => [f.key, f])).get("content")!;
    const nKey = new Map(noisy.factors.map((f) => [f.key, f])).get("content")!;
    expect(hKey.score).toBeGreaterThan(nKey.score);
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
    // فایل‌های غیرشخصی قطعی در اسکن کامل رد می‌شوند؛ این پیش‌بینی برای فایل مرزی است (احتمال بالا = ۷۰)
    expect(preds.find((p) => p.key === "broker")!.likely).toBeGreaterThanOrEqual(70);
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
  test("پیش‌فرض قوانین مالک نسخه ۳: وزن ۵۰/۲۰/۲۰/۱۰ (جمع ۱۰۰)، آستانه ۷۰/۴۰، اسکن ۱۵ دقیقه", async () => {
    const { DIVAR_DEFAULT_SETTINGS } = await import("@/lib/divar/config");
    expect(DIVAR_DEFAULT_SETTINGS.weightPersonal).toBe(50);
    expect(DIVAR_DEFAULT_SETTINGS.weightUnderprice).toBe(20);
    expect(DIVAR_DEFAULT_SETTINGS.weightOther).toBe(20);
    expect(DIVAR_DEFAULT_SETTINGS.weightLocation).toBe(10);
    expect(
      DIVAR_DEFAULT_SETTINGS.weightPersonal +
        DIVAR_DEFAULT_SETTINGS.weightUnderprice +
        DIVAR_DEFAULT_SETTINGS.weightOther +
        DIVAR_DEFAULT_SETTINGS.weightLocation
    ).toBe(100);
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

// ==========================================================================
// ۱۱) فیلتر مکان ایجنت — ۱۷ منطقه پیش‌فرض مالک + قرارداد فیلتر اسکن/فهرست
// ==========================================================================

describe("فیلتر مکان — ۱۷ منطقه پیش‌فرض مالک (منطبق با رجیستری آرم)", () => {
  test("هر ۱۷ نام منطقه به منطقه واقعی آرم حل می‌شود (هیچ نام گمشده نیست)", async () => {
    const { DEFAULT_LOCATION_AREA_NAMES, DEFAULT_LOCATION_AREA_IDS, resolveAreaIdsByNames } = await import(
      "@/lib/divar/tabriz-locations"
    );
    expect(DEFAULT_LOCATION_AREA_NAMES.length).toBe(17);
    const r = resolveAreaIdsByNames(DEFAULT_LOCATION_AREA_NAMES);
    expect(r.missing).toEqual([]); // دقت کامل: هیچ منطقه‌ای حل‌نشده نمی‌ماند
    expect(r.ids.length).toBe(17); // بدون تکرار
    expect(DEFAULT_LOCATION_AREA_IDS.length).toBe(17);
  });

  test("نام‌های محاوره‌ای مالک با نویسه‌های متفاوت هم حل می‌شوند (۳۵ فارسی/لاتین، پرانتز، ZWNJ)", async () => {
    const { resolveAreaIdsByNames } = await import("@/lib/divar/tabriz-locations");
    const r = resolveAreaIdsByNames([
      "۳۵ متری سینا", // ارقام فارسی — نام آرم «35 متری سینا»
      "دادگستری ایل گلی", // بدون پرانتز — نام آرم «دادگستری (ایل گلی)»
      "الهی‌پرست", // نیم‌فاصله — نام آرم «الهی پرست»
      "ولی عصر", // با فاصله — نام آرم «ولیعصر»
    ]);
    expect(r.missing).toEqual([]);
    expect(r.ids.length).toBe(4);
  });

  test("پیش‌فرض تنظیمات: همان ۱۷ منطقه + پوشش محله‌ها ≥ ۱۵۰", async () => {
    const { DIVAR_DEFAULT_SETTINGS } = await import("@/lib/divar/config");
    const { DEFAULT_LOCATION_AREA_IDS, ALL_LINES, TABRIZ_AREAS } = await import("@/lib/divar/tabriz-locations");
    expect(DIVAR_DEFAULT_SETTINGS.areaIds).toEqual(DEFAULT_LOCATION_AREA_IDS);
    expect(DIVAR_DEFAULT_SETTINGS.lineIds).toEqual([]);
    const covered = ALL_LINES.filter((l) => DEFAULT_LOCATION_AREA_IDS.includes(l.areaId)).length;
    expect(covered).toBeGreaterThanOrEqual(150);
    expect(covered).toBeLessThanOrEqual(ALL_LINES.length);
    expect(TABRIZ_AREAS.find((a) => a.id === DIVAR_DEFAULT_SETTINGS.areaIds[0])?.n).toBe("ولیعصر");
  });

  test("قرارداد فیلتر اسکن (locationAllowed): درون/بیرون/بدون تطبیق/فیلتر خاموش", async () => {
    const { locationAllowed, ALL_LINES } = await import("@/lib/divar/tabriz-locations");
    const inLine = ALL_LINES.find((l) => l.n === "ارگ")!; // منطقه 17 شهریور جدید
    const outLine = ALL_LINES.find((l) => l.areaId !== inLine.areaId)!;
    const sel = { areaIds: [inLine.areaId], lineIds: [] };
    // آگهیِ هم‌منطقه → مجاز
    expect(locationAllowed({ areaId: inLine.areaId, lineId: inLine.id }, sel)).toBe(true);
    // آگهیِ منطقه دیگر → رد (هرگز ذخیره نمی‌شود)
    expect(locationAllowed({ areaId: outLine.areaId, lineId: outLine.id }, sel)).toBe(false);
    // بدون تطبیق قابل اتکا → رد
    expect(locationAllowed(null, sel)).toBe(false);
    expect(locationAllowed({ areaId: null, lineId: null }, sel)).toBe(false);
    // فیلتر خاموش → همه مجاز (حتی بدون تطبیق)
    expect(locationAllowed(null, { areaIds: [], lineIds: [] })).toBe(true);
    expect(locationAllowed({ areaId: outLine.areaId, lineId: outLine.id }, { areaIds: [], lineIds: [] })).toBe(true);
  });

  test("اجتماع منطقه+محله در lineInSelection (منطبق با فیلتر مکان آرم)", async () => {
    const { lineInSelection, ALL_LINES } = await import("@/lib/divar/tabriz-locations");
    const a = ALL_LINES[0];
    const other = ALL_LINES.find((l) => l.areaId !== a.areaId)!;
    // انتخاب منطقه → همه محله‌هایش مجاز، حتی بدون انتخاب محله
    expect(lineInSelection(a, { areaIds: [a.areaId], lineIds: [] })).toBe(true);
    expect(lineInSelection(other, { areaIds: [a.areaId], lineIds: [] })).toBe(false);
    // انتخاب محله خاص از منطقه دیگر → همان مجاز (اجتماع، نه اشتراک)
    expect(lineInSelection(other, { areaIds: [a.areaId], lineIds: [other.id] })).toBe(true);
    expect(lineInSelection(a, { areaIds: [a.areaId], lineIds: [other.id] })).toBe(true);
    // بدون هیچ انتخابی → همه
    expect(lineInSelection(a, { areaIds: [], lineIds: [] })).toBe(true);
  });

  test("فهرست خواندن آگهی‌ها: allowedLineIdsForSelection اجتماع محله‌های مناطق انتخابی", async () => {
    const { allowedLineIdsForSelection, ALL_LINES, DEFAULT_LOCATION_AREA_IDS } = await import(
      "@/lib/divar/tabriz-locations"
    );
    // فیلتر خاموش → null (پرس‌وجوی بدون قید مکان)
    expect(allowedLineIdsForSelection({ areaIds: [], lineIds: [] })).toBeNull();
    // فیلتر ۱۷ منطقه → همه محله‌های همان مناطق
    const ids = allowedLineIdsForSelection({ areaIds: DEFAULT_LOCATION_AREA_IDS, lineIds: [] })!;
    const expected = ALL_LINES.filter((l) => DEFAULT_LOCATION_AREA_IDS.includes(l.areaId)).map((l) => l.id);
    expect(ids.length).toBe(expected.length);
    for (const id of expected) expect(ids).toContain(id);
    // محله خاص از منطقه انتخاب‌نشده هم اضافه می‌شود (اجتماع)
    const someOut = ALL_LINES.find((l) => !DEFAULT_LOCATION_AREA_IDS.includes(l.areaId))!;
    const ids2 = allowedLineIdsForSelection({ areaIds: DEFAULT_LOCATION_AREA_IDS, lineIds: [someOut.id] })!;
    expect(ids2).toContain(someOut.id);
    expect(ids2.length).toBe(expected.length + 1);
  });

  test("اعتبارسنجی انتخاب مکان: شناسه نامعتبر رد، شناسه معتبر قبول", async () => {
    const { validateLocationSelection, ALL_LINES, TABRIZ_AREAS } = await import("@/lib/divar/tabriz-locations");
    const v1 = validateLocationSelection(["fake-area-id"], []);
    expect(v1.ok).toBe(false);
    expect(v1.message).toBeTruthy();
    const v2 = validateLocationSelection([], ["fake-line-id"]);
    expect(v2.ok).toBe(false);
    const v3 = validateLocationSelection([TABRIZ_AREAS[0].id], [ALL_LINES[0].id]);
    expect(v3.ok).toBe(true);
    expect(v3.message).toBeNull();
  });

  test("امتیاز مکان با فیلتر فعال: آگهی منطقه انتخابی امتیاز می‌گیرد؛ محله خاص منطقه دیگر هم مجاز است (اجتماع)", async () => {
    const { scoreLocation } = await import("@/lib/divar/scoring");
    const { ALL_LINES } = await import("@/lib/divar/tabriz-locations");
    const inLine = ALL_LINES.find((l) => l.n === "ارگ")!;
    const outLine = ALL_LINES.find((l) => l.areaId !== inLine.areaId && l.n.length >= 4)!;
    // درون منطقه انتخابی → امتیاز کامل
    const r1 = scoreLocation({
      title: `اپارتمان ${inLine.n}`,
      locationText: `در تبریز، ${inLine.n}`,
      selectedAreaIds: [inLine.areaId],
      selectedLineIds: [],
    });
    expect(r1.score).toBeGreaterThan(0);
    expect(r1.reason).not.toContain("بیرون از محدوده");
    // بیرون از انتخاب → صفر + دلیل
    const r2 = scoreLocation({
      title: `اپارتمان ${outLine.n}`,
      locationText: `در تبریز، ${outLine.n}`,
      selectedAreaIds: [inLine.areaId],
      selectedLineIds: [],
    });
    expect(r2.score).toBe(0);
    expect(r2.reason).toContain("بیرون از محدوده");
    // محله خاص از منطقه دیگر در انتخاب محله‌ها → مجاز (اجتماع)
    const r3 = scoreLocation({
      title: `اپارتمان ${outLine.n}`,
      locationText: `در تبریز، ${outLine.n}`,
      selectedAreaIds: [inLine.areaId],
      selectedLineIds: [outLine.id],
    });
    expect(r3.score).toBeGreaterThan(0);
    expect(r3.reason).not.toContain("بیرون از محدوده");
  });
});

describe("فیلتر مکان — مهاجرت یک‌باره و ذخیره انتخاب (پایگاه)", () => {
  test("نصب قدیمی بدون انتخاب مکانی → پس از نخستین بارگذاری، ۱۷ منطقه پیش‌فرض مالک فعال می‌شود", async () => {
    const { db } = await import("@/lib/db");
    const { loadDivarSettings } = await import("@/lib/divar/store");
    const { DEFAULT_LOCATION_AREA_IDS } = await import("@/lib/divar/tabriz-locations");
    // شبیه‌سازی ردیف قدیمی: بدون انتخاب مکانی و بدون پرچم مهاجرت
    const oldJson = JSON.stringify({
      timeWindow: "24h",
      categories: ["apartment-sell"],
      weightPersonal: 50,
      weightUnderprice: 30,
      weightLocation: 20,
      huntThreshold: 70,
      followThreshold: 40,
      autoScanMinutes: 15,
      areaIds: [],
      lineIds: [],
      maxScanPages: 3,
      minMarketSample: 4,
      armPriceWeight: 0.35,
    });
    await db.divarSetting.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", dataJson: oldJson, locFilterInit: false },
      update: { dataJson: oldJson, locFilterInit: false },
    });
    const settings = await loadDivarSettings();
    expect(settings.areaIds).toEqual(DEFAULT_LOCATION_AREA_IDS);
    expect(settings.lineIds).toEqual([]);
    // پرچم مهاجرت ثبت شد؟
    const row = await db.divarSetting.findUnique({ where: { id: "singleton" } });
    expect(row?.locFilterInit).toBe(true);
  });

  test("مهاجرت یک‌بارة قوانین نسخه ۳: نصب قدیمی (۵۰/۳۰/۲۰) → چهار وزن مالک ۵۰/۲۰/۲۰/۱۰", async () => {
    const { db } = await import("@/lib/db");
    const { loadDivarSettings } = await import("@/lib/divar/store");
    const oldJson = JSON.stringify({
      timeWindow: "24h",
      categories: ["apartment-sell"],
      weightPersonal: 50,
      weightUnderprice: 30,
      weightLocation: 20,
      huntThreshold: 70,
      followThreshold: 40,
      autoScanMinutes: 15,
      areaIds: [],
      lineIds: [],
      maxScanPages: 3,
      minMarketSample: 4,
      armPriceWeight: 0.35,
    });
    await db.divarSetting.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", dataJson: oldJson, locFilterInit: true },
      update: { dataJson: oldJson, locFilterInit: true },
    });
    const settings = await loadDivarSettings();
    expect(settings.weightPersonal).toBe(50);
    expect(settings.weightUnderprice).toBe(20);
    expect(settings.weightOther).toBe(20);
    expect(settings.weightLocation).toBe(10);
    expect(settings.scoringV3Init).toBe(true);
  });

  test("مهاجرت از نسخه ۲ (۵۰/۲۵/۲۵) → نسخه ۳ (۵۰/۲۰/۲۰/۱۰)", async () => {
    const { db } = await import("@/lib/db");
    const { loadDivarSettings } = await import("@/lib/divar/store");
    const v2Json = JSON.stringify({
      timeWindow: "24h",
      categories: ["apartment-sell"],
      weightPersonal: 50,
      weightUnderprice: 25,
      weightOther: 25,
      scoringV2Init: true,
      huntThreshold: 70,
      followThreshold: 40,
      autoScanMinutes: 15,
      areaIds: [],
      lineIds: [],
    });
    await db.divarSetting.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", dataJson: v2Json, locFilterInit: true },
      update: { dataJson: v2Json, locFilterInit: true },
    });
    const settings = await loadDivarSettings();
    expect(settings.weightPersonal).toBe(50);
    expect(settings.weightUnderprice).toBe(20);
    expect(settings.weightOther).toBe(20);
    expect(settings.weightLocation).toBe(10);
    expect(settings.scoringV3Init).toBe(true);
  });

  test("ذخیره چهار وزن دلخواه کاربر (قابل افزایش/کاهش) — پس از مهاجرت", async () => {
    const { saveDivarSettings, loadDivarSettings } = await import("@/lib/divar/store");
    await saveDivarSettings({ weightPersonal: 60, weightUnderprice: 25, weightOther: 15, weightLocation: 5 });
    const s = await loadDivarSettings();
    expect(s.weightPersonal).toBe(60);
    expect(s.weightUnderprice).toBe(25);
    expect(s.weightOther).toBe(15);
    expect(s.weightLocation).toBe(5);
    // بازگرداندن پیش‌فرض مالک برای تست‌های بعدی
    await saveDivarSettings({ weightPersonal: 50, weightUnderprice: 20, weightOther: 20, weightLocation: 10 });
  });

  test("پس از مقداردهی، «همه تبریز» (خالی) انتخاب آگاهانه است و به پیش‌فرض برنمی‌گردد", async () => {
    const { db } = await import("@/lib/db");
    const { loadDivarSettings, saveDivarSettings } = await import("@/lib/divar/store");
    await saveDivarSettings({ areaIds: [], lineIds: [] });
    const settings = await loadDivarSettings();
    expect(settings.areaIds).toEqual([]);
    expect(settings.lineIds).toEqual([]);
  });

  test("ذخیره انتخاب با حذف تکرار و پاک‌سازی مقادیر غیررشته‌ای", async () => {
    const { saveDivarSettings, loadDivarSettings } = await import("@/lib/divar/store");
    const { TABRIZ_AREAS } = await import("@/lib/divar/tabriz-locations");
    const ids = [TABRIZ_AREAS[0].id, TABRIZ_AREAS[1].id, TABRIZ_AREAS[0].id];
    await saveDivarSettings({ areaIds: ids });
    const settings = await loadDivarSettings();
    expect(settings.areaIds.length).toBe(2);
    // بازگرداندن پیش‌فرض برای تست‌های بعدی
    const { DEFAULT_LOCATION_AREA_IDS } = await import("@/lib/divar/tabriz-locations");
    await saveDivarSettings({ areaIds: [...DEFAULT_LOCATION_AREA_IDS], lineIds: [] });
  });
});
