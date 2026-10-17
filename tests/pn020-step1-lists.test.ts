/**
 * pn020-step1-lists.test.ts — PN-020 / گام اول (دستور مالک ۱۴۰۵/۰۷/۲۱ — جلسهٔ شورای ۰۲۴)
 * =============================================================================
 * سه فهرست چهارگانه + ریشه‌یابی ۵۰۴:
 *   §الف — M1 فهرست آگهی: حذف سه ستون (آخرین وضعیت/تصاویر/انتشار) + سال بدون کاما
 *   §ب  — M2 فهرست درخواست: رنگی فوریت/سمت(جهت)/نوع ساخت + سال بدون کاما +
 *          جهت فایل‌گونه برای موارد زیاد + تاریخ ثبت آخرین ستون
 *   §ج۱ — M3 فهرست معاملات: پنج ستون تازه (عنوان ملک/شرایط پرداخت/تاریخ سند/
 *          وضعیت معامله/حق‌الزحمه) + شاهکار شرایط مالی قرارداد از rawInfoJson
 *   §ج۲ — ریشه‌یابی ۵۰۴: ensureSeeded غیرمسدود + بارگذاری خودکار پس از سنک
 */

import { readFileSync } from "node:fs";
import { afterAll, describe, expect, test } from "bun:test";

const SRC = "/home/z/my-project/src";
const TILES = `${SRC}/core/tiles/tiles`;
const M1_SRC = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
const M2_SRC = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
const M2_SIDES_SRC = readFileSync(`${TILES}/arm-request/SideFileCell.tsx`, "utf8");
const M3_PAGE_SRC = readFileSync(`${TILES}/transactions-contracts/TransactionsContractsPage.tsx`, "utf8");
const M3_SRC = readFileSync(`${TILES}/transactions-contracts/TransactionsTab.tsx`, "utf8");
const M3_DOC_SRC = readFileSync(`${TILES}/transactions-contracts/ContractFileDialog.tsx`, "utf8");

const { db } = await import("@/lib/db");

afterAll(async () => {
  await db.$disconnect();
});

/* ==========================================================================
 * §الف — M1 فهرست آگهی
 * ========================================================================== */

describe("PN-020 §الف — M1: حذف سه ستون + سال بدون کاما", () => {
  test("الف-۱) سه ستون حذف‌شده در سرستون‌ها نیستند: آخرین وضعیت (وضعیت) · تصاویر · انتشار", () => {
    expect(M1_SRC).not.toContain(">وضعیت</TableHead>");
    expect(M1_SRC).not.toContain(">تصاویر</TableHead>");
    expect(M1_SRC).not.toContain(">انتشار</TableHead>");
  });

  test("الف-۲) سلول‌های ستون‌های حذف‌شده هم پاک شده‌اند (imageCount / addedToDivar دیگر رندر نمی‌شوند)", () => {
    expect(M1_SRC).not.toContain("r.imageCount");
    expect(M1_SRC).not.toContain("r.addedToDivar");
    expect(M1_SRC).not.toContain("r.addedToInsta");
    // PN-039 (ن۰۶۴/گام ۵): ستون تازهٔ «وضعیت آگهی» classifyListingStatus را زنده کرد —
    // ستون قدیمی «آخرین وضعیت» همچنان حذف است (الف-۱)؛ این گارد اکنون رندر تازه را قفل می‌کند
    expect(M1_SRC).toContain("classifyListingStatus(r.status)");
    expect(M1_SRC).toContain("listingStatusLabel(r.status)");
  });

  test("الف-۳) ستون‌های باقی‌ماندهٔ اصلی سر جایشان هستند (دسته‌بندی/تاریخ وضعیت/لینک)", () => {
    for (const h of ["دسته‌بندی", "تاریخ وضعیت", "لینک", "بازدید", "ساخت"]) {
      expect(M1_SRC).toContain(`>${h}</TableHead>`);
    }
  });

  test("الف-۳-ب) جلسهٔ ۰۳۳ (دستور مالک — ثانیاً/ب+ت): ستون «آخرین فعالیت» حذف + ترتیب ستون‌ها به‌ترتیب تازه", () => {
    // حذف کامل ستون (سرستون + سلول)
    expect(M1_SRC).not.toContain(">آخرین فعالیت</TableHead>");
    // ترتیب الزامی مالک (ن۰۶۴): ردیف · کد آگهی · کارشناس · شعبه · نوع ملک · دسته‌بندی · وضعیت آگهی · مالک · قیمت ·
    // قیمت هر متر · رهن/اجاره · آدرس ملک · متراژ · اتاق · طبقه · ساخت · بازدید · لینک · تاریخ وضعیت · تاریخ ثبت · یادداشت
    const headers = [...M1_SRC.matchAll(/<TableHead[^>]*>([^<]+)<\/TableHead>/g)].map((m) => m[1].trim());
    expect(headers).toEqual([
      "ردیف", "کد آگهی", "کارشناس", "شعبه", "نوع ملک", "دسته‌بندی", "وضعیت آگهی", "مالک", "قیمت",
      "قیمت هر متر", "رهن / اجاره", "آدرس ملک", "متراژ", "اتاق", "طبقه", "ساخت", "بازدید", "لینک", "تاریخ وضعیت", "تاریخ ثبت", "یادداشت",
    ]);
    // ترتیب بدنه هم منطبق است: لینک (۱۲) → تاریخ وضعیت (۱۳) → تاریخ ثبت (۱۴) → یادداشت (۱۵ — آخرین ستون)
    expect(M1_SRC).toMatch(/r\.publicUrl[\s\S]*?<\/TableCell>[\s\S]*?<TableCell className="text-muted-foreground whitespace-nowrap text-\[10px\]">\s*\{r\.statusDate/);
    expect(M1_SRC).toMatch(/\{r\.statusDate \? faDateTime\(r\.statusDate\) : "—"\}[\s\S]*?\{r\.createdAt \? faDateTime\(r\.createdAt\) : "—"\}[\s\S]*?<OwnerNoteCell/);
  });

  test("الف-۳-پ) (ن۰۶۴/گام ۵) ستون «وضعیت آگهی» بلافاصله بعد از دسته‌بندی است", () => {
    const headers = [...M1_SRC.matchAll(/<TableHead[^>]*>([^<]+)<\/TableHead>/g)].map((m) => m[1].trim());
    const i = headers.indexOf("دسته‌بندی");
    expect(i).toBeGreaterThan(-1);
    expect(headers[i + 1]).toBe("وضعیت آگهی");
  });

  test("الف-۳-ت) (ن۰۶۴/گام ۳) ستون «تاریخ ثبت» بلافاصله بعد از تاریخ وضعیت است", () => {
    const headers = [...M1_SRC.matchAll(/<TableHead[^>]*>([^<]+)<\/TableHead>/g)].map((m) => m[1].trim());
    const i = headers.indexOf("تاریخ وضعیت");
    expect(i).toBeGreaterThan(-1);
    expect(headers[i + 1]).toBe("تاریخ ثبت");
  });

  test("الف-۴) سال ساخت بدون کاما — faDigits (نه faNumber که جداکنندهٔ هزارگان می‌گذارد)", () => {
    // سلول سال ساخت باید faDigits(r.buildYear) باشد — ۱۴۰۳ و نه ۱،۴۰۳
    expect(M1_SRC).toMatch(/faDigits\(r\.buildYear\)/);
    expect(M1_SRC).not.toMatch(/faNumber\(r\.buildYear\)/);
  });

  test("الف-۵) بینش وضعیت و فیلتر بالای فهرست باقی است (داده حذف نمی‌شود — فقط ستون)", () => {
    expect(M1_SRC).toContain("listingStateBadgeClass");
    expect(M1_SRC).toContain("LISTING_STATES");
  });
});

/* ==========================================================================
 * §ب — M2 فهرست درخواست
 * ========================================================================== */

describe("PN-020 §ب — M2: رنگی سه ستون + سال بدون کاما + جهت فایل‌گونه + تاریخ ثبت آخر", () => {
  test("ب-۱) فوریت رنگی — هر دو حالت فوری/عادی از رجیستری رنگ", () => {
    expect(M2_SRC).toContain('valueSoftClass("فوری")');
    expect(M2_SRC).toContain('valueSoftClass("عادی")');
    expect(M2_SRC).not.toContain("bg-orange-500/15 text-orange-700"); // رنگ هاردکد قدیمی حذف شد (قانون ۱۲)
  });

  test("ب-۲) جهت (سمت) — سلول فایل‌گونه SideFileCell با آستانهٔ ۳ (عین الگوی فایل مناطق)", () => {
    expect(M2_SRC).toContain("<SideFileCell");
    expect(M2_SIDES_SRC).toContain("export const SIDES_FILE_THRESHOLD = 3");
    expect(M2_SIDES_SRC).toContain('data-testid="sides-file-button"');
    expect(M2_SIDES_SRC).toContain('data-testid="sides-file-list"');
  });

  test("ب-۳) تجزیهٔ چندمقداری parseNameList — هر دو جداکنندهٔ فارسی/لاتین + حفظ نیم‌فاصلهٔ درون‌واژه‌ای", async () => {
    const { parseNameList } = await import("@/core/tiles/tiles/arm-request/SideFileCell");
    expect(parseNameList("شمال، جنوب، شرق")).toEqual(["شمال", "جنوب", "شرق"]);
    expect(parseNameList("شخصی, مجتمع")).toEqual(["شخصی", "مجتمع"]);
    // نیم‌فاصلهٔ «سه‌در» عین منبع حفظ می‌شود (نمایش درست فارسی)
    expect(parseNameList("شمالی-جنوبی، سه‌در")).toEqual(["شمالی-جنوبی", "سه‌در"]);
    expect(parseNameList(" شمال  ،   جنوب ")).toEqual(["شمال", "جنوب"]);
    expect(parseNameList(null)).toEqual([]);
    expect(parseNameList("")).toEqual([]);
    expect(parseNameList("  , ، ")).toEqual([]);
  });

  test("ب-۴) نوع ساخت رنگی — هر مقدار Badge با valueSoftClass (شخصی/مجتمع/برج)", () => {
    expect(M2_SRC).toContain("parseNameList(r.constructTypeNames)");
    expect(M2_SRC).toMatch(/parseNameList\(r\.constructTypeNames\)\.map/);
  });

  test("ب-۵) سال ساخت (از/تا) بدون کاما — faDigits و نه faNumber", () => {
    expect(M2_SRC).toMatch(/faDigits\(r\.buildYearFrom\)/);
    expect(M2_SRC).toMatch(/faDigits\(r\.buildYearTo\)/);
    expect(M2_SRC).not.toMatch(/faNumber\(r\.buildYear(From|To)\)/);
  });

  test("ب-۶) تاریخ ثبت پیش از یادداشت + یادداشت آخرین ستون فهرست است (بند ۴ دستور + PN-039/گام ۴)", () => {
    // سرستون‌ها: آخرین <TableHead> باید «یادداشت» و پیش از آن «تاریخ ثبت» باشد (ن۰۶۴)
    const headers = [...M2_SRC.matchAll(/<TableHead[^>]*>([^<]+)<\/TableHead>/g)].map((m) => m[1].trim());
    expect(headers.length).toBeGreaterThan(10);
    expect(headers[headers.length - 1]).toBe("یادداشت");
    expect(headers[headers.length - 2]).toBe("تاریخ ثبت");
  });

  test("ب-۶-ب) (ن۰۶۴/گام ۷) ستون «نوع ساختمان» از فهرست درخواست حذف شده است", () => {
    // نه سرستون نه سلول رندر — دادهٔ buildingTypeName در API/اکسل دست‌نخورده می‌ماند
    expect(M2_SRC).not.toContain(">نوع ساختمان</TableHead>");
    expect(M2_SRC).not.toContain("valueSoftClass(r.buildingTypeName)");
  });

  test("ب-۶-پ) (ن۰۶۴/گام ۶) فیلتر «نوع ملک» چیپی در هر دو فهرست است", () => {
    expect(M1_SRC).toContain('id="arm-listing-property-types-filter"');
    expect(M1_SRC).toContain('params.append("propertyType", t)');
    expect(M2_SRC).toContain('id="arm-request-property-types-filter"');
    expect(M2_SRC).toContain('params.append("propertyType", t)');
  });

  test("ب-۷) رجیستری رنگ: هر ۱۱ جهت رنگ یکتا دارند (قانون عدم تکرار تک‌رنگ در ستون)", async () => {
    const { valueSoftClass } = await import("@/lib/value-colors");
    const sides = ["شمال", "جنوب", "شرق", "غرب", "شمال غربی", "شمال شرقی", "جنوب غربی", "جنوب شرقی", "شمالی-جنوبی", "شرقی-غربی", "سه‌در"];
    const colors = sides.map((s) => valueSoftClass(s));
    expect(new Set(colors).size).toBe(sides.length);
    // فوریت و انواع ساخت هم یکتا درون ستون خود
    expect(valueSoftClass("فوری")).not.toBe(valueSoftClass("عادی"));
    const constructs = ["شخصی", "مجتمع", "برج"];
    expect(new Set(constructs.map((c) => valueSoftClass(c))).size).toBe(constructs.length);
  });

  test("ب-۸) جلسهٔ ۰۳۳ (ثانیاً/الف): ستون سند M2 رنگی — پنج مقدار واقعی DB از رجیستری + سلول Badge-دار", async () => {
    const { valueSoftClass, hasDistinctColors } = await import("@/lib/value-colors");
    // پنج مقدار واقعی DB (کشف زنده از ۳۵هزار ردیف)؛ golname = قولنامه با املاای مبدأ ⇒ هم‌رنگ معنایی
    const sanads = ["شش‌دانگ", "در دست اقدام", "قراردادی", "قولنامه", "golname"];
    for (const s of sanads) expect(valueSoftClass(s)).toMatch(/bg-\w+-\d+\/\d+ /);
    // چهار سند معنایی متمایز — رنگ تکراری ممنوع (قانون مالک)
    expect(hasDistinctColors(["شش‌دانگ", "در دست اقدام", "قراردادی", "قولنامه"])).toBe(true);
    // golname هم‌رنگ قولنامه (هم‌معنا — الگوی «دفتر کار/دفترکار»)
    expect(valueSoftClass("golname")).toBe(valueSoftClass("قولنامه"));
    // سلول سند در M2 با Badge رنگی رندر می‌شود (نه متن ساده)
    expect(M2_SRC).toMatch(/parseNameList\(r\.sanadNames\)[\s\S]{0,200}valueSoftClass\(name\)/);
  });
});

/* ==========================================================================
 * §ج۱ — M3 فهرست معاملات: ستون‌های تازه + شاهکار شرایط مالی
 * ========================================================================== */

describe("PN-020 §ج۱ — M3: پنج ستون تازه + تجزیهٔ شرایط مالی قرارداد", () => {
  test("ج۱-۱) پنج سرستون تازه در فهرست معاملات", () => {
    for (const h of ["عنوان ملک", "شرایط پرداخت", "تاریخ سند", "وضعیت معامله", "حق‌الزحمه"]) {
      expect(M3_SRC).toContain(`>${h}</TableHead>`);
    }
    // ستون‌های اصلی دستورهای قبلی سر جایشان
    for (const h of ["تاریخ معامله", "کد ملک", "فروشنده", "کد درخواست", "خریدار", "نوع قرارداد", "قیمت", "تجمیع حق‌السهم مشاوران", "شماره هولوگرام", "فایل قرارداد"]) {
      expect(M3_SRC).toContain(h);
    }
  });

  test("ج۱-۲) تجزیهٔ rawInfoJson واقعی — پرداخت‌های نقدی با مبلغ/تاریخ/شماره پیگیری + چک + مبالغ جانبی", async () => {
    const { parseTxFinancialTerms } = await import("@/lib/melk-api/tx-enrichment");
    // عین شکل پاسخ خام trade-overviews/info (نمونهٔ واقعی DB — tx 6852ea7d + فیلدهای جانبی)
    const raw = JSON.stringify({
      _id: "6852ea7db81330057ca73da0",
      property: { _id: "p1", address: "شش متری پنجم پلاک 10", title: "فروش آپارتمان مسکونی 118 متری" },
      propertyCode: 35873,
      requestCode: 17283,
      contractType: { label: "مبایعه نامه", value: "mobayeName" },
      contractSanadDate: "2025-03-30T16:32:16.854Z",
      contractDate: "2025-01-20T16:31:24.643Z",
      contractPrice: "5870000000",
      comisionOfContract: 58700000,
      taxOfContract: 11740000,
      janebiPrice: 150000000,
      edariPrice: 12000000,
      serviceDong: 300000,
      status: "finished",
      buyerCashList: [
        { amount: 18000000, date: "2024-05-06T16:32:48.363Z", trackingNumber: "", key: 1 },
        { amount: 25000000, date: "2025-01-06T16:32:48.363Z", trackingNumber: "12345", key: 2 },
      ],
      sellerCashList: [
        { amount: 49000000, date: "2025-02-04T16:33:29.683Z", trackingNumber: "000000000", key: 1 },
      ],
      buyerChequeList: ["681c5cbf4315b73fb6089ae2", "681c5cbf4315b73fb6089ae3"],
      sellerChequeList: [],
    });
    const out = parseTxFinancialTerms(raw);
    expect(out.sanadDate).toBe("2025-03-30T16:32:16.854Z");
    expect(out.txStatus).toBe("finished");
    expect(out.comisionOfContract).toBe(58700000);
    expect(out.taxOfContract).toBe(11740000);
    expect(out.paymentTerms).not.toBeNull();
    expect(out.paymentTerms!.buyerCashCount).toBe(2);
    expect(out.paymentTerms!.buyerCashTotal).toBe(43000000);
    expect(out.paymentTerms!.sellerCashCount).toBe(1);
    expect(out.paymentTerms!.sellerCashTotal).toBe(49000000);
    expect(out.paymentTerms!.buyerChequeCount).toBe(2);
    expect(out.paymentTerms!.sellerChequeCount).toBe(0);
    expect(out.paymentSchedule).not.toBeNull();
    expect(out.paymentSchedule!.buyerCash[0].amount).toBe(18000000); // مرتب بر تاریخ (قدیمی‌ترین اول)
    expect(out.paymentSchedule!.buyerCash[1].trackingNumber).toBe("12345");
    expect(out.paymentSchedule!.janebiPrice).toBe(150000000);
    expect(out.paymentSchedule!.edariPrice).toBe(12000000);
    expect(out.paymentSchedule!.serviceDong).toBe(300000);
  });

  test("ج۱-۳) تجزیهٔ ایمن — JSON خراب/تهی/آرایه → همه-null بدون پرتاب", async () => {
    const { parseTxFinancialTerms } = await import("@/lib/melk-api/tx-enrichment");
    for (const bad of [null, undefined, "", "not-json{", "[]", '"string"', "123"]) {
      const out = parseTxFinancialTerms(bad as string | null);
      expect(out.sanadDate).toBeNull();
      expect(out.txStatus).toBeNull();
      expect(out.paymentTerms).toBeNull();
      expect(out.paymentSchedule).toBeNull();
    }
  });

  test("ج۱-۴) صادقانه بدون پرداخت — داده هست ولی هیچ قسطی ثبت نشده → paymentTerms=null", async () => {
    const { parseTxFinancialTerms } = await import("@/lib/melk-api/tx-enrichment");
    const out = parseTxFinancialTerms(JSON.stringify({ contractSanadDate: "2025-01-01T00:00:00Z", status: "finished", buyerCashList: [], sellerCashList: [], buyerChequeList: [], sellerChequeList: [] }));
    expect(out.sanadDate).toBe("2025-01-01T00:00:00Z");
    expect(out.txStatus).toBe("finished");
    expect(out.paymentTerms).toBeNull();
    expect(out.paymentSchedule).toBeNull();
  });

  test("ج۱-۵) پرداخت صفرریال نادیده گرفته می‌شود (مقادیر صفر مولد نیستند)", async () => {
    const { parseTxFinancialTerms } = await import("@/lib/melk-api/tx-enrichment");
    const out = parseTxFinancialTerms(JSON.stringify({ buyerCashList: [{ amount: 0, date: "2025-01-01T00:00:00Z" }] }));
    expect(out.paymentTerms).toBeNull();
  });

  test("ج۱-۶) برچسب فارسی وضعیت معامله — نگاشت واژگان مبدأ + ناشناخته عین خام", async () => {
    const { txStatusLabel } = await import("@/lib/melk-api/tx-enrichment");
    expect(txStatusLabel("finished")).toBe("تکمیل شده");
    expect(txStatusLabel("rescission")).toBe("فسخ شده");
    expect(txStatusLabel("deletedByFinance")).toBe("حذف شده توسط مالی");
    expect(txStatusLabel("waitingForAddRealtors")).toBe("در انتظار افزودن مشاور");
    expect(txStatusLabel("preDefined")).toBe("پیش‌نویس");
    expect(txStatusLabel("NOT_FOUND_AT_SOURCE")).toBe("در مبدأ یافت نشد");
    expect(txStatusLabel("حالت-ناشناخته")).toBe("حالت-ناشناخته"); // هیچ اختراعی نیست
    expect(txStatusLabel(null)).toBeNull();
  });

  test("ج۱-۷) غنی‌سازی ردیف کامل — فیلدهای تازه روی خروجی enrichTransactionRows می‌نشینند", async () => {
    const { enrichTransactionRows } = await import("@/lib/melk-api/tx-enrichment");
    const raw = JSON.stringify({
      property: { title: "فروش آپارتمان ۱۱۰ متری", address: "خیابان X" },
      contractSanadDate: "2025-03-30T16:32:16.854Z",
      status: "finished",
      comisionOfContract: 50000000,
      taxOfContract: 10000000,
      serviceDong: 300000,
      buyerCashList: [{ amount: 10000000, date: "2025-01-01T00:00:00Z", trackingNumber: "1" }],
    });
    const rows = enrichTransactionRows(
      [
        {
          id: "tx-a", contractDate: new Date("2025-01-01T00:00:00Z"), propertyCode: "35873",
          propertyCustomer: null, requestCode: "17283", requestCustomer: null, contractHolo: "H1",
          suggestedPropertyCount: 1, eventsCount: 1,
        },
      ],
      {
        owners: [], requesters: [], contracts: [], agencies: [],
        txInfo: [
          {
            txId: "tx-a", contractType: "مبایعه نامه", contractPrice: 5870000000,
            buyerName: "فاطمه ولی پور", buyerMobile: "09141112233",
            sellerName: "اقا خلیلی", sellerMobile: "09142223344",
            realtorSharesJson: null, propertyTitle: "فروش آپارتمان ۱۱۰ متری", propertyAddress: "خیابان X",
            status: "finished", documentDate: null, deliveryDate: null,
            rawInfoJson: raw, comisionOfContract: 50000000, taxOfContract: 10000000,
          },
        ],
      }
    );
    const r = rows[0];
    expect(r.propertyTitle).toBe("فروش آپارتمان ۱۱۰ متری");
    expect(r.propertyAddress).toBe("خیابان X");
    expect(r.txStatus).toBe("finished");
    expect(r.sanadDate).toBe("2025-03-30T16:32:16.854Z");
    expect(r.comisionOfContract).toBe(50000000);
    expect(r.taxOfContract).toBe(10000000);
    expect(r.paymentTerms!.buyerCashCount).toBe(1);
    expect(r.paymentTerms!.buyerCashTotal).toBe(10000000);
    expect(r.paymentSchedule!.serviceDong).toBe(300000);
    // خودِ پاسخ خام هرگز در ردیف خروجی نمی‌نشیند (قانون دادهٔ مقدس + بار سبک)
    expect((r as Record<string, unknown>).rawInfoJson).toBeUndefined();
  });

  test("ج۱-۸) سند قرارداد — بخش شاهکار «شرایط مالی و تعهدات» + تاریخ سند/وضعیت در جدول مشخصات", () => {
    expect(M3_DOC_SRC).toContain("شرایط مالی و تعهدات قرارداد");
    expect(M3_DOC_SRC).toContain("PaymentSideTable");
    expect(M3_DOC_SRC).toContain("پرداخت‌های خریدار");
    expect(M3_DOC_SRC).toContain("پرداخت‌های فروشنده");
    expect(M3_DOC_SRC).toContain("قیمت جنبی");
    expect(M3_DOC_SRC).toContain("دنگ خدمات");
    expect(M3_DOC_SRC).toContain("تاریخ سند");
    expect(M3_DOC_SRC).toContain("وضعیت معامله");
  });
});

/* ==========================================================================
 * §ج۲ — ریشه‌یابی ۵۰۴: ensureSeeded غیرمسدود + بارگذاری خودکار
 * ========================================================================== */

describe("PN-020 §ج۲ — ریشه‌یابی ۵۰۴ و ترمیم‌های ساختاری", () => {
  test("ج۲-۱) هر پنج روت GET فهرست‌ها از حالت background استفاده می‌کنند (صفر اجرای سنک درونِ درخواست)", () => {
    for (const route of ["finance", "meta", "customer-club", "contracts", "transactions"]) {
      const src = readFileSync(`${SRC}/app/api/crm/${route}/route.ts`, "utf8");
      expect(src).toContain("ensureSeeded(guard.armTokens?.accessToken, { background: true })");
    }
  });

  test("ج۲-۲) ensureSeeded با پرچم background فوری برمی‌گردد (seedPending=true) و سنک در پس‌زمینه است", async () => {
    const { ensureSeeded, isArmSyncInFlight } = await import("@/lib/melk-api/sync");
    // کش خالی (عین الگوی تست HOTFIX-05 — سایر تست‌ها دادهٔ خودشان را می‌کارند)
    await db.transactionRecord.deleteMany({});
    await db.expertRecord.deleteMany({});

    const originalFetch = globalThis.fetch;
    // شبیه‌ساز ARM با تأخیر ۸۰ms — اگر مسیر مسدود بود، پاسخ ≥۸۰ms می‌شد
    globalThis.fetch = (async () => {
      await new Promise((r) => setTimeout(r, 80));
      return new Response(JSON.stringify({ data: [], message: "ok" }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    try {
      const t0 = Date.now();
      const res = await ensureSeeded("pn020-bg-token", { background: true });
      const elapsed = Date.now() - t0;
      // پاسخ فوری — بسیار کوتاه‌تر از تأخیر شبیه‌ساز (صفر مهلت دروازهٔ ۶۰-۹۰ث)
      expect(elapsed).toBeLessThan(70);
      expect(res.seedPending).toBe(true);
      expect(res.transactions).toBe(0);
      // کار در پس‌زمینه آغاز شده و با پایان آن، صف همه‌جا سبز می‌شود
      for (let i = 0; i < 100 && isArmSyncInFlight(); i++) {
        await new Promise((r) => setTimeout(r, 40));
      }
      expect(isArmSyncInFlight()).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("ج۲-۳) بارگذاری خودکار فهرست پس از پایان سنک — سیگنال از صفحهٔ کاشی به تب", () => {
    expect(M3_PAGE_SRC).toContain("syncDoneSignal");
    expect(M3_PAGE_SRC).toMatch(/setSyncDoneSignal\(\(n\) => n \+ 1\)/);
    expect(M3_SRC).toContain("syncDoneSignal");
    expect(M3_SRC).toMatch(/void reloadRef\.current\(\)/);
  });

  test("ج۲-۴) مسیر همگام قدیمی ensureSeeded (بدون پرچم) دست‌نخورده است — تست‌های HOTFIX-05 سپرش می‌کنند", async () => {
    const src = readFileSync(`${SRC}/lib/melk-api/sync.ts`, "utf8");
    expect(src).toContain("opts: { background?: boolean } = {}");
    expect(src).toContain("void syncWithRefresh(armToken, \"\").catch(() => undefined)");
    // مستند ریشه‌یابی در سورس
    expect(src).toContain("PN-020/گام اول-ج۲ — ریشه‌یابی خطای ۵۰۴");
  });
});
