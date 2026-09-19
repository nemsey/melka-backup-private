/**
 * تست‌های رگرسیون باگ sync — دستور ملکا-شورا-۰۰۷، بخش B.1
 * ------------------------------------------------------
 * ریشهٔ خالی‌بودن جدول‌های production (کشف‌های شب ۱ Recon، لاگ
 * recon-night1.jsonl):
 *  ۱) realtor-reports/traded-count و traded-count-total بدون
 *     startDate+endDate → HTTP 400 «لطفا یک بازه تاریخی انتخاب کنید»
 *     (فقط startDate هم کافی نیست — رکورد s2-depth).
 *  ۲) traded-count-total فقط «خلاصهٔ چهارگانه» می‌دهد (rowCount=0،
 *     rowKeys=[] در همهٔ ۲۰۰ها) — لیست ردیف‌ها از traded-count می‌آید.
 *
 * این تست سرور واقعی را شبیه‌سازی می‌کند: هر درخواست realtor-reports
 * بدون بازهٔ کامل = 400. اگر رفع باگ روزی برگردد، sync شکست می‌خورد و
 * تست fail می‌شود (رگرسیون واقعی، نه فقط بررسی شکل).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const { db } = await import("@/lib/db");
const { syncFromArm, buildReportDateRange } = await import("@/lib/melk-api/sync");

// ---------------------------------------------------------------------------
// شبیه‌ساز سرور ARM — رفتار اثبات‌شدهٔ شب ۱
// ---------------------------------------------------------------------------

interface RecordedCall {
  path: string;
  query: URLSearchParams;
}

const calls: RecordedCall[] = [];

/** پاسخ NestJS استاندارد سامانه */
function envelope(status: number, ok: boolean, message: string, data: unknown): Response {
  return new Response(
    JSON.stringify({ statusCode: status, status: ok, message, data }),
    { status, headers: { "content-type": "application/json" } }
  );
}

const OK = (data: unknown) => envelope(200, true, "ok", data);
const PAGED = (list: unknown[], totalPages = 1) =>
  OK({ count: list.length, limit: 100, page: 1, totalPages, list });
const NEED_RANGE = () => envelope(400, false, "لطفا یک بازه تاریخی انتخاب کنید", { error: "BadRequest" });

/** ردیف معامله با شکل فیلدهای اثبات‌شدهٔ سامانه */
function tradedRow(id: string, over: Record<string, unknown> = {}) {
  return {
    _id: id,
    contractDate: "1405/06/15",
    propertyCode: "P-B1",
    propertyCustomer: "فروشندهٔ تست",
    requestCode: "R-B1",
    requestCustomer: "خریدار تست",
    contractHolo: "H-B1",
    suggestedPropertyCount: 3,
    eventsCount: 2,
    ...over,
  };
}

const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input));
  // مسیر بعد از پیشوند /api/apm/
  const path = url.pathname.replace(/^.*\/api\/apm\//, "");
  const query = url.searchParams;
  calls.push({ path, query });

  const hasFullRange = Boolean(query.get("startDate") && query.get("endDate"));

  // — خانوادهٔ گزارش‌های مشاور: بازهٔ کامل الزامی (شبیه‌سازی سرور واقعی)
  if (path === "realtor-reports/traded-count") {
    if (!hasFullRange) return NEED_RANGE();
    return PAGED([tradedRow("t-b1-1"), tradedRow("t-b1-2", { propertyCode: "P-B2" })]);
  }
  if (path === "realtor-reports/traded-count-total") {
    if (!hasFullRange) return NEED_RANGE();
    // این endpoint فقط خلاصه می‌دهد — هرگز list (کشف ۲ شب ۱)
    return OK({ totalCount: 2, hasRequestEvent: 1, hasSuggestedProperty: 1, hasBoth: 1 });
  }
  if (path === "realtor-reports/realtor-interactions/list") {
    // مسیر ۴۰۴ است (کشف شب ۱) — sync باید ساکت-fail غیربحرانی بماند
    return envelope(404, false, "Cannot GET /api/apm/realtor-reports/realtor-interactions/list", { error: "NotFound" });
  }
  if (path === "realtor-reports/supply-demand") {
    if (!hasFullRange) return NEED_RANGE();
    return PAGED([]);
  }

  // — endpointهای بدون بازه (رفتار ۲۰۰ اثبات‌شدهٔ شب ۱ — نباید بازه بگیرند)
  if (path === "realtors/list") {
    return PAGED([{ _id: "r-b1-1", code: "410031001", fullName: "مشاور تست B.1", mobileNumber: "09120000001" }]);
  }
  if (path === "visits/list") return PAGED([], 0);
  if (path === "trade-overviews/list") return PAGED([], 0);

  return envelope(404, false, `unmocked path: ${path}`, { error: "NotFound" });
}) as typeof fetch;

// ---------------------------------------------------------------------------
// راه‌اندازی/پاکسازی
// ---------------------------------------------------------------------------

const TABLES = [
  "transactionRecord",
  "expertRecord",
  "interactionRecord",
  "visitRecord",
  "supplyDemandRecord",
  "contractRecord",
] as const;

async function cleanSlate() {
  for (const t of TABLES) await (db as never as Record<string, { deleteMany: (arg?: unknown) => Promise<unknown> }>)[t].deleteMany({});
  await db.syncState.deleteMany({});
}

beforeAll(cleanSlate);
afterAll(async () => {
  await cleanSlate();
  globalThis.fetch = realFetch;
});

// ---------------------------------------------------------------------------
// تست‌ها
// ---------------------------------------------------------------------------

describe("B.1 — buildReportDateRange (بازهٔ جلالی پیش‌فرض)", () => {
  test("مبدأ = 2018-01-01 میلادی = 1396/10/11 جلالی (مستند دستور)", () => {
    const r = buildReportDateRange(new Date("2026-09-19T20:00:00Z"));
    expect(r.startDate).toBe("1396/10/11");
  });

  test("مقصد = امروز به وقت تهران (2026-09-19 → 1405/06/28)", () => {
    const r = buildReportDateRange(new Date("2026-09-19T20:00:00Z")); // تهران ۲۳:۳۰ همان روز
    expect(r.endDate).toBe("1405/06/28");
  });

  test("قالب هر دو طرف YYYY/MM/DD جلالی است", () => {
    const r = buildReportDateRange(new Date());
    expect(r.startDate).toMatch(/^1[34]\d{2}\/\d{2}\/\d{2}$/);
    expect(r.endDate).toMatch(/^1[34]\d{2}\/\d{2}\/\d{2}$/);
  });
});

describe("B.1 — sync با سروری که بازه را الزامی می‌کند (شبیه‌سازی ARM واقعی)", () => {
  test(
    "sync موفق: status ok + رکورد > 0 (شاهد موردنیاز دستور B.1)",
    async () => {
      const res = await syncFromArm("test-token-b1");
      expect(res.ok).toBe(true);
      expect(res.error).toBeUndefined();
      // شاهد دستور: recordsFetched > 0 — معاملات از traded-count (لیست‌دار)
      expect(res.transactions).toBe(2);
      expect(res.experts).toBe(1);
      // خلاصهٔ چهارگانه از traded-count-total (تنها نقش درست آن)
      const state = await db.syncState.findUnique({ where: { id: "singleton" } });
      expect(state?.summaryJson).toContain('"totalCount":2');
      // رکوردها واقعاً در پایگاه نشسته‌اند
      expect(await db.transactionRecord.count()).toBe(2);
      expect(await db.expertRecord.count()).toBe(1);
    },
    30_000
  );

  test("هر تماس realtor-reportsِ فعال بازهٔ کامل را داشته و قالب بازه جلالی است", () => {
    // تعاملات (۴۰۴) عمداً بدون بازه می‌ماند — مسیرش غلط است و در شب ۲ کشف می‌شود
    const reportCalls = calls.filter((c) =>
      c.path === "realtor-reports/traded-count" ||
      c.path === "realtor-reports/traded-count-total" ||
      c.path === "realtor-reports/supply-demand"
    );
    expect(reportCalls.length).toBeGreaterThanOrEqual(3);
    for (const c of reportCalls) {
      expect(c.query.get("startDate")).toBe("1396/10/11");
      expect(c.query.get("endDate")).toMatch(/^1[34]\d{2}\/\d{2}\/\d{2}$/);
    }
  });

  test("رگرسیون: endpointهای بدون-بازه (realtors/visits/trade-overviews) بازه نمی‌گیرند", () => {
    const noRange = calls.filter((c) => ["realtors/list", "visits/list", "trade-overviews/list"].includes(c.path));
    expect(noRange.length).toBeGreaterThanOrEqual(3);
    for (const c of noRange) {
      expect(c.query.get("startDate")).toBeNull();
      expect(c.query.get("endDate")).toBeNull();
    }
  });

  test("مسیر ۴۰۴ تعاملات، sync را نمی‌شکند (ساکت-fail غیربحرانی)", async () => {
    const res = await syncFromArm("test-token-b1");
    expect(res.ok).toBe(true);
    expect(res.interactions).toBe(0);
    expect(calls.some((c) => c.path === "realtor-reports/realtor-interactions/list")).toBe(true);
  });
});
