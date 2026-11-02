/**
 * تست کاشی‌های جدید (دور دوم): قراردادها و اسناد، باشگاه مشتریان،
 * مالی و کمیسیون، شاخص قیمت روز مناطق
 * - محاسبه‌گر کمیسیون با تعرفه رسمی اتحادیه مشاورین املاک تبریز
 * - نگاشت قراردادها (trade-overviews) و وضعیت‌های ۱۲گانه واقعی
 * - تحلیل جامعه مشتریان (تکراری/رشد/نرمال‌سازی نام)
 * - آمار شاخص قیمت (میانه/چارک/جهش/انحراف/شاخص کل)
 * - ثبت کاشی‌ها و ایجنت‌های جدید در رجیستری
 * اجرا: bun test tests/new-tiles-2.test.ts
 */

import { beforeAll, describe, expect, test } from "bun:test";

// ==========================================================================
// محاسبه‌گر کمیسیون — تعرفه رسمی اتحادیه مشاورین املاک تبریز
// ==========================================================================

describe("محاسبه‌گر کمیسیون (تعرفه اتحادیه تبریز)", () => {
  test("مبایعه‌نامه تا سقف ۷۰۰ میلیون: نیم درصد هر طرف", async () => {
    const { saleCommissionBase } = await import("@/lib/melk-api/commission");
    // ۵۰۰ میلیون × ۰٫۵٪ = ۲٫۵ میلیون
    expect(saleCommissionBase(500_000_000)).toBe(2_500_000);
    // دقیقاً روی سقف ۷۰۰ میلیون: ۳٫۵ میلیون
    expect(saleCommissionBase(700_000_000)).toBe(3_500_000);
    // صفر و منفی
    expect(saleCommissionBase(0)).toBe(0);
    expect(saleCommissionBase(-100)).toBe(0);
  });

  test("مبایعه‌نامه مازاد بر ۷۰۰ میلیون: بند ۱ + ۰٫۲۵٪ مازاد", async () => {
    const { saleCommissionBase } = await import("@/lib/melk-api/commission");
    // ۲ میلیارد: ۳٫۵ میلیون + ۱٫۳ میلیارد × ۰٫۲۵٪ = ۳٫۲۵ میلیون → ۶٫۷۵ میلیون
    expect(saleCommissionBase(2_000_000_000)).toBe(6_750_000);
    // ۷۰۰ میلیون + ۱۰۰ میلیون = ۳٫۵م + ۲۵۰هزار
    expect(saleCommissionBase(800_000_000)).toBe(3_750_000);
  });

  test("اجاره‌نامه: ۱٪ ودیعه + ۲۵٪ اجاره ماه اول", async () => {
    const { rentCommissionBase } = await import("@/lib/melk-api/commission");
    // ودیعه ۵۰۰م + اجاره ۱۵م: ۵م + ۳٫۷۵م = ۸٫۷۵ میلیون
    expect(rentCommissionBase(500_000_000, 15_000_000)).toBe(8_750_000);
    expect(rentCommissionBase(0, 0)).toBe(0);
  });

  test("تمدید اجاره: موجر ۵۰٪ و مستأجر ۲۵٪ تعرفه مصوب", async () => {
    const { rentRenewalCommissions } = await import("@/lib/melk-api/commission");
    const base = 8_750_000;
    const { landlord, tenant } = rentRenewalCommissions(500_000_000, 15_000_000);
    expect(landlord).toBe(Math.round(base * 0.5));
    expect(tenant).toBe(Math.round(base * 0.25));
  });

  test("مالیات ارزش افزوده ۱۰٪ به کمیسیون افزوده می‌شود", async () => {
    const { withVat } = await import("@/lib/melk-api/commission");
    const r = withVat(6_750_000, 10);
    expect(r.commission).toBe(6_750_000);
    expect(r.tax).toBe(675_000);
    expect(r.payable).toBe(7_425_000);
  });

  test("محاسبه کامل مبایعه‌نامه — عین commissionData سامانه مالی", async () => {
    const { calculateCommission } = await import("@/lib/melk-api/commission");
    const r = calculateCommission({ contractType: "mobayeName", contractPrice: 2_000_000_000, vatPercent: 10 });
    expect(r.buyerCommission).toBe(6_750_000);
    expect(r.sellerCommission).toBe(6_750_000);
    expect(r.buyerTax).toBe(675_000);
    expect(r.sellerTax).toBe(675_000);
    expect(r.buyerPayable).toBe(7_425_000);
    expect(r.sellerPayable).toBe(7_425_000);
    expect(r.dealValue).toBe(2_000_000_000);
  });

  test("محاسبه کامل اجاره‌نامه و تمدید اجاره", async () => {
    const { calculateCommission } = await import("@/lib/melk-api/commission");
    const rent = calculateCommission({
      contractType: "ejareName",
      contractDeposite: 500_000_000,
      contractRent: 15_000_000,
      vatPercent: 10,
    });
    expect(rent.buyerCommission).toBe(8_750_000); // مستأجر
    expect(rent.sellerCommission).toBe(8_750_000); // موجر
    expect(rent.buyerPayable).toBe(9_625_000);

    const renewal = calculateCommission({
      contractType: "rentalRenewal",
      contractDeposite: 500_000_000,
      contractRent: 15_000_000,
      vatPercent: 10,
    });
    // مستأجر ۲۵٪ تعرفه + مالیات
    expect(renewal.buyerCommission).toBe(Math.round(8_750_000 * 0.25));
    // موجر ۵۰٪ تعرفه + مالیات
    expect(renewal.sellerCommission).toBe(Math.round(8_750_000 * 0.5));
  });

  test("اعتبارسنجی ورودی محاسبه — پیام‌های فارسی", async () => {
    const { validateCommissionInput } = await import("@/lib/melk-api/commission");
    expect(validateCommissionInput("mobayeName", {})).toBe("ثمن معامله را وارد کنید.");
    expect(validateCommissionInput("ejareName", {})).toBe("ودیعه و اجاره ماهانه را وارد کنید.");
    expect(validateCommissionInput("invalid", {})).toBe("نوع معامله انتخاب‌شده معتبر نیست.");
    expect(validateCommissionInput("mobayeName", { contractPrice: 100 })).toBeNull();
    expect(validateCommissionInput("ejareName", { contractDeposite: 100, contractRent: 5 })).toBeNull();
  });
});

// ==========================================================================
// نگاشت قراردادها (trade-overviews) — وضعیت‌ها و ساختار سامانه ARM
// ==========================================================================

describe("نگاشت قراردادها و وضعیت‌های واقعی سامانه", () => {
  test("۱۲ وضعیت واقعی سامانه همه برچسب فارسی دارند", async () => {
    const { CONTRACT_STATUSES, CONTRACT_STATUS_FA } = await import("@/lib/melk-api/types");
    expect(CONTRACT_STATUSES.length).toBe(12);
    for (const s of CONTRACT_STATUSES) {
      expect(CONTRACT_STATUS_FA[s].length).toBeGreaterThan(2);
    }
    expect(CONTRACT_STATUS_FA.preDefined).toBe("پیش‌نویس");
    expect(CONTRACT_STATUS_FA.waitingForAddRealtors).toBe("در انتظار افزودن مشاور");
    expect(CONTRACT_STATUS_FA.waitingForRealtors).toBe("در انتظار تایید مشاوران");
    expect(CONTRACT_STATUS_FA.waitingForFinance).toBe("در انتظار تایید مالی");
    expect(CONTRACT_STATUS_FA.confirmedByFinance).toBe("تایید شده مالی");
    expect(CONTRACT_STATUS_FA.rejectedByFinance).toBe("رد شده مالی");
    expect(CONTRACT_STATUS_FA.waitingForDocument).toBe("در انتظار تنظیم سند");
    expect(CONTRACT_STATUS_FA.rejected).toBe("رد شده");
  });

  test("قیف چرخه عمر: ۷ مرحله مثبت به‌ترتیب منطقی", async () => {
    const { CONTRACT_FUNNEL_ORDER } = await import("@/lib/melk-api/types");
    expect(CONTRACT_FUNNEL_ORDER).toEqual([
      "preDefined",
      "waitingForAddRealtors",
      "waitingForRealtors",
      "waitingForFinance",
      "confirmedByFinance",
      "waitingForDocument",
      "finished",
    ]);
  });

  test("ردیف لیست trade-overviews نگاشت می‌شود (عین ستون‌های سامانه)", async () => {
    const { mapArmContractRow } = await import("@/lib/melk-api/adapters");
    const row = {
      _id: "66f0a1c",
      contractHolo: "6543",
      propertyCode: "P-100",
      requestCode: "R-200",
      contractType: { label: "مبایعه‌نامه" },
      status: "waitingForFinance",
      creator: { identifier: { fullName: "سید نعمت اله سیدی" } },
      createdAt: "1404/06/21 14:30",
      canAddRealtor: false,
    };
    const c = mapArmContractRow(row);
    expect(c).not.toBeNull();
    expect(c!.id).toBe("66f0a1c");
    expect(c!.status).toBe("waitingForFinance");
    expect(c!.contractHolo).toBe("6543");
    expect(c!.contractType).toBe("مبایعه‌نامه");
    expect(c!.creatorName).toBe("سید نعمت اله سیدی");
    expect(c!.createdAt).not.toBeNull();
  });

  test("جزئیات info ادغام می‌شود: خریداران، فروشندگان، حق‌السهم و تاریخ‌ها", async () => {
    const { mapArmContractRow, mergeArmContractInfo } = await import("@/lib/melk-api/adapters");
    const base = mapArmContractRow({
      _id: "c1",
      status: "waitingForRealtors",
      createdAt: "1404/05/01",
    })!;
    const merged = mergeArmContractInfo(base, {
      contractDate: "1404/06/15",
      documentDate: null,
      contractPropertyDate: "1404/07/01",
      property: { title: "آپارتمان ۸۵ متری", address: "تبریز، ولیعصر" },
      contractType: { label: "مبایعه‌نامه" },
      buyerList: [{ fullName: "علی محمدی", mobileNumber: "09141234567" }],
      sellerList: [{ fullName: "مریم احمدی", mobileNumber: "09351112233" }],
      primaryRealtorList: [{ realtor: { _id: "r1", fullName: "سید نعمت اله سیدی" }, realtorUnit: 60, confirmation: "confirm" }],
      secondaryRealtorList: [{ realtor: { _id: "r2", fullName: "رضا کریمی" }, realtorsPercentage: 40, confirmation: "wait", description: "" }],
    });
    expect(merged.buyers).toEqual([{ fullName: "علی محمدی", mobileNumber: "09141234567" }]);
    expect(merged.sellers.length).toBe(1);
    expect(merged.propertyTitle).toBe("آپارتمان ۸۵ متری");
    expect(merged.propertyAddress).toBe("تبریز، ولیعصر");
    expect(merged.contractType).toBe("مبایعه‌نامه");
    expect(merged.realtorShares.length).toBe(2);
    expect(merged.realtorShares[0]).toMatchObject({ name: "سید نعمت اله سیدی", unitPercent: 60, confirmation: "confirm", role: "primary" });
    expect(merged.realtorShares[1]).toMatchObject({ name: "رضا کریمی", unitPercent: 40, confirmation: "wait", role: "secondary" });
    expect(merged.deliveryDate).not.toBeNull();
    expect(merged.documentDate).toBeNull();
  });

  test("پیکربندی کمیسیون سامانه مالی (fm) نگاشت می‌شود", async () => {
    const { mapCommissionConfig } = await import("@/lib/melk-api/adapters");
    const payload = {
      status: "success",
      configList: [
        {
          city: { _id: "614ed19700cace6eac4f9df2", name: "تبریز" },
          valueAddedPercentage: 10,
          realEstateTariff: "<b>تعرفه خرید و فروش:</b>…",
          image: "commissionImages/ettahadie-tabriz.jpg",
          detail: [
            {
              contractType: "mobayeName",
              contractTypeFa: "مبایعه نامه",
              buyerLable: "خریدار",
              sellerLable: "فروشنده",
              inputs: [{ key: "contractPrice", lable: "ثمن معامله" }],
            },
            {
              contractType: "ejareName",
              contractTypeFa: "اجاره نامه",
              buyerLable: "مستأجر",
              sellerLable: "موجر",
              inputs: [
                { key: "contractDeposite", lable: "ودیعه" },
                { key: "contractRent", lable: "اجاره ماهانه" },
              ],
            },
          ],
        },
      ],
    };
    const configs = mapCommissionConfig(payload);
    expect(configs.length).toBe(1);
    const c = configs[0];
    expect(c.cityId).toBe("614ed19700cace6eac4f9df2");
    expect(c.cityName).toBe("تبریز");
    expect(c.valueAddedPercentage).toBe(10);
    expect(c.detail.length).toBe(2);
    expect(c.detail[0].contractType).toBe("mobayeName");
    expect(c.detail[0].buyerLabel).toBe("خریدار");
    expect(c.detail[0].inputs[0]).toEqual({ key: "contractPrice", label: "ثمن معامله" });
    expect(c.detail[1].inputs.length).toBe(2);
  });
});

// ==========================================================================
// باشگاه مشتریان — ساخت جامعه، تکراری‌ها، رشد
// ==========================================================================

describe("تحلیل جامعه مشتریان", () => {
  test("نرمال‌سازی نام: فاصله‌ها، نیم‌فاصله، ی/ك عربی", async () => {
    const { normalizeCustomerName } = await import("@/lib/melk-api/customer-club");
    expect(normalizeCustomerName("  علی   محمدی ")).toBe("علی محمدی");
    expect(normalizeCustomerName("محمد\u200cرضا")).toBe("محمد رضا");
    expect(normalizeCustomerName("علي رضاكي")).toBe("علی رضاکی");
  });

  test("جامعه ساخته می‌شود و مشتری دوطرفه (تکراری) شناسایی می‌شود", async () => {
    const { buildCustomerClub } = await import("@/lib/melk-api/customer-club");
    const members = buildCustomerClub([
      { name: "علی محمدی", role: "BUYER", date: "2025-01-15T10:00:00Z" },
      { name: "علی محمدی", role: "SELLER", date: "2025-06-20T10:00:00Z" },
      { name: "مریم احمدی", role: "BUYER", date: "2025-03-10T10:00:00Z", mobile: "09351112233" },
      { name: "سید نعمت اله سیدی", role: "EXPERT", date: "2024-12-01T10:00:00Z" },
      { name: "علی محمدی", role: "SELLER", date: "2025-08-01T10:00:00Z" },
    ]);
    expect(members.length).toBe(3);
    const ali = members.find((m) => m.name === "علی محمدی")!;
    expect(ali.repeat).toBe(true);
    expect(ali.buyerCount).toBe(1);
    expect(ali.sellerCount).toBe(2);
    expect(ali.firstSeen).toBe("2025-01-15T10:00:00.000Z");
    expect(ali.lastSeen).toBe("2025-08-01T10:00:00.000Z");
    const maryam = members.find((m) => m.name === "مریم احمدی")!;
    expect(maryam.repeat).toBe(false);
    expect(maryam.mobile).toBe("09351112233");
  });

  test("سری رشد ماهانه: اولین حضور هر عضو در ماه مربوط شمرده می‌شود", async () => {
    const { buildCustomerClub, customerGrowthSeries } = await import("@/lib/melk-api/customer-club");
    const members = buildCustomerClub([
      { name: "الف ساده", role: "BUYER", date: "2025-01-15T10:00:00Z" },
      { name: "الف ساده", role: "SELLER", date: "2025-01-20T10:00:00Z" }, // همان عضو — دوباره شمرده نمی‌شود
      { name: "بهنام رضایی", role: "SELLER", date: "2025-02-05T10:00:00Z" },
      { name: "جواد کریمی", role: "BUYER", date: "2025-02-15T10:00:00Z" }, // همان ماه جلالی
    ]);
    const series = customerGrowthSeries(members);
    expect(series.length).toBe(2);
    expect(series[0].count).toBe(1);
    expect(series[1].count).toBe(2);
  });

  test("پرکارترین مشتریان مرتب می‌شوند", async () => {
    const { buildCustomerClub, topCustomers } = await import("@/lib/melk-api/customer-club");
    const members = buildCustomerClub([
      { name: "کم کار", role: "BUYER", date: "2025-01-01T00:00:00Z" },
      { name: "پر کار", role: "BUYER", date: "2025-01-01T00:00:00Z" },
      { name: "پر کار", role: "SELLER", date: "2025-02-01T00:00:00Z" },
      { name: "پر کار", role: "SELLER", date: "2025-03-01T00:00:00Z" },
    ]);
    const top = topCustomers(members, 2);
    expect(top[0].name).toBe("پر کار");
  });
});

// ==========================================================================
// آمار شاخص قیمت — میانه، چارک، جهش، انحراف
// ==========================================================================

// ==========================================================================
// رجیستری: کاشی‌ها و ایجنت‌های جدید ثبت شده‌اند
// ==========================================================================

describe("ثبت کاشی‌ها و ایجنت‌های جدید", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("P6.5-11 + بازسازی فازهای ۷-۸-۹ — رجیستری جدید با ترتیب منطقی M1 تا M4", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    // P6.5-12 (بند ب مرحلهٔ قبل): کاشی مشتریان حذف شد — داده ماندگار، نما حذف
    expect(tileRegistry.has("customer-club")).toBe(false);
    // بازسازی فازهای ۷-۸-۹ (۱۴۰۵/۰۷/۷): M5/M6/M7 حذف نما — داده ماندگار، نما حذف
    expect(tileRegistry.has("price-index")).toBe(false);
    expect(tileRegistry.has("supply-demand")).toBe(false);
    expect(tileRegistry.has("extraction")).toBe(false);
    // سه کاشی معاملات/قراردادها/مالی → کاشی ادغامی (بند پ)
    expect(tileRegistry.has("transactions-contracts")).toBe(true);
    expect(tileRegistry.has("transactions")).toBe(false);
    expect(tileRegistry.has("contracts")).toBe(false);
    expect(tileRegistry.has("finance-commission")).toBe(false);

    // بازسازی فازهای ۷-۸-۹ — ترتیب الزامی M1 تا M4
    const ids = tileRegistry.listChildren("management-dashboard", "OWNER").map((t) => t.id);
    expect(ids.indexOf("arm-listings")).toBe(0); // M1
    expect(ids.indexOf("arm-requests")).toBe(1); // M2
    expect(ids.indexOf("transactions-contracts")).toBe(2); // M3
    expect(ids.indexOf("experts")).toBe(3); // M4
    expect(ids.length).toBe(8); // هشت کاشی — M1-M4 + چهار کاشی تازه (PN-003: m5 تطبیق + m6 یادگیری)
    expect(ids.indexOf("smart-matching")).toBe(4); // M5 تطبیق
    expect(ids.indexOf("learning-tier")).toBe(5); // M6 یادگیری و Tier
    expect(ids.indexOf("market-index")).toBe(6); // M7 شاخص بازار
    expect(ids.indexOf("data-coverage")).toBe(7); // M8 پوشش اطلاعات
    // تنظیمات عمومی ریشه است (چهارم) — نه داخل داشبورد مدیریتی؛ داشبورد مدیریتی آخرین کاشی ریشه
    expect(ids).not.toContain("settings");
    expect(tileRegistry.listRoot("OWNER").at(-1)?.id).toBe("management-dashboard");
  });

  test("بازسازی فازهای ۷-۸-۹ — کاشی‌های ماندگار M1 تا M4 ایجنت اختصاصی متصل به شناسه خود دارند", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    for (const id of ["transactions-contracts", "experts", "arm-listings", "arm-requests"]) {
      const tile = tileRegistry.get(id)!;
      expect(tile.agent).not.toBeNull();
      expect(tile.agent!.tileId).toBe(id);
      expect(tile.agent!.insightDomains.length).toBeGreaterThan(3);
      expect(tile.agent!.capabilities).toContain("memory");
    }
  });

  test("ایجنت‌های جدید در رجیستری ایجنت ثبت شده‌اند", async () => {
    const { getAgent } = await import("@/core/agent");
    const contractAgent = getAgent("contracts");
    expect(contractAgent).not.toBeNull();
    expect(contractAgent!.name).toContain("قرارداد");
    const clubAgent = getAgent("customer-club");
    expect(clubAgent).not.toBeNull();
    const financeAgent = getAgent("finance-commission");
    expect(financeAgent).not.toBeNull();
    // P6530/گام ۵ — ایجنت شاخص قیمت (M5) حذف شد: null
    expect(getAgent("price-index")).toBeNull();
    expect(getAgent("supply-demand")).toBeNull();
    expect(getAgent("extraction")).toBeNull();
  });

  test("برچسب فارسی همه دامنه‌های بینش جدید تعریف شده است", async () => {
    const { DOMAIN_FA } = await import("@/components/app/AgentPanel");
    const newDomains = [
      "FUNNEL", "BOTTLENECK", "STALLED", "SHARE", "REJECT",
      "COMMUNITY", "REPEAT", "GROWTH", "LOYALTY", "CATALOG",
      "TARIFF", "REVENUE", "SETTLEMENT", "BRANCH", "PIPELINE",
      "MARKET", "REGION", "ALERT", "HEALTH",
    ];
    for (const d of newDomains) {
      expect(DOMAIN_FA[d]?.length ?? 0).toBeGreaterThan(2);
    }
  });

  test("P6.5-12 — تنظیمات کاشی معاملات فقط شامل فیلدهای تک‌نمای جدید است", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const tile = tileRegistry.get("transactions-contracts")!;
    // تب‌های قراردادها/مالی حذف شدند ⇒ تنظیم defaultStatus/showFunnel دیگر وجود ندارد
    expect(tile.settings.find((s) => s.key === "defaultStatus")).toBeUndefined();
    expect(tile.settings.find((s) => s.key === "showFunnel")).toBeUndefined();
    const sortSetting = tile.settings.find((s) => s.key === "sortBy")!;
    expect(sortSetting.defaultValue).toBe("contractDate");
    const chartsSetting = tile.settings.find((s) => s.key === "showCharts")!;
    expect(chartsSetting.defaultValue).toBe(true);
  });
});
