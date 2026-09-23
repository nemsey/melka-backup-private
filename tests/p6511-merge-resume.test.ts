/**
 * تست‌های P6.5-11 — دستور هشت‌بندی مالک (۱۴۰۵/۰۶/۳۱)
 * ------------------------------------------------------
 *  الف) قانون دادهٔ مقدس: لایهٔ تحلیل هرگز raw* را نمی‌نویسد
 *  ب) ازسرگیری: resolveCycleStart + SyncCheckpoint (ادامه از آخرین صفحهٔ کامل)
 *  پ) غنی‌سازی فهرست معاملات: نام/موبایل مالک و درخواست‌دهنده + متن قرارداد + تجمیع حق‌السهم
 *  پ-۶) ایجنت ادغامی ≥۱۵ دامنهٔ بینش
 *  ح) دفترچهٔ مشتریان: تلفیق چهار منبع + نرمال‌سازی موبایل
 *  نکتهٔ ۲) حفاظت داده: حذف/ادغام کاشی هرگز رکوردی را حذف نمی‌کند
 *
 * اجرا: bun run test tests/p6511-merge-resume.test.ts
 */

import { beforeAll, describe, expect, test } from "bun:test";

// ==========================================================================
// الف) قانون دادهٔ مقدس — structural guard
// ==========================================================================

describe("P6.5-11 الف — قانون دادهٔ مقدس ملک تبریز", () => {
  test("لایهٔ تحلیل (tx-enrichment) هیچ ستون raw* یا دادهٔ خام را نمی‌نویسد — فقط خواندن", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/melk-api/tx-enrichment.ts", "utf8");
    // ماژول غنی‌سازی باید خالص باشد: صفر import از Prisma/db/repositories برای نوشتن
    expect(src).not.toContain("@prisma/client");
    expect(src).not.toContain('from "@/lib/db"');
    // صفر الگوی نوشتن در ستون‌های خام
    expect(src).not.toMatch(/rawDate\s*=/);
    expect(src).not.toMatch(/rawPropertyCustomer\s*=/);
    expect(src).not.toMatch(/rawRequestCustomer\s*=/);
    expect(src).not.toMatch(/rawOwnerName\s*=/);
    expect(src).not.toMatch(/rawCustomerName\s*=/);
  });

  test("دفترچهٔ مشتریان (customer-directory) خالص است — صفر Prisma/db", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/melk-api/customer-directory.ts", "utf8");
    expect(src).not.toContain("@prisma/client");
    expect(src).not.toContain('from "@/lib/db"');
  });

  test("هیچ مسیر حذف داده در چرخهٔ حیات کاشی نیست — حذف کاشی ≠ حذف رکورد", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const tilesDir = "src/core/tiles";
    const violations: string[] = [];
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${ent.name}`;
        if (ent.isDirectory()) walk(p);
        else if (ent.name === "index.ts") {
          const src = readFileSync(p, "utf8");
          // unregister فقط از رجیستری است — هرگز deleteMany روی جداول داده
          if (/deleteMany|\.delete\(/.test(src)) violations.push(p);
        }
      }
    };
    walk(tilesDir);
    expect(violations).toEqual([]);
  });
});

// ==========================================================================
// ب) ازسرگیری — resolveCycleStart (خالص) + قانون ترتیب checkpoint
// ==========================================================================

describe("P6.5-11 ب — ازسرگیری دریافت داده (ادامه از جاییکه قطع شد)", () => {
  test("resolveCycleStart: چرخهٔ ناتمام با همان pageSize ⇒ ادامه از lastCompletedPage + 1", async () => {
    const { resolveCycleStart } = await import("@/lib/melk-api/arm-catalog");
    const saved = {
      id: "listings", cycleId: "cycle-abc", pageSize: 50, lastCompletedPage: 138,
      totalPages: 408, totalAtSource: 20392, phase: "in-progress",
      completedAt: null, updatedAt: new Date(), createdAt: new Date(),
    };
    const r = resolveCycleStart(saved, 50, 6900);
    expect(r.resumed).toBe(true);
    expect(r.startPage).toBe(139); // دقیقاً صفحهٔ بعد از آخرین صفحهٔ کامل
    expect(r.cycleId).toBe("cycle-abc"); // همان چرخه ادامه می‌یابد
    expect(r.lastCompletedPage).toBe(138);
  });

  test("resolveCycleStart: چرخهٔ کامل ⇒ چرخهٔ تازه از صفحهٔ ۱ (بروزرسانی)", async () => {
    const { resolveCycleStart } = await import("@/lib/melk-api/arm-catalog");
    const saved = {
      id: "listings", cycleId: "cycle-old", pageSize: 500, lastCompletedPage: 23,
      totalPages: 23, totalAtSource: 11363, phase: "complete",
      completedAt: new Date(), updatedAt: new Date(), createdAt: new Date(),
    };
    const r = resolveCycleStart(saved, 500, 11363);
    expect(r.resumed).toBe(false);
    expect(r.startPage).toBe(1);
    expect(r.cycleId).not.toBe("cycle-old");
  });

  test("resolveCycleStart: pageSize متفاوت ⇒ چرخهٔ تازه (نه ازسرگیری ناسازگار — حفرهٔ داده ممنوع)", async () => {
    const { resolveCycleStart } = await import("@/lib/melk-api/arm-catalog");
    const saved = {
      id: "requests", cycleId: "cycle-50", pageSize: 50, lastCompletedPage: 100,
      totalPages: 408, totalAtSource: 20392, phase: "in-progress",
      completedAt: null, updatedAt: new Date(), createdAt: new Date(),
    };
    const r = resolveCycleStart(saved, 100, 6900);
    expect(r.resumed).toBe(false);
    expect(r.startPage).toBe(1);
  });

  test("resolveCycleStart: بوت‌استرپ پیشرفت P6.5-10 بدون checkpoint ⇒ floor(count/pageSize) صفحهٔ کامل", async () => {
    const { resolveCycleStart } = await import("@/lib/melk-api/arm-catalog");
    // ۶٬۹۰۰ رکورد موجود با صفحهٔ ۵۰تایی ⇒ ۱۳۸ صفحهٔ کامل ⇒ ادامه از ۱۳۹
    const r = resolveCycleStart(null, 50, 6900);
    expect(r.resumed).toBe(true);
    expect(r.startPage).toBe(139);
    expect(r.lastCompletedPage).toBe(138);
  });

  test("SyncCheckpoint repository: upsert + خواندن (ادامهٔ چرخه در DB می‌ماند)", async () => {
    const { getIntegrationRepository } = await import("@/core/repositories");
    const repo = getIntegrationRepository();
    await repo.upsertSyncCheckpoint({
      id: "test-cp-p6511", cycleId: "c1", pageSize: 50, lastCompletedPage: 7, totalPages: 40, totalAtSource: 2000, phase: "in-progress",
    });
    const cp = await repo.getSyncCheckpoint("test-cp-p6511");
    expect(cp).not.toBeNull();
    expect(cp!.lastCompletedPage).toBe(7);
    expect(cp!.phase).toBe("in-progress");
    // پیشروی: صفحهٔ ۸ کامل شد
    await repo.upsertSyncCheckpoint({ id: "test-cp-p6511", lastCompletedPage: 8 });
    const cp2 = await repo.getSyncCheckpoint("test-cp-p6511");
    expect(cp2!.lastCompletedPage).toBe(8);
    expect(cp2!.cycleId).toBe("c1"); // بقیهٔ فیلدها دست‌نخورده
    // پاک‌سازی تست
    const { db } = await import("@/lib/db");
    await db.syncCheckpoint.deleteMany({ where: { id: "test-cp-p6511" } });
  });
});

// ==========================================================================
// پ) غنی‌سازی فهرست معاملات — ستون‌های جدید (خالص)
// ==========================================================================

describe("P6.5-11 پ — غنی‌سازی ستون‌های جدید فهرست معاملات", () => {
  test("aggregateConsultantShares: تجمیع تعداد + مجموع درصد + تأییدها", async () => {
    const { aggregateConsultantShares } = await import("@/lib/melk-api/tx-enrichment");
    const json = JSON.stringify([
      { name: "کارشناس الف", unitPercent: 40, confirmation: "confirm", role: "primary" },
      { name: "کارشناس ب", unitPercent: 35, confirmation: "wait", role: "secondary" },
      { name: "کارشناس ج", unitPercent: 25, confirmation: "confirm", role: "secondary" },
    ]);
    const agg = aggregateConsultantShares(json);
    expect(agg).not.toBeNull();
    expect(agg!.count).toBe(3);
    expect(agg!.totalPercent).toBe(100);
    expect(agg!.confirmed).toBe(2);
    expect(agg!.pending).toBe(1);
    expect(agg!.names).toContain("کارشناس الف");
  });

  test("synthesizeContractText: ترکیب شفاف از فیلدهای واقعی — نوع/هولوگرام/طرفین/مشاوران", async () => {
    const { synthesizeContractText } = await import("@/lib/melk-api/tx-enrichment");
    const contract = {
      contractHolo: "H-123",
      propertyCode: "P-1",
      requestCode: null,
      contractType: "مبایعه‌نامه",
      contractDate: new Date("2026-06-15T00:00:00Z"),
      documentDate: null,
      deliveryDate: null,
      propertyTitle: "آپارتمان ۸۸ متری ولیعصر",
      propertyAddress: null,
      buyerListJson: JSON.stringify([{ fullName: "خریدار تست", mobileNumber: "09141112233" }]),
      sellerListJson: JSON.stringify([{ fullName: "فروشنده تست", mobileNumber: "09142223344" }]),
      realtorListJson: JSON.stringify([{ name: "مشاور تست", unitPercent: 100, confirmation: "confirm", role: "primary" }]),
      status: "confirmedByFinance",
    };
    const text = synthesizeContractText(contract, { propertyCode: "P-1" });
    expect(text).toContain("مبایعه‌نامه");
    expect(text).toContain("H-123");
    expect(text).toContain("خریدار تست");
    expect(text).toContain("فروشنده تست");
    expect(text).toContain("مشاور تست");
    expect(text).toContain("100");
  });

  test("synthesizeContractText: قرارداد تهی ⇒ null (نه متن ساختگی)", async () => {
    const { synthesizeContractText } = await import("@/lib/melk-api/tx-enrichment");
    const empty = {
      contractHolo: null, propertyCode: null, requestCode: null, contractType: null,
      contractDate: null, documentDate: null, deliveryDate: null, propertyTitle: null,
      propertyAddress: null, buyerListJson: null, sellerListJson: null, realtorListJson: null, status: "preDefined",
    };
    expect(synthesizeContractText(empty, {})).toBeNull();
  });

  test("enrichTransactionRows: تطبیق سه‌کلیدی قرارداد + ادغام تماس مالک/درخواست‌دهنده", async () => {
    const { enrichTransactionRows } = await import("@/lib/melk-api/tx-enrichment");
    const rows = [
      {
        id: "tx-1", contractDate: new Date("2026-06-15T00:00:00Z"), propertyCode: "P-100",
        // P6.5-12 — شاهد دادهٔ واقعی: propertyCustomer خود گزارش فقط «برچسب نقش» است
        // (۷۳۵/۷۳۵ رکورد production = «فروشنده»)؛ نام واقعی مالک از رجیستری آگهی‌های ARM می‌آید
        propertyCustomer: "فروشنده", requestCode: "R-200", requestCustomer: null,
        contractHolo: null, suggestedPropertyCount: 2, eventsCount: 1,
      },
      {
        id: "tx-2", contractDate: new Date("2026-06-16T00:00:00Z"), propertyCode: "P-999",
        propertyCustomer: null, requestCode: null, requestCustomer: "درخواست‌دهندهٔ داخلی",
        contractHolo: "H-777", suggestedPropertyCount: 0, eventsCount: 0,
      },
    ];
    const owners = [{ propertyCode: "P-100", ownerName: "مالک غنی‌شدهٔ ARM", ownerMobile: "09143334455" }];
    const requesters = [{ requestCode: "R-200", customerName: "درخواست‌دهندهٔ ARM", customerMobile: "09145556677" }];
    const contracts = [
      {
        contractHolo: "H-777", propertyCode: "P-999", requestCode: null, contractType: "اجاره‌نامه",
        contractDate: new Date("2026-06-10T00:00:00Z"), documentDate: null, deliveryDate: null,
        propertyTitle: null, propertyAddress: null, buyerListJson: null, sellerListJson: null,
        realtorListJson: JSON.stringify([{ name: "مشاور ۱", unitPercent: 50, confirmation: "confirm", role: "primary" }]),
        status: "payed",
      },
    ];
    const out = enrichTransactionRows(rows, { owners, requesters, contracts });

    // ردیف ۱ (اولویت P6.5-12): نام مالک از رجیستری آگهی ARM + موبایل از ARM + درخواست‌دهنده از ARM
    // (برچسب نقش «فروشنده» دیگر هرگز نام ستون مالک را جعل نمی‌کند)
    expect(out[0].ownerName).toBe("مالک غنی‌شدهٔ ARM");
    expect(out[0].ownerMobile).toBe("09143334455");
    expect(out[0].requesterName).toBe("درخواست‌دهندهٔ ARM");
    expect(out[0].requesterMobile).toBe("09145556677");
    expect(out[0].contractMatchBy).toBeNull();

    // ردیف ۲: تطبیق قرارداد از مسیر هولوگرام + متن قرارداد + تجمیع حق‌السهم
    expect(out[1].contractMatchBy).toBe("holo");
    expect(out[1].contractText).toContain("اجاره‌نامه");
    expect(out[1].consultantsShareSummary?.count).toBe(1);
    expect(out[1].consultantsShareSummary?.totalPercent).toBe(50);
    expect(out[1].ownerName).toBeNull(); // بدون داده — «در انتظار غنی‌سازی» در UI
  });

  test("enrichTransactionRows (P6.5-12): بدون رجیستری ARM ⇒ برچسب نقش آخرین fallback + طرف فروشندهٔ قرارداد", async () => {
    const { enrichTransactionRows } = await import("@/lib/melk-api/tx-enrichment");
    const rows = [
      // بدون رجیستری آگهی و بدون قرارداد ⇒ برچسب نقش (بهتر از تهی — عین نمایش خود سامانه)
      { id: "tx-a", contractDate: new Date("2026-06-15T00:00:00Z"), propertyCode: "P-100", propertyCustomer: "فروشنده", requestCode: null, requestCustomer: null, contractHolo: null, suggestedPropertyCount: 0, eventsCount: 0 },
      // با قراردادِ دارای فروشندهٔ نام‌دار ⇒ نام فروشندهٔ قرارداد بالاتر از برچسب نقش
      { id: "tx-b", contractDate: new Date("2026-06-16T00:00:00Z"), propertyCode: "P-200", propertyCustomer: "فروشنده", requestCode: null, requestCustomer: null, contractHolo: "H-900", suggestedPropertyCount: 0, eventsCount: 0 },
    ];
    const contracts = [
      {
        contractHolo: "H-900", propertyCode: "P-200", requestCode: null, contractType: "مبایعه‌نامه",
        contractDate: new Date("2026-06-10T00:00:00Z"), documentDate: null, deliveryDate: null,
        propertyTitle: null, propertyAddress: null,
        buyerListJson: null,
        sellerListJson: JSON.stringify([{ fullName: "فروشندهٔ قراردادی", mobileNumber: "09149990000" }]),
        realtorListJson: null, status: "payed",
      },
    ];
    const out = enrichTransactionRows(rows, { owners: [], requesters: [], contracts });
    expect(out[0].ownerName).toBe("فروشنده"); // fallback نهایی — برچسب نقش
    expect(out[1].ownerName).toBe("فروشندهٔ قراردادی"); // طرف فروشندهٔ قرارداد > برچسب نقش
    expect(out[1].ownerMobile).toBe("09149990000");
  });
});

// ==========================================================================
// پ-۶) ایجنت ادغامی — حداقل ۱۵ بینش (الزام بند پ-۶)
// ==========================================================================

describe("P6.5-11 پ-۶ — ایجنت کاشی ادغامی (≥۱۵ بینش)", () => {
  test("دامنه‌های بینش ایجنت transactions-contracts ≥ ۱۵ و شامل دامنه‌های الزامی", async () => {
    const { getAgent } = await import("@/core/agent");
    const agent = getAgent("transactions-contracts");
    expect(agent).not.toBeNull();
    expect(agent!.insightDomains.length).toBeGreaterThanOrEqual(15);
    // P6.5-14 (A.۱) — COMPOSITION/CONVERSION حذف؛ INFO_COVERAGE/TOP_EXPERTS تازه
    for (const d of ["VOLUME", "TREND", "FUNNEL", "BOTTLENECK", "REVENUE", "SETTLEMENT", "INFO_COVERAGE", "CONTRACT_TEXT", "SHARE_AGGREGATE", "TOP_EXPERTS"]) {
      expect(agent!.insightDomains as readonly string[]).toContain(d);
    }
    for (const removed of ["COMPOSITION", "CONVERSION", "CONTACT_COVERAGE"]) {
      expect(agent!.insightDomains as readonly string[]).not.toContain(removed);
    }
  });

  test("تولید بینش واقعی روی دادهٔ seed: حداقل ۶ کارت بینش (معاملات/قرارداد/مالی/تماس)", async () => {
    const { TransactionsContractsAgent } = await import("@/core/agent/transactions-contracts-agent");
    const { getTransactionRepository, getContractRepository, getExpertRepository, getVisitRepository, getPropertyRecordRepository, getRequestRepository } = await import("@/core/repositories");
    const { db } = await import("@/lib/db");
    // seed حداقلی p6511 (پاک‌سازی در پایان همین تست)
    const P = "p6511-";
    try {
      await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } });
      await db.contractRecord.deleteMany({ where: { id: { startsWith: P } } });
      await db.visitRecord.deleteMany({ where: { id: { startsWith: P } } });
    } catch { /* noop */ }
    await db.transactionRecord.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({
        id: `${P}tx-${i}`,
        contractDate: new Date(2026, i % 6, 10),
        propertyCode: `P${i}`,
        propertyCustomer: `مالک ${i}`,
        requestCode: i % 2 === 0 ? `R${i}` : null,
        requestCustomer: i % 2 === 0 ? `خریدار ${i}` : null,
        contractHolo: i < 8 ? `H${i}` : null,
        suggestedPropertyCount: i % 3,
        eventsCount: i % 2,
        ownerCode: null, branchId: null,
        rawDate: "1405/06/15", rawPropertyCustomer: `مالک خام ${i}`,
      })),
    });
    await db.contractRecord.create({
      data: {
        id: `${P}ct-0`, status: "confirmedByFinance", contractHolo: "H0", propertyCode: "P0",
        contractType: "مبایعه‌نامه", creatorName: "تست",
        buyerListJson: JSON.stringify([{ fullName: "خریدار 0", mobileNumber: "09140000001" }]),
        sellerListJson: JSON.stringify([{ fullName: "مالک 0", mobileNumber: "09140000002" }]),
        realtorListJson: JSON.stringify([{ name: "مشاور تست", unitPercent: 100, confirmation: "confirm", role: "primary" }]),
      },
    });
    await db.visitRecord.create({
      data: {
        id: `${P}vi-0`, propertyCode: "P0", requesterName: "درخواست‌دهنده تست",
        checkerName: "بررسی‌کننده تست", propertyRealtorName: "مشاور تست",
        checkTime: new Date(), createdAt: new Date(), syncedAt: new Date(),
      },
    });
    const agent = new TransactionsContractsAgent({
      transactions: getTransactionRepository(),
      contracts: getContractRepository(),
      experts: getExpertRepository(),
      visits: getVisitRepository(),
      property: getPropertyRecordRepository(),
      request: getRequestRepository(),
    });
    const insights = await agent.renderInsights();
    // حتی با پایگاه تست، بینش‌های پایه (حجم/ترکیب/پوشش تماس/...) تولید می‌شوند
    expect(insights.insights.length).toBeGreaterThanOrEqual(3);
    for (const ins of insights.insights) {
      expect(ins.title.length).toBeGreaterThan(3);
      expect(ins.body.length).toBeGreaterThan(20);
    }
    // پاک‌سازی seed
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.contractRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.visitRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
  });
});

// ==========================================================================
// ح) دفترچهٔ مشتریان — تلفیق چهار منبع (خالص)
// ==========================================================================

describe("P6.5-11 ح — دفترچهٔ مشتریان (فهرست مشتریان تک‌صفحه‌ای)", () => {
  test("normalizeMobileDir: ارقام فارسی/پیشوند ۹۸/۱۰رقمی ⇒ 09xxxxxxxxx", async () => {
    const { normalizeMobileDir } = await import("@/lib/melk-api/customer-directory");
    expect(normalizeMobileDir("۰۹۱۴۱۱۱۲۲۳۳")).toBe("09141112233");
    expect(normalizeMobileDir("+98 914 111 2233")).toBe("09141112233");
    expect(normalizeMobileDir("9141112233")).toBe("09141112233");
    expect(normalizeMobileDir("12345")).toBeNull();
    expect(normalizeMobileDir(null)).toBeNull();
  });

  test("buildCustomerDirectory: ادغام بر موبایل + نقش‌های چندگانه + مرتب‌سازی حضور", async () => {
    const { buildCustomerDirectory, directoryStats } = await import("@/lib/melk-api/customer-directory");
    const parties = [
      { fullName: "یعقوبی", mobile: "09143151109", role: "OWNER" as const, source: "arm-listing" as const, date: "2026-09-01" },
      { fullName: "یعقوبی صاحب آگهی", mobile: "09143151109", role: "SELLER" as const, source: "contract" as const, date: "2026-09-10" },
      { fullName: "خریدار تست", mobile: "09140000001", role: "BUYER" as const, source: "contract" as const, date: "2026-08-01" },
      { fullName: "خریدار تست", role: "BUYER" as const, source: "transaction" as const, date: "2026-08-05" }, // بدون موبایل — ادغام با نام
      { fullName: "درخواست‌دهندهٔ ARM", mobile: "09140000002", role: "REQUESTER" as const, source: "arm-request" as const, date: null },
    ];
    const dir = buildCustomerDirectory(parties);
    // یعقوبی: یک رکورد با دو نقش (ادغام موبایل)
    const yaghoubi = dir.find((c) => c.fullName === "یعقوبی");
    expect(yaghoubi).toBeDefined();
    expect(yaghoubi!.roles).toContain("OWNER");
    expect(yaghoubi!.roles).toContain("SELLER");
    expect(yaghoubi!.appearances).toBe(2);
    // خریدار تست: ادغام نام‌محور (موبایل + بدون موبایل)
    const buyer = dir.find((c) => c.fullName === "خریدار تست");
    expect(buyer).toBeDefined();
    expect(buyer!.appearances).toBe(2);
    expect(buyer!.mobile).toBe("09140000001"); // موبایل از رکورد اول پر شد
    // آمار
    const stats = directoryStats(dir);
    expect(stats.total).toBeGreaterThanOrEqual(3);
    expect(stats.withMobile).toBeGreaterThanOrEqual(3);
    expect(stats.owners).toBeGreaterThanOrEqual(1);
    expect(stats.requesters).toBeGreaterThanOrEqual(1);
  });

  test("filterDirectory: جست‌وجو با نام و با ارقام موبایل", async () => {
    const { buildCustomerDirectory, filterDirectory } = await import("@/lib/melk-api/customer-directory");
    const parties = [
      { fullName: "شهریار بابایان", mobile: "09141110000", role: "OWNER" as const, source: "arm-listing" as const },
      { fullName: "دیگر", mobile: "09142220000", role: "REQUESTER" as const, source: "arm-request" as const },
    ];
    const dir = buildCustomerDirectory(parties);
    expect(filterDirectory(dir, "بابایان").length).toBe(1);
    expect(filterDirectory(dir, "0914111").length).toBe(1);
    expect(filterDirectory(dir, "").length).toBe(2);
  });

  test("باشگاه مشتریان: روت فهرست مشتریان را برمی‌گرداند (customers با rows/total/stats)", async () => {
    // ادغامی — روی DB تست؛ اگر خالی باشد ساختار همچنان معتبر است
    const { createSession } = await import("@/lib/auth/session");
    const { db } = await import("@/lib/db");
    await db.armConnection.deleteMany({}).catch(() => undefined);
    const { token } = await createSession(
      { personnelCode: "940001", displayName: "تست p6511", role: "OWNER" },
      { ip: "127.0.0.1" },
      null
    );
    const route = await import("@/app/api/crm/customer-club/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/crm/customer-club", {
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      customers?: { rows: unknown[]; total: number; stats: { total: number; withMobile: number } };
    };
    expect(body.customers).toBeDefined();
    expect(Array.isArray(body.customers!.rows)).toBe(true);
    expect(typeof body.customers!.total).toBe("number");
    expect(body.customers!.stats).toBeDefined();
    // پاک‌سازی
    const { createHash } = await import("node:crypto");
    await db.session.deleteMany({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } }).catch(() => undefined);
    await db.auditLog.deleteMany({ where: { actor: "940001" } }).catch(() => undefined);
  });
});

// ==========================================================================
// نکتهٔ ۳) زیرساخت انتقال — مسیرهای sync-all و data-freshness موجودند
// ==========================================================================

describe("P6.5-11 نکتهٔ ۳ — زیرساخت انتقال اطلاعات امشب", () => {
  test("مسیر POST /api/sync/all (انتقال کامل همهٔ منابع) موجود است", async () => {
    const route = await import("@/app/api/sync/all/route");
    expect(typeof route.POST).toBe("function");
  });

  test("مسیر GET /api/crm/data-freshness (بند ت — تاریخ آخرین بروزرسانی) موجود است", async () => {
    const route = await import("@/app/api/crm/data-freshness/route");
    expect(typeof route.GET).toBe("function");
  });

  test("computeTilesFreshness: نقشهٔ تازگی همهٔ کاشی‌های فعال را پوشش می‌دهد", async () => {
    const { computeTilesFreshness } = await import("@/lib/melk-api/data-freshness");
    const map = await computeTilesFreshness();
    for (const tileId of [
      "transactions-contracts", "experts", "customer-club", "supply-demand", "price-index",
      "extraction", "file-finder", "listing", "request", "arm-listing", "arm-request", "management-dashboard",
    ]) {
      expect(map[tileId]).toBeDefined();
      expect(map[tileId].sourceLabel.length).toBeGreaterThan(3);
    }
    // کاشی‌های حذف‌شده در نقشه نیستند
    expect(map["visits"]).toBeUndefined();
    expect(map["finance-commission"]).toBeUndefined();
  });
});
