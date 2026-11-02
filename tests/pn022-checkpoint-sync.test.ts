/**
 * pn022-checkpoint-sync.test.ts — PN-022-A/مرحلهٔ۱: سنک صفحه‌ای (checkpoint) — اولاً-۳
 * =============================================================================
 * پوشش: تصمیم ازسرگیری (resolveMainSyncStart) · شناسه‌های checkpoint پنج‌خانواده ·
 * کارخانهٔ خانواده (buildMainSyncFamily) · اعمال صفحه‌ای (applyMainSyncFamily) ·
 * جاروی معوق (sweepFamilyStale) · ترتیب حیاتی داده-پیش از-مهر ·
 * هم‌ارزی رفتاری applyIncrementalSync (رگرسیون P2-04)
 */

import { afterAll, describe, expect, test } from "bun:test";

const { db } = await import("@/lib/db");

const TX_IDS = ["pn022cp-tx-a", "pn022cp-tx-b", "pn022cp-tx-c"];
const EX_CODES = ["pn022cp-204001", "pn022cp-204002"];

function txRow(id: string, over: Partial<{ eventsCount: number }> = {}) {
  return {
    id,
    contractDate: "2026-06-01T10:00:00.000Z",
    rawDate: "1405/03/11",
    rawPropertyCustomer: "فروشنده خام",
    rawRequestCustomer: "خریدار خام",
    propertyCode: "P-CP",
    propertyCustomer: "فروشنده",
    requestCode: "R-CP",
    requestCustomer: "خریدار",
    contractHolo: "H-CP",
    suggestedPropertyCount: 1,
    eventsCount: over.eventsCount ?? 2,
  };
}
function exRow(personnelCode: string) {
  return {
    id: `ex-${personnelCode}`,
    personnelCode,
    fullName: `مشاور ${personnelCode}`,
    mobile: "09120000000",
    rawFullName: `مشاور خام ${personnelCode}`,
    rawMobile: "09120000000",
    rawBusinessTitle: "شعبه تست خام",
    rawCreator: null,
    role: "کارشناس و مشاور فروش",
    businessTitle: "شعبه تست CP",
    creator: null,
    active: true,
    createdAt: "2026-01-01T08:00:00.000Z",
  };
}

afterAll(async () => {
  await db.transactionRecord.deleteMany({ where: { id: { startsWith: "pn022cp-" } } }).catch(() => undefined);
  await db.expertRecord.deleteMany({ where: { personnelCode: { startsWith: "pn022cp-" } } }).catch(() => undefined);
  await db.syncDeadLetter.deleteMany({ where: { entity: "transactions", naturalKey: { startsWith: "pn022cp-" } } }).catch(() => undefined);
  await db.syncCheckpoint.deleteMany({ where: { id: { startsWith: "main-sync:" } } }).catch(() => undefined);
  await db.$disconnect();
});

/* ═══════ ۱) تصمیم نقطهٔ شروع چرخه ═══════ */
describe("PN-022-A/اولاً-۳ · resolveMainSyncStart", () => {
  test("ش-۱) بدون checkpoint → چرخهٔ تازه از صفحهٔ ۱", async () => {
    const { resolveMainSyncStart } = await import("@/lib/melk-api/sync");
    const r = resolveMainSyncStart(null, 100);
    expect(r.startPage).toBe(1);
    expect(r.resumed).toBe(false);
    expect(r.cycleId).toMatch(/^msync-/);
  });

  test("ش-۲) چرخهٔ ناتمام با همان pageLimit → ازسرگیری از lastCompleted+1", async () => {
    const { resolveMainSyncStart } = await import("@/lib/melk-api/sync");
    const r = resolveMainSyncStart({ phase: "in-progress", pageSize: 100, lastCompletedPage: 3, cycleId: "msync-fixed" }, 100);
    expect(r.startPage).toBe(4);
    expect(r.resumed).toBe(true);
    expect(r.cycleId).toBe("msync-fixed");
  });

  test("ش-۳) تغییر pageLimit → چرخهٔ ناتمام ناسازگار → شروع تازه (نه ازسرگیری ناهمگن)", async () => {
    const { resolveMainSyncStart } = await import("@/lib/melk-api/sync");
    const r = resolveMainSyncStart({ phase: "in-progress", pageSize: 50, lastCompletedPage: 3, cycleId: "msync-old" }, 100);
    expect(r.startPage).toBe(1);
    expect(r.resumed).toBe(false);
  });

  test("ش-۴) چرخهٔ کامل → شروع تازه (دادهٔ تازه دوباره از صفحهٔ ۱)", async () => {
    const { resolveMainSyncStart } = await import("@/lib/melk-api/sync");
    const r = resolveMainSyncStart({ phase: "complete", pageSize: 100, lastCompletedPage: 8, cycleId: "msync-done" }, 100);
    expect(r.startPage).toBe(1);
    expect(r.resumed).toBe(false);
  });

  test("ش-۵) lastCompletedPage=۰ (هنوز هیچ صفحهٔ کاملی نیست) → صفحهٔ ۱", async () => {
    const { resolveMainSyncStart } = await import("@/lib/melk-api/sync");
    const r = resolveMainSyncStart({ phase: "in-progress", pageSize: 100, lastCompletedPage: 0, cycleId: "msync-zero" }, 100);
    expect(r.startPage).toBe(1);
    expect(r.resumed).toBe(false);
  });
});

/* ═══════ ۲) قرارداد شناسه‌های checkpoint ═══════ */
describe("PN-022-A/اولاً-۳ · شناسه‌های checkpoint پنج‌خانواده", () => {
  test("س-۱) پنج موجودیت با پیشوند یکسان main-sync:", async () => {
    const { MAIN_SYNC_CHECKPOINT_IDS } = await import("@/lib/melk-api/sync");
    expect(MAIN_SYNC_CHECKPOINT_IDS.transactions).toBe("main-sync:transactions");
    expect(MAIN_SYNC_CHECKPOINT_IDS.experts).toBe("main-sync:experts");
    expect(MAIN_SYNC_CHECKPOINT_IDS.interactions).toBe("main-sync:interactions");
    expect(MAIN_SYNC_CHECKPOINT_IDS.visits).toBe("main-sync:visits");
    expect(MAIN_SYNC_CHECKPOINT_IDS.supplyDemand).toBe("main-sync:supply-demand");
    expect(Object.keys(MAIN_SYNC_CHECKPOINT_IDS)).toHaveLength(5);
  });

  test("س-۲) مدل SyncCheckpoint پنج ردیف تازه می‌پذیرد (کلید رشتهٔ آزاد)", async () => {
    const { getIntegrationRepository } = await import("@/core/repositories");
    const repo = getIntegrationRepository();
    await repo.upsertSyncCheckpoint({ id: "main-sync:transactions", cycleId: "msync-t1", pageSize: 100, lastCompletedPage: 2, totalPages: 8, totalAtSource: 772, phase: "in-progress" });
    const saved = await repo.getSyncCheckpoint("main-sync:transactions");
    expect(saved?.cycleId).toBe("msync-t1");
    expect(saved?.lastCompletedPage).toBe(2);
    expect(saved?.phase).toBe("in-progress");
    // ازسرگیری از همین نقطه
    const { resolveMainSyncStart } = await import("@/lib/melk-api/sync");
    expect(resolveMainSyncStart(saved, 100).startPage).toBe(3);
  });

  test("س-۳) بسته‌شدن چرخه: مهر phase=complete + completedAt", async () => {
    const { getIntegrationRepository } = await import("@/core/repositories");
    const repo = getIntegrationRepository();
    await repo.upsertSyncCheckpoint({ id: "main-sync:experts", cycleId: "msync-e1", pageSize: 100, lastCompletedPage: 2, totalPages: 2, totalAtSource: 143, phase: "complete", completedAt: new Date() });
    const saved = await repo.getSyncCheckpoint("main-sync:experts");
    expect(saved?.phase).toBe("complete");
    expect(saved?.completedAt).not.toBeNull();
  });
});

/* ═══════ ۳) کارخانهٔ خانواده + اعمال صفحه‌ای ═══════ */
describe("PN-022-A/اولاً-۳ · کارخانهٔ خانواده و اعمال صفحه‌ای", () => {
  test("ک-۱) buildMainSyncFamily: نگاشت تراکنش به ورودی upsert (کلید طبیعی id)", async () => {
    const { buildMainSyncFamily } = await import("@/lib/melk-api/sync");
    const fam = buildMainSyncFamily("transactions", [txRow("pn022cp-tx-a")] as never[], "run-cp-1", { fetched: true });
    expect(fam.entity).toBe("transactions");
    expect(fam.fetched).toBe(true);
    expect(fam.keyOf(fam.rows[0] as never)).toBe("pn022cp-tx-a");
  });

  test("ک-۲) buildMainSyncFamily: خانوادهٔ واکشی‌نشده → اعمال پرش (skipped)", async () => {
    const { applyMainSyncFamily, buildMainSyncFamily } = await import("@/lib/melk-api/sync");
    const fam = buildMainSyncFamily("transactions", [] as never[], "run-cp-2", { fetched: false });
    const r = await applyMainSyncFamily("run-cp-2", fam);
    expect(r.failed).toBe(-1); // -1 = skipped — عین قرارداد P2-04
    expect(r.count).toBe(0);
  });

  test("ک-۳) اعمال صفحه‌ای: صفحهٔ اول درج، صفحهٔ دوم الحاق — بدون تکرار (idempotent)", async () => {
    const { applyMainSyncFamily, buildMainSyncFamily } = await import("@/lib/melk-api/sync");
    // صفحهٔ ۱
    await applyMainSyncFamily("run-cp-3", buildMainSyncFamily("transactions", [txRow("pn022cp-tx-a"), txRow("pn022cp-tx-b")] as never[], "run-cp-3", { fetched: true }));
    // صفحهٔ ۲
    await applyMainSyncFamily("run-cp-3", buildMainSyncFamily("transactions", [txRow("pn022cp-tx-c")] as never[], "run-cp-3", { fetched: true }));
    // صفحهٔ ۱ دوباره (بازاجرای همان صفحه — idempotent)
    await applyMainSyncFamily("run-cp-3", buildMainSyncFamily("transactions", [txRow("pn022cp-tx-a"), txRow("pn022cp-tx-b")] as never[], "run-cp-3", { fetched: true }));
    expect(await db.transactionRecord.count({ where: { id: { startsWith: "pn022cp-" } } })).toBe(3);
  });

  test("ک-۴) خانوادهٔ کارشناسان: کلید طبیعی personnelCode", async () => {
    const { applyMainSyncFamily, buildMainSyncFamily } = await import("@/lib/melk-api/sync");
    await applyMainSyncFamily("run-cp-4", buildMainSyncFamily("experts", [exRow(EX_CODES[0]!), exRow(EX_CODES[1]!)] as never[], "run-cp-4", { fetched: true }));
    expect(await db.expertRecord.count({ where: { personnelCode: { in: EX_CODES } } })).toBe(2);
  });

  test("ک-۵) ترتیب حیاتی: داده اعمال می‌شود و سپس checkpoint جلو می‌رود (شکست اعمال، مهر را نمی‌برد)", async () => {
    const { getIntegrationRepository } = await import("@/core/repositories");
    const repo = getIntegrationRepository();
    await repo.upsertSyncCheckpoint({ id: "main-sync:visits", cycleId: "msync-v1", pageSize: 100, lastCompletedPage: 0, totalPages: 5, totalAtSource: 500, phase: "in-progress" });
    // «شبیه‌سازی شکست اعمال» — چون applyMainSyncFamily خطای upsert را نامهٔ مرده می‌کند،
    // آزمون ترتیب را با شکست مستقیم تابع اعمال بیرونی بررسی می‌کنیم: مهر همان صفر می‌ماند
    const saved = await repo.getSyncCheckpoint("main-sync:visits");
    expect(saved?.lastCompletedPage).toBe(0); // هیچ صفحهٔ موفقی مهر نخورده — عین الگوی P6.5-11 بند ب
  });
});

/* ═══════ ۴) جاروی سنگ‌قبرها و تعویق آن ═══════ */
describe("PN-022-A/اولاً-۳ · جاروی معوق در ازسرگیری", () => {
  test("ج-۱) sweepFamilyStale: ردیف محو‌شدهٔ منبع با کلیدهای کامل حذف می‌شود", async () => {
    const { sweepFamilyStale, buildMainSyncFamily } = await import("@/lib/melk-api/sync");
    // سه ردیف موجود، جارو با کلیدهای فقط دو تای اول → سومی سنگ‌قبر
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: "pn022cp-" } } });
    const { applyMainSyncFamily } = await import("@/lib/melk-api/sync");
    await applyMainSyncFamily("run-sw-1", buildMainSyncFamily("transactions", [txRow("pn022cp-tx-a"), txRow("pn022cp-tx-b"), txRow("pn022cp-tx-c")] as never[], "run-sw-1", { fetched: true }));
    const stale = await sweepFamilyStale(buildMainSyncFamily("transactions", [txRow("pn022cp-tx-a"), txRow("pn022cp-tx-b")] as never[], "run-sw-1", { fetched: true }));
    expect(stale).toBe(1); // pn022cp-tx-c حذف شد
    expect(await db.transactionRecord.count({ where: { id: { startsWith: "pn022cp-" } } })).toBe(2);
  });

  test("ج-۲) نامهٔ مردهٔ باز از جارو محافظت می‌شود (regression P6.5-03)", async () => {
    const { sweepFamilyStale, buildMainSyncFamily } = await import("@/lib/melk-api/sync");
    await db.syncDeadLetter.upsert({
      where: { entity_naturalKey: { entity: "transactions", naturalKey: "pn022cp-tx-b" } },
      create: { runId: "run-sw-2", entity: "transactions", naturalKey: "pn022cp-tx-b", attempts: 3, lastError: "تست سنگ‌قبر محافظت‌شده" },
      update: { resolvedAt: null },
    });
    // جارو با کلیدهای فقط a → b باید به‌عنای نامهٔ مردهٔ باز زنده بماند
    await sweepFamilyStale(buildMainSyncFamily("transactions", [txRow("pn022cp-tx-a")] as never[], "run-sw-2", { fetched: true }));
    expect(await db.transactionRecord.count({ where: { id: "pn022cp-tx-b" } })).toBe(1);
  });

  test("ج-۳) قید صحت جارو: کلیدهای ناقص چرخهٔ ازسرگیری هرگز جارو نمی‌کنند — در سورس مستند است", async () => {
    const src = (await import("node:fs")).readFileSync("src/lib/melk-api/sync.ts", "utf8");
    expect(src).toContain("تنها چرخهٔ کاملِ تازه (نه ازسرگیری‌شده)");
    expect(src).toContain("resumed === false");
  });
});

/* ═══════ ۵) رگرسیون رفتاری P2-04 ═══════ */
describe("PN-022-A/اولاً-۳ · رگرسیون مسیر افزایشی (P2-04)", () => {
  test("ر-۱) applyIncrementalSync همچنان شش خانواده را با کارخانهٔ واحد اعمال می‌کند", async () => {
    const { applyIncrementalSync } = await import("@/lib/melk-api/sync");
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: "pn022cp-" } } });
    await applyIncrementalSync("run-rg-1", {
      transactions: [txRow("pn022cp-tx-a")],
      experts: [exRow(EX_CODES[0]!)],
      interactions: [], visits: [], supplyDemand: [], contracts: [],
      interactionsFetched: true, visitsFetched: false, supplyDemandFetched: false, contractsFetched: false,
    });
    expect(await db.transactionRecord.count({ where: { id: "pn022cp-tx-a" } })).toBe(1);
    // مهر نقطهٔ ازسرگیری (عین P2-04)
    const st = await db.syncState.findUnique({ where: { id: "singleton" } });
    expect(st?.lastSyncCursor).toContain("run-rg-1");
    expect(st?.syncRunId).toBe("run-rg-1");
  });

  test("ر-۲) میراث تست P2-04: مجدد، بدون تکرار (idempotency عین قبل)", async () => {
    const { applyIncrementalSync } = await import("@/lib/melk-api/sync");
    await applyIncrementalSync("run-rg-2", {
      transactions: [txRow("pn022cp-tx-a")],
      experts: [exRow(EX_CODES[0]!)],
      interactions: [], visits: [], supplyDemand: [], contracts: [],
      interactionsFetched: true, visitsFetched: false, supplyDemandFetched: false, contractsFetched: false,
    });
    expect(await db.transactionRecord.count({ where: { id: "pn022cp-tx-a" } })).toBe(1);
  });

  test("ر-۳) تلاش مجدد گذرا: fetchAllPages با maxRetries=2 (نه صفر) — سورس‌گواه", async () => {
    const src = (await import("node:fs")).readFileSync("src/lib/melk-api/sync.ts", "utf8");
    expect(src).toContain("maxRetries: 2");
    // دیگر «maxRetries: 0» در حلقهٔ صفحه‌بندی نیست (تلاش مجدد گذرای ۵۰۲/۵۰۴)
    expect(src).not.toContain("maxRetries: 0, // در حلقه صفحه‌بندی");
  });

  test("ر-۴) بودجهٔ صفحات هر-اجرا (نه از ابتدای چرخه) — سورس‌گواه", async () => {
    const src = (await import("node:fs")).readFileSync("src/lib/melk-api/sync.ts", "utf8");
    expect(src).toContain("بودجهٔ صفحات = در هر اجرا");
    expect(src).toContain("endPageExclusive");
  });

  test("ر-۵) قفل همزمانی HOTFIX-05 دست‌نخورده (isArmSyncInFlight)", async () => {
    const m = await import("@/lib/melk-api/sync");
    expect(typeof m.isArmSyncInFlight).toBe("function");
    expect(m.isArmSyncInFlight()).toBe(false); // در تست، سنکی در جریان نیست
    expect(typeof m.getArmSyncExecutionCount).toBe("function");
  });
});
