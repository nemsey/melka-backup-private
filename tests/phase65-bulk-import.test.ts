/**
 * تست‌های P6.5-03 — Bulk Import Pipeline (دستور شورا P6.5-03 بخش B/F)
 * ------------------------------------------------------
 * پنج گروه الزام + هم‌زیستی:
 *  ۱) پایه با موک — ۱۰۰۰ رکورد → ۱۰۰۰ ذخیره (واقعی روی مخزن) + پایان صفحه‌بندی + برش batch
 *  ۲) Checkpoint + Resume — قطع میانه → ادامه از checkpoint؛ صفر تکراری؛ شمارنده تجمعی
 *  ۳) Idempotency — اجرای دوباره → صفر جدید؛ تغییر فیلد → update؛ merge non-null
 *  ۴) Rate Limiting — فاصله پایان-پاسخ تا درخواست بعدی ≥ حد (واقعی) + ۱۰۰ درخواست
 *  ۵) Retry — ۵۰۰→موفق در سوم؛ ۴۰۰ فوری؛ 429 با Retry-After؛ سیاست دقیق 2/4/8/16/30
 *  ۶) هم‌زیستی sync+bulk (بخش D دستور — الزامی): جاروی افزایشی رکورد Bulk را حذف نمی‌کند
 *
 * الگوی ایزوله‌سازی: عین tests/phase2-sync.test.ts — پایگاه test.db از طریق
 * DATABASE_URL محیط؛ سینک/انبار checkpoint پیش‌فرض (بدون تزریق کلاینت) روی همان پایگاه.
 */
import { describe, expect, test } from "bun:test";

const { db } = await import("@/lib/db");

import {
  bulkImport,
  createRepositorySink,
  SyncStateBulkCheckpointStore,
  RateLimiter,
  retryDelayFor,
  clampPageSize,
  clampBatchSize,
  classifyFetchError,
  BulkFetchError,
  DEFAULT_RETRY_DELAYS_MS,
  BULK_CHECKPOINT_VERSION,
  type BulkImportOptions,
  type BulkPageFetcher,
  type BulkRecordSink,
  type BulkImportProgress,
  type BulkImportResult,
} from "../src/lib/melk-api/bulk-import";
import { MelkApiError } from "../src/lib/melk-api/types";
import { applyIncrementalSync } from "../src/lib/melk-api/sync";
import type { TransactionUpsertInput, BulkWriteStats } from "../src/core/repositories";

// ===================== ساختگاه موک =====================

const PREFIX = "p6503";

function txRow(i: number, over: Partial<TransactionUpsertInput> = {}): TransactionUpsertInput {
  return {
    id: `${PREFIX}-tx-${i}`,
    contractDate: new Date("2024-06-01T10:00:00.000Z"),
    propertyCode: `P-${i}`,
    propertyCustomer: `فروشنده ${i}`,
    requestCode: `R-${i}`,
    requestCustomer: `خریدار ${i}`,
    contractHolo: `H-${i}`,
    suggestedPropertyCount: 1,
    eventsCount: 2,
    ...over,
  };
}

/** موک واکشی صفحات — ردیف‌های نگاشت‌شده (خروجی سازگار ARM در سطح UpsertInput) */
function makeFetcher(pages: TransactionUpsertInput[][], hooks: {
  onPage?: (page: number) => void;
  failAt?: (page: number) => Error | null;
  recordTiming?: { start: number; end: number }[];
} = {}): BulkPageFetcher & { requestedPages: number[] } {
  const requestedPages: number[] = [];
  return {
    requestedPages,
    fetchPage: async (req) => {
      requestedPages.push(req.page);
      hooks.onPage?.(req.page);
      if (hooks.recordTiming) {
        const t = { start: Date.now(), end: 0 };
        hooks.recordTiming.push(t);
        await new Promise((r) => setTimeout(r, 3)); // شبیه‌سازی تأخیر شبکه
        t.end = Date.now();
      }
      const fail = hooks.failAt?.(req.page);
      if (fail) throw fail;
      const rows = pages[req.page - 1] ?? [];
      return { rows, hasMore: req.page < pages.length };
    },
  };
}

/** خواب جعلی — تأخیرها را ثبت می‌کند بدون انتظار واقعی (برای اثبات دنباله دقیق backoff) */
function makeFakeSleep(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = [];
  return {
    delays,
    sleep: async (ms: number) => {
      delays.push(ms);
    },
  };
}

/** سینک ثبت‌کننده (بدون DB) — برای تست‌های مکانیکی نرخ/retry/برش */
function makeRecorderSink(): BulkRecordSink & { batches: unknown[][]; stats: BulkWriteStats[] } {
  const batches: unknown[][] = [];
  const stats: BulkWriteStats[] = [];
  return {
    batches,
    stats,
    saveBatch: async (rows) => {
      batches.push(rows);
      const st = { created: rows.length, updated: 0, duplicates: 0, errors: 0 };
      stats.push(st);
      return st;
    },
  };
}

/** انبار checkpoint درون-حافظه — ایزوله‌سازی تست‌های مکانیکی از SyncState */
class MemCheckpointStore {
  private cp: import("../src/lib/melk-api/bulk-import").BulkImportCheckpoint | null = null;
  async load() { return this.cp; }
  async save(cp: import("../src/lib/melk-api/bulk-import").BulkImportCheckpoint) { this.cp = cp; }
}

async function clearBulkTx(): Promise<void> {
  await db.transactionRecord.deleteMany({ where: { id: { startsWith: `${PREFIX}-tx-` } } });
  await db.syncState.update({ where: { id: "singleton" }, data: { bulkImportCheckpoint: null } }).catch(() => undefined);
}

function opts(over: Partial<BulkImportOptions> = {}): BulkImportOptions {
  return { entity: "transaction", ...over };
}

// ===================== ۰) توابع خالص =====================

describe("P6.5-03 — سیاست‌های خالص (retry/clamp/classify)", () => {
  test("دنباله backoff عین دستور: 2s→4s→8s→16s→30s + سقف + null پس از ۵", () => {
    expect(DEFAULT_RETRY_DELAYS_MS).toEqual([2000, 4000, 8000, 16000, 30000]);
    expect(retryDelayFor(1, 5)).toBe(2000);
    expect(retryDelayFor(2, 5)).toBe(4000);
    expect(retryDelayFor(3, 5)).toBe(8000);
    expect(retryDelayFor(4, 5)).toBe(16000);
    expect(retryDelayFor(5, 5)).toBe(30000);
    expect(retryDelayFor(6, 5)).toBe(null); // اتمام تلاش‌ها
    expect(retryDelayFor(9, 9)).toBe(30000); // سقف 30s برای maxRetries بزرگ‌تر
    expect(retryDelayFor(0, 5)).toBe(null);
  });

  test("clamp صفحه/دسته — بازه‌های مجاز طراحی §۱.۳", () => {
    expect(clampPageSize(undefined)).toBe(100);
    expect(clampPageSize(50)).toBe(100);   // کمینه
    expect(clampPageSize(500)).toBe(500);  // بیشینه
    expect(clampPageSize(999)).toBe(500);
    expect(clampBatchSize(undefined)).toBe(1000);
    expect(clampBatchSize(50)).toBe(100);
    expect(clampBatchSize(5000)).toBe(2000);
  });

  test("طبقه‌بندی خطا — 5xx/429/پرچم retryable ↔ 4xx فوری ↔ ناشناخته فوری", () => {
    expect(classifyFetchError(new MelkApiError("UNKNOWN", "سرور", 500, false)).retryable).toBe(true);
    expect(classifyFetchError(new MelkApiError("UNKNOWN", "شلوغ", 429, false)).retryable).toBe(true);
    expect(classifyFetchError(new MelkApiError("UNKNOWN", "شبکه", 0, true)).retryable).toBe(true);
    expect(classifyFetchError(new MelkApiError("INVALID_PERSONNEL_CODE", "درخواست", 400, false)).retryable).toBe(false);
    expect(classifyFetchError(new MelkApiError("UNAUTHORIZED", "توکن", 401, false)).retryable).toBe(false);
    expect(classifyFetchError(new Error("ناشناخته")).retryable).toBe(false);
    expect(classifyFetchError(new BulkFetchError("429", { status: 429, retryable: true, retryAfterMs: 25000 })))
      .toEqual({ retryable: true, retryAfterMs: 25000 });
  });
});

// ===================== ۴-الف) RateLimiter — واحد =====================

describe("P6.5-03 — RateLimiter (§۱.۸: فاصله پایان-پاسخ تا درخواست بعدی)", () => {
  test("۱۰۰ درخواست پیاپی — تمام فاصله‌ها ≥ حداقل مجاز (اندازه‌گیری واقعی)", async () => {
    const lim = new RateLimiter(15); // مقیاس کوچک برای سرعت تست — مکانیزم همان است
    const stamps: number[] = [];
    for (let i = 0; i < 100; i++) {
      await lim.wait();
      stamps.push(Date.now());
      await new Promise((r) => setTimeout(r, 2)); // کار شبیه درخواست
      lim.complete();
    }
    expect(stamps).toHaveLength(100);
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i] - stamps[i - 1]).toBeGreaterThanOrEqual(15);
    }
  }, 10_000);

  test("نخستین درخواست آزاد است (بدون خواب آغازین)", async () => {
    const lim = new RateLimiter(500);
    const t0 = Date.now();
    await lim.wait();
    expect(Date.now() - t0).toBeLessThan(50); // اگر منتظر می‌ماند ≥500ms می‌شد
  });
});

// ===================== ۱) پایه با موک — سینک واقعی مخزن =====================

describe("P6.5-03-۱ — خط لوله پایه با موک (سینک واقعی TransactionRepository)", () => {
  test("۱۰۰۰ رکورد (۱۰ صفحه×۱۰۰) → ۱۰۰۰ ذخیره واقعی + COMPLETED + شمارنده‌ها", async () => {
    await clearBulkTx();
    try {
      const pages = Array.from({ length: 10 }, (_, p) =>
        Array.from({ length: 100 }, (_, i) => txRow(p * 100 + i))
      );
      const fetcher = makeFetcher(pages);
      const progressCalls: BulkImportProgress[] = [];

      const result = await bulkImport(
        opts({ onProgress: (p) => progressCalls.push(p) }),
        { fetcher }
      );

      expect(result.status).toBe("COMPLETED");
      expect(result.progress.totalFetched).toBe(1000);
      expect(result.progress.totalSaved).toBe(1000);
      expect(result.progress.totalDuplicates).toBe(0);
      expect(result.progress.totalErrors).toBe(0);
      expect(result.progress.currentPage).toBe(10);
      expect(await db.transactionRecord.count({ where: { id: { startsWith: `${PREFIX}-tx-` } } })).toBe(1000);
      // رکوردها sourceRunId دارند (محافظت جاروی sync — §۱.۹)
      expect(await db.transactionRecord.count({ where: { id: { startsWith: `${PREFIX}-tx-` }, sourceRunId: { not: null } } })).toBe(1000);
      // onProgress برای هر صفحه صدا زده شد با شمارنده رشدیابنده
      expect(progressCalls.length).toBe(10);
      expect(progressCalls[9].totalFetched).toBe(1000);
      expect(progressCalls[0].checkpoint.lastPage).toBe(1);
      expect(fetcher.requestedPages).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    } finally {
      await clearBulkTx();
    }
  });

  test("صفحه خالی اول → COMPLETED با صفر ذخیره", async () => {
    await clearBulkTx();
    try {
      const result = await bulkImport(opts(), { fetcher: makeFetcher([]) });
      expect(result.status).toBe("COMPLETED");
      expect(result.progress.totalFetched).toBe(0);
      expect(result.progress.totalSaved).toBe(0);
    } finally {
      await clearBulkTx();
    }
  });

  test("برش batchSize — صفحه ۲۵۰تایی با دسته ۱۰۰ → saveBatchهای [100,100,50] + currentBatch=3", async () => {
    const sink = makeRecorderSink();
    const page = Array.from({ length: 250 }, (_, i) => txRow(1000 + i));
    const result = await bulkImport(
      opts({ batchSize: 100 }),
      { fetcher: makeFetcher([page]), sink }
    );
    expect(result.status).toBe("COMPLETED");
    expect(sink.batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(result.progress.currentBatch).toBe(3);
    expect(result.progress.totalSaved).toBe(250);
  });

  test("خطای رکورد منفرد → PARTIAL؛ بقیه دسته ذخیره می‌شوند", async () => {
    await clearBulkTx();
    try {
      const good = Array.from({ length: 9 }, (_, i) => txRow(2000 + i));
      const poison = { ...txRow(2099), propertyCode: undefined } as unknown as TransactionUpsertInput;
      const result = await bulkImport(
        opts(),
        { fetcher: makeFetcher([[...good, poison]]) }
      );
      expect(result.status).toBe("PARTIAL");
      expect(result.progress.totalErrors).toBe(1);
      expect(result.progress.totalSaved).toBe(9);
      expect(await db.transactionRecord.count({ where: { id: { startsWith: `${PREFIX}-tx-20` } } })).toBe(9);
    } finally {
      await clearBulkTx();
    }
  });
});

// ===================== ۲) Checkpoint + Resume =====================

describe("P6.5-03-۲ — Checkpoint و Resume (§۱.۴/§۱.۵)", () => {
  test("خطای قطعی صفحه ۴ (از ۶) → FAILED + checkpoint در صفحه ۳ + داده صفحات ۱-۳ سالم", async () => {
    await clearBulkTx();
    try {
      const pages = Array.from({ length: 6 }, (_, p) =>
        Array.from({ length: 50 }, (_, i) => txRow(3000 + p * 50 + i))
      );
      const result = await bulkImport(
        opts(),
        {
          fetcher: makeFetcher(pages, {
            failAt: (p) => (p === 4 ? new MelkApiError("INVALID_PERSONNEL_CODE", "درخواست نامعتبر", 400, false) : null),
          }),
        }
      );

      expect(result.status).toBe("FAILED");
      expect(result.error).toContain("صفحه 4");
      expect(result.error).toContain("checkpoint");
      // ۱۵۰ رکورد صفحات ۱-۳ ذخیره شدند
      expect(await db.transactionRecord.count({ where: { id: { startsWith: `${PREFIX}-tx-3` } } })).toBe(150);
      // checkpoint در SyncState نشست — lastPage=3
      const raw = await db.syncState.findUnique({ where: { id: "singleton" } });
      const cp = JSON.parse(raw!.bulkImportCheckpoint!);
      expect(cp.lastPage).toBe(3);
      expect(cp.entity).toBe("transaction");
      expect(cp.version).toBe(BULK_CHECKPOINT_VERSION);
      expect(cp.totals.fetched).toBe(150);
      expect(cp.runId).toBeTruthy();
    } finally {
      await clearBulkTx();
    }
  });

  test("اجرای مجدد → ادامه از صفحه ۴ (نه ۱)؛ صفر تکرار؛ شمارنده تجمعی درست", async () => {
    // خودکفا: اول شکست در صفحه ۴ بساز، بعد بلافاصله ادامه بده
    await clearBulkTx();
    try {
      const pages = Array.from({ length: 6 }, (_, p) =>
        Array.from({ length: 50 }, (_, i) => txRow(3000 + p * 50 + i))
      );
      const failed = await bulkImport(
        opts(),
        {
          fetcher: makeFetcher(pages, {
            failAt: (p) => (p === 4 ? new MelkApiError("INVALID_PERSONNEL_CODE", "درخواست نامعتبر", 400, false) : null),
          }),
        }
      );
      expect(failed.status).toBe("FAILED");

      const fetcher = makeFetcher(pages);
      const result = await bulkImport(opts(), { fetcher });

      expect(result.status).toBe("COMPLETED");
      // ادامه از صفحه ۴ — صفحات ۱-۳ هرگز دوباره واکشی نشدند
      expect(fetcher.requestedPages).toEqual([4, 5, 6]);
      // شمارنده تجمعی: ۱۵۰ (از checkpoint) + ۱۵۰ تازه
      expect(result.progress.totalFetched).toBe(300);
      expect(result.progress.totalSaved).toBe(300);
      // صفر رکورد تکراری — مجموع نهایی دقیقاً ۳۰۰
      expect(await db.transactionRecord.count({ where: { id: { startsWith: `${PREFIX}-tx-3` } } })).toBe(300);
    } finally {
      await clearBulkTx();
    }
  });

  test("checkpoint موجودیت/نسخه/بازه متفاوت → شروع تازه از صفحه ۱", async () => {
    await clearBulkTx();
    try {
      // checkpoint جعلی با موجودیت متفاوت + نسخه متفاوت
      await db.syncState.upsert({
        where: { id: "singleton" },
        update: { bulkImportCheckpoint: JSON.stringify({ entity: "expert", lastPage: 9, totalProcessed: 999, startedAt: "2026-01-01T00:00:00.000Z", lastRecordId: "x", version: "p99-x" }) },
        create: { id: "singleton", bulkImportCheckpoint: JSON.stringify({ entity: "expert", lastPage: 9, totalProcessed: 999, startedAt: "2026-01-01T00:00:00.000Z", lastRecordId: "x", version: "p99-x" }) },
      });
      const fetcher = makeFetcher([[txRow(4000)], [txRow(4001)]]);
      const result = await bulkImport(opts(), { fetcher });
      expect(result.status).toBe("COMPLETED");
      expect(fetcher.requestedPages).toEqual([1, 2]); // از ۱ شروع کرد نه ۱۰
      expect(result.progress.totalFetched).toBe(2);
    } finally {
      await clearBulkTx();
    }
  });

  test("انبار checkpoint — رفت‌وبرگشت JSON از طریق IntegrationRepository (SyncState)", async () => {
    const store = new SyncStateBulkCheckpointStore();
    const cp = {
      entity: "visit" as const,
      lastPage: 7,
      lastRecordId: "v-77",
      totalProcessed: 700,
      startedAt: "2026-09-17T00:00:00.000Z",
      version: BULK_CHECKPOINT_VERSION,
      runId: "run-x",
      updatedAt: "2026-09-17T01:00:00.000Z",
      dateRange: null,
      totals: { fetched: 700, saved: 700, duplicates: 0, errors: 0 },
    };
    await store.save(cp);
    const loaded = await store.load("visit");
    expect(loaded).toEqual(cp);
    // موجودیت متفاوت → null (شروع تازه)
    expect(await store.load("transaction")).toBeNull();
    // ستون خام در SyncState — فقط همین ستون لمس شد
    const raw = await db.syncState.findUnique({ where: { id: "singleton" } });
    expect(JSON.parse(raw!.bulkImportCheckpoint!).lastPage).toBe(7);
    await store.save({ ...cp, entity: "transaction", lastPage: 0 });
  });
});

// ===================== ۳) Idempotency + Upsert =====================

describe("P6.5-03-۳ — Idempotency مطلق (§۱.۶ + §۲.۴)", () => {
  test("اجرای مجدد کامل از صفر (checkpoint تازه) با همان داده → created=0؛ duplicates=1000؛ شمارش DB ثابت", async () => {
    await clearBulkTx();
    try {
      const pages = Array.from({ length: 10 }, (_, p) =>
        Array.from({ length: 100 }, (_, i) => txRow(5000 + p * 100 + i))
      );
      const first = await bulkImport(opts(), { fetcher: makeFetcher(pages) });
      expect(first.progress.totalSaved).toBe(1000);
      const countAfterFirst = await db.transactionRecord.count({ where: { id: { startsWith: `${PREFIX}-tx-5` } } });
      expect(countAfterFirst).toBe(1000);

      // پاک‌سازی checkpoint → اجرای مجدد از صفحه ۱ با همان داده
      await db.syncState.update({ where: { id: "singleton" }, data: { bulkImportCheckpoint: null } });
      const second = await bulkImport(opts(), { fetcher: makeFetcher(pages) });
      expect(second.status).toBe("COMPLETED");
      expect(second.progress.totalSaved).toBe(0);        // صفر نوشتار جدید
      expect(second.progress.totalDuplicates).toBe(1000); // همه تکراریِ بی‌تغییر
      expect(await db.transactionRecord.count({ where: { id: { startsWith: `${PREFIX}-tx-5` } } })).toBe(1000);
    } finally {
      await clearBulkTx();
    }
  });

  test("تغییر یک فیلد در منبع → فقط همان رکورد update می‌شود (updated=1)", async () => {
    await clearBulkTx();
    try {
      const pages = [[txRow(6000), txRow(6001)]];
      await bulkImport(opts(), { fetcher: makeFetcher(pages) });
      await db.syncState.update({ where: { id: "singleton" }, data: { bulkImportCheckpoint: null } });

      const changed = [[txRow(6000, { propertyCustomer: "فروشنده تغییریافته" }), txRow(6001)]];
      const second = await bulkImport(opts(), { fetcher: makeFetcher(changed) });
      expect(second.progress.totalSaved).toBe(1);        // فقط یک update
      expect(second.progress.totalDuplicates).toBe(1);
      const row = await db.transactionRecord.findUnique({ where: { id: `${PREFIX}-tx-6000` } });
      expect(row!.propertyCustomer).toBe("فروشنده تغییریافته");
    } finally {
      await clearBulkTx();
    }
  });

  test("merge non-null (§۲.۴) — فیلد تهیِ جدید، مقدار موجود را پاک نمی‌کند", async () => {
    await clearBulkTx();
    try {
      await bulkImport(opts(), { fetcher: makeFetcher([[txRow(6100, { contractHolo: "H-KEEP" })]]) });
      await db.syncState.update({ where: { id: "singleton" }, data: { bulkImportCheckpoint: null } });

      // اجرای بعدی همان رکورد با contractHolo تهی
      await bulkImport(opts(), { fetcher: makeFetcher([[txRow(6100, { contractHolo: null, propertyCustomer: null })]]) });
      const row = await db.transactionRecord.findUnique({ where: { id: `${PREFIX}-tx-6100` } });
      expect(row!.contractHolo).toBe("H-KEEP");       // حفظ شد
      expect(row!.propertyCustomer).toBe("فروشنده 6100"); // حفظ شد
    } finally {
      await clearBulkTx();
    }
  });
});

// ===================== ۴) Rate Limiting — سطح خط لوله =====================

describe("P6.5-03-۴ — Rate limiting در خط لوله (صفر فشار به مبدأ)", () => {
  test("۵ صفحه با rateLimitMs=100 — هر فاصله پایان-پاسخ تا درخواست بعدی ≥ 100ms", async () => {
    const timing: { start: number; end: number }[] = [];
    const pages = Array.from({ length: 5 }, (_, p) => [txRow(7000 + p)]);
    await bulkImport(
      opts({ rateLimitMs: 100 }),
      { fetcher: makeFetcher(pages, { recordTiming: timing }), sink: makeRecorderSink(), checkpointStore: new MemCheckpointStore() }
    );
    expect(timing).toHaveLength(5);
    for (let i = 1; i < timing.length; i++) {
      const gap = timing[i].start - timing[i - 1].end;
      expect(gap).toBeGreaterThanOrEqual(100);
      // و فاصله شروع-به-شروع نیز (شامل مدت خود درخواست) ≥ حد
      expect(timing[i].start - timing[i - 1].start).toBeGreaterThanOrEqual(100);
    }
  }, 10_000);
});

// ===================== ۵) Retry با backoff نمایی =====================

describe("P6.5-03-۵ — Retry با طبقه‌بندی خطا (§۱.۷)", () => {
  test("۵۰۰، ۵۰۰، موفق در سوم — تأخیرهای دقیق [2000, 4000]", async () => {
    const fake = makeFakeSleep();
    let calls = 0;
    const fetcher: BulkPageFetcher = {
      fetchPage: async () => {
        calls += 1;
        if (calls <= 2) throw new MelkApiError("UNKNOWN", "خطای موقت سرور", 500, false);
        return { rows: [txRow(8000)], hasMore: false };
      },
    };
    const result = await bulkImport(opts(), { fetcher, sleep: fake.sleep, checkpointStore: new MemCheckpointStore() });
    expect(result.status).toBe("COMPLETED");
    expect(calls).toBe(3);
    expect(fake.delays).toEqual([2000, 4000]); // عین سیاست دستور
    expect(result.progress.totalSaved).toBe(1);
  });

  test("۴۰۰ (غیرقابل retry) → صفر خواب، صفر تلاش مجدد، FAILED فوری + checkpoint صفحه قبل", async () => {
    await clearBulkTx();
    try {
      const fake = makeFakeSleep();
      let calls = 0;
      const fetcher: BulkPageFetcher = {
        fetchPage: async (req) => {
          calls += 1;
          if (req.page === 2) throw new MelkApiError("INVALID_PERSONNEL_CODE", "درخواست نامعتبر", 400, false);
          return { rows: [txRow(8100 + req.page)], hasMore: req.page < 3 };
        },
      };
      const result = await bulkImport(opts(), { fetcher, sleep: fake.sleep });
      expect(result.status).toBe("FAILED");
      expect(calls).toBe(2);
      expect(fake.delays).toEqual([]);
      const raw = await db.syncState.findUnique({ where: { id: "singleton" } });
      expect(JSON.parse(raw!.bulkImportCheckpoint!).lastPage).toBe(1);
    } finally {
      await clearBulkTx();
    }
  });

  test("429 با Retry-After — تأخیر = max(سیاست, Retry-After)", async () => {
    const fake = makeFakeSleep();
    let calls = 0;
    const fetcher: BulkPageFetcher = {
      fetchPage: async () => {
        calls += 1;
        if (calls === 1) throw new BulkFetchError("مبدأ شلوغ است", { status: 429, retryable: true, retryAfterMs: 25000 });
        return { rows: [], hasMore: false };
      },
    };
    const result = await bulkImport(opts(), { fetcher, sleep: fake.sleep, checkpointStore: new MemCheckpointStore() });
    expect(result.status).toBe("COMPLETED");
    expect(fake.delays).toEqual([25000]); // احترام به Retry-After مبدأ (بیشتر از سیاست 2s)
  });

  test("خطای دائمی پس از ۵ retry — ۶ فراخوانی + دنباله کامل [2,4,8,16,30] + FAILED", async () => {
    const fake = makeFakeSleep();
    let calls = 0;
    const fetcher: BulkPageFetcher = {
      fetchPage: async () => {
        calls += 1;
        throw new MelkApiError("UNKNOWN", "سرور پایین است", 503, false);
      },
    };
    const result = await bulkImport(opts(), { fetcher, sleep: fake.sleep, checkpointStore: new MemCheckpointStore() });
    expect(result.status).toBe("FAILED");
    expect(calls).toBe(6); // ۱ اصلی + ۵ retry
    expect(fake.delays).toEqual([2000, 4000, 8000, 16000, 30000]);
    expect(result.error).toContain("سرور پایین است");
  });
});

// ===================== ۶) هم‌زیستی sync + bulk (بخش D دستور — الزامی) =====================

describe("P6.5-03-۶ — رگرسیون هم‌زیستی sync افزایشی + Bulk (§۱.۹ + کشف P6.5-03)", () => {
  test("پس از Bulk، sync افزایشی هیچ رکورد Bulk را حذف نمی‌کند؛ سنگ‌قبر غیر-Bulk جارو می‌شود", async () => {
    await clearBulkTx();
    try {
      // ۱) Bulk: ۲۰ معامله تاریخی (sourceRunId غیرتهی)
      const bulkPages = Array.from({ length: 4 }, (_, p) =>
        Array.from({ length: 5 }, (_, i) => txRow(9000 + p * 5 + i))
      );
      const bulk = await bulkImport(opts(), { fetcher: makeFetcher(bulkPages) });
      expect(bulk.status).toBe("COMPLETED");
      expect(await db.transactionRecord.count({ where: { id: { startsWith: `${PREFIX}-tx-9` } } })).toBe(20);

      // ۲) سنگ‌قبر غیر-Bulk: رکورد sync قدیمی که دیگر در ARM نیست
      const staleId = `${PREFIX}-tx-stale`;
      await db.transactionRecord.create({
        data: { id: staleId, contractDate: new Date("2025-01-01T00:00:00Z"), propertyCode: "P-stale", sourceRunId: null },
      });

      // ۳) sync افزایشی با پنجره کوچک: ۲ کلید هم‌پوشان با Bulk + ۱ تازه
      const syncRows = [
        { ...txRow(9000, { eventsCount: 7 }), id: `${PREFIX}-tx-9000` }, // هم‌پوشان
        { ...txRow(9001), id: `${PREFIX}-tx-9001` },                     // هم‌پوشان
        { id: `${PREFIX}-tx-fresh`, contractDate: new Date("2026-06-01T00:00:00Z"), propertyCode: "P-fresh", propertyCustomer: "جدید", requestCode: null, requestCustomer: null, contractHolo: null, suggestedPropertyCount: 0, eventsCount: 0 },
      ];
      await applyIncrementalSync("p6503-coexist-run", {
        transactions: syncRows as never[],
        experts: [],
        interactions: [],
        visits: [],
        supplyDemand: [],
        contracts: [],
        interactionsFetched: false,
        visitsFetched: false,
        supplyDemandFetched: false,
        contractsFetched: false,
      });

      // ۴) شاهد شمارشی (§۱.۹-د): هیچ رکورد Bulk حذف نشد
      const bulkRemaining = await db.transactionRecord.count({ where: { id: { startsWith: `${PREFIX}-tx-9` } } });
      expect(bulkRemaining).toBe(20);
      // کلید هم‌پوشان update شد نه حذف/بازسازی — و محافظتش باقی ماند
      const overlapped = await db.transactionRecord.findUnique({ where: { id: `${PREFIX}-tx-9000` } });
      expect(overlapped!.eventsCount).toBe(7);
      expect(overlapped!.sourceRunId).not.toBeNull();
      // سنگ‌قبر غیر-Bulk جارو شد (رفتار v1 حفظ)
      expect(await db.transactionRecord.findUnique({ where: { id: staleId } })).toBeNull();
      // رکورد تازه sync نشست (sourceRunId تهی — مسیر sync)
      const fresh = await db.transactionRecord.findUnique({ where: { id: `${PREFIX}-tx-fresh` } });
      expect(fresh).not.toBeNull();
      expect(fresh!.sourceRunId).toBeNull();
    } finally {
      await clearBulkTx();
      await db.transactionRecord.deleteMany({ where: { id: `${PREFIX}-tx-stale` } });
    }
  });
});

// ===================== ۷) سینک مخزن — پوشش موجودیت‌های دیگر =====================

describe("P6.5-03-۷ — سینک مخزن سایر موجودیت‌ها (قرارداد هفت‌گانه)", () => {
  test("expert + interaction + visit + contract + listing + request: upsertBulk با merge non-null و کلید طبیعی", async () => {
    const sink = createRepositorySink("expert");
    const stats = await sink.saveBatch(
      [{ id: "p6503-ex-1", personnelCode: "6503001", fullName: "مشاور انبوه", mobile: "09140000001", role: "کارشناس", businessTitle: "شعبه", creator: null, active: true, createdAt: new Date("2026-01-01T00:00:00Z") }],
      { sourceRunId: "p6503-run", entity: "expert" }
    );
    expect(stats.created).toBe(1);
    // دوباره با فیلد تهی جدید → duplicate (بی‌تغییر) — merge non-null
    const again = await sink.saveBatch(
      [{ id: "p6503-ex-1", personnelCode: "6503001", fullName: "مشاور انبوه", mobile: "09140000001", role: null as unknown as string, businessTitle: "شعبه", creator: null, active: true, createdAt: new Date("2026-01-01T00:00:00Z") }],
      { sourceRunId: "p6503-run", entity: "expert" }
    );
    expect(again.created).toBe(0);
    expect(again.duplicates).toBe(1);
    await db.expertRecord.deleteMany({ where: { id: "p6503-ex-1" } });

    // visit
    const vSink = createRepositorySink("visit");
    const vStats = await vSink.saveBatch(
      [{ id: "p6503-vi-1", propertyCode: "P-1", requesterName: "مشتری", checkerName: "بررسی‌گر", propertyRealtorName: "مشاور", checkTime: null, createdAt: new Date("2026-01-01T00:00:00Z"), status: "" }],
      { sourceRunId: "p6503-run", entity: "visit" }
    );
    expect(vStats.created).toBe(1);
    await db.visitRecord.deleteMany({ where: { id: "p6503-vi-1" } });

    // interaction
    const iSink = createRepositorySink("interaction");
    const iStats = await iSink.saveBatch(
      [{ id: "p6503-in-1", requestRealtorName: "الف", propertyRealtorName: "ب", count: 3 }],
      { sourceRunId: "p6503-run", entity: "interaction" }
    );
    expect(iStats.created).toBe(1);
    await db.interactionRecord.deleteMany({ where: { id: "p6503-in-1" } });

    // contract
    const cSink = createRepositorySink("contract");
    const cStats = await cSink.saveBatch(
      [{ id: "p6503-ct-1", status: "finished", contractHolo: "H", propertyCode: "P", requestCode: null, contractType: null, creatorName: null, createdAt: null, contractDate: null, documentDate: null, deliveryDate: null, propertyTitle: null, propertyAddress: null, buyerListJson: null, sellerListJson: null, realtorListJson: null, canAddRealtor: false }],
      { sourceRunId: "p6503-run", entity: "contract" }
    );
    expect(cStats.created).toBe(1);
    await db.contractRecord.deleteMany({ where: { id: "p6503-ct-1" } });

    // listing → PropertyRecord (کلید propertyCode)
    const lSink = createRepositorySink("listing");
    const lStats = await lSink.saveBatch(
      [{ id: "p6503-pr-1", propertyCode: "PC-6503", title: "آپارتمان انبوه", price: 5_000_000_000 }],
      { sourceRunId: "p6503-run", entity: "listing" }
    );
    expect(lStats.created).toBe(1);
    const prRow = await db.propertyRecord.findUnique({ where: { propertyCode: "PC-6503" } });
    expect(prRow!.sourceRunId).toBe("p6503-run");
    expect(prRow!.tenantId).toBe("melk-tabriz");
    await db.propertyRecord.deleteMany({ where: { id: "p6503-pr-1" } });

    // request → RequestRecord با source='arm' (کلید requestCode)
    const rSink = createRepositorySink("request");
    const rStats = await rSink.saveBatch(
      [{ id: "p6503-req-1", requestCode: "RC-6503", customerName: "مشتری انبوه" }],
      { sourceRunId: "p6503-run", entity: "request" }
    );
    expect(rStats.created).toBe(1);
    const rqRow = await db.requestRecord.findUnique({ where: { requestCode: "RC-6503" } });
    expect(rqRow!.source).toBe("arm");
    expect(rqRow!.sourceRunId).toBe("p6503-run");
    expect(rqRow!.actorCode).toBe("arm");
    await db.requestRecord.deleteMany({ where: { id: "p6503-req-1" } });
  });
});
