/**
 * p6530-m3-transactions.test.ts — سوئیت تازهٔ کاشی M3 «معاملات ملک تبریز» (گام ۳)
 * =============================================================================
 * نکتهٔ بسیار مهم ۲ (گام ۳): «کلیه تست‌های کاشی معاملات ملک تبریز (ایجنت، بینش،
 * فهرست، فیلتر، بروزرسانی و ...) حذف شود؛ تست‌های جدید طراحی، پیاده‌سازی و
 * اعمال واقعی شود و در انتها راستی‌آزمایی شود.»
 * (سوئیت قدیمی M3 در p6526 حذف شد — این جایگزین کامل است.)
 *
 * بند ۱ (نکتهٔ دستور): «فقط عنوان فهرست معاملات طبق بند ۱ اصلاح شود و لاغیر»
 * بخش‌ها:
 *   §۱ ایجنت · §۲ تنظیمات · §۳ عناوین یازده‌ستونی (بند ۱ — فقط عنوان) ·
 *   §۴ فیلتر تمام ستون‌ها (بند ۲) · §۵ بینش‌ها · §۶ بروزرسانی (بند ۴) ·
 *   §۷ قیمت قرارداد با کاما (نکتهٔ بسیار مهم ۳) · §۸ رنگ بخش M3
 */
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, test } from "bun:test";

const P = "p6530m3";
const SRC = "/home/z/my-project/src";
const TILES = "/home/z/my-project/src/core/tiles/tiles";

let OWNER_TOKEN: string | null = null;

async function ownerToken(): Promise<string> {
  if (OWNER_TOKEN) return OWNER_TOKEN;
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode: "950034", displayName: "تست M3", role: "OWNER" },
    { ip: "127.0.0.1" },
    null
  );
  OWNER_TOKEN = token;
  return token;
}

async function callRoute(query: string): Promise<{ status: number; body: any }> {
  const route = await import("@/app/api/crm/transactions/route");
  const { NextRequest } = await import("next/server");
  const token = await ownerToken();
  const req = new NextRequest(`http://localhost${query}`, { headers: { authorization: `Bearer ${token}` } });
  const res = await route.GET(req);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/* ==========================================================================
 * §۱ — ایجنت کاشی M3
 * ========================================================================== */

describe("گام ۳/M3 §۱ — ایجنت هوشمند", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("۱-۱) ایجنت ثبت شده با شناسه و نام درست", async () => {
    const { getAgent } = await import("@/core/agent");
    const agent = getAgent("transactions-contracts")!;
    expect(agent).toBeDefined();
    expect(agent.name).toContain("معاملات");
  });

  test("۱-۲) قرارداد کاشی ↔ ایجنت: دامنه‌های بیست‌گانه (≥۱۵ الزام ادغام)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const tile = tileRegistry.get("transactions-contracts")!;
    expect(tile.agent!.insightDomains.length).toBeGreaterThanOrEqual(15);
    expect(tile.agent!.insightDomains).toContain("INFO_COVERAGE");
    expect(tile.agent!.insightDomains).toContain("TOP_EXPERTS");
  });

  test("۱-۳) حلقهٔ یادگیری: بازخورد → حافظه + بازیابی", async () => {
    const { getAgent } = await import("@/core/agent");
    const agent = getAgent("transactions-contracts")!;
    const before = await agent.submitFeedback({ insightKey: `${P}-warmup`, insightTitle: "پیش‌گرمایش", domain: "VOLUME", rating: 1 });
    const after = await agent.submitFeedback({ insightKey: `${P}-fb1`, insightTitle: "تست بازخورد گام ۳", domain: "VOLUME", rating: 1, comment: "بازخورد آزمایشی M3" });
    expect(after.totalFeedback).toBe(before.totalFeedback + 1);
    expect((await agent.retrieveRelevant("تست بازخورد گام ۳", 5)).length).toBeGreaterThan(0);
  });
});

/* ==========================================================================
 * §۲ — تنظیمات کاشی M3
 * ========================================================================== */

describe("گام ۳/M3 §۲ — تنظیمات کاشی", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("۲-۱) تنظیمات مرتب‌سازی و نمودار موجودند", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const tile = tileRegistry.get("transactions-contracts")!;
    const keys = tile.settings.map((s) => s.key);
    expect(keys).toContain("sortBy");
    expect(keys).toContain("showCharts");
  });
});

/* ==========================================================================
 * §۳ — عناوین یازده‌ستونی (بند ۱: «فقط عنوان فهرست طبق بند ۱ اصلاح شود و لاغیر»)
 * ========================================================================== */

describe("گام ۳/M3 §۳ — عناوین فهرست (بند ۱)", () => {
  test("۳-۱) عناوین دقیقاً عین دستور مالک — بدون پیشوند عددی و بدون «مبلغ»", async () => {
    const s = readFileSync(`${TILES}/transactions-contracts/TransactionsTab.tsx`, "utf8");
    // فقط ناحیهٔ سرستون‌ها؛ عناوین با آیکون داخل span هستند — متن خالص استخراج می‌شود
    const header = s.slice(s.indexOf("<TableHeader>"), s.indexOf("</TableHeader>"));
    const heads = [...header.matchAll(/<TableHead[^>]*>(?:\s*<span[^>]*>[^<]*<[^>]*>\s*([^<]+?)\s*<\/span>\s*|([^<]+?))<\/TableHead>/g)]
      .map((m) => (m[1] ?? m[2] ?? "").trim())
      .filter(Boolean);
    expect(heads).toEqual([
      "ردیف",
      "تاریخ معامله",
      "کد ملک",
      "فروشنده",
      "کد درخواست",
      "خریدار",
      "نوع قرارداد",
      "قیمت",
      "تجمیع حق‌السهم مشاوران",
      "شماره هولوگرام",
      "فایل قرارداد",
    ]);
  });

  test("۳-۲) عنوان قدیمی «مبلغ قرارداد» و «قیمت قرارداد» حذف شده (P6546/گام پنجم-ت-۴: نام ستون = قیمت)", async () => {
    const s = readFileSync(`${TILES}/transactions-contracts/TransactionsTab.tsx`, "utf8");
    expect(s).not.toMatch(/<TableHead[^>]*>.*مبلغ قرارداد/);
    expect(s).not.toMatch(/<TableHead[^>]*>.*قیمت قرارداد/);
    expect(s).toContain("قیمت");
  });

  test("۳-۳) ترتیب ستون‌ها دست‌نخورده (لاغیر — بند ۱ فقط عنوان)", async () => {
    const s = readFileSync(`${TILES}/transactions-contracts/TransactionsTab.tsx`, "utf8");
    // فقط ناحیهٔ سرستون‌ها (TableHeader) — نه فرم فیلترها
    const headerStart = s.indexOf("<TableHeader>");
    const headerEnd = s.indexOf("</TableHeader>");
    const header = s.slice(headerStart, headerEnd);
    const order = ["ردیف", "تاریخ معامله", "کد ملک", "فروشنده", "کد درخواست", "خریدار", "نوع قرارداد", "قیمت", "تجمیع حق‌السهم", "شماره هولوگرام", "فایل قرارداد"]
      .map((t) => header.indexOf(t));
    for (const idx of order) expect(idx).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });
});

/* ==========================================================================
 * §۴ — فیلتر بر اساس تمام ستون‌ها (بند ۲)
 * ========================================================================== */

describe("گام ۳/M3 §۴ — فیلتر تمام ستون‌ها", () => {
  beforeAll(async () => {
    // seed دو معامله با غنی‌سازی قرارداد برای فیلترهای لایهٔ غنی‌سازی
    const { getTransactionRepository, getContractRepository } = await import("@/core/repositories");
    const { db } = await import("@/lib/db");
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.contractRecord.deleteMany({ where: { contractHolo: { startsWith: "p65m3holo" } } }).catch(() => undefined);
    const txRepo = getTransactionRepository();
    await txRepo.upsertBulk([
      {
        id: `${P}t1`, propertyCode: `${P}7001`, propertyCustomer: "فروشنده اول", requestCustomer: "خریدار اول", requestCode: `${P}8001`,
        contractDate: new Date("2026-06-11T00:00:00.000Z"),
        contractHolo: "p65m3holo1", suggestedPropertyCount: 1, eventsCount: 1,
      },
      {
        id: `${P}t2`, propertyCode: `${P}7002`, propertyCustomer: "فروشنده دوم", requestCustomer: "خریدار دوم", requestCode: `${P}8002`,
        contractDate: new Date("2026-06-12T00:00:00.000Z"),
        contractHolo: "p65m3holo2", suggestedPropertyCount: 0, eventsCount: 2,
      },
    ], { sourceRunId: `${P}-seed` });
    // قراردادها برای غنی‌سازی (فروشنده/خریدار/قیمت) — درج مستقیم با همهٔ فیلدها
    await db.contractRecord.createMany({
      data: [
        {
          id: `${P}c1`, status: "active", contractHolo: "p65m3holo1",
          propertyCode: `${P}7001`, requestCode: `${P}8001`,
          contractType: "مبایعه نامه", contractDate: new Date("2026-06-11T00:00:00.000Z"),
          contractPrice: 9_000_000_000,
          sellerListJson: JSON.stringify([{ fullName: "علی فروشنده تست", mobileNumber: "09141110000" }]),
          buyerListJson: JSON.stringify([{ fullName: "رضا خریدار تست", mobileNumber: "09142220000" }]),
        },
        {
          id: `${P}c2`, status: "active", contractHolo: "p65m3holo2",
          propertyCode: `${P}7002`, requestCode: `${P}8002`,
          contractType: "اجاره نامه", contractDate: new Date("2026-06-12T00:00:00.000Z"),
          contractPrice: 500_000_000,
          sellerListJson: JSON.stringify([{ fullName: "مریم فروشنده دوم", mobileNumber: "09143330000" }]),
          buyerListJson: JSON.stringify([{ fullName: "سارا خریدار دوم", mobileNumber: "09144440000" }]),
        },
      ],
    });
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.contractRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.$disconnect();
  });

  test("۴-۱) فیلترهای موجود: کد ملک + کد درخواست + هولوگرام — فارسی = لاتین", async () => {
    const fa = await callRoute(`/api/crm/transactions?propertyCode=${P}۷۰۰۱`);
    const latin = await callRoute(`/api/crm/transactions?propertyCode=${P}7001`);
    expect(fa.status).toBe(200);
    expect(latin.status).toBe(200);
    const faCodes = fa.body.rows.map((r: any) => r.propertyCode);
    expect(faCodes).toEqual(latin.body.rows.map((r: any) => r.propertyCode));
  });

  test("۴-۲) فیلتر فروشنده (نام) — ستون ۴", async () => {
    const r = await callRoute(`/api/crm/transactions?propertyCode=${P}&sellerName=علی فروشنده تست`);
    expect(r.status).toBe(200);
    expect(r.body.rows.map((x: any) => x.propertyCode)).toEqual([`${P}7001`]);
  });

  test("۴-۳) فیلتر خریدار (موبایل) — ستون ۶", async () => {
    const r = await callRoute(`/api/crm/transactions?propertyCode=${P}&buyerName=09144440000`);
    expect(r.status).toBe(200);
    expect(r.body.rows.map((x: any) => x.propertyCode)).toEqual([`${P}7002`]);
  });

  test("۴-۴) فیلتر قیمت قرارداد از/تا — ستون ۸ (تومان)", async () => {
    const high = await callRoute(`/api/crm/transactions?propertyCode=${P}&priceFrom=1000000000`);
    expect(high.body.rows.map((x: any) => x.propertyCode)).toEqual([`${P}7001`]);
    const low = await callRoute(`/api/crm/transactions?propertyCode=${P}&priceTo=600000000`);
    expect(low.body.rows.map((x: any) => x.propertyCode)).toEqual([`${P}7002`]);
  });

  test("۴-۵) فیلتر فایل قرارداد دارد/ندارد — ستون ۱۱", async () => {
    // test.db از معاملات واقعی خالی است — با seed خودمان آزمایش می‌کنیم
    const yes = await callRoute(`/api/crm/transactions?propertyCode=${P}&hasContract=yes`);
    expect(yes.body.rows.map((x: any) => x.propertyCode).sort()).toEqual([`${P}7001`, `${P}7002`].sort());
    for (const r of yes.body.rows) {
      expect(Boolean(r.contractMatchBy || r.contractText)).toBe(true);
    }
    const no = await callRoute(`/api/crm/transactions?propertyCode=${P}&hasContract=no`);
    expect(no.body.rows.length).toBe(0); // هر دو seed قرارداد دارند
  });

  test("۴-۶) نوع قرارداد: مقدار ناشناخته → 400 شفاف (رفع F2 — حفظ‌شده)", async () => {
    const r = await callRoute(`/api/crm/transactions?contractType=نامعلوم`);
    expect(r.status).toBe(400);
  });

  test("۴-۷) فیلتر تاریخ: مرز روز شامل (رفع F5 — حفظ‌شده)", async () => {
    const r = await callRoute(`/api/crm/transactions?dateFrom=2026-06-11&dateTo=2026-06-11`);
    expect(r.status).toBe(200);
    expect(r.body.rows.some((x: any) => x.propertyCode === `${P}7001`)).toBe(true);
  });

  test("۴-۸) UI فیلتر: هر ۱۱ ستون پوشش داده شده‌اند (فرم + چندانتخابی‌ها)", async () => {
    const s = readFileSync(`${TILES}/transactions-contracts/TransactionsTab.tsx`, "utf8");
    for (const id of [
      "f-dateFrom", "f-dateTo", "f-propertyCode", "f-requestCode", "f-contractHolo",
      "f-expertName", "f-personnelCode", "f-sellerName", "f-buyerName", "f-priceFrom",
      "f-priceTo", "f-hasContract", "m3-contract-kind-filters",
    ]) {
      expect(s).toContain(id);
    }
  });
});

/* ==========================================================================
 * §۵ — بینش‌ها
 * ========================================================================== */

describe("گام ۳/M3 §۵ — بینش‌ها", () => {
  test("۵-۱) بینش ایجنت M3 با دادهٔ کاشته‌شده: ≥۳ بینش معتبر با دامنه‌های اعلام‌شده", async () => {
    // seed درون‌تستی (الگوی p6511) — test.db از معاملات واقعی خالی است
    const { getTransactionRepository } = await import("@/core/repositories");
    const { db } = await import("@/lib/db");
    await getTransactionRepository().upsertBulk([
      { id: `${P}i1`, propertyCode: `${P}7101`, propertyCustomer: "مالک یک", requestCustomer: null, requestCode: null, contractDate: new Date("2026-09-20T00:00:00.000Z"), contractHolo: `${P}h1`, suggestedPropertyCount: 2, eventsCount: 1 },
      { id: `${P}i2`, propertyCode: `${P}7102`, propertyCustomer: "مالک دو", requestCustomer: "متقاضی دو", requestCode: `${P}8102`, contractDate: new Date("2026-09-21T00:00:00.000Z"), contractHolo: `${P}h2`, suggestedPropertyCount: 0, eventsCount: 3 },
      { id: `${P}i3`, propertyCode: `${P}7103`, propertyCustomer: "مالک سه", requestCustomer: "متقاضی سه", requestCode: `${P}8103`, contractDate: new Date("2026-09-22T00:00:00.000Z"), contractHolo: null, suggestedPropertyCount: 1, eventsCount: 0 },
    ], { sourceRunId: `${P}-iseed` });
    try {
    const { getAgent } = await import("@/core/agent");
    const agent = getAgent("transactions-contracts")!;
    const result = await agent.renderInsights();
    expect(result.insights.length).toBeGreaterThanOrEqual(3);
    const declared = new Set<string>(agent.insightDomains as readonly string[]);
    for (const ins of result.insights) {
      expect(declared.has(ins.domain)).toBe(true);
      expect(ins.title).toMatch(/[\u0600-\u06FF]/);
      expect(["info", "positive", "warning", "critical"]).toContain(ins.severity);
    }
    } finally {
      await db.transactionRecord.deleteMany({ where: { id: { startsWith: `${P}i` } } }).catch(() => undefined);
    }
  });
});

/* ==========================================================================
 * §۶ — بروزرسانی (بند ۴)
 * ========================================================================== */

describe("گام ۳/M3 §۶ — بروزرسانی", () => {
  test("۶-۱) روت: lastUpdate با تاریخ دقیق آخرین موفقیت (بند ۴.۲)", async () => {
    const r = await callRoute("/api/crm/transactions?limit=1");
    expect(r.status).toBe(200);
    expect(r.body.lastUpdate).toBeDefined();
    expect(r.body.lastUpdate.lastSuccessAt === null || typeof r.body.lastUpdate.lastSuccessAt === "string").toBe(true);
    expect(typeof r.body.lastUpdate.attempts).toBe("number");
  });

  test("۶-۲) بخش بروزرسانی در صفحه: id + تاریخ دقیق + ازسرگیری (بند ۴.۱ + ۴.۲)", async () => {
    const s = readFileSync(`${TILES}/transactions-contracts/TransactionsContractsPage.tsx`, "utf8");
    expect(s).toContain('id="m3-update-section"');
    expect(s).toContain('id="m3-last-update"');
    expect(s).toContain("آخرین بروزرسانی موفق معاملات");
    expect(s).toContain("ازسرگیری از آخرین نقطهٔ کامل");
    expect(s).toMatch(/ARM و PM/);
    // P6546/گام سوم-۱ — بروزرسانی پس‌زمینه‌ای با پیشرفت (بدون مهلت ۹۰ ثانیه)
    expect(s).toContain("/api/crm/transactions/sync");
    expect(s).toContain("data-testid=\"m3-sync-progress\"");
  });

  test("۶-۳) روت sync/all: همهٔ منابع با ازسرگیری (زنجیرهٔ ARM و PM)", async () => {
    const s = readFileSync(`${SRC}/app/api/sync/all/route.ts`, "utf8");
    expect(s).toContain("transactions");
    expect(s).toContain("listings");
    expect(s).toContain("requests");
    expect(s).toContain("checkpoint");
  });
});

/* ==========================================================================
 * §۷ — قیمت قرارداد با کاما (نکتهٔ بسیار مهم ۳)
 * ========================================================================== */

describe("گام ۳/M3 §۷ — قیمت قرارداد با کاما و تومان", () => {
  test("۷-۱) فورمت قیمت: faAmountFull با جداکنندهٔ «،» و واحد تومان", async () => {
    const { faAmountFull } = await import("@/lib/format");
    expect(faAmountFull(9_000_000_000)).toBe("۹،۰۰۰،۰۰۰،۰۰۰ تومان");
    expect(faAmountFull(500_000_000)).toBe("۵۰۰،۰۰۰،۰۰۰ تومان");
  });

  test("۷-۲) ستون قیمت در صفحه از faAmountFull با قالب بدون واحد استفاده می‌کند (P6546/گام پنجم-ت-۴)", async () => {
    const s = readFileSync(`${TILES}/transactions-contracts/TransactionsTab.tsx`, "utf8");
    expect(s).toMatch(/faAmountFull\(t\.contractAmount, ""\)/);
  });
});

/* ==========================================================================
 * §۸ — رنگ بخش M3 (گام صفر — قرمز یاقوتی)
 * ========================================================================== */

describe("گام ۳/M3 §۸ — رنگ بخش (قرمز یاقوتی #DC2626)", () => {
  test("۸-۱) کاشی M3: accent = m3 و صفحهٔ بروزرسانی از sec-m3 استفاده می‌کند", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    await import("@/core/tiles/bootstrap");
    expect(tileRegistry.get("transactions-contracts")!.accent).toBe("m3");
    const s = readFileSync(`${TILES}/transactions-contracts/TransactionsContractsPage.tsx`, "utf8");
    expect(s).toContain("sec-m3-500");
    expect(s).toContain("sec-m3-700");
  });
});
