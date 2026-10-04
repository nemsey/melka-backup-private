/**
 * تست‌های P6.5-12 — همگام‌سازی بین‌سامانه‌ای (PM پرسنل + کارگزاری‌ها + داشبورد مالی ACC)
 * و «درستی درج اطلاعات هر ستون» (نکتهٔ بسیار مهم دستور مالک ۱۴۰۵/۰۷/۰۱)
 * ------------------------------------------------------
 * پوشش:
 *   A) pm-acc-sync: syncPmPersonnel (صفحه‌بندی ۳۰تایی + upsert-only + نگاشت فیلدها)
 *      · syncSpecialProperties (فهرست + جزئیات info + نرم‌شکست جزئیات)
 *      · fetchAccBestRealtor (businessId از قرارداد + پالایش ردیف‌های بی‌realtorId)
 *   B) expert-enrichment: pmCode بر اساس _id مشترک · موبایل پشتیبان از PM ·
 *      شمارش مبایعه/اجاره (انتساب گزارش + صورت‌وضعیت، قانون max نه جمع) ·
 *      بینش ۲۰ نفر برتر (topSale/topRent/coverage)
 *   C) tx-enrichment (P6.5-12): shares با درصد هر مشاور · contractType/contractAmount ·
 *      کارگزاری مرتبط بر اساس کد ملک
 *   D) قالب‌بندی مبلغ: جداکنندهٔ «،» عین نمونهٔ دستور + faAmountFull بدون خلاصه‌سازی
 *   E) قانون دادهٔ مقدس: rawJson عین منبع در هر دو رجیستری تازه
 *
 * سرور PM/ARM/ACC شبیه‌سازی می‌شود (عین الگوی phase65-sync-bugfix) — صفر شبکهٔ واقعی.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const { db } = await import("@/lib/db");
const { syncPmPersonnel, syncSpecialProperties, fetchAccBestRealtor } = await import("@/lib/melk-api/pm-acc-sync");
import type { PmPersonnelRow, SpecialPropertyRow } from "@/lib/melk-api/pm-acc-sync";
const { enrichExpertRows, buildTopExpertsInsight } = await import("@/lib/melk-api/expert-enrichment");
const { enrichTransactionRows } = await import("@/lib/melk-api/tx-enrichment");
const { faNumber, faAmountFull } = await import("@/lib/format");
const { MELK_ENDPOINTS } = await import("@/lib/melk-api/endpoints");

const T = "p6512t";
const realFetch = globalThis.fetch;

// ---------------------------------------------------------------------------
// شبیه‌ساز سرورهای PM / ARM / ACC — شکل پاسخ‌ها عین پروب زندهٔ ۱۴۰۵/۰۷/۰۱
// ---------------------------------------------------------------------------

function envelope(status: number, ok: boolean, message: string, data: unknown): Response {
  return new Response(
    JSON.stringify({ statusCode: status, status: ok, message, data }),
    { status, headers: { "content-type": "application/json" } }
  );
}
const OK = (data: unknown) => envelope(200, true, "ok", data);

/** پرسنل PM نمونه — ۳ کاربر با _id مشترک ARM + یک ردیف بی‌_id (باید صرف شود) */
const pmPersonnel: PmPersonnelRow[] = [
  { _id: `${T}-ex1`, code: "410000001", fullName: "کارشناس الف", mobileNumber: "09141110001", role: { title: "مشاور املاک", _id: "r1" }, businessId: { title: "ملک تبریز", code: "MT" }, activationStatus: { ps: true }, imageCover: "https://cdn.example/img1.jpg" },
  { _id: `${T}-ex2`, code: "410000002", fullName: "کارشناس ب", mobileNumber: "09141110002", role: { title: "مدیر شعبه", _id: "r2" }, businessId: { title: "ملک تبریز", code: "MT" } },
  { _id: `${T}-ex3`, code: 410000003, fullName: "کارشناس پ", mobileNumber: 9141110003, role: "مشاور" },
  { _id: "", code: "no-id", fullName: "ردیف بی‌شناسهٔ معتبر" },
];

/** کارگزاری‌های نمونه — یکی با جزئیات info موفق، یکی با info خطادار (نرم‌شکست) */
const spRows: SpecialPropertyRow[] = [
  {
    _id: `${T}-sp1`,
    realtor: { _id: `${T}-ex1`, fullName: "کارشناس الف" },
    creator: { _id: `${T}-ex2`, fullName: "کارشناس ب" },
    details: ["بند ۱ قرارداد", "بند ۲ قرارداد"],
    createdAt: "2026-06-10T00:00:00.000Z",
  },
  { _id: `${T}-sp2`, realtor: null, creator: null, details: undefined },
];

const spInfo = {
  realtor: { _id: `${T}-ex1`, fullName: "کارشناس الف" },
  creator: { _id: `${T}-ex2`, fullName: "کارشناس ب" },
  property: { _id: `${T}-prop1`, code: `${T}-P100` },
  payPercent: 35,
  sellPriceWithPercent: 19_300_000_000,
};

let spInfoFail = false;

beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^.*\/api\//, "");
    const q = url.searchParams;

    // ---- PM realtors/list (صفحه‌بندی ۳۰تایی) ----
    if (path.endsWith("realtors/list")) {
      const page = Number(q.get("page") ?? 1);
      const limit = Number(q.get("limit") ?? 30);
      if (limit > 30) return envelope(500, false, "PM server: big page timeout", null);
      const start = (page - 1) * limit;
      const slice = pmPersonnel.slice(start, start + limit);
      return OK({ count: pmPersonnel.length, limit, page, totalPages: Math.ceil(pmPersonnel.length / limit), list: slice });
    }

    // ---- ARM special-properties/list ----
    if (path.endsWith("special-properties/list")) {
      return OK({ count: spRows.length, limit: 30, page: 1, totalPages: 1, list: spRows });
    }

    // ---- ARM special-properties/info/:id ----
    if (path.includes("special-properties/info/")) {
      if (spInfoFail) return envelope(500, false, "server error", null);
      if (path.endsWith(`${T}-sp1`)) return OK(spInfo);
      return envelope(404, false, "not found", null);
    }

    // ---- ACC dashboard/bestRealtor ----
    if (path.endsWith("dashboard/bestRealtor")) {
      if (!q.get("business")) return envelope(400, false, "business required", null);
      return OK([
        { tradeOverviewsCount: 42, realtorId: `${T}-ex1`, realtorFullName: "کارشناس الف" },
        { tradeOverviewsCount: 7, realtorId: `${T}-ex2`, realtorFullName: "کارشناس ب" },
        { tradeOverviewsCount: 0, realtorId: null, realtorFullName: "بی‌شناسه" },
      ]);
    }

    return envelope(404, false, `unmocked: ${path}`, null);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

// ===========================================================================
// A) pm-acc-sync
// ===========================================================================
describe("P6.5-12 A — همگام‌سازی پرسنل PM", () => {
  test("syncPmPersonnel: صفحه‌بندی ۳۰تایی + upsert-only + نگاشت فیلدها + صرف ردیف بی‌_id", async () => {
    // اجرای اول — ایجاد
    const r1 = await syncPmPersonnel("pm-token");
    expect(r1.ok).toBe(true);
    expect(r1.personnel).toBe(3); // ردیف بی‌_id صرف شد

    const ex1 = await db.pmPersonnelRecord.findUnique({ where: { id: `${T}-ex1` } });
    expect(ex1?.code).toBe("410000001");
    expect(ex1?.fullName).toBe("کارشناس الف");
    expect(ex1?.mobileNumber).toBe("09141110001");
    expect(ex1?.roleTitle).toBe("مشاور املاک");
    expect(ex1?.businessTitle).toBe("ملک تبریز");
    expect(ex1?.imageCover).toContain("cdn.example");
    // قانون دادهٔ مقدس: rawJson عین منبع
    const raw = JSON.parse(ex1?.rawJson ?? "{}") as PmPersonnelRow;
    expect(raw._id).toBe(`${T}-ex1`);
    expect(raw.role).toEqual({ title: "مشاور املاک", _id: "r1" });

    // کد عددی هم رشته می‌شود (code: 410000003)
    const ex3 = await db.pmPersonnelRecord.findUnique({ where: { id: `${T}-ex3` } });
    expect(ex3?.code).toBe("410000003");
    expect(ex3?.mobileNumber).toBe("9141110003");

    // اجرای دوم — idempotent (تعداد ثابت؛ بدون تکرار)
    const r2 = await syncPmPersonnel("pm-token");
    expect(r2.personnel).toBe(3);
    expect(await db.pmPersonnelRecord.count({ where: { id: { startsWith: `${T}-` } } })).toBe(3);
  });
});

describe("P6.5-12 A — همگام‌سازی کارگزاری‌های ARM", () => {
  test("syncSpecialProperties: فهرست + جزئیات info + نگاشت ملک/درصد + نرم‌شکست جزئیات", async () => {
    const r = await syncSpecialProperties("arm-token");
    expect(r.ok).toBe(true);
    expect(r.total).toBe(2);
    expect(r.detailed).toBe(1); // sp1 با جزئیات؛ sp2 یافت نشد (404 قطعی → همان ردیف فهرست)

    const sp1 = await db.specialPropertyRecord.findUnique({ where: { id: `${T}-sp1` } });
    expect(sp1?.propertyCode).toBe(`${T}-P100`);
    expect(sp1?.payPercent).toBe(35);
    expect(sp1?.sellPrice).toBe(19_300_000_000);
    expect(sp1?.realtorName).toBe("کارشناس الف");
    expect(sp1?.creatorName).toBe("کارشناس ب");
    expect(JSON.parse(sp1?.detailsJson ?? "[]")).toEqual(["بند ۱ قرارداد", "بند ۲ قرارداد"]);

    // sp2: info = 404 قطعی ⇒ ردیف فهرست ذخیره شد (نرم — کل اجرا نشکست)
    const sp2 = await db.specialPropertyRecord.findUnique({ where: { id: `${T}-sp2` } });
    expect(sp2).not.toBeNull();
    expect(sp2?.propertyCode).toBeNull();

    // خطای ۵xx سرور info هم نرم است — اجرای مجدد با info خراب نباید کل sync را بشکند
    spInfoFail = true;
    const r2 = await syncSpecialProperties("arm-token");
    expect(r2.ok).toBe(true);
    expect(r2.total).toBe(2);
    spInfoFail = false;
  });
});

describe("P6.5-12 A — داشبورد مالی ACC", () => {
  test("fetchAccBestRealtor: businessId از قرارداد + پالایش بی‌realtorId + مرتب‌سازی نه — عین منبع", async () => {
    // seed قرارداد با businessId (منبع resolveBusinessId)
    await db.contractRecord.deleteMany({ where: { contractHolo: { startsWith: `${T}-` } } });
    await db.contractRecord.create({
      data: {
        id: `${T}-ct1`, contractHolo: `${T}-H1`, propertyCode: `${T}-P1`, requestCode: null,
        contractType: "مبایعه نامه", businessId: `${T}-biz-1`,
        buyerListJson: null, sellerListJson: null, realtorListJson: null, status: "payed",
      },
    });
    const best = await fetchAccBestRealtor("arm-token");
    expect(best.length).toBe(2); // ردیف بی‌realtorId صرف شد
    expect(best[0]?.realtorId).toBe(`${T}-ex1`);
    expect(best[0]?.tradeOverviewsCount).toBe(42);
  });

  test("مسیرهای endpooint عین پروب زندهٔ ۱۴۰۵/۰۷/۰۱", () => {
    expect(MELK_ENDPOINTS.pm.realtorsList).toBe("realtors/list");
    expect(MELK_ENDPOINTS.arm.specialPropertiesList).toBe("special-properties/list");
    expect(MELK_ENDPOINTS.arm.specialPropertyInfo("X")).toBe("special-properties/info/X");
    expect(MELK_ENDPOINTS.acc.bestRealtor).toBe("dashboard/bestRealtor");
  });
});

// ===========================================================================
// B) expert-enrichment
// ===========================================================================
describe("P6.5-12 B — غنی‌سازی کاشی کارشناسان", () => {
  beforeAll(async () => {
    // seed: درخواست با actorName (کارشناس درخواست) + آگهی با ownerName (کارشناس آگهی)
    await db.requestRecord.deleteMany({ where: { requestCode: { startsWith: `${T}-` } } });
    await db.propertyRecord.deleteMany({ where: { propertyCode: { startsWith: `${T}-` } } });
    await db.transactionRecord.deleteMany({ where: { propertyCode: { startsWith: `${T}-` } } });
    await db.requestRecord.create({
      data: { id: `${T}-req1`, source: "arm", requestCode: `${T}-R1`, actorCode: "410000001", actorName: "کارشناس الف", customerName: null, customerMobile: null },
    });
    await db.propertyRecord.create({
      data: { id: `${T}-prop1`, propertyCode: `${T}-P100`, ownerName: "کارشناس ب", title: "آگهی تست" },
    });
    // معاملهٔ گزارش تطابق: درخواست با کارشناس الف + آگهی با کارشناس ب
    await db.transactionRecord.create({
      data: { id: `${T}-tx1`, propertyCode: `${T}-P100`, requestCode: `${T}-R1`, contractHolo: null, contractDate: new Date() },
    });
    // قرارداد اجاره‌نامه با سهم «کارشناس الف» (35٪)
    await db.contractRecord.update({
      where: { id: `${T}-ct1` },
      data: { contractType: "اجاره نامه", realtorListJson: JSON.stringify([{ name: "کارشناس الف", unitPercent: 35, confirmation: "confirm", role: "primary" }]) },
    });
  });

  test("enrichExpertRows: pmCode بر اساس _id مشترک + موبایل پشتیبان از PM", async () => {
    const base = [
      { id: `${T}-ex1`, personnelCode: "ARM-1", fullName: "کارشناس الف", mobile: "09141110001", role: "مشاور", businessTitle: "ملک تبریز", creator: null, active: true, createdAt: new Date(), interactionTotal: 5 },
      { id: `${T}-ex2`, personnelCode: "ARM-2", fullName: "کارشناس ب", mobile: "—", role: "مشاور", businessTitle: "ملک تبریز", creator: null, active: true, createdAt: new Date(), interactionTotal: 0 },
      { id: `${T}-ex9`, personnelCode: "ARM-9", fullName: "بدون PM", mobile: "—", role: "مشاور", businessTitle: "", creator: null, active: true, createdAt: new Date(), interactionTotal: 0 },
    ];
    const { rows, attribution } = await enrichExpertRows(base, null);
    // کد پرسنلی از PM (_id مشترک)
    expect(rows[0]?.pmCode).toBe("410000001");
    expect(rows[1]?.pmCode).toBe("410000002");
    expect(rows[2]?.pmCode).toBeNull(); // در PM ثبت نشده
    // موبایل: ex1 از خود ARM؛ ex2 «—» ⇒ پشتیبان PM؛ ex9 بدون PM ⇒ «—»
    expect(rows[0]?.mobile).toBe("09141110001");
    expect(rows[1]?.mobile).toBe("09141110002");
    expect(rows[2]?.mobile).toBe("—");
    // شمارش: الف = گزارش تطابق (۱ فروش) + اجاره قرارداد (۱)؛ ب = گزارش تطابق (۱ فروش)
    expect(rows[0]?.saleCount).toBe(1);
    expect(rows[0]?.rentCount).toBe(1);
    expect(rows[1]?.saleCount).toBe(1);
    // شفافیت انتساب
    expect(attribution.salesTotal).toBeGreaterThanOrEqual(1);
    expect(attribution.salesAttributed).toBeGreaterThanOrEqual(1);
    // شاهد ACC (کل کسب‌وکار) — توکن null ⇒ بدون کش تازه
    expect(rows[0]?.accContractCount).toBeNull();
  });

  test("buildTopExpertsInsight: ۲۰ نفر برتر با کد پرسنلی + پوشش شفاف", async () => {
    const base = Array.from({ length: 25 }, (_, i) => ({
      id: `${T}-top${i}`, personnelCode: `ARM-${i}`, fullName: `کارشناس شماره ${i}`,
      mobile: "09140000000", role: "مشاور", businessTitle: "", creator: null, active: true,
      createdAt: new Date(), interactionTotal: 0,
    }));
    const { rows, attribution } = await enrichExpertRows(base, null);
    const insight = buildTopExpertsInsight(rows, attribution);
    expect(insight.topSale.length).toBeLessThanOrEqual(20);
    expect(insight.topRent.length).toBeLessThanOrEqual(20);
    expect(insight.coverage).toEqual({ salesTotal: attribution.salesTotal, salesAttributed: attribution.salesAttributed });
  });
});

// ===========================================================================
// C) tx-enrichment — ستون‌های تازهٔ P6.5-12
// ===========================================================================
describe("P6.5-12 C — ستون‌های تازهٔ فهرست معاملات (درستی درج اطلاعات هر ستون)", () => {
  test("shares با درصد هر مشاور + نوع/مبلغ قرارداد + کارگزاری بر اساس کد ملک", () => {
    const rows = [
      {
        id: `${T}-txE`, contractDate: new Date("2026-06-15T00:00:00Z"), propertyCode: `${T}-P100`,
        propertyCustomer: "فروشنده", requestCode: null, requestCustomer: null,
        contractHolo: `${T}-H1`, suggestedPropertyCount: 0, eventsCount: 0,
      },
    ];
    const contracts = [
      {
        contractHolo: `${T}-H1`, propertyCode: `${T}-P100`, requestCode: null, contractType: "مبایعه نامه",
        contractDate: new Date("2026-06-10T00:00:00Z"), documentDate: null, deliveryDate: null,
        propertyTitle: null, propertyAddress: null, buyerListJson: null, sellerListJson: null,
        realtorListJson: JSON.stringify([
          { name: "مشاور الف", unitPercent: 60, confirmation: "confirm", role: "primary" },
          { name: "مشاور ب", unitPercent: 40, confirmation: "pending", role: "" },
        ]),
        status: "payed",
        contractPrice: 19_300_000_000,
        rawContractPrice: "19300000000",
        comisionOfContract: 193_000_000,
        taxOfContract: 1_000_000,
      },
    ];
    const agencies = [
      { id: `${T}-sp2`, propertyCode: `${T}-P999`, propertyId: null, realtorName: "غیرمرتبط", creatorName: null, payPercent: null, sellPrice: null, detailsJson: null, createdAt: null },
      { id: `${T}-sp1`, propertyCode: `${T}-P100`, propertyId: `${T}-prop1`, realtorName: "کارشناس الف", creatorName: "کارشناس ب", payPercent: 35, sellPrice: 19_300_000_000, detailsJson: JSON.stringify(["بند ۱"]), createdAt: new Date("2026-06-01T00:00:00Z") },
    ];
    const out = enrichTransactionRows(rows, { owners: [], requesters: [], contracts, agencies });

    // سهم هر مشاور با درصد (بند ب: «در مقابل نام هر مشاور درصد حق السهم»)
    expect(out[0].consultantsShareSummary?.shares).toEqual([
      // P6547/گام سوم-۴ — شعبهٔ مشاور از سامانهٔ PM (بدون نقشه → null صادقانه)
      { name: "مشاور الف", branch: null, unitPercent: 60, confirmation: "confirm" },
      { name: "مشاور ب", branch: null, unitPercent: 40, confirmation: "pending" },
    ]);
    expect(out[0].consultantsShareSummary?.totalPercent).toBe(100);
    // نوع و مبلغ قرارداد از قرارداد تطبیقی
    expect(out[0].contractType).toBe("مبایعه نامه");
    expect(out[0].contractAmount).toBe(19_300_000_000);
    expect(out[0].contractMatchBy).toBe("holo");
    // کارگزاری مرتبط — همان کد ملک (نه ردیف دیگر)
    expect(out[0].agency?.id).toBe(`${T}-sp1`);
    expect(out[0].agency?.payPercent).toBe(35);
  });
});

// ===========================================================================
// D) قالب‌بندی مبلغ (نکتهٔ ۱ دستور — جداکنندهٔ «،» عین نمونه)
// ===========================================================================
describe("P6.5-12 D — قالب‌بندی مبالغ", () => {
  test("faNumber: جداکنندهٔ «،» (U+060C) عین نمونهٔ دستور: ۲۰۰،۰۰۰،۰۰۰،۰۰۰", () => {
    expect(faNumber(200_000_000_000)).toBe("۲۰۰،۰۰۰،۰۰۰،۰۰۰");
    expect(faNumber(19_300_000_000)).toBe("۱۹،۳۰۰،۰۰۰،۰۰۰");
    expect(faNumber(19_300_000_000)).not.toContain("٬"); // جداکنندهٔ قدیمی U+066C حذف شد
  });

  test("faAmountFull: تمام ارقام بدون خلاصه‌سازی + تهی ⇒ «—»", () => {
    expect(faAmountFull(19_300_000_000)).toBe("۱۹،۳۰۰،۰۰۰،۰۰۰ تومان");
    expect(faAmountFull(null)).toBe("—");
    expect(faAmountFull(undefined)).toBe("—");
    expect(faAmountFull(Number.NaN)).toBe("—");
    // واحد دلخواه
    expect(faAmountFull(5_000, " ریال")).toBe("۵،۰۰۰ ریال");
  });
});

// ===========================================================================
// پاک‌سازی seed تست
// ===========================================================================
afterAll(async () => {
  await db.pmPersonnelRecord.deleteMany({ where: { id: { startsWith: `${T}-` } } }).catch(() => undefined);
  await db.specialPropertyRecord.deleteMany({ where: { id: { startsWith: `${T}-` } } }).catch(() => undefined);
  await db.contractRecord.deleteMany({ where: { id: { startsWith: `${T}-` } } }).catch(() => undefined);
  await db.requestRecord.deleteMany({ where: { id: { startsWith: `${T}-` } } }).catch(() => undefined);
  await db.propertyRecord.deleteMany({ where: { id: { startsWith: `${T}-` } } }).catch(() => undefined);
  await db.transactionRecord.deleteMany({ where: { id: { startsWith: `${T}-` } } }).catch(() => undefined);
});
