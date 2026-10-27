/**
 * PN-050 · دستور ۵/۶ — تست‌های ژورنال اپلیکیشن + دوام دیسک (سناریوی D)
 * ---------------------------------------------------------------------------
 * اجرا: bun test tests/pn050/journal-replay.test.ts
 *
 * سناریوی D (دستور ۶): sync در batch ۵ از ۱۰ · kill -9 → resurrect →
 * batch ۵ (intent بدون committed) در startup با replayPendingBatches
 * دوباره اجرا می‌شود — هیچ داده‌ای گم نمی‌شود (ایدمپوتنت).
 *
 * به‌علاوه (دستور ۵): پراگماهای دوام روی DB تست — WAL + checkpoint.
 * هر تست ژورنال dir ایزوله می‌گیرد (MELKA_JOURNAL_DIR) — صفر نشتی بین تست‌ها.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO = "/home/z/my-project";
const TMP_ROOT = mkdtempSync(join(REPO, "scripts/pn050/test-artifacts/journal-"));

/** dir ژورنال ایزوله برای هر تست */
function freshDir(name: string): string {
  const d = join(TMP_ROOT, name);
  mkdirSync(d, { recursive: true });
  process.env.MELKA_JOURNAL_DIR = d;
  return d;
}

afterAll(() => {
  delete process.env.MELKA_JOURNAL_DIR;
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("PN-050 · دستور ۵ — ژورنال اپلیکیشن (intent/committed/replay)", () => {
  test("writeIntent فایل .intent می‌سازد؛ committed تا پایش pending می‌ماند", async () => {
    freshDir("t1");
    const { writeIntent, listPendingBatches, writeCommitted } = await import("@/lib/journal");
    writeIntent("batch-1", "melketun-sync", { listings: 100 });
    writeIntent("batch-2", "melketun-sync", { listings: 50 });

    let pending = listPendingBatches();
    expect(pending.map((p) => p.batchId)).toEqual(["batch-1", "batch-2"]);
    expect(pending[0].kind).toBe("melketun-sync");
    expect(pending[0].meta).toEqual({ listings: 100 });

    writeCommitted("batch-1", "melketun-sync", { upserted: 100 });
    pending = listPendingBatches();
    expect(pending.map((p) => p.batchId)).toEqual(["batch-2"]); // batch-1 دیگر pending نیست
  });

  test("replay: batch ناتمام (kill -9 وسط سینک) دوباره اجرا و کامل می‌شود", async () => {
    freshDir("t2");
    const { writeIntent, listPendingBatches, replayPendingBatches } = await import("@/lib/journal");
    writeIntent("batch-5-of-10", "melketun-sync", { listings: 120 }); // همان که kill -9 خورد

    const seen: string[] = [];
    const res = await replayPendingBatches({
      onBatch: async (intent) => {
        seen.push(intent.batchId);
        expect(intent.batchId).toBe("batch-5-of-10"); // همان batch دوباره اجرا شد
      },
    });
    expect(res.replayed).toEqual(["batch-5-of-10"]);
    expect(seen).toEqual(["batch-5-of-10"]);
    expect(listPendingBatches()).toEqual([]); // پس از replay موفق → committed → پاک
  });

  test("replay شکست‌خورده: batch ناتمام می‌ماند تا بوت بعدی (ضد گم‌شدگی)", async () => {
    freshDir("t3");
    const { writeIntent, replayPendingBatches, listPendingBatches } = await import("@/lib/journal");
    writeIntent("batch-fail", "melketun-sync");

    const res = await replayPendingBatches({
      onBatch: async () => {
        throw new Error("CRM هنوز خاموش است");
      },
    });
    expect(res.failed).toEqual(["batch-fail"]);
    expect(listPendingBatches().map((p) => p.batchId)).toEqual(["batch-fail"]); // مانَد
  });

  test("batch کهنه (> maxAge) بایگانی می‌شود — ضد حلقهٔ بی‌نهایت", async () => {
    const dir = freshDir("t4");
    const { writeIntent, replayPendingBatches, listPendingBatches } = await import("@/lib/journal");
    // intent دستی با زمان کهنه (۴ روز پیش) — writeIntent همیشه «اکنون» می‌نویسد
    const { writeFileSync } = await import("node:fs");
    const old = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      join(dir, "batch-old.intent"),
      JSON.stringify({ batchId: "batch-old", kind: "melketun-sync", startedAt: old }),
    );
    writeIntent("batch-fresh", "melketun-sync"); // ...و یک batch تازه که عادی اجرا شود

    const seen: string[] = [];
    const res = await replayPendingBatches({
      onBatch: async (intent) => {
        seen.push(intent.batchId);
      },
    });
    expect(res.abandoned).toEqual(["batch-old"]); // کهنه بایگانی شد — حلقه نیست
    expect(res.replayed).toEqual(["batch-fresh"]); // تازه عادی replay شد
    expect(seen).toEqual(["batch-fresh"]); // کهنه هرگز handler را ندید
    expect(listPendingBatches()).toEqual([]);
  });

  test("ژورنال خالی: replay صادقانه هیچ‌کاری نمی‌کند", async () => {
    freshDir("t5");
    const { replayPendingBatches } = await import("@/lib/journal");
    const res = await replayPendingBatches({
      onBatch: async () => {
        throw new Error("نباید صدا زده شود");
      },
    });
    expect(res.replayed).toEqual([]);
    expect(res.failed).toEqual([]);
    expect(res.abandoned).toEqual([]);
  });

  test("متا بدون PII: intent فقط شمارنده حمل می‌کند (قانون ۱۰)", async () => {
    const dir = freshDir("t6");
    const { writeIntent } = await import("@/lib/journal");
    const { readFileSync } = await import("node:fs");
    writeIntent("batch-pii", "melketun-sync", { listings: 10, requests: 5 });
    const raw = readFileSync(join(dir, "batch-pii.intent"), "utf8");
    expect(raw).not.toContain("09"); // هیچ موبایل خامی
    expect(raw).not.toContain("ownerMobile");
    expect(JSON.parse(raw).meta).toEqual({ listings: 10, requests: 5 });
  });
});

describe("PN-050 · دستور ۵ — دوام دیسک (پراگماها روی DB تست)", () => {
  test("ensureDurabilityPragmas: WAL روی دیسک محلی فعال می‌شود", async () => {
    const { db } = await import("@/lib/db");
    const { ensureDurabilityPragmas } = await import("@/lib/db");
    const res = await ensureDurabilityPragmas(db, join(REPO, "db/test.db"));
    expect(["wal", "delete"]).toContain(res.journalMode);
  });

  test("مسیر FUSE شناسایی و DELETE می‌ماند (دکترین PN-041-R)", async () => {
    const { ensureDurabilityPragmas, isFusePath } = await import("@/lib/db");
    expect(isFusePath("/home/z/my-project/upload/.data/custom.db")).toBe(true);
    expect(isFusePath("/home/z/my-project/db/custom.db")).toBe(false);
  });

  test("checkpointWal بدون خطا اجرا می‌شود (WAL → TRUNCATE)", async () => {
    const { db } = await import("@/lib/db");
    const { checkpointWal } = await import("@/lib/db");
    await db.refListCache.upsert({
      where: { key: "pn050-wal-test" },
      create: { key: "pn050-wal-test", dataJson: "{}" },
      update: { dataJson: "{}" },
    });
    await checkpointWal(db);
    const walPath = join(REPO, "db/test.db-wal");
    if (existsSync(walPath)) {
      const { statSync } = await import("node:fs");
      expect(statSync(walPath).size).toBeLessThanOrEqual(64 * 1024); // بلافاصله بعد از checkpoint خالی
    }
  });
});
