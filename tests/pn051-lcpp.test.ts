/**
 * PN-051 · فرمان ۸ — تست‌های پذیرش هستهٔ LCPP (بقا · سرعت · صحت · Delta)
 * ---------------------------------------------------------------------------
 * اجرا: bun test tests/pn051-lcpp.test.ts
 * پوشش معیارهای حکم (بخش‌های تست‌پذیر درون-فرایندی):
 *   ۱) بقا: محافظ قانون ۰۴ (null/'' هرگز روی پر نمی‌نشیند) + اتمی‌بودن Chunk
 *          (شکست وسط دسته = صفر اثر جزئی — «kill -9 وسط Sync» در سطح Chunk)
 *   ۲) سرعت: Chunkهای ۵۰۰تایی + همزمانی ≤۳ (خط قرمز ≤۵)
 *   ۳) Delta (فرمان ۵): هش صفحه → skip · commit → lastSyncAt
 *   ۴) تأخیر تطبیقی: خطای 429 → عقب‌کشی
 *   ۵) صحت: کدک epoch-ms · Zod اعتبارسنجی کلید طبیعی · ماتریس منبع ستون‌ها
 *   ۶) فرمان ۷: چرخهٔ عمر پرچم Force Refresh + وضعیت UI (فاز A/B)
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ── ایزوله‌سازی فایل‌های وضعیت/delta پیش از هر import از ماژول ──
const ISO_DIR = mkdtempSync(join(tmpdir(), "pn051-lcpp-"));
process.env.MELK_LCPP_RUNTIME_DIR = ISO_DIR;

import {
  SqlBulkWriter,
  createBulkWriter,
  runPool,
  openDelta,
  sqlValue,
  updateListStatus,
  markCycleStart,
  markCycleEnd,
  readLcppStatus,
  PHASE_LABELS,
  requestForceRefresh,
  peekForceRefresh,
  clearForceRefresh,
  CHUNK_SIZE,
  CONCURRENCY,
  type BulkTableSpec,
} from "@/sync/lists/kernel";
import { resolveSource, columnsForLane, endpointSelectionReport, COLUMN_SOURCE_MAP } from "@/lib/column-source-map";
import { validateRow as m1Validate } from "@/sync/lists/arm-listings";
import { validateRow as m9Validate } from "@/sync/lists/transactions";

/** جدول آزمایشی — کلید طبیعی code (UNIQUE) عین الگوی propertyCode */
const TEST_SPEC: BulkTableSpec = {
  table: "LcppTestRow",
  naturalKey: "code",
  columns: ["name", "score", "flag"],
  metaColumns: ["syncedAt"],
};

const DB_PATH = join(ISO_DIR, "lcpp-test.db");
let writer: SqlBulkWriter;

/** درایور آزمایشی متناسب با ران‌تایم — در Bun: bun:sqlite (ADR-051-03 —
 *  better-sqlite3 در Bun 1.3.14 با NAPI FATAL می‌اشکند · در Node سالم) */
async function openTestDb(): Promise<{ exec(sql: string): unknown; close(): void }> {
  const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
  if (isBun) {
    const modId = ["bun", "sqlite"].join(":");
    const mod = (await import(modId)) as { Database: new (p: string) => { exec(s: string): unknown; close(): void } };
    return new mod.Database(DB_PATH);
  }
  const mod = (await import("better-sqlite3")) as { default: new (p: string) => { exec(s: string): unknown; close(): void } };
  return new mod.default(DB_PATH);
}

beforeAll(async () => {
  const setup = await openTestDb();
  setup.exec(
    `CREATE TABLE IF NOT EXISTS LcppTestRow (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       code TEXT NOT NULL UNIQUE,
       name TEXT,
       score REAL,
       flag INTEGER,
       syncedAt INTEGER
     )`
  );
  setup.close();
  writer = await createBulkWriter(DB_PATH);
});

afterAll(() => {
  writer.close();
  rmSync(ISO_DIR, { recursive: true, force: true });
});

describe("فرمان ۱/۴ — محافظ قانون ۰۴ (null روی پر نمی‌نشیند)", () => {
  test("مقدار نال ورودی، مقدار موجود را حفظ می‌کند؛ مقدار معتبر جایگزین می‌شود", () => {
    writer.upsertBulk(TEST_SPEC, [{ code: "A", name: "first", score: 10, flag: 1, syncedAt: new Date() }]);
    // نام نال → باید «first» بماند؛ score تازه جایگزین
    writer.upsertBulk(TEST_SPEC, [{ code: "A", name: null, score: 20, syncedAt: new Date() }]);
    const row = writer.currentValues(TEST_SPEC, "A", ["name", "score"]) as { name: string | null; score: number | null };
    expect(row?.name).toBe("first");
    expect(row?.score).toBe(20);
    // نام معتبر → جایگزین
    writer.upsertBulk(TEST_SPEC, [{ code: "A", name: "second", score: 20, syncedAt: new Date() }]);
    const row2 = writer.currentValues(TEST_SPEC, "A", ["name"]) as { name: string | null };
    expect(row2?.name).toBe("second");
  });

  test("رشتهٔ خالی مثل null رفتار می‌کند (هم‌ارز normValue)", () => {
    writer.upsertBulk(TEST_SPEC, [{ code: "B", name: "keep-me", syncedAt: new Date() }]);
    writer.upsertBulk(TEST_SPEC, [{ code: "B", name: "", syncedAt: new Date() }]);
    const row = writer.currentValues(TEST_SPEC, "B", ["name"]) as { name: string | null };
    expect(row?.name).toBe("keep-me");
  });
});

describe("فرمان ۸ بند ۲ — بقا: Chunk اتمی ۵۰۰تایی (شبیه‌سازی شکست وسط Sync)", () => {
  test("۱۱۰۰ ردیف → دقیقاً ۳ Chunk (۵۰۰+۵۰۰+۱۰۰) همه نوشته می‌شوند", () => {
    const rows = Array.from({ length: 1100 }, (_, i) => ({
      code: `bulk-${i}`,
      name: `row-${i}`,
      score: i,
      syncedAt: new Date(),
    }));
    const r = writer.upsertBulk(TEST_SPEC, rows);
    expect(r.written).toBe(1100);
    expect(r.chunks).toBe(3);
    expect(CHUNK_SIZE).toBe(500); // عین حکم فرمان ۴
  });

  test("ردیف معیوب وسط Chunk → کل Chunk عقب می‌غلتد (صفر اثر جزئی — اتمی)", () => {
    // ۵۰۰ ردیف سالم (Chunk ۱) + ۵۰۰ ردیف با یکی معیوب (Chunk ۲) → فقط Chunk ۱ کامیت
    const good = Array.from({ length: 500 }, (_, i) => ({ code: `atom-${i}`, name: "ok", syncedAt: new Date() }));
    writer.upsertBulk(TEST_SPEC, good);
    const before = writer.rawAll<{ c: number }>("SELECT COUNT(*) AS c FROM LcppTestRow")[0].c;
    const badChunk: Array<Record<string, unknown>> = Array.from({ length: 499 }, (_, i) => ({ code: `atom2-${i}`, name: "ok", syncedAt: new Date() }));
    badChunk.push({ code: "atom2-bad", name: { invalid: "object-binding" }, syncedAt: new Date() });
    expect(() => writer.upsertBulk(TEST_SPEC, badChunk)).toThrow();
    const after = writer.rawAll<{ c: number }>("SELECT COUNT(*) AS c FROM LcppTestRow")[0].c;
    expect(after).toBe(before); // هیچ‌کدام از ۴۹۹+۱ ردیف Chunk شکست‌خورده ننوشت
  });
});

describe("فرمان ۵ — Delta Sync (هش صفحه · lastSyncTime)", () => {
  test("صفحهٔ بی‌تغییر → true (skip DB) · صفحهٔ تغییر‌یافته → false", () => {
    const delta = openDelta("test-list");
    const payload = [{ id: 1, t: "a" }, { id: 2, t: "b" }];
    const first = delta.pageUnchanged("test-list", "p1", payload);
    const second = delta.pageUnchanged("test-list", "p1", payload);
    const changed = delta.pageUnchanged("test-list", "p1", [...payload, { id: 3, t: "c" }]);
    expect(first).toBe(false);
    expect(second).toBe(true);
    expect(changed).toBe(false);
  });

  test("commit → lastSyncAt تازه است", () => {
    const delta = openDelta("test-list");
    expect(delta.lastSyncAt()).toBeNull();
    const before = Date.now();
    delta.commit("test-list");
    const at = delta.lastSyncAt()?.getTime() ?? 0;
    expect(at).toBeGreaterThanOrEqual(before - 5_000);
  });
});

describe("فرمان ۴ — همزمانی ≤۳ و تأخیر تطبیقی", () => {
  test("۱۰ کار همزمان → هر لحظه حداکثر ۳ فعال (خط قرمز ≤۵)", async () => {
    let active = 0;
    let maxActive = 0;
    const stats = await runPool(
      Array.from({ length: 10 }, (_, i) => i),
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 30));
        active -= 1;
      },
      { initialDelayMs: 5 }
    );
    expect(stats.processed).toBe(10);
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(CONCURRENCY).toBe(3);
  });

  test("خطای 429 → تأخیر عقب‌کشی می‌کند", async () => {
    const stats = await runPool(
      [1, 2, 3],
      async () => {
        throw new Error("HTTP 429 too many requests");
      },
      { initialDelayMs: 100 }
    );
    expect(stats.failures).toBe(3);
    expect(stats.delayMs).toBeGreaterThan(100); // ×۱٫۵ پس از فشار
  });
});

describe("فرمان ۸ بند ۴ — صحت: کدک epoch-ms و اعتبارسنجی Zod", () => {
  test("sqlValue: Date→epoch-ms عدد صحیح · boolean→0/1 · undefined→null", () => {
    const d = new Date("2026-10-28T12:00:00.000Z");
    expect(sqlValue(d)).toBe(d.getTime());
    expect(typeof sqlValue(d)).toBe("number");
    expect(sqlValue(true)).toBe(1);
    expect(sqlValue(false)).toBe(0);
    expect(sqlValue(undefined)).toBeNull();
    expect(sqlValue("متن")).toBe("متن");
  });

  test("M1: ردیف بی‌کدآگهی رد · ردیف معتبر می‌گذرد", () => {
    expect(m1Validate(null)).toBeNull();
    expect(m1Validate({ propertyCode: "" })).toBeNull(); // Zod min(1)
    expect(m1Validate({ propertyCode: "TB-100", title: "ویلا" })).not.toBeNull();
  });

  test("M9: ردیف بی‌شناسه معامله رد", () => {
    expect(m9Validate(null)).toBeNull();
    expect(m9Validate({ id: "" })).toBeNull();
    expect(m9Validate({ id: "tx-1" })).not.toBeNull();
  });
});

describe("فرمان ۲ — ماتریس کشف Endpoint (column-source-map)", () => {
  test("مالک آگهی: primary=arm_owner · fallback=public_site · lane=critical", () => {
    const rule = resolveSource("property", "owner");
    expect(rule?.primary).toBe("arm_owner");
    expect(rule?.fallback).toBe("public_site");
    expect(rule?.lane).toBe("critical");
  });

  test("ستون‌های حیاتی معامله (فرمان ۶): مبلغ · وضعیت · کارشناس همگی critical", () => {
    const criticals = columnsForLane("transaction", "critical").map((r) => r.column);
    for (const col of ["parties", "amount", "date", "expert"]) expect(criticals).toContain(col);
  });

  test("ownerNote مقدس است: منبع یگانه crm_private · بدون fallback", () => {
    const rule = resolveSource("property", "ownerNote");
    expect(rule?.primary).toBe("crm_private");
    expect(rule?.fallback).toBeNull();
  });

  test("گزارش endpoint markdown شامل هر سه موجودیت است", () => {
    const md = endpointSelectionReport(new Date("2026-10-28T00:00:00Z"));
    expect(md).toContain("آگهی‌ها");
    expect(md).toContain("درخواست‌ها");
    expect(md).toContain("معاملات");
    expect(Object.keys(COLUMN_SOURCE_MAP)).toEqual(["property", "request", "transaction"]);
  });
});

describe("فرمان ۷ — پرچم Force Refresh و وضعیت UI فاز A/B", () => {
  test("چرخهٔ عمر پرچم: request → peek=true → clear → peek=false", () => {
    expect(peekForceRefresh()).toBe(false);
    expect(requestForceRefresh()).toBe(true);
    expect(peekForceRefresh()).toBe(true);
    clearForceRefresh();
    expect(peekForceRefresh()).toBe(false);
  });

  test("نشانگر UI: فاز A «در حال دریافت اطلاعات حیاتی…» · فاز B «در حال تکمیل جزئیات…»", () => {
    markCycleStart("cycle-test");
    updateListStatus("m1-arm-listings", { phase: "fast-pass", progressPct: 50, fetched: 100, written: 40 });
    let s = readLcppStatus();
    expect(s.running).toBe(true);
    expect(s.lists["m1-arm-listings"].label).toBe(PHASE_LABELS["fast-pass"]);
    expect(PHASE_LABELS["fast-pass"]).toContain("اطلاعات حیاتی");
    updateListStatus("m1-arm-listings", { phase: "deep-pass", progressPct: 80 });
    s = readLcppStatus();
    expect(s.lists["m1-arm-listings"].label).toBe(PHASE_LABELS["deep-pass"]);
    expect(PHASE_LABELS["deep-pass"]).toContain("تکمیل جزئیات");
    markCycleEnd("done");
    s = readLcppStatus();
    expect(s.running).toBe(false);
    expect(s.phase).toBe("done");
  });
});
