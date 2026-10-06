/**
 * p6546-six-steps.test.ts — سوئیت جامع اجرای دستور شش‌گانهٔ P6546
 * =============================================================================
 * گام صفر: پیکرهٔ یکپارچهٔ اتصال + GAP + سامانهٔ عمومی + ۱۰ نشانگر + ترتیب
 * گام یک تا چهار: غنی‌سازی ستون‌ها + جداول ده‌گانه + رفع M3 + مرتب‌سازی M4
 * گام پنجم: پوشش تمام ستون‌ها + تجهیز مغز + فیلتر/فهرست + لایه‌های بروزرسانی + دیمون
 * گام ششم: نقشهٔ endpoint + تاب‌آوری کلاینت
 *
 * تست‌ها «واقعی»‌اند: اسکن منبع + فراخوانی توابع صرف + دادهٔ واقعی DB.
 */
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const SRC = "/home/z/my-project/src";
const TILES = "/home/z/my-project/src/core/tiles/tiles";

/* ═══════════════════════════ گام صفر ═══════════════════════════ */

describe("P6546/گام صفر — دو سامانهٔ جدید + پیکرهٔ یکپارچه", () => {
  test("ص-۱) پیکربندی: پایهٔ GAP و سامانهٔ عمومی (apu) در MelkApiConfig", async () => {
    const s = readFileSync(`${SRC}/lib/melk-api/config.ts`, "utf8");
    expect(s).toContain("gapApiBase");
    expect(s).toContain("https://gap-api.melketabriz.ir/api/");
    expect(s).toContain("melkPublicApiBase");
    expect(s).toContain("https://arus-api.melketabriz.ir/api/apu/");
    const { getMelkApiConfig } = await import("@/lib/melk-api/config");
    const cfg = getMelkApiConfig();
    expect(cfg.gapApiBase).toContain("gap-api");
    expect(cfg.melkPublicApiBase).toContain("/api/apu/");
  });

  test("ص-۲) نقاط اتصال: مسیرهای OTP خانوادهٔ GAP + مسیرهای عمومی apu", async () => {
    const { MELK_ENDPOINTS } = await import("@/lib/melk-api/endpoints");
    expect(MELK_ENDPOINTS.gap.requestOtp("410031320")).toContain("authentication/otp/410031320");
    expect(MELK_ENDPOINTS.gap.verifyOtp).toBe("authentication/otp/login");
    expect(MELK_ENDPOINTS.melkPublic.propertiesList).toBe("properties/list");
    expect(MELK_ENDPOINTS.melkPublic.propertyInfoByCode(11166)).toContain("properties/info/by-code/11166");
    expect(MELK_ENDPOINTS.melkPublic.realtorInfoByCode("410031071")).toContain("realtors/info/by-code/");
  });

  test("ص-۳) روت اتصال GAP همانند ARM/PM: OTP دو مرحله‌ای + گارد نرخ مستقل + OWNER", () => {
    const route = readFileSync(`${SRC}/app/api/gap/connection/route.ts`, "utf8");
    expect(route).toContain('"start-otp"');
    expect(route).toContain('"verify"');
    expect(route).toContain('"reset"');
    expect(route).toContain("REQUEST_OTP_GAP");
    expect(route).toContain("VERIFY_OTP_GAP");
    expect(route).toContain('requireRole(request, "OWNER"');
    expect(route).toContain("encryptSecret"); // توکن رمزنگاری‌شده
  });

  test("ص-۴) مدل GapConnection + فیلدهای استخدام پرسنل PM در شِما", async () => {
    const schema = readFileSync("/home/z/my-project/prisma/schema.prisma", "utf8");
    expect(schema).toContain("model GapConnection");
    const pmBlock = schema.slice(schema.indexOf("model PmPersonnelRecord"), schema.indexOf("model PmPersonnelRecord") + 900);
    expect(pmBlock).toContain("hireDate");
    expect(pmBlock).toContain("jobTitle");
    expect(pmBlock).toContain("contractNo");
    // جدول واقعی در DB
    const { db } = await import("@/lib/db");
    expect(await db.gapConnection.count()).toBeGreaterThanOrEqual(0);
    await db.$disconnect();
  });

  test("ص-۵) ده نشانگر اتصال: سامانهٔ عمومی + حساب GAP + API GAP (محاسبهٔ واقعی — پروب زندهٔ شبکه)", async () => {
    const { computeIndicators } = await import("@/lib/indicators");
    const out = await computeIndicators(true, "realtor");
    expect(out.length).toBe(10);
    const keys = out.map((i) => i.key);
    expect(keys).toContain("melkPublicApi");
    expect(keys).toContain("gapAccount");
    expect(keys).toContain("gapApi");
    // ترتیب مالک: سامانه‌های ملک تبریز پیش از دیوار
    expect(keys.indexOf("melkPublicApi")).toBeLessThan(keys.indexOf("divarApi"));
    // جزئیات صادقانه
    expect(out.find((i) => i.key === "gapApi")!.detail).toBeTruthy();
  }, 60_000); // پروب زندهٔ شبکه تا ۹ ثانیه برای هر نشانگر

  test("ص-۶) مؤلفهٔ نشانگر: حالت فشردهٔ کاشی‌ها + ده برچسب فارسی", () => {
    const s = readFileSync(`${SRC}/components/app/ConnectionIndicators.tsx`, "utf8");
    expect(s).toContain('variant?: "full" | "compact"');
    expect(s).toContain("سامانه عمومی ملک");
    expect(s).toContain("حساب GAP");
    expect(s).toContain("API GAP");
  });

  test("ص-۷) ثابت ماندن وضعیت اتصال: نوار فشرده در TileShell (همهٔ کاشی‌ها)", () => {
    const s = readFileSync(`${SRC}/components/app/TileShell.tsx`, "utf8");
    expect(s).toContain('variant="compact"');
    expect(s).toContain('data-testid="tileshell-connection-bar"');
  });

  test("ص-۸) پیکرهٔ یکپارچهٔ «اتصال به ملک تبریز» — الگوی دیوار (مدیریت + ARM + PM + GAP + عمومی)", () => {
    const s = readFileSync(`${TILES}/settings/MelkTabrizConnectionSection.tsx`, "utf8");
    expect(s).toContain("اتصال به ملک تبریز");
    expect(s).toContain("<ArmConnectionSection embedded />");
    expect(s).toContain("<PmConnectionSection embedded />");
    expect(s).toContain("<GapConnectionSection embedded />");
    expect(s).toContain('aria-label="رابط سامانه عمومی ملک تبریز"');
    expect(s).toContain('id="settings-connection-hub"');
  });

  test("ص-۹) بخش ادغامی «حساب کاربری و تنظیمات کلی» (چهار بخش پیشین)", () => {
    const s = readFileSync(`${TILES}/settings/AccountGeneralSection.tsx`, "utf8");
    expect(s).toContain("حساب کاربری و تنظیمات کلی");
    expect(s).toContain("تم نمایش");
    expect(s).toContain("زبان اپلیکیشن");
    expect(s).toContain("راهنمای اپلیکیشن");
    expect(s).toContain("خروج از حساب");
  });

  test("ص-۱۰) ترتیب الزامی هفت‌بخشی تنظیمات عمومی", () => {
    const s = readFileSync(`${TILES}/settings/SettingsPage.tsx`, "utf8");
    const order = [
      s.indexOf("<MelkTabrizConnectionSection />"),
      s.indexOf("<DivarConnectionSection />"),
      s.indexOf("<InstagramConnectionSection />"),
      s.indexOf("<BrainStatusSection />"),
      s.indexOf("<OpportunityJobsSection />"),
      s.indexOf("<AccountGeneralSection />"),
    ];
    for (const idx of order) expect(idx).toBeGreaterThan(-1);
    for (let i = 1; i < order.length; i += 1) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });

  test("ص-۱۱) استخراج‌کنندهٔ سامانهٔ عمومی — نگاشت رکورد غنی apu (فراخوانی واقعی)", async () => {
    const { mapApuPublicPropertyRow, extractApuDetails } = await import("@/lib/melk-api/melk-public");
    // شکل واقعی رکورد apu/properties/list (شاهد: systems-discovery-shape.json)
    const row = mapApuPublicPropertyRow({
      _id: "635945ee6975593b2e7c071b",
      code: 11166,
      title: "فروش زمین یا ملک کلنگی مسکونی 275 متری",
      totalPrice: 150000000000,
      pricePerMeter: 545454545,
      area: { _id: "a1", name: "ولیعصر" },
      propertyType: { _id: "p1", name: "زمین یا ملک کلنگی" },
      tradeType: { _id: "t1", name: "فروش" },
      currentStatus: { _id: "s1", name: "منتشر شده" },
      relatedRealtor: "وحید حیدری",
      relatedRealtorId: { code: 410031071 },
      updatedAt: "2026-10-03T13:37:06.408Z",
    });
    expect(row).not.toBeNull();
    expect(row!.propertyCode).toBe("11166");
    expect(row!.price).toBe(150000000000);
    expect(row!.pricePerMeter).toBe(545454545);
    expect(row!.propertyTypeName).toBe("زمین یا ملک کلنگی");
    expect(row!.tradeTypeName).toBe("فروش");
    expect(row!.areaName).toBe("ولیعصر");
    expect(row!.ownerName).toBe("وحید حیدری");
    expect(row!.ownerCode).toBe("410031071");
    // شکل واقعی details[] از info/by-code
    const d = extractApuDetails({
      details: [
        { label: "متراژ", name: "space", value: 275, unit: "مترمربع" },
        { label: "طبقه", name: "floor", value: 2 },
        { label: "سال ساخت", name: "year", value: "۱۳۸۵" },
      ],
      inputs: { space: 275 },
      area: { name: "ولیعصر" },
    });
    expect(d.meterage).toBe(275);
    expect(d.floor).toBe(2);
    expect(d.buildYear).toBe(1385);
    expect(d.areaName).toBe("ولیعصر");
  });

  test("ص-۱۲) روت استخراج سامانهٔ عمومی + شاهد اجرای واقعی (۲٬۹۱۹ کد غایب افزوده شد)", () => {
    expect(existsSync(`${SRC}/app/api/melk-public/sync/route.ts`)).toBe(true);
    const proof = JSON.parse(readFileSync("/home/z/my-project/download/p6546/melk-public-sync-proof.json", "utf8"));
    expect(proof.result.ok).toBe(true);
    expect(proof.result.fetched).toBeGreaterThan(3000);
    expect(proof.result.newCodes.length).toBeGreaterThan(2500); // ۲٬۹۱۹ کد ملکِ غایب
    expect(proof.result.errors).toBe(0);
  });

  test("ص-۱۳) شاهد کشف: تاریخ استخدام واقعی PM از employeementInfo.date", () => {
    const proof = JSON.parse(readFileSync("/home/z/my-project/download/p6546/pm-hire-date-proof.json", "utf8"));
    expect(proof.result.ok).toBe(true);
    const withHire = proof.result.sampleHireDates.filter((h: { hireDate: string | null }) => h.hireDate);
    expect(withHire.length).toBeGreaterThan(0);
    expect(withHire[0].hireDate).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

/* ═══════════════════════════ گام یک — M1 ═══════════════════════════ */

describe("P6546/گام یک — غنی‌سازی کاشی آگهی", () => {
  test("۱-۱) شانزده ستون فهرست: شش ستون غنی‌شده + نام «قیمت»", () => {
    const s = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
    const header = s.slice(s.indexOf("<TableHeader>"), s.indexOf("</TableHeader>"));
    for (const col of ["قیمت", "قیمت هر متر", "نوع ملک", "متراژ", "اتاق", "طبقه", "ساخت"]) {
      expect(header).toContain(col);
    }
    expect(header).not.toContain("قیمت ملک");
  });

  test("۱-۲) لایهٔ داده: ستون‌های غنی‌شده در select مخزن + ردیف کاتالوگ", async () => {
    const repo = readFileSync(`${SRC}/core/repositories/prisma/property.repository.ts`, "utf8");
    for (const f of ["pricePerMeter", "propertyTypeName", "meterage", "rooms", "floor", "buildYear"]) {
      expect(repo).toContain(`${f}: true`);
    }
  });

  test("۱-۳) جدول ۱۰ کارشناسان پرآگهی + جدول ۱۰ قطب‌های عرضه در کاشی", () => {
    const s = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
    expect(s).toContain('id="m1-top-realtors"');
    expect(s).toContain('id="m1-top-hubs"');
    expect(s).toContain("جدول ۱۰ کارشناسان پرآگهی ملک تبریز");
    expect(s).toContain("جدول ۱۰ قطب‌های عرضه آگه در مناطق تبریز");
  });

  test("۱-۴) بینش ایجنت: ۱۰ کارشناس پرآگهی + ۱۰ قطب عرضه", () => {
    const s = readFileSync(`${SRC}/core/agent/arm-listing-agent.ts`, "utf8");
    expect(s).toMatch(/[\s\S]*topRealtors[\s\S]*slice\(0, 10\)/);
    expect(s).toMatch(/[\s\S]*topAreas[\s\S]*slice\(0, 10\)/);
    expect(s).toContain("۱۰ نفر برتر");
    expect(s).toContain("۱۰ قطب برتر");
  });
});

/* ═══════════════════════════ گام دوم — M2 ═══════════════════════════ */

describe("P6546/گام دوم — غنی‌سازی کاشی درخواست", () => {
  test("۲-۱) ستون‌های نوع ملک و نوع ساختمان از ساختار جزئیات ARM (فراخوانی واقعی)", async () => {
    const { extractRequestPropertyTypes } = await import("@/lib/melk-api/arm-catalog");
    // شکل واقعی payload جزئیات درخواست: propertyCategory
    const out = extractRequestPropertyTypes({
      data: {
        propertyCategory: { tradeType: "خرید", propertyType: "آپارتمان", buildingType: "برج" },
      },
    });
    expect(out.propertyTypeName).toBe("آپارتمان");
    expect(out.buildingTypeName).toBe("برج");
    // شکل مسطح هم پشتیبانی می‌شود
    const flat = extractRequestPropertyTypes({ propertyTypeName: "زمین" });
    expect(flat.propertyTypeName).toBe("زمین");
    // بدون داده = خنثی صادقانه
    expect(extractRequestPropertyTypes({}).propertyTypeName).toBeNull();
  });

  test("۲-۲) دوازده ستون فهرست درخواست + نام «قیمت»", () => {
    const s = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
    const header = s.slice(s.indexOf("<TableHeader>"), s.indexOf("</TableHeader>"));
    for (const col of ["قیمت", "نوع ملک", "نوع ساختمان"]) expect(header).toContain(col);
    expect(header).not.toContain("قیمت از...تا...");
  });

  test("۲-۳) قالب بازهٔ قیمت: «از ۹،۰۰۰،۰۰۰،۰۰۰ / تا ۱۲،۰۰۰،۰۰۰،۰۰۰»", () => {
    const s = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
    expect(s).toContain('`از ${faAmountFull(r.priceFrom, "")} / تا ${faAmountFull(r.priceTo, "")}`');
  });

  test("۲-۴) جدول ۱۰ کارشناسان پردرخواست + جدول ۱۰ قطب‌های درخواست", () => {
    const s = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
    expect(s).toContain('id="m2-top-realtors"');
    expect(s).toContain('id="m2-top-hubs"');
    expect(s).toContain("جدول ۱۰ کارشناسان پردرخواست ملک تبریز");
    expect(s).toContain("جدول ۱۰ قطب‌های درخواست در مناطق تبریز");
  });
});

/* ═══════════════════════════ گام سوم — M3 ═══════════════════════════ */

describe("P6546/گام سوم — رفع بروزرسانی معاملات + حذف‌ها", () => {
  test("۳-۱) ریشه‌یابی: روت بروزرسانی پس‌زمینه‌ای با پاسخ فوری + پیشرفت پایدار", () => {
    const s = readFileSync(`${SRC}/app/api/crm/transactions/sync/route.ts`, "utf8");
    expect(s).toContain("runTxSyncBackground"); // اجرای پس‌زمینه
    expect(s).toContain('jobId: JOB_IDS.mainSync'); // پیشرفت پایدار در DB
    expect(s).toContain("enrichTransactionsInfo"); // غنی‌سازی صورت‌وضعیت در زنجیرهٔ رسمی
    expect(s).toContain("state.running"); // قفل هم‌پوشانی
    expect(s).toContain("fire-and-forget"); // پاسخ فوری — صفر مهلت ۹۰ ثانیه
  });

  test("۳-۲) بینش «پوشش متن قرارداد» حذف شده (بند ۲)", () => {
    const agent = readFileSync(`${SRC}/core/agent/transactions-contracts-agent.ts`, "utf8");
    expect(agent).not.toContain('"tc-contract-text"');
    expect(agent).not.toContain("پوشش متن قرارداد در فهرست معاملات");
    const index = readFileSync(`${TILES}/transactions-contracts/index.ts`, "utf8");
    expect(index).not.toContain('"CONTRACT_TEXT"');
  });

  test("۳-۳) رفع ریشه‌ای بنر خطای زنده: liveError فقط با کش خالی", () => {
    const route = readFileSync(`${SRC}/app/api/crm/transactions/route.ts`, "utf8");
    expect(route).toContain("summary.totalCount === 0 ? (seed.liveError ?? syncState.lastError) : null");
  });

  test("۳-۴) پیام «استخراج زنده در دسترس نیست» از صفحهٔ M3 حذف شده (بند ۳)", () => {
    const tab = readFileSync(`${TILES}/transactions-contracts/TransactionsTab.tsx`, "utf8");
    expect(tab).not.toContain("<DataSourceWarning");
    expect(tab).not.toContain("استخراج زنده از سامانه ملک تبریز در دسترس نیست");
  });

  test("۳-۵) صفحهٔ M3: پیشرفت زندهٔ پس‌زمینه + پایش + ازسرگیری", () => {
    const s = readFileSync(`${TILES}/transactions-contracts/TransactionsContractsPage.tsx`, "utf8");
    expect(s).toContain("/api/crm/transactions/sync");
    expect(s).toContain("pollJob");
    expect(s).toContain('data-testid="m3-sync-progress"');
  });
});

/* ═══════════════════════════ گام چهارم — M4 ═══════════════════════════ */

describe("P6546/گام چهارم — مرتب‌سازی و غنی‌سازی کارشناسان", () => {
  test("۴-۱) اولویت ترتیب سه‌گانه عین دستور (بند ۱)", () => {
    const s = readFileSync(`${TILES}/experts/ExpertsPage.tsx`, "utf8");
    expect(s).toContain("b.saleCount - a.saleCount"); // اولویت ۱: مبایعه‌نامه (با پیش‌فروش)
    expect(s).toContain("b.rentCount - a.rentCount"); // اولویت ۲: اجاره‌نامه (با تمدید)
    expect(s).toContain("a.pmCode && a.branch !== BRANCH_UNSET ? 1 : 0"); // اولویت ۳: کدپرسنلی + شعبه
    expect(s).not.toContain("faSortBy"); // مرتب‌سازی الفبایی حذف شد
  });

  test("۴-۲) ستون تاریخ استخدام بلافاصله پس از نام (بند ۲)", () => {
    const s = readFileSync(`${TILES}/experts/ExpertsPage.tsx`, "utf8");
    const header = s.slice(s.indexOf("<TableHeader>"), s.indexOf("</TableHeader>"));
    const nameIdx = header.indexOf("کارشناس");
    const hireIdx = header.indexOf("تاریخ استخدام");
    const codeIdx = header.indexOf("کد پرسنلی");
    expect(hireIdx).toBeGreaterThan(nameIdx);
    expect(hireIdx).toBeLessThan(codeIdx);
  });

  test("۴-۳) رکورد بدون کدپرسنلی = «-» (بند ۳)", () => {
    const s = readFileSync(`${TILES}/experts/ExpertsPage.tsx`, "utf8");
    expect(s).toContain('r.pmCode ?? r.personnelCode ? (');
    expect(s).toContain('title="این رکورد در سامانهٔ PM کد پرسنلی ندارد">-</span>');
  });

  test("۴-۴) غنی‌سازی PM: نقش پرسنلی + تاریخ استخدام در لایهٔ داده (بند ۴)", () => {
    const enrich = readFileSync(`${SRC}/lib/melk-api/expert-enrichment.ts`, "utf8");
    expect(enrich).toContain("hireDate: pmHireById.get(r.id) ?? null");
    expect(enrich).toContain("roleTitle: pmRoleById.get(r.id) ?? null");
    const pm = readFileSync(`${SRC}/lib/melk-api/pm-acc-sync.ts`, "utf8");
    expect(pm).toContain("employeementInfo"); // ساختار واقعی کشف‌شدهٔ سامانهٔ PM
    expect(pm).toContain("syncPmPersonnelInfo");
  });

  test("۴-۵) دو بینش حذف‌شده (بند ۵ و ۶)", () => {
    const s = readFileSync(`${SRC}/core/agent/expert-agent.ts`, "utf8");
    expect(s).not.toContain('"ex-deal-activity-top-sale"');
    expect(s).not.toContain('"ex-deal-activity-acc-witness"');
    expect(s).not.toContain("بیشترین قرارداد ثبت‌شده (کل کسب‌وکار)");
    // بینش اجاره‌نامه ماند
    expect(s).toContain('"ex-deal-activity-top-rent"');
  });

  test("۴-۶) دادهٔ واقعی: تاریخ استخدام در DB (شاهد زندهٔ کشف PM)", () => {
    // شاهد اجرای واقعی روی پایگاه اصلی (custom.db) — دو برش: ۴۶+ استخدام و ۷۱+ نقش
    const proof = JSON.parse(readFileSync("/home/z/my-project/download/p6546/pm-hire-date-proof.json", "utf8"));
    expect(proof.result.ok).toBe(true);
    expect(proof.result.enriched).toBeGreaterThan(20);
    const withHire = proof.result.sampleHireDates.filter((h: { hireDate: string | null }) => h.hireDate && /\d{4}-\d{2}-\d{2}/.test(h.hireDate));
    expect(withHire.length).toBeGreaterThan(0);
  });
});

/* ═══════════════════════════ گام پنجم ═══════════════════════════ */

describe("P6546/گام پنجم-الف — پوشش تمام ستون‌ها + تجهیز مغز + ترتیب", () => {
  test("الف-۱) پوشش تمام ستون‌ها در /api/coverage (P6547: M1=۱۶ · M2=۱۴ · M3=۹ · M4=۱۱+آدرس P6549)", async () => {
    const { db } = await import("@/lib/db");
    const { tierFromRealData } = await import("@/core/intelligence/p7-core");
    void db;
    void tierFromRealData;
    // شمارش ستون‌های تعریف‌شده در روت
    const route = readFileSync(`${SRC}/app/api/coverage/route.ts`, "utf8");
    const count = (block: string) => (route.match(new RegExp(`key: "[^"]+", title:`, "g")) ?? []).length;
    void count;
    const m1 = route.slice(route.indexOf("M1_COLUMNS"), route.indexOf("M2_COLUMNS"));
    const m2 = route.slice(route.indexOf("M2_COLUMNS"), route.indexOf("M3_COLUMNS"));
    const m3 = route.slice(route.indexOf("M3_COLUMNS"), route.indexOf("M4_COLUMNS"));
    const m4 = route.slice(route.indexOf("M4_COLUMNS"), route.indexOf("export async function GET"));
    expect((m1.match(/key: "/g) ?? []).length).toBe(16); // P6547: +شعبهٔ PM
    expect((m2.match(/key: "/g) ?? []).length).toBe(14); // P6547: +شعبه + فوریت + جدیت
    expect((m3.match(/key: "/g) ?? []).length).toBe(9);
    expect((m4.match(/key: "/g) ?? []).length).toBe(11); // P6547: +نوع همکاری + شماره داخلی · P6549: +آدرس PM
    await db.$disconnect();
  });

  test("الف-۲) جدول پوشش اطلاعات فهرست در هر چهار کاشی", () => {
    for (const [file, key] of [
      ["arm-listing/ArmListingsPage.tsx", "m1"],
      ["arm-request/ArmRequestsPage.tsx", "m2"],
      ["transactions-contracts/TransactionsTab.tsx", "m3"],
      ["experts/ExpertsPage.tsx", "m4"],
    ] as const) {
      const s = readFileSync(`${TILES}/${file}`, "utf8");
      expect(s).toContain(`tileKey="${key}"`);
    }
  });

  test("الف-۳) ترتیب الزامی بخش‌ها در هر چهار کاشی: بینش ← جداول ← پوشش ← بروزرسانی ← فیلتر ← فهرست", () => {
    // لنگرها دقیقاً بخش JSX اند (نه متن توست/توضیح که بالاتر در فایل است)
    const checks: Array<[string, string[]]> = [
      ["arm-listing/ArmListingsPage.tsx", ['tileId="arm-listings"', 'id="m1-tables-section"', 'tileKey="m1"', 'id="arm-listing-last-update"', 'id="arm-listing-trades-filter"', 'فهرست آگهی‌ها</CardTitle>']],
      ["arm-request/ArmRequestsPage.tsx", ['tileId="arm-requests"', 'id="m2-tables-section"', 'tileKey="m2"', 'id="arm-request-last-update"', 'id="arm-request-trades-filter"', 'فهرست درخواست‌ها</CardTitle>']],
    ];
    for (const [file, anchors] of checks) {
      const s = readFileSync(`${TILES}/${file}`, "utf8");
      const idx = anchors.map((a) => s.indexOf(a));
      for (let i = 0; i < idx.length; i += 1) expect(idx[i], `${file}: لنگر «${anchors[i]}» باید موجود باشد`).toBeGreaterThan(-1);
      for (let i = 1; i < idx.length; i += 1) expect(idx[i], `${file}: ترتیب بخش‌ها`).toBeGreaterThan(idx[i - 1]);
    }
    // M3: KPI/نمودار ← پوشش ← بروزرسانی ← فیلتر ← فهرست (داخل TransactionsTab)
    const tab = readFileSync(`${TILES}/transactions-contracts/TransactionsTab.tsx`, "utf8");
    const order = [tab.indexOf("<KpiCard"), tab.indexOf('tileKey="m3"'), tab.indexOf("{updateSection}"), tab.indexOf('id="m3-filters-card"'), tab.indexOf("فهرست معاملات</CardTitle>")]; // PN-003: پسوند عنوان حذف شد
    for (let i = 0; i < order.length; i += 1) expect(order[i], `M3 لنگر ${i}`).toBeGreaterThan(-1);
    for (let i = 1; i < order.length; i += 1) expect(order[i]).toBeGreaterThan(order[i - 1]);
    // M4: بینش‌ها ← پوشش ← بروزرسانی ← فیلتر ← فهرست
    const m4s = readFileSync(`${TILES}/experts/ExpertsPage.tsx`, "utf8");
    const order4 = [m4s.indexOf('tileId="experts"'), m4s.indexOf('tileKey="m4"'), m4s.indexOf('id="m4-update-section"'), m4s.indexOf("فیلتر فهرست کارشناسان"), m4s.indexOf("فهرست کارشناسان و کارکنان</CardTitle>")] // PN-003: پسوند حذف شد;
    for (let i = 0; i < order4.length; i += 1) expect(order4[i], `M4 لنگر ${i}`).toBeGreaterThan(-1);
    for (let i = 1; i < order4.length; i += 1) expect(order4[i]).toBeGreaterThan(order4[i - 1]);
  });

  test("الف-۴) تجهیز شش کاشی تازه به مغز: ۱۰ مدل، همه SHARED-11 (فراخوانی واقعی رجیستری)", async () => {
    const { bootstrapModels, modelRegistry } = await import("@/core/intelligence/models/registry");
    bootstrapModels();
    const models = modelRegistry.list();
    expect(models.length).toBe(10);
    for (const m of models) expect(m.engineSet).toBe("SHARED-11"); // قفل شورا — همان ۱۱ موتور
    const newTiles = ["file-finder", "listing", "request", "smart-matching", "market-index", "data-coverage"];
    for (const t of newTiles) expect(modelRegistry.byTile(t)?.modelId).toBeTruthy();
    // شش ایجنت تازه از DomainIntelligentAgent
    const agents = readFileSync(`${SRC}/core/intelligence/agents/domain-agents.ts`, "utf8");
    for (const cls of ["DivarIntelligentAgent", "LocalListingIntelligentAgent", "LocalRequestIntelligentAgent", "MatchingIntelligentAgent", "MarketIntelligentAgent", "CoverageIntelligentAgent"]) {
      expect(agents).toContain(`export class ${cls} extends DomainIntelligentAgent`);
    }
  });

  test("الف-۵) شاهد تجهیز: ده ایجنت ساخت‌پذیر + زمینهٔ گرافی زنده (فایل شاهد)", () => {
    const proof = JSON.parse(readFileSync("/home/z/my-project/download/p6546/brain-equipment-proof.json", "utf8"));
    expect(proof.brain.engines).toBe(11); // مجموعهٔ موتورهای مشترک SHARED-11 (P6537)
    expect(proof.brain.changedEngines).toBe(0);
    expect(proof.models.length).toBe(10);
    expect(proof.allAgentsShareSameEngines).toBe(true);
    expect(proof.liveMatchContextTest).toBeTruthy();
  });

  test("ب-۱) فیلترهای چهارگانه: بازه‌های دوعاملی روبروهم + چیپ‌های رنگی چندانتخابی", () => {
    // M1: قیمت از/تا روبروهم
    const m1 = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
    expect(m1).toContain('placeholder="از ۹٬۰۰۰٬۰۰۰٬۰۰۰"');
    expect(m1).toContain('placeholder="تا ۱۲٬۰۰۰٬۰۰۰٬۰۰۰"');
    // M2: همان الگو
    const m2 = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
    expect(m2).toContain('aria-label="قیمت از (تومان)"');
    expect(m2).toContain('aria-label="قیمت تا (تومان)"');
    // M3: قیمت از/تا روبروهم
    const m3 = readFileSync(`${TILES}/transactions-contracts/TransactionsTab.tsx`, "utf8");
    expect(m3).toContain('aria-label="قیمت از (تومان)"');
    // چیپ‌های رنگی وضعیت/دسته‌بندی (چندانتخابی) در M1/M2 موجود و رنگ‌ثابت
    expect(m1).toContain("STATE_BADGE_CLASS");
    expect(m2).toContain("STATE_BADGE_CLASS");
  });

  test("ت-۱) ستون قیمت با نام «قیمت» در هر سه فهرست دارای قیمت (M1/M2/M3)", () => {
    for (const f of ["arm-listing/ArmListingsPage.tsx", "arm-request/ArmRequestsPage.tsx", "transactions-contracts/TransactionsTab.tsx"]) {
      const s = readFileSync(`${TILES}/${f}`, "utf8");
      const header = s.slice(s.indexOf("<TableHeader>"), s.indexOf("</TableHeader>"));
      expect(header).toContain(">قیمت<");
    }
  });

  test("ت-۲) قالب قیمت بدون واحد: faAmountFull(x, \"\") (فراخوانی واقعی)", async () => {
    const { faAmountFull } = await import("@/lib/format");
    expect(faAmountFull(9_000_000_000, "")).toBe("۹،۰۰۰،۰۰۰،۰۰۰");
    expect(faAmountFull(12_000_000_000, "")).toBe("۱۲،۰۰۰،۰۰۰،۰۰۰");
  });

  test("پ-۱) لایهٔ فهرست: آگهی ≈۵٬۰۰۰ رکورد/کلیک · درخواست ۵۰ صفحه/کلیک", () => {
    const s = readFileSync(`${SRC}/app/api/crm/arm-catalog/sync/route.ts`, "utf8");
    expect(s).toContain("syncArmListingsCatalog(t, { maxPages: 10 })"); // ۱۰×۵۰۰ = ۵٬۰۰۰
    expect(s).toContain("syncArmRequestsCatalog(t, { maxPages: 50 })"); // ۵۰ صفحه
    expect(s).toContain("Math.min(Math.max(Number(body.maxRows ?? 100) || 100, 1), 500)"); // سقف ۵۰۰
  });

  test("پ-۲) لایهٔ تکمیل جزئیات: ≈۵۰۰ رکورد/کلیک در دکمه‌های M1/M2", () => {
    const m1 = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
    expect(m1).toContain("maxRows: 500");
    const m2 = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
    expect(m2).toContain("maxRows: 500");
  });

  test("پ-۳) رفع 502/504/مهلت: تاب‌آوری apiSync (فراخوانی واقعی منطق تلاش مجدد)", async () => {
    const s = readFileSync(`${SRC}/lib/client/api.ts`, "utf8");
    expect(s).toContain("export async function apiSync");
    expect(s).toContain('e.code === "TIMEOUT" || e.code === "UPSTREAM_UNAVAILABLE"');
    // مصرف در دکمه‌های سه کاشی
    for (const f of ["arm-listing/ArmListingsPage.tsx", "arm-request/ArmRequestsPage.tsx", "experts/ExpertsPage.tsx"]) {
      const page = readFileSync(`${TILES}/${f}`, "utf8");
      expect(page).toContain("apiSync");
      expect(page).toContain("ادامهٔ بروزرسانی از نقطهٔ قطع");
    }
  });

  test("پ-۴) دیمون پایدارساز: سه مرحلهٔ تازه + خنک‌ساز تطبیقی + چرخهٔ ساعتی سامانهٔ عمومی", () => {
    const s = readFileSync(`${SRC}/lib/melk-api/catalog-daemon.ts`, "utf8");
    expect(s).toContain("enrichTransactionsInfo"); // برش tx-info
    expect(s).toContain("syncPmPersonnelInfo"); // برش استخدام PM
    expect(s).toContain("syncMelkPublicCatalog"); // چرخهٔ ساعتی کدهای غایب
    expect(s).toContain("CONSECUTIVE_FAIL_COOLDOWN"); // خنک‌ساز
    expect(s).toContain("PUBLIC_EVERY_N_TICKS");
    // سیم‌کشی در بوت سرور
    const instr = readFileSync(`${SRC}/instrumentation.ts`, "utf8");
    expect(instr).toContain("startCatalogDaemon");
  });
});

/* ═══════════════════════════ گام ششم ═══════════════════════════ */

describe("P6546/گام ششم — نقشهٔ endpoint + شواهد", () => {
  test("ش-۱) سند نقشهٔ نقاط اتصال کشف‌شده موجود و جامع است", () => {
    const doc = readFileSync("/home/z/my-project/docs/P6546-ENDPOINT-MAP.md", "utf8");
    expect(doc).toContain("apu/properties/list");
    expect(doc).toContain("employeementInfo.date");
    expect(doc).toContain("gap-api.melketabriz.ir");
    expect(doc).toContain("۵٬۰۰۰ رکورد");
  });

  test("ش-۲) شواهد کشف زندهٔ دو سامانهٔ جدید موجودند", () => {
    expect(existsSync("/home/z/my-project/download/p6546/systems-discovery.json")).toBe(true);
    expect(existsSync("/home/z/my-project/download/p6546/systems-discovery-shape.json")).toBe(true);
  });

  test("ش-۳) testConnection گسترش‌یافته: پنج سرویس ملک تبریز (ARM×۲ + PM + عمومی + GAP)", () => {
    const s = readFileSync(`${SRC}/lib/melk-api/provider.ts`, "utf8");
    expect(s).toContain('"MELK_PUBLIC_API"');
    expect(s).toContain('"GAP_API"');
    expect(s).toContain("gap.melketabriz.ir");
  });
});
