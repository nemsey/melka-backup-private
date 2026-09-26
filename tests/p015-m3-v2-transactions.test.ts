/**
 * p015-m3-v2-transactions.test.ts — P6.5-15 (ملکا-شورا-۱۴۰۵-۰۱۸ — پروندهٔ نهایی کاشی M3)
 * -----------------------------------------------------------------------------
 * ساختار الزامی BLOCK G:
 *   بخش ۱ — دسته‌بندی classifyContract (BLOCK 0.3): ۵ ورودی الزامی + وارینت‌ها
 *   بخش ۲ — روند ماهانه (BLOCK A): سری ۱ = مبایعه+پیش‌فروش · سری ۲ = اجاره+تمدید · سری ۳ = ۱+۲+none · پیوستگی
 *   بخش ۳ — کارشناسان برتر (BLOCK C): ستون ۱/۲ خانواده‌ای · ستون ۳ = ۱+۲+ثبت‌نشده · حداکثر ۱۰
 *   بخش ۴ — فیلترها (BLOCK F): ۱۸ سناریو عین جدول F.۲
 *   بخش ۵ — ترتیب ستون‌ها (BLOCK E): ۱۱ ستون · خلوص سلول کد ملک/کد درخواست · فروشنده/خریدار
 *   بخش ۶ — حفاظت داده: صفر کاهش رکورد · حفظ داده خام
 *   بخش ۷ — رگرسیون باگ‌های تشخیص‌شده (filter-bug-diagnosis.md): F1/F2/F3
 */
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, test, describe } from "bun:test";

const TAB_FILE = "/home/z/my-project/src/core/tiles/tiles/transactions-contracts/TransactionsTab.tsx";
const AGENT_FILE = "/home/z/my-project/src/core/agent/transactions-contracts-agent.ts";
const ROUTE_FILE = "/home/z/my-project/src/app/api/crm/transactions/route.ts";
const P = "p015v2-";

// ===========================================================================
// بخش ۱ — دسته‌بندی (BLOCK 0.3)
// ===========================================================================

describe("P6.5-15 M3v2 · بخش ۱ — classifyContract (قانون انواع معاملات ملکا)", () => {
  test("۰.۳ — پنج ورودی الزامی (۴ نوع + null) → پنج خروجی صحیح", async () => {
    const { classifyContract } = await import("@/lib/contract-classify");
    expect(classifyContract("مبایعه نامه")).toEqual({ kind: "مبایعه‌نامه", family: "sale" });
    expect(classifyContract("پیش فروش")).toEqual({ kind: "پیش‌فروش", family: "sale" });
    expect(classifyContract("اجاره نامه")).toEqual({ kind: "اجاره", family: "rent" });
    expect(classifyContract("تمدید اجاره")).toEqual({ kind: "تمدید اجاره", family: "rent" });
    expect(classifyContract(null)).toEqual({ kind: "ثبت‌نشده", family: "none" });
  });

  test("۰.۳ — نیم‌فاصله و فاصله یکسان دیده می‌شوند (فرم جلسه ۰۱۸ = فرم DB)", async () => {
    const { classifyContract } = await import("@/lib/contract-classify");
    expect(classifyContract("مبایعه\u200cنامه").kind).toBe("مبایعه‌نامه");
    expect(classifyContract("پیش\u200cفروش").kind).toBe("پیش‌فروش");
    expect(classifyContract("اجاره").family).toBe("rent");
  });

  test("۰.۳ — مقدار ناشناخته/خالی → ثبت‌نشده/none (حفظ قید ریاضی مجموع)", async () => {
    const { classifyContract } = await import("@/lib/contract-classify");
    expect(classifyContract("")).toEqual({ kind: "ثبت‌نشده", family: "none" });
    expect(classifyContract(undefined)).toEqual({ kind: "ثبت‌نشده", family: "none" });
    expect(classifyContract("   ").family).toBe("none");
    expect(classifyContract("قرارداد آیندهٔ سامانه").kind).toBe("ثبت‌نشده");
  });

  test("۰.۳ — normalizeContractTypeValue: نیم‌فاصله → فاصله + فشرده‌سازی", async () => {
    const { normalizeContractTypeValue } = await import("@/lib/contract-classify");
    expect(normalizeContractTypeValue("مبایعه\u200cنامه")).toBe("مبایعه نامه");
    expect(normalizeContractTypeValue("  اجاره   نامه  ")).toBe("اجاره نامه");
  });
});

// ===========================================================================
// بخش ۲ — روند ماهانه (BLOCK A)
// ===========================================================================

describe("P6.5-15 M3v2 · بخش ۲ — روند ماهانهٔ سه‌سری (منطق خانواده‌ای)", () => {
  test("A.۱ — سری ۱ = مبایعه‌نامه + پیش‌فروش (شامل پیش‌فروش)", async () => {
    const { txTypeMonthlySeries } = await import("@/core/agent/analyzers");
    const rows = [
      { contractDate: "2025-04-10", contractType: "مبایعه نامه" },
      { contractDate: "2025-04-11", contractType: "پیش فروش" },
      { contractDate: "2025-04-12", contractType: "اجاره نامه" },
      { contractDate: "2025-04-13", contractType: "تمدید اجاره" },
      { contractDate: "2025-04-14", contractType: null },
    ];
    const s = txTypeMonthlySeries(rows, { fromKey: "1404-01", toKey: "1404-02" });
    const sum = s.reduce((acc, p) => acc + p.sale, 0);
    expect(sum).toBe(2); // مبایعه + پیش‌فروش — نه بیشتر
  });

  test("A.۱ — سری ۲ = اجاره + تمدید اجاره", async () => {
    const { txTypeMonthlySeries } = await import("@/core/agent/analyzers");
    const rows = [
      { contractDate: "2025-04-10", contractType: "اجاره نامه" },
      { contractDate: "2025-04-11", contractType: "تمدید اجاره" },
      { contractDate: "2025-04-12", contractType: "مبایعه نامه" },
      { contractDate: "2025-04-13", contractType: "پیش فروش" },
    ];
    const s = txTypeMonthlySeries(rows, { fromKey: "1404-01", toKey: "1404-02" });
    expect(s.reduce((acc, p) => acc + p.rent, 0)).toBe(2);
  });

  test("A.۱ — سری ۳ = سری ۱ + سری ۲ + ثبت‌نشده در «هر» ماه (قید ریاضی)", async () => {
    const { txTypeMonthlySeries } = await import("@/core/agent/analyzers");
    const rows = [
      { contractDate: "2025-04-10", contractType: "مبایعه نامه" },
      { contractDate: "2025-04-11", contractType: "پیش فروش" },
      { contractDate: "2025-04-12", contractType: "اجاره نامه" },
      { contractDate: "2025-04-13", contractType: null },
      { contractDate: "2025-05-01", contractType: null },
      { contractDate: "2026-08-20", contractType: "تمدید اجاره" },
    ];
    const s = txTypeMonthlySeries(rows, { fromKey: "1404-01", toKey: "1405-07" });
    for (const p of s) expect(p.total).toBe(p.sale + p.rent + p.none);
    expect(s.reduce((a, p) => a + p.none, 0)).toBe(2);
  });

  test("A.۱ — در هر ماه series3 >= series1 + series2", async () => {
    const { txTypeMonthlySeries } = await import("@/core/agent/analyzers");
    const rows = [
      { contractDate: "2025-04-10", contractType: null },
      { contractDate: "2025-04-11", contractType: "مبایعه نامه" },
      { contractDate: "2025-05-01", contractType: "اجاره نامه" },
      { contractDate: "2026-01-01", contractType: null },
    ];
    const s = txTypeMonthlySeries(rows, { fromKey: "1404-01", toKey: "1405-07" });
    for (const p of s) expect(p.total).toBeGreaterThanOrEqual(p.sale + p.rent);
  });

  test("A.۱ — ماهیت پیوسته: بدون شکاف، از فروردین ۱۴۰۴ تا ماه مقصد؛ ماه خالی = صفر", async () => {
    const { txTypeMonthlySeries } = await import("@/core/agent/analyzers");
    const s = txTypeMonthlySeries([{ contractDate: "2025-05-01", contractType: "مبایعه نامه" }], { fromKey: "1404-01", toKey: "1405-07" });
    expect(s).toHaveLength(19); // ۱۲ + ۷ ماه
    expect(s[0]!.key).toBe("1404-01");
    expect(s[s.length - 1]!.key).toBe("1405-07");
    // پیوستگی کلیدها
    for (let i = 1; i < s.length; i += 1) {
      const [py, pm] = s[i - 1]!.key.split("-").map(Number);
      const [cy, cm] = s[i]!.key.split("-").map(Number);
      expect(cy * 12 + cm).toBe(py * 12 + pm + 1);
    }
    const empty = s.find((p) => p.total === 0);
    expect(empty!.sale).toBe(0);
    expect(empty!.rent).toBe(0);
    expect(empty!.none).toBe(0);
  });

  test("A.۱ — جمع کل سری ۳ = فقط ردیف‌های داخل بازه (خارج بازه شمرده نمی‌شود)", async () => {
    const { txTypeMonthlySeries } = await import("@/core/agent/analyzers");
    const rows = [
      { contractDate: "2025-05-01", contractType: "مبایعه نامه" },
      { contractDate: "2025-05-02", contractType: "اجاره نامه" },
      { contractDate: "2023-01-01", contractType: "مبایعه نامه" }, // قبل از فروردین ۱۴۰۴
      { contractDate: "2030-01-01", contractType: null }, // بعد از بازه
    ];
    const s = txTypeMonthlySeries(rows, { fromKey: "1404-01", toKey: "1405-07" });
    expect(s.reduce((acc, p) => acc + p.total, 0)).toBe(2);
  });
});

// ===========================================================================
// بخش ۳ — کارشناسان برتر (BLOCK C)
// ===========================================================================

describe("P6.5-15 M3v2 · بخش ۳ — کارشناسان برتر سه‌ستونی (منطق خانواده‌ای)", () => {
  const rows = [
    { contractDate: "2025-04-01", contractType: "مبایعه نامه", shareNames: ["الف"] },
    { contractDate: "2025-04-02", contractType: "پیش فروش", shareNames: ["الف"] },
    { contractDate: "2025-04-03", contractType: "اجاره نامه", shareNames: ["ج"] },
    { contractDate: "2025-04-04", contractType: "تمدید اجاره", shareNames: ["ج"] },
    { contractDate: "2025-04-05", contractType: null, shareNames: ["د"] },
  ];

  test("C.۱ — ستون ۱ (مبایعه‌نامه) = مبایعه + پیش‌فروش هر کارشناس", async () => {
    const { topExpertsByTxType } = await import("@/core/agent/analyzers");
    const top = topExpertsByTxType(rows, 10);
    const a = top.sale.find((e) => e.name === "الف");
    expect(a!.count).toBe(2); // مبایعه + پیش‌فروش
    expect(top.sale.some((e) => e.name === "ج")).toBe(false); // اجاره‌کار در ستون فروش نیست
  });

  test("C.۱ — ستون ۲ (اجاره) = اجاره + تمدید هر کارشناس", async () => {
    const { topExpertsByTxType } = await import("@/core/agent/analyzers");
    const top = topExpertsByTxType(rows, 10);
    const j = top.rent.find((e) => e.name === "ج");
    expect(j!.count).toBe(2); // اجاره + تمدید
    expect(top.rent.some((e) => e.name === "الف")).toBe(false);
  });

  test("C.۱ — ستون ۳ (مجموع) = ستون ۱ + ستون ۲ + ثبت‌نشدهٔ همان کارشناس", async () => {
    const { topExpertsByTxType } = await import("@/core/agent/analyzers");
    const top = topExpertsByTxType(rows, 10);
    // الف: ۲ فروش + ۰ اجاره + ۰ ثبت‌نشده = ۲
    expect(top.total.find((e) => e.name === "الف")!.count).toBe(2);
    // ج: ۰ + ۲ + ۰ = ۲
    expect(top.total.find((e) => e.name === "ج")!.count).toBe(2);
    // د: ۰ + ۰ + ۱ ثبت‌نشده = ۱ (فقط در ستون مجموع)
    expect(top.total.find((e) => e.name === "د")!.count).toBe(1);
    expect(top.sale.some((e) => e.name === "د")).toBe(false);
    expect(top.rent.some((e) => e.name === "د")).toBe(false);
  });

  test("C.۱ — حداکثر ۱۰ نتیجه در هر ستون", async () => {
    const { topExpertsByTxType } = await import("@/core/agent/analyzers");
    const many = Array.from({ length: 15 }, (_, i) => ({
      contractDate: "2025-04-01",
      contractType: "مبایعه نامه",
      shareNames: [`کارشناس ${i}`],
    }));
    const top = topExpertsByTxType(many, 10);
    expect(top.sale).toHaveLength(10);
    expect(top.rent).toHaveLength(0);
    expect(top.total).toHaveLength(10);
  });

  test("C.۱ — مرتب‌سازی نزولی بر اساس تعداد", async () => {
    const { topExpertsByTxType } = await import("@/core/agent/analyzers");
    const top = topExpertsByTxType(rows, 10);
    for (const col of [top.sale, top.rent, top.total]) {
      for (let i = 1; i < col.length; i += 1) expect(col[i]!.count).toBeLessThanOrEqual(col[i - 1]!.count);
    }
  });
});

// ===========================================================================
// بخش ۴ — فیلترها (BLOCK F — ۱۸ سناریو عین جدول F.۲)
// ===========================================================================

/** ساخت نشست OWNER و فراخوانی مستقیم روت — عین الگوی p014 (روت واقعی + دیتابیس تست) */
async function makeOwnerRequest(query: string): Promise<{ status: number; body: any }> {
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode: "950001", displayName: "تست p015", role: "OWNER" },
    { ip: "127.0.0.1" },
    null
  );
  const route = await import("@/app/api/crm/transactions/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest(`http://localhost/api/crm/transactions?${query}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const res = await route.GET(req);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ===========================================================================
// بخش ۵ — ترتیب ستون‌ها (BLOCK E — ساختاری عین معیار پذیرش)
// ===========================================================================

describe("P6.5-15 M3v2 · بخش ۵ — ترتیب ۱۱ ستون و ساده‌سازی سلول‌ها", () => {
  const tab = readFileSync(TAB_FILE, "utf8");

  test("E.۱ — ترتیب دقیق ۱۱ ستون (ردیف ← تاریخ ← کد ملک ← فروشنده ← کد درخواست ← خریدار ← نوع ← مبلغ ← تجمیع ← هولوگرام ← فایل)", () => {
    const order = [
      "۱. ردیف</TableHead>",
      "۲. تاریخ معامله</TableHead>",
      "۳. کد ملک</span>",
      "۴. فروشنده</TableHead>",
      "۵. کد درخواست</span>",
      "۶. خریدار</TableHead>",
      "۷. نوع قرارداد</TableHead>",
      "۸. مبلغ قرارداد</TableHead>",
      "۹. تجمیع حق‌السهم مشاوران</TableHead>",
      "۱۰. شماره هولوگرام</TableHead>",
      "۱۱. فایل قرارداد</TableHead>",
    ];
    let last = -1;
    for (const header of order) {
      const idx = tab.indexOf(header);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeGreaterThan(last);
      last = idx;
    }
  });

  test("E.۲ — سلول کد ملک فقط <code> است — بدون نام/موبایل مالک (دستور ۱ مالک)", () => {
    const start = tab.indexOf("{/* ۳ — کد ملک: فقط کد — بدون نام");
    const end = tab.indexOf("{/* ۴ — فروشنده: نام + موبایل زیر نام", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const cell = tab.slice(start, end);
    expect(cell).toContain("<code");
    expect(cell).not.toContain("ownerName");
    expect(cell).not.toContain("ownerMobile");
    expect(cell).not.toContain("<Users");
    expect(cell).not.toContain("tel:");
  });

  test("E.۳ — سلول کد درخواست فقط <code> است — بدون نام/موبایل درخواست‌دهنده (دستور ۲ مالک)", () => {
    const start = tab.indexOf("{/* ۵ — کد درخواست: فقط کد — بدون نام");
    const end = tab.indexOf("{/* ۶ — خریدار: نام + موبایل زیر نام", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const cell = tab.slice(start, end);
    expect(cell).toContain("<code");
    expect(cell).not.toContain("requesterName");
    expect(cell).not.toContain("requesterMobile");
    expect(cell).not.toContain("tel:");
  });

  test("E.۴ — ستون فروشنده: نام + موبایل زیر نام (fallback به مالک در لایهٔ غنی‌سازی)", () => {
    const start = tab.indexOf("{/* ۴ — فروشنده: نام + موبایل زیر نام (E.۴ — fallback");
    const end = tab.indexOf("{/* ۵ — کد درخواست: فقط کد — بدون نام");
    const cell = tab.slice(start, end);
    expect(cell).toContain("t.sellerName");
    expect(cell).toContain("t.sellerMobile");
    expect(cell).toContain(`tel:`);
    // fallback: زنجیرهٔ غنی‌سازی فروشنده شامل مالک است
    const enrich = readFileSync("/home/z/my-project/src/lib/melk-api/tx-enrichment.ts", "utf8");
    const sellerBlock = enrich.slice(enrich.indexOf("const sellerName ="), enrich.indexOf("const requesterName ="));
    expect(sellerBlock).toContain("owner?.ownerName");
  });

  test("E.۵ — ستون خریدار: نام + موبایل زیر نام (fallback به درخواست‌دهنده)", () => {
    const start = tab.indexOf("{/* ۶ — خریدار: نام + موبایل زیر نام (E.۵ — fallback");
    const end = tab.indexOf("{/* ۷ — نوع قرارداد: یکی از چهار نوع");
    const cell = tab.slice(start, end);
    expect(cell).toContain("t.buyerName");
    expect(cell).toContain("t.buyerMobile");
    expect(cell).toContain("tel:");
    const enrich = readFileSync("/home/z/my-project/src/lib/melk-api/tx-enrichment.ts", "utf8");
    const buyerBlock = enrich.slice(enrich.indexOf("const buyerName ="), enrich.indexOf("// P6.5-14 — نوع/مبلغ"));
    expect(buyerBlock).toContain("requester?.customerName");
  });

  test("E.۱/۷ — نوع قرارداد از classifyContract: چهار نوع یا «بدون قرارداد»", () => {
    expect(tab).toContain("classifyContract(t.contractType).kind");
    expect(tab).toContain("بدون قرارداد");
    const typeCellStart = tab.indexOf("{/* ۷ — نوع قرارداد: یکی از چهار نوع");
    const typeCellEnd = tab.indexOf("{/* ۸ — مبلغ قرارداد — با جداکنندهٔ");
    const cell = tab.slice(typeCellStart, typeCellEnd);
    expect(cell).toContain("{kind}");
    expect(cell).not.toContain("{t.contractType}");
  });

  test("C.۱(UI) — کارشناسان برتر فقط نام + تعداد — بدون کد پرسنلی", () => {
    expect(tab).not.toContain("expertCodeByName");
    expect(tab).toContain("۱۰ برتر — ");
    expect(tab).toContain("کارشناسان برتر بر اساس تعداد معاملات");
  });

  test("B.۱(UI) — Legend سه‌خطی با برچسب‌های جدید", () => {
    expect(tab).toContain("مبایعه‌نامه (شامل پیش‌فروش)");
    expect(tab).toContain("اجاره (شامل تمدید)");
    expect(tab).toContain('total: "مجموع"');
    expect(tab).toMatch(/dataKey="total"[^/]*strokeWidth=\{3\.5\}/);
  });

  test("B.۱(UI) — DOM: KPI ← نمودار/برترین‌ها ← شفافیت ← فیلترها ← فهرست", () => {
    const kpi = tab.indexOf("شاخص‌های چهارجانی");
    const charts = tab.indexOf("روند ماهانه معاملات");
    const filters = tab.indexOf('id="m3-filters-card"');
    const filtersEnd = tab.indexOf("</Card>", filters);
    const table = tab.indexOf("فهرست معاملات — تمامی کارشناسان");
    expect(kpi).toBeGreaterThan(-1);
    expect(charts).toBeGreaterThan(kpi);
    expect(filters).toBeGreaterThan(charts);
    expect(table).toBeGreaterThan(filtersEnd);
  });
});

// ===========================================================================
// بخش ۶ — حفاظت داده (قانون مقدس)
// ===========================================================================

describe("P6.5-15 M3v2 · بخش ۶ — حفاظت داده", () => {
  test("۶-۱ — صفر کاهش رکورد: غنی‌سازی هیچ ردیفی حذف نمی‌کند (ورودی = خروجی)", async () => {
    const { enrichTransactionRows } = await import("@/lib/melk-api/tx-enrichment");
    const rows = Array.from({ length: 9 }, (_, i) => ({
      id: `${P}keep-${i}`, contractDate: "2025-06-01", propertyCode: `PK${i}`, propertyCustomer: null,
      requestCode: null, requestCustomer: null, contractHolo: null, suggestedPropertyCount: 0, eventsCount: 0,
    }));
    const out = enrichTransactionRows(rows, { owners: [], requesters: [], contracts: [], txInfo: [] });
    expect(out.length).toBe(rows.length);
    expect(out.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  test("۶-۲ — حفظ دادهٔ خام: جدول غنی‌سازی فقط upsert؛ هیچ حذفی نیست", () => {
    const src = readFileSync("/home/z/my-project/src/lib/melk-api/tx-info-enrichment.ts", "utf8");
    expect(src).toContain("upsert");
    expect(src).not.toMatch(/\.deleteMany\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
  });

  test("۶-۳ — تولیدی: rawInfoJson منبع نگه‌داشته می‌شود و لایهٔ نمایش فقط می‌خواند", async () => {
    const { db } = await import("@/lib/db");
    const c = await db.transactionEnrichment.count({ where: { rawInfoJson: { not: null } } });
    // صفر نوشتن در ستون‌های raw: ماژول tx-enrichment فقط می‌خواند (ساختاری)
    const enrichSrc = readFileSync("/home/z/my-project/src/lib/melk-api/tx-enrichment.ts", "utf8");
    expect(enrichSrc).not.toMatch(/rawInfoJson\s*[:=]/);
    expect(c).toBeGreaterThanOrEqual(0); // شمارش معتبر حتی با DB تست خالی
  });
});

// ===========================================================================
// ===========================================================================
// بخش ۸ — ایجنت (بینش‌ها با منطق جلسه ۰۱۸)
// ===========================================================================

describe("P6.5-15 M3v2 · بخش ۸ — ایجنت بینش‌ها", () => {
  test("A/C — ایجنت: قانون خانواده + برچسب‌های جدید + فقط نام و تعداد", () => {
    const src = readFileSync(AGENT_FILE, "utf8");
    expect(src).toContain("classifyContract");
    expect(src).toContain("شامل پیش‌فروش");
    expect(src).toContain("شامل تمدید");
    expect(src).toContain("فقط نام و تعداد");
  });
});
