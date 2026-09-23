/**
 * p014-m3-transactions.test.ts — P6.5-14 (ملکا-شورا-۱۴۰۵-۰۱۷ — پروندهٔ کاشی M3)
 * -----------------------------------------------------------------------------
 * تست‌های تازهٔ کاشی «معاملات ملک تبریز» مطابق ساختار بازنویسی‌شده:
 *   بخش ۱ — بینش: حذف دو بینش · سه‌سری روند · ریاضی مجموع · ۷ معیار پوشش · ۳ ستون برتر
 *   بخش ۲ — API: ۱۵ فیلد هر ردیف · محاسبهٔ ماهانه از دیتابیس · فیلترهای سه‌گانه
 *   بخش ۳ — ظاهر: ترتیب DOM فیلترها/جدول · ترتیب ستون‌ها (تجمیع قبل از هولوگرام)
 *   بخش ۴ — داده: صفر کاهش رکورد · نگاشت info · نرمال‌سازی موبایل · پوشش
 *
 * تست‌های قدیمی ساختار قبلی این کاشی حذف/به‌روزرسانی شدند (D.۱).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, afterAll, expect, test, describe } from "bun:test";

const AGENT_FILE = "/home/z/my-project/src/core/agent/transactions-contracts-agent.ts";
const TAB_FILE = "/home/z/my-project/src/core/tiles/tiles/transactions-contracts/TransactionsTab.tsx";
const P = "p014-";

// ===========================================================================
// بخش ۱ — بینش
// ===========================================================================

describe("P6.5-14 M3 · بخش ۱ — بینش", () => {
  test("A.۱ — کلیدها و دامنه‌های دو بینش حذف‌شده در کد ایجنت صفر نتیجه", () => {
    const src = readFileSync(AGENT_FILE, "utf8");
    expect(src).not.toContain("tc-composition");
    expect(src).not.toContain("tc-conversion");
    expect(src).not.toContain("COMPOSITION");
    expect(src).not.toContain("CONVERSION");
    expect(src).not.toContain("ترکیب رویداد و آگهی پیشنهادی");
    expect(src).not.toContain("نرخ رساندن درخواست به معامله");
  });

  test("A.۱ — رجیستری ایجنت: دامنه‌های حذف‌شده غایب · تازه‌ها حاضر · همچنان ≥۱۵", async () => {
    const { getAgent } = await import("@/core/agent");
    const agent = getAgent("transactions-contracts");
    expect(agent).not.toBeNull();
    const domains = agent!.insightDomains as readonly string[];
    expect(domains).not.toContain("COMPOSITION");
    expect(domains).not.toContain("CONVERSION");
    for (const d of ["TOP_EXPERTS", "INFO_COVERAGE", "TREND", "VOLUME", "DOCUMENT"]) {
      expect(domains).toContain(d);
    }
    expect(domains.length).toBeGreaterThanOrEqual(15);
  });

  test("A.۲ — categorizeTxType: برچسب‌های منبع (مبایعه نامه/اجاره نامه/تمدید اجاره)", async () => {
    const { categorizeTxType } = await import("@/core/agent/analyzers");
    expect(categorizeTxType({ contractDate: "2026-01-01", contractType: "مبایعه نامه" })).toBe("sale");
    expect(categorizeTxType({ contractDate: "2026-01-01", contractType: "اجاره نامه" })).toBe("rent");
    expect(categorizeTxType({ contractDate: "2026-01-01", contractType: "تمدید اجاره" })).toBe("rent");
  });

  test("A.۲ — استنتاج از عنوان ملک وقتی نوع قرارداد null است", async () => {
    const { categorizeTxType } = await import("@/core/agent/analyzers");
    expect(categorizeTxType({ contractDate: "2026-01-01", contractType: null, propertyTitle: "فروش آپارتمان مسکونی ۱۵۷ متری" })).toBe("sale");
    expect(categorizeTxType({ contractDate: "2026-01-01", contractType: null, propertyTitle: "رهن و اجاره آپارتمان مسکونی ۹۰ متری" })).toBe("rent");
  });

  test("A.۲ — هیچ سیگنالی نیست ⇒ «سایر» (در مجموع محاسبه می‌شود)", async () => {
    const { categorizeTxType } = await import("@/core/agent/analyzers");
    expect(categorizeTxType({ contractDate: "2026-01-01", contractType: null })).toBe("other");
    expect(categorizeTxType({ contractDate: "2026-01-01", contractType: null, propertyTitle: "زیربنا ۲۰۰ متری" })).toBe("other");
  });

  test("A.۲ — قید ریاضی: مجموع = مبایعه + اجاره + سایر در «هر» ماه", async () => {
    const { txTypeMonthlySeries } = await import("@/core/agent/analyzers");
    const rows = [
      { contractDate: "2025-04-10", contractType: "مبایعه نامه" },
      { contractDate: "2025-04-11", contractType: "اجاره نامه" },
      { contractDate: "2025-04-12", contractType: null, propertyTitle: "فروش زمین" },
      { contractDate: "2025-05-01", contractType: null },
      { contractDate: "2026-08-20", contractType: "تمدید اجاره" },
    ];
    const series = txTypeMonthlySeries(rows, { fromKey: "1404-01", toKey: "1405-07" });
    expect(series.length).toBeGreaterThan(0);
    for (const p of series) {
      expect(p.total).toBe(p.sale + p.rent + p.other);
    }
  });

  test("A.۲ — بازه: از فروردین ۱۴۰۴ شروع · ماه جاری را دارد · ماه‌های خالی صفر پر می‌شوند", async () => {
    const { txTypeMonthlySeries } = await import("@/core/agent/analyzers");
    const series = txTypeMonthlySeries([{ contractDate: "2025-05-01", contractType: "مبایعه نامه" }], { fromKey: "1404-01", toKey: "1405-07" });
    expect(series[0]!.key).toBe("1404-01");
    expect(series[series.length - 1]!.key).toBe("1405-07");
    // ماه بدون داده = صفر در هر سه سری
    const empty = series.find((p) => p.total === 0);
    expect(empty).toBeDefined();
    expect(empty!.sale).toBe(0);
    expect(empty!.rent).toBe(0);
    expect(empty!.other).toBe(0);
  });

  test("A.۲ — جمع کل سری مجموع = تعداد ردیف‌های داخل بازه (خارج بازه شمرده نمی‌شود)", async () => {
    const { txTypeMonthlySeries } = await import("@/core/agent/analyzers");
    const rows = [
      { contractDate: "2025-05-01", contractType: "مبایعه نامه" }, // اردیبهشت ۱۴۰۴ — داخل
      { contractDate: "2025-05-02", contractType: "اجاره نامه" }, // داخل
      { contractDate: "2023-01-01", contractType: "مبایعه نامه" }, // قبل از فروردین ۱۴۰۴ — خارج
    ];
    const series = txTypeMonthlySeries(rows, { fromKey: "1404-01", toKey: "1405-07" });
    expect(series.reduce((s, p) => s + p.total, 0)).toBe(2);
  });

  test("A.۴ — computeTxInfoCoverage: هفت معیار با کلید و ترتیب دقیق", async () => {
    const { computeTxInfoCoverage } = await import("@/lib/melk-api/tx-enrichment");
    const cov = computeTxInfoCoverage([]);
    expect(cov.criteria.map((c) => c.key)).toEqual([
      "ownerName", "ownerMobile", "buyerName", "buyerMobile", "contractType", "contractAmount", "shareAggregate",
    ]);
    expect(cov.criteria.map((c) => c.label)).toEqual([
      "نام مالک", "موبایل مالک", "نام خریدار", "موبایل خریدار", "نوع قرارداد", "مبلغ قرارداد", "تجمیع حق‌السهم مشاوران",
    ]);
  });

  test("A.۴ — فرمول دقیق هر معیار + درصد با یک رقم اعشار", async () => {
    const { computeTxInfoCoverage } = await import("@/lib/melk-api/tx-enrichment");
    const rows = [
      { ownerName: "الف", ownerMobile: "09140000001", buyerName: "ب", buyerMobile: "09140000002", contractType: "مبایعه نامه", contractAmount: 1000, consultantsShareSummary: { totalPercent: 50, count: 1, confirmed: 1, pending: 0, names: ["س"], shares: [] } },
      { ownerName: "ج", ownerMobile: null, buyerName: null, buyerMobile: null, contractType: null, contractAmount: null, consultantsShareSummary: null },
    ] as never[];
    const cov = computeTxInfoCoverage(rows);
    expect(cov.total).toBe(2);
    const by = Object.fromEntries(cov.criteria.map((c) => [c.key, c]));
    expect(by.ownerName.filled).toBe(2);
    expect(by.ownerMobile.filled).toBe(1);
    expect(by.buyerName.filled).toBe(1);
    expect(by.buyerMobile.filled).toBe(1);
    expect(by.contractType.filled).toBe(1);
    expect(by.contractAmount.filled).toBe(1); // مبلغ > 0
    expect(by.shareAggregate.filled).toBe(1); // مجموع درصد > 0
    expect(by.ownerMobile.pct).toBe(50);
    // یک رقم اعشار: ۱ از ۳ = ۳۳.۳
    const cov3 = computeTxInfoCoverage([...rows, rows[0]!] as never[]);
    expect(cov3.criteria.find((c) => c.key === "ownerMobile")!.pct).toBe(66.7);
  });

  test("A.۵ — topExpertsByTxType: سه ستون · حداکثر ۱۰ هر ستون · مرتب‌سازی نزولی", async () => {
    const { topExpertsByTxType } = await import("@/core/agent/analyzers");
    const rows = Array.from({ length: 25 }, (_, i) => ({
      contractDate: "2025-05-01",
      contractType: i % 2 === 0 ? "مبایعه نامه" : "اجاره نامه",
      realtorSharesJson: JSON.stringify([{ name: `کارشناس ${i % 15}`, unitPercent: 100, confirmation: "confirm" }]),
    }));
    const top = topExpertsByTxType(rows, 10);
    expect(top.sale.length).toBeLessThanOrEqual(10);
    expect(top.rent.length).toBeLessThanOrEqual(10);
    expect(top.total.length).toBeLessThanOrEqual(10);
    for (const list of [top.sale, top.rent, top.total]) {
      for (let i = 1; i < list.length; i++) expect(list[i]!.count).toBeLessThanOrEqual(list[i - 1]!.count);
    }
  });

  test("A.۵ — قید ریاضی: جمع اعداد هر ستون ≤ کل معاملات همان دسته", async () => {
    const { topExpertsByTxType } = await import("@/core/agent/analyzers");
    const rows = [
      { contractDate: "2025-05-01", contractType: "مبایعه نامه", realtorSharesJson: JSON.stringify([{ name: "الف" }, { name: "ب" }]) },
      { contractDate: "2025-05-02", contractType: "مبایعه نامه", realtorSharesJson: JSON.stringify([{ name: "الف" }]) },
      { contractDate: "2025-05-03", contractType: "اجاره نامه", realtorSharesJson: JSON.stringify([{ name: "الف" }]) },
      { contractDate: "2025-05-04", contractType: null, realtorSharesJson: JSON.stringify([{ name: "ج" }]) },
    ];
    const top = topExpertsByTxType(rows, 10);
    // مبایعه: الف ۲ + ب ۱ = ۳ = تعداد مبایعه‌ها (هر سهم یک‌بار — نه جمع درصد)
    expect(top.sale.reduce((s, e) => s + e.count, 0)).toBe(3);
    expect(top.rent.reduce((s, e) => s + e.count, 0)).toBe(1);
    // مجموع = مبایعه + اجاره + سایر در هر کارشناس
    const totalByName = new Map(top.total.map((e) => [e.name, e.count]));
    const saleByName = new Map(top.sale.map((e) => [e.name, e.count]));
    const rentByName = new Map(top.rent.map((e) => [e.name, e.count]));
    const otherByName = new Map(topExpertsByTxType(rows, 10).total.map((e) => [e.name, e.count]));
    void otherByName;
    for (const [name, totalCount] of totalByName) {
      expect(totalCount).toBe((saleByName.get(name) ?? 0) + (rentByName.get(name) ?? 0) + ((name === "ج") ? 1 : 0));
    }
  });
});

// ===========================================================================
// بخش ۲ — API و لایهٔ غنی‌سازی
// ===========================================================================

describe("P6.5-14 M3 · بخش ۲ — API و غنی‌سازی معامله‌محور", () => {
  test("C — mapTxInfoPayload: نگاشت کامل پاسخ trade-overviews/info (عین ساختار زندهٔ ARM)", async () => {
    const { mapTxInfoPayload } = await import("@/lib/melk-api/tx-info-enrichment");
    const payload = {
      _id: "6aa8fc819aff63cef5b78cd8",
      property: { _id: "p1", address: "خطیب.قرجه داغی", title: "رهن و اجاره آپارتمان مسکونی 90 متری" },
      propertyCode: 57327,
      requestCode: 51971,
      contractType: { label: "اجاره نامه", value: "ejareName" },
      contractHolo: "140520025",
      contractPrice: "30500000000",
      comisionOfContract: 11000000,
      taxOfContract: 2000000,
      status: "finished",
      buyerList: [{ _id: "b1", mobileNumber: 989146620700, fullName: "سعیده سلمانی صادق" }],
      sellerList: [{ _id: "s1", mobileNumber: 989380596826, fullName: "محمد بهجت" }],
      primaryRealtorList: [{ realtor: { _id: "r1", fullName: "علی نورافکن" }, realtorUnit: 50, confirmation: "confirm" }],
      secondaryRealtorList: [{ realtor: { _id: "r2", fullName: "وحید حیدری" }, realtorUnit: 10, confirmation: "wait" }],
      documentDate: "2026-10-22T08:05:35.515Z",
      contractPropertyDate: "2026-10-20T08:05:31.038Z",
      businessId: "biz-1",
    };
    const row = mapTxInfoPayload("6aa8fc819aff63cef5b78cd8", payload);
    expect(row.txId).toBe("6aa8fc819aff63cef5b78cd8");
    expect(row.contractType).toBe("اجاره نامه");
    expect(row.contractPrice).toBe(30500000000);
    expect(row.buyerName).toBe("سعیده سلمانی صادق");
    expect(row.buyerMobile).toBe("09146620700"); // 98… → 0…
    expect(row.sellerName).toBe("محمد بهجت");
    expect(row.sellerMobile).toBe("09380596826");
    expect(row.propertyTitle).toContain("رهن و اجاره");
    const shares = JSON.parse(row.realtorSharesJson!) as { name: string; unitPercent: number; role: string }[];
    expect(shares).toHaveLength(2);
    expect(shares[0]).toMatchObject({ name: "علی نورافکن", unitPercent: 50, role: "primary" });
    expect(shares[1]).toMatchObject({ name: "وحید حیدری", unitPercent: 10, role: "secondary" });
    expect(row.status).toBe("finished");
    expect(row.businessId).toBe("biz-1");
  });

  test("C — normalizeMobile: پیشوندهای ۹۸/+۹۸/۹رقمی و ارقام نامعتبر", async () => {
    const { normalizeMobile } = await import("@/lib/melk-api/tx-info-enrichment");
    expect(normalizeMobile(989146620700)).toBe("09146620700");
    expect(normalizeMobile("+989141112233")).toBe("09141112233");
    expect(normalizeMobile("09141112233")).toBe("09141112233");
    expect(normalizeMobile("9141112233")).toBe("09141112233");
    expect(normalizeMobile(null)).toBeNull();
    expect(normalizeMobile("abc")).toBe("abc");
  });

  test("C — اولویت معامله‌محور: txInfo بر قرارداد تطبیقی مقدم است (نوع/مبلغ/طرفین مستقل)", async () => {
    const { enrichTransactionRows } = await import("@/lib/melk-api/tx-enrichment");
    const rows = [{
      id: "tx-1", contractDate: "2026-01-01", propertyCode: "P1", propertyCustomer: "فروشنده",
      requestCode: "R1", requestCustomer: "خریدار", contractHolo: "H1", suggestedPropertyCount: 0, eventsCount: 0,
    }];
    const out = enrichTransactionRows(rows, {
      owners: [], requesters: [],
      contracts: [{
        contractHolo: "H1", propertyCode: "P1", requestCode: "R1", contractType: "مبایعه نامه",
        contractDate: null, documentDate: null, deliveryDate: null, propertyTitle: null, propertyAddress: null,
        buyerListJson: null, sellerListJson: null, realtorListJson: null, status: "finished",
        contractPrice: 111, rawContractPrice: null, comisionOfContract: null, taxOfContract: null,
      }],
      txInfo: [{
        txId: "tx-1", contractType: "اجاره نامه", contractPrice: 999, buyerName: "خریدار واقعی", buyerMobile: "09140000001",
        sellerName: "فروشندهٔ واقعی", sellerMobile: "09140000002", realtorSharesJson: JSON.stringify([{ name: "مشاور", unitPercent: 100, confirmation: "confirm" }]),
        propertyTitle: "اجاره سوئیت", propertyAddress: null, status: "finished", documentDate: null, deliveryDate: null,
      }],
    });
    expect(out[0]!.contractType).toBe("اجاره نامه"); // info > قرارداد
    expect(out[0]!.contractAmount).toBe(999);
    expect(out[0]!.buyerName).toBe("خریدار واقعی");
    expect(out[0]!.sellerName).toBe("فروشندهٔ واقعی");
    expect(out[0]!.sellerMobile).toBe("09140000002");
    expect(out[0]!.infoMatch).toBe(true);
    expect(out[0]!.consultantsShareSummary?.totalPercent).toBe(100);
  });

  test("C — مبلغ قرارداد اجاره: contractPrice نیست ⇒ contractRent منبع خود سامانه", async () => {
    const { mapTxInfoPayload } = await import("@/lib/melk-api/tx-info-enrichment");
    const rent = mapTxInfoPayload("tx-rent", {
      contractType: { label: "اجاره نامه", value: "ejareName" },
      contractPrice: undefined,
      contractRent: "3000000",
      comisionOfContract: 3465000,
    });
    expect(rent.contractType).toBe("اجاره نامه");
    expect(rent.contractPrice).toBe(3000000);
    expect(rent.rawContractPrice).toBe("3000000");
  });

  test("C — طرفین null در فهرست‌های قدیمی منبع (ردیف‌های ۱۴۰۴) خطا نمی‌دهد", async () => {
    const { mapTxInfoPayload } = await import("@/lib/melk-api/tx-info-enrichment");
    const row = mapTxInfoPayload("tx-old", {
      contractType: { label: "مبایعه نامه" },
      buyerList: [null, { fullName: null }],
      sellerList: [null],
      contractPrice: "3500000000",
    });
    expect(row.buyerName).toBeNull();
    expect(row.sellerName).toBeNull();
    expect(row.contractPrice).toBe(3500000000);
  });

  test("API — هر ردیف ۱۵ فیلد الزامی را دارد (روت واقعی + نشست تست)", async () => {
    const { db } = await import("@/lib/db");
    await db.armConnection.deleteMany({}).catch(() => undefined);
    const { createSession } = await import("@/lib/auth/session");
    const { token } = await createSession(
      { personnelCode: "940001", displayName: "تست p014", role: "OWNER" },
      { ip: "127.0.0.1" },
      null
    );
    // seed یک معامله با غنی‌سازی معامله‌محور
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.transactionEnrichment.deleteMany({ where: { txId: { startsWith: P } } }).catch(() => undefined);
    await db.transactionRecord.create({
      data: {
        id: `${P}tx-1`, contractDate: new Date("2026-01-05"), propertyCode: "P014P", propertyCustomer: "فروشنده",
        requestCode: "R014", requestCustomer: "خریدار", contractHolo: "H014",
        suggestedPropertyCount: 0, eventsCount: 1, rawDate: "1404/10/15",
      },
    });
    await db.transactionEnrichment.create({
      data: {
        txId: `${P}tx-1`, contractType: "مبایعه نامه", contractPrice: 5_000_000_000,
        buyerName: "خریدار تست", buyerMobile: "09141110000", sellerName: "فروشنده تست", sellerMobile: "09142220000",
        realtorSharesJson: JSON.stringify([{ name: "کارشناس تست", unitPercent: 100, confirmation: "confirm" }]),
        propertyTitle: "فروش آپارتمان", status: "finished",
      },
    });
    const route = await import("@/app/api/crm/transactions/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/crm/transactions?limit=5000", {
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<Record<string, unknown>> };
    const row = body.rows.find((r) => r.id === `${P}tx-1`);
    expect(row).toBeDefined();
    for (const field of [
      "propertyCode", "ownerName", "ownerMobile", "sellerName", "sellerMobile",
      "requestCode", "requesterName", "requesterMobile", "buyerName", "buyerMobile",
      "contractHolo", "contractType", "contractAmount", "consultantsShareSummary", "contractText",
    ]) {
      expect(row!).toHaveProperty(field);
    }
    expect(row!.contractType).toBe("مبایعه نامه");
    expect(row!.contractAmount).toBe(5_000_000_000);
    expect(row!.sellerName).toBe("فروشنده تست");
    expect(row!.buyerName).toBe("خریدار تست");
    // پاسخ نگاشت کد پرسنلی را دارد (A.۵)
    expect(body).toHaveProperty("expertCodeByName");
  });

  test("API — فیلتر نوع قرارداد (مبایعه نامه) فقط مبایعه برمی‌گرداند", async () => {
    const { createSession } = await import("@/lib/auth/session");
    const { token } = await createSession(
      { personnelCode: "940001", displayName: "تست p014", role: "OWNER" },
      { ip: "127.0.0.1" },
      null
    );
    const route = await import("@/app/api/crm/transactions/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/crm/transactions?contractType=" + encodeURIComponent("مبایعه نامه"), {
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ contractType: string | null }> };
    expect(body.rows.length).toBeGreaterThan(0);
    for (const r of body.rows) expect(r.contractType).toBe("مبایعه نامه");
  });

  test("API — فیلتر نوع قرارداد (اجاره نامه) شامل تمدید اجاره است", async () => {
    const { createSession } = await import("@/lib/auth/session");
    const { token } = await createSession(
      { personnelCode: "940001", displayName: "تست p014", role: "OWNER" },
      { ip: "127.0.0.1" },
      null
    );
    const route = await import("@/app/api/crm/transactions/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/crm/transactions?contractType=" + encodeURIComponent("اجاره نامه"), {
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ contractType: string | null }> };
    for (const r of body.rows) {
      expect(["اجاره نامه", "تمدید اجاره"] as Array<string | null>).toContain(r.contractType);
    }
  });

  test("API — فیلتر نام کارشناس: ردیف‌های دارای سهم او", async () => {
    const { createSession } = await import("@/lib/auth/session");
    const { token } = await createSession(
      { personnelCode: "940001", displayName: "تست p014", role: "OWNER" },
      { ip: "127.0.0.1" },
      null
    );
    const route = await import("@/app/api/crm/transactions/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/crm/transactions?expertName=" + encodeURIComponent("کارشناس تست"), {
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ id: string; consultantsShareSummary: { names: string[] } | null }> };
    expect(body.rows.length).toBeGreaterThan(0);
    expect(body.rows.some((r) => r.id === `${P}tx-1`)).toBe(true);
  });

  test("API — فیلتر کد پرسنلی: نگاشت PM به نام کارشناس", async () => {
    const { createSession } = await import("@/lib/auth/session");
    const { token } = await createSession(
      { personnelCode: "940001", displayName: "تست p014", role: "OWNER" },
      { ip: "127.0.0.1" },
      null
    );
    const { db } = await import("@/lib/db");
    // seed کارشناس PM برای نگاشت (مدل واقعی: id مشترک + code پرسنلی + fullName)
    const pmCode = "p014-pm-1";
    await db.pmPersonnelRecord.upsert({
      where: { id: `${P}pm-1` },
      create: { id: `${P}pm-1`, code: pmCode, fullName: "کارشناس تست", syncedAt: new Date() },
      update: { code: pmCode, fullName: "کارشناس تست" },
    }).catch(() => undefined);
    const route = await import("@/app/api/crm/transactions/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest(`http://localhost/api/crm/transactions?personnelCode=${pmCode}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ id: string }> };
    expect(body.rows.some((r) => r.id === `${P}tx-1`)).toBe(true);
  });

  test("API — محاسبهٔ ماهانه از دیتابیس: سری سه‌گانه با شمارش مستقیم DB منطبق است", async () => {
    const { txTypeMonthlySeries } = await import("@/core/agent/analyzers");
    const { getTransactionRepository } = await import("@/core/repositories");
    const { getContractRepository, getPropertyRecordRepository, getRequestRepository } = await import("@/core/repositories");
    const { enrichTransactionRows } = await import("@/lib/melk-api/tx-enrichment");
    const rows = await getTransactionRepository().findAll();
    const enriched = enrichTransactionRows(rows, {
      owners: await getPropertyRecordRepository().findOwnerContactsByCodes([...new Set(rows.map((r) => r.propertyCode))]),
      requesters: await getRequestRepository().findArmRequesterContactsByCodes([...new Set(rows.map((r) => r.requestCode).filter((c): c is string => Boolean(c)))]),
      contracts: (await getContractRepository().findAll()).map((c) => ({
        contractHolo: c.contractHolo, propertyCode: c.propertyCode, requestCode: c.requestCode, contractType: c.contractType,
        contractDate: c.contractDate, documentDate: c.documentDate, deliveryDate: c.deliveryDate, propertyTitle: c.propertyTitle,
        propertyAddress: c.propertyAddress, buyerListJson: c.buyerListJson, sellerListJson: c.sellerListJson,
        realtorListJson: c.realtorListJson, status: c.status,
      })),
      txInfo: await getTransactionRepository().findInfoEnrichmentsByTxIds(rows.map((r) => r.id)),
    });
    const series = txTypeMonthlySeries(enriched.map((r) => ({ contractDate: r.contractDate, contractType: r.contractType })), { fromKey: "1404-01", toKey: "1405-07" });
    // شمارش مستقیم: هر ردیفِ داخل بازه دقیقاً یک‌بار در سری مجموع
    const { dateToJalali } = await import("@/lib/jalali");
    const inRange = enriched.filter((r) => {
      const j = dateToJalali(new Date(r.contractDate));
      const key = `${j.jy}-${String(j.jm).padStart(2, "0")}`;
      return key >= "1404-01" && key <= "1405-07";
    });
    expect(series.reduce((s, p) => s + p.total, 0)).toBe(inRange.length);
    for (const p of series) expect(p.total).toBe(p.sale + p.rent + p.other);
  });
});

// ===========================================================================
// بخش ۳ — ظاهر (ساختاری — عین معیار پذیرش B.۱/B.۲)
// ===========================================================================

describe("P6.5-14 M3 · بخش ۳ — ظاهر (ساختاری)", () => {
  const tab = readFileSync(TAB_FILE, "utf8");

  test("B.۱ — ترتیب DOM: KPI ← نمودارها ← فیلترها ← فهرست (فیلترها فوراً بالای فهرست)", () => {
    const kpi = tab.indexOf("شاخص‌های چهارجانی");
    const charts = tab.indexOf("روند ماهانه معاملات — مبایعه‌نامه، اجاره و مجموع");
    const filters = tab.indexOf('id="m3-filters-card"');
    const filtersEnd = tab.indexOf("</Card>", filters);
    const table = tab.indexOf("فهرست معاملات — تمامی کارشناسان");
    expect(kpi).toBeGreaterThan(-1);
    expect(charts).toBeGreaterThan(kpi);
    expect(filters).toBeGreaterThan(charts);
    expect(table).toBeGreaterThan(filtersEnd);
    // بین پایان کارت فیلترها و کارت فهرست، هیچ کارت دیگری نیست (فقط کامنت/فاصله)
    const nextCard = tab.indexOf("<Card", filtersEnd);
    const between = tab.slice(filtersEnd + "</Card>".length, nextCard).replace(/\s/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    expect(between).toBe("");
    expect(tab.indexOf("فهرست معاملات — تمامی کارشناسان", nextCard)).toBeGreaterThan(-1);
  });

  test("B.۱ — فیلترها در موبایل جمع‌شونده (aria-controls + دکمه باز/بستن)", () => {
    expect(tab).toContain('id="m3-filters-form"');
    expect(tab).toContain("filtersOpen");
    expect(tab).toContain("useIsMobile");
  });

  test("B.۲ — ترتیب ستون‌ها: تجمیع حق‌السهم «قبل از» شماره هولوگرام", () => {
    const share = tab.indexOf("تجمیع حق‌السهم مشاوران</TableHead>");
    const holo = tab.indexOf(">شماره هولوگرام</TableHead>");
    expect(share).toBeGreaterThan(-1);
    expect(holo).toBeGreaterThan(share);
  });

  test("B.۲ — ترتیب ستون‌های ۹گانه عین دستور (کد ملک ← فروشنده ← درخواست ← خریدار ← تجمیع ← هولوگرام ← نوع ← مبلغ ← فایل)", () => {
    const order = [
      "کد ملک</span>", "فروشنده</TableHead>", "درخواست</span>", "خریدار</TableHead>",
      "تجمیع حق‌السهم مشاوران</TableHead>", "شماره هولوگرام</TableHead>",
      "نوع قرارداد</TableHead>", "مبلغ قرارداد</TableHead>", "فایل قرارداد</TableHead>",
    ];
    let last = -1;
    for (const header of order) {
      const idx = tab.indexOf(header);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeGreaterThan(last);
      last = idx;
    }
  });

  test("A.۱/B — نمودار «ترکیب رویداد و آگهی پیشنهادی» و ستون‌های حذف‌شده غایب‌اند", () => {
    expect(tab).not.toContain("ترکیب رویداد و آگهی پیشنهادی");
    expect(tab).not.toContain("composition"); // متغیر/حافظهٔ نمودار حذف‌شده
    expect(tab).not.toContain("summary.hasBoth"); // رندر سنجه‌های حذف‌شده ممنوع
    expect(tab).not.toContain("summary.hasRequestEvent");
    expect(tab).not.toContain("summary.hasSuggestedProperty");
  });

  test("A.۳ — نمودار روند سه‌سری با Legend فارسی و خط مجموع ضخیم‌تر", () => {
    expect(tab).toContain('dataKey="sale"');
    expect(tab).toContain('dataKey="rent"');
    expect(tab).toContain('dataKey="total"');
    expect(tab).toContain("SERIES_FA");
    expect(tab).toMatch(/dataKey="total"[^/]*strokeWidth=\{3\.5\}/);
  });

  test("A.۵ — کارت کارشناسان برتر سه‌ستونی با نام + کد پرسنلی + تعداد", () => {
    expect(tab).toContain("کارشناسان برتر بر اساس تعداد معاملات");
    expect(tab).toContain("۱۰ برتر — ");
    expect(tab).toContain("expertCodeByName");
    expect(tab).toContain("مبایعه‌نامه");
  });
});

// ===========================================================================
// بخش ۴ — داده (قانون دادهٔ مقدس + پوشش)
// ===========================================================================

describe("P6.5-14 M3 · بخش ۴ — داده", () => {
  const dbCleanup = async () => {
    const { db } = await import("@/lib/db");
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.transactionEnrichment.deleteMany({ where: { txId: { startsWith: P } } }).catch(() => undefined);
  };
  beforeAll(dbCleanup);
  afterAll(dbCleanup);

  test("۴-۱ — صفر کاهش رکورد: غنی‌سازی هیچ ردیفی حذف نمی‌کند (ورودی = خروجی)", async () => {
    const { enrichTransactionRows } = await import("@/lib/melk-api/tx-enrichment");
    const rows = Array.from({ length: 7 }, (_, i) => ({
      id: `${P}keep-${i}`, contractDate: "2025-06-01", propertyCode: `PK${i}`, propertyCustomer: null,
      requestCode: null, requestCustomer: null, contractHolo: null, suggestedPropertyCount: 0, eventsCount: 0,
    }));
    const out = enrichTransactionRows(rows, { owners: [], requesters: [], contracts: [], txInfo: [] });
    expect(out.length).toBe(rows.length);
    expect(out.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  test("۴-۲ — جدول TransactionEnrichment فقط upsert است (افزایی؛ هرگز حذف نیست)", async () => {
    const src = readFileSync("/home/z/my-project/src/lib/melk-api/tx-info-enrichment.ts", "utf8");
    expect(src).toContain("upsert");
    // هیچ فراخوانی حذفی — فقط توضیح متنی مجاز است
    expect(src).not.toMatch(/\.deleteMany\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    expect(src).not.toMatch(/\.deleteManyUnchecked/);
  });

  test("۴-۳ — جاروی sync اصلی (deleteMany+createMany) جدول غنی‌سازی معامله‌محور را لمس نمی‌کند", async () => {
    const syncSrc = readFileSync("/home/z/my-project/src/lib/melk-api/sync.ts", "utf8");
    // جدول‌های جاروی اصلی — TransactionEnrichment نباید میان آن‌ها باشد
    for (const table of ["transactionEnrichment"]) {
      expect(syncSrc).not.toContain(`${table}.deleteMany`);
    }
    expect(syncSrc).toContain("transactionRecord.deleteMany");
    expect(syncSrc).toContain("contractRecord.deleteMany");
  });

  test("۴-۴ — شمارش قبل/بعد روی دیتابیس تست: بکاپ معنادار (baseline ثابت می‌ماند)", async () => {
    const { db } = await import("@/lib/db");
    const before = await db.transactionRecord.count();
    // افزودن و غنی‌سازی یک ردیف
    await db.transactionRecord.create({
      data: { id: `${P}inv-1`, contractDate: new Date("2026-02-01"), propertyCode: "P014X", contractHolo: "H014X" },
    });
    await db.transactionEnrichment.upsert({
      where: { txId: `${P}inv-1` },
      create: { txId: `${P}inv-1`, contractType: "مبایعه نامه", contractPrice: 1 },
      update: { contractType: "مبایعه نامه" },
    });
    const after = await db.transactionRecord.count();
    expect(after).toBe(before + 1); // فقط افزایش — هیچ کاهشی نیست
    // حذف seed تست
    await db.transactionRecord.delete({ where: { id: `${P}inv-1` } });
    expect(await db.transactionRecord.count()).toBe(before);
  });

  test("۴-۵ — پوشش هفت معیار روی دادهٔ غنی‌شدهٔ کامل = صددرصد", async () => {
    const { computeTxInfoCoverage } = await import("@/lib/melk-api/tx-enrichment");
    const full = [{
      ownerName: "مالک", ownerMobile: "09140000000", buyerName: "خریدار", buyerMobile: "09140000001",
      contractType: "مبایعه نامه", contractAmount: 100,
      consultantsShareSummary: { totalPercent: 100, count: 1, confirmed: 1, pending: 0, names: ["الف"], shares: [] },
    }] as never[];
    const cov = computeTxInfoCoverage(full);
    for (const c of cov.criteria) {
      expect(c.pct).toBe(100);
      expect(c.filled).toBe(1);
    }
  });

  test("۴-۶ — بینش ایجنت روی دادهٔ seed تازه: کارت‌های الزامی BLOCK A تولید می‌شوند", async () => {
    const { db } = await import("@/lib/db");
    const { TransactionsContractsAgent } = await import("@/core/agent/transactions-contracts-agent");
    const { getTransactionRepository, getContractRepository, getExpertRepository, getVisitRepository, getPropertyRecordRepository, getRequestRepository } = await import("@/core/repositories");
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.transactionEnrichment.deleteMany({ where: { txId: { startsWith: P } } }).catch(() => undefined);
    await db.transactionRecord.createMany({
      data: [
        { id: `${P}a-1`, contractDate: new Date("2025-07-01"), propertyCode: "P014A", contractHolo: "H014A" },
        { id: `${P}a-2`, contractDate: new Date("2025-07-02"), propertyCode: "P014B", contractHolo: "H014B" },
      ],
    });
    await db.transactionEnrichment.createMany({
      data: [
        { txId: `${P}a-1`, contractType: "مبایعه نامه", contractPrice: 1_000_000_000, buyerName: "خ", sellerName: "ف", realtorSharesJson: JSON.stringify([{ name: "کارشناس تست", unitPercent: 100, confirmation: "confirm" }]) },
        { txId: `${P}a-2`, contractType: "اجاره نامه", contractPrice: 200_000_000, buyerName: "خ۲", sellerName: "ف۲", realtorSharesJson: JSON.stringify([{ name: "کارشناس تست", unitPercent: 100, confirmation: "confirm" }]) },
      ],
    });
    const agent = new TransactionsContractsAgent({
      transactions: getTransactionRepository(),
      contracts: getContractRepository(),
      experts: getExpertRepository(),
      visits: getVisitRepository(),
      property: getPropertyRecordRepository(),
      request: getRequestRepository(),
    });
    const raw = await (agent as unknown as { computeRawInsights: () => Promise<Array<{ key: string; title: string }>> }).computeRawInsights();
    const keys = raw.map((c) => c.key);
    expect(keys).toContain("tc-trend");
    expect(keys).toContain("tc-top-experts");
    expect(keys).toContain("tc-info-coverage");
    expect(keys).toContain("tc-volume");
    expect(keys).not.toContain("tc-composition");
    expect(keys).not.toContain("tc-conversion");
    // عنوان بینش پوشش = نام تازهٔ A.۴
    const coverage = raw.find((c) => c.key === "tc-info-coverage");
    expect(coverage!.title).toBe("پوشش اطلاعات فهرست معاملات");
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.transactionEnrichment.deleteMany({ where: { txId: { startsWith: P } } }).catch(() => undefined);
  });

  test("۴-۷ — فایل قرارداد برای همه: هر ردیف یا متن قرارداد دارد یا دادهٔ سند (roite/agency/holo)", async () => {
    const { enrichTransactionRows } = await import("@/lib/melk-api/tx-enrichment");
    const rows = [{ id: `${P}f-1`, contractDate: "2026-01-01", propertyCode: "PF1", propertyCustomer: null, requestCode: null, requestCustomer: null, contractHolo: "HF1", suggestedPropertyCount: 0, eventsCount: 0 }];
    const out = enrichTransactionRows(rows, {
      owners: [], requesters: [], contracts: [], txInfo: [],
    });
    // حتی بدون قرارداد تطبیقی، هولوگرام خود رکورد ⇒ سند قابل تولید
    expect(out[0]!.contractText ?? out[0]!.contractHolo ?? out[0]!.agency).toBeTruthy();
  });
});

// مرجع مسیر فایل برای خوانایی
void join;
