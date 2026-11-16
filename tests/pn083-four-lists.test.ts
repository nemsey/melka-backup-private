/**
 * تست‌های PN-083 — هماهنگ‌ساز فراجامع بروزرسانی چهار فهرست داشبورد ملک تبریز
 * ---------------------------------------------------------------------------
 * پوشش:
 *   ۱) ساختار FOUR_LISTS (چهار فهرست · jobId/lockId یکتا · اتصال به JOB_IDS)
 *   ۲) پرچم درخواست فوری مشاوران (experts-force.flag — چرخهٔ کامل ثبت/پرسش/پاک‌سازی)
 *   ۳) قفل بین‌فرایندی update:mX (دو مسیر هم‌زمان → تنها یکی اجرا؛ دومي صادقانه رد)
 *   ۴) وضعیت یکپارچهٔ SyncJobState (list-mX) — نوشتن/خواندن/ادغام در نمای چهارگانه
 *   ۵) runExpertsListUpdate بدون توکن → ثبت صادقانهٔ خطا + ran=false
 *   ۶) نمای یکپارچه readFourListsUnified — هر چهار کلید، برچسب، وضعیت
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// دایرکتوری اجرایی ایزوله برای پرچم‌ها (عین الگوی MELK_LCPP_RUNTIME_DIR)
const RUNTIME_DIR = mkdtempSync(join(tmpdir(), "pn083-runtime-"));
process.env.MELK_LCPP_RUNTIME_DIR = RUNTIME_DIR;

const { db } = await import("@/lib/db");
const { ensureJobLockTable, JobLockService } = await import("@/core/runtime/joblock");
const {
  FOUR_LISTS,
  FOUR_LIST_IDS,
  parseFourListId,
  requestExpertsForceRefresh,
  peekExpertsForceRefresh,
  clearExpertsForceRefresh,
  withListLock,
  listLockHolder,
  upsertFourListState,
  runExpertsListUpdate,
  readFourListsUnified,
  SOURCE_LABELS,
} = await import("@/lib/melk-api/four-lists");
const { JOB_IDS } = await import("@/lib/melk-api/job-state");

beforeAll(async () => {
  await ensureJobLockTable(db);
  // پاک‌سازی ردیف‌های این تست (قفل‌ها + وضعیت فهرست‌ها)
  await db.jobLock.deleteMany({ where: { jobId: { startsWith: "update:" } } });
  await db.syncJobState.deleteMany({ where: { jobId: { startsWith: "list-" } } });
});

afterAll(async () => {
  await db.jobLock.deleteMany({ where: { jobId: { startsWith: "update:" } } });
  await db.syncJobState.deleteMany({ where: { jobId: { startsWith: "list-" } } });
  await db.$disconnect();
  rmSync(RUNTIME_DIR, { recursive: true, force: true });
});

describe("PN-083 · ۱) ساختار یکتای چهار فهرست", () => {
  test("۱-۱ دقیقاً چهار فهرست M1-M4 با برچسب فارسی", () => {
    expect(FOUR_LIST_IDS).toEqual(["m1", "m2", "m3", "m4"]);
    for (const id of FOUR_LIST_IDS) {
      expect(FOUR_LISTS[id].label.length).toBeGreaterThan(3);
      expect(FOUR_LISTS[id].shortLabel.length).toBeGreaterThan(2);
    }
  });

  test("۱-۲ jobId/lockId یکتا و متصل به JOB_IDS (منبع یگانه)", () => {
    const jobIds = FOUR_LIST_IDS.map((id) => FOUR_LISTS[id].jobId);
    const lockIds = FOUR_LIST_IDS.map((id) => FOUR_LISTS[id].lockId);
    expect(new Set(jobIds).size).toBe(4);
    expect(new Set(lockIds).size).toBe(4);
    expect(jobIds).toContain(JOB_IDS.listM1);
    expect(jobIds).toContain(JOB_IDS.listM2);
    expect(jobIds).toContain(JOB_IDS.listM3);
    expect(jobIds).toContain(JOB_IDS.listM4);
    expect(lockIds).toEqual(["update:m1", "update:m2", "update:m3", "update:m4"]);
  });

  test("۱-۳ parseFourListId — فقط چهار کلید مجاز", () => {
    expect(parseFourListId("m1")).toBe("m1");
    expect(parseFourListId("m4")).toBe("m4");
    expect(parseFourListId("m5")).toBeNull();
    expect(parseFourListId(undefined)).toBeNull();
    expect(parseFourListId("all")).toBeNull(); // «all» فقط در سطح route معنا دارد
  });

  test("۱-۴ سه منبع اجرا برچسب فارسی دارند", () => {
    expect(SOURCE_LABELS.auto).toContain("خودکار");
    expect(SOURCE_LABELS.manual).toContain("دستی");
    expect(SOURCE_LABELS.forced).toContain("فوری");
  });
});

describe("PN-083 · ۲) پرچم درخواست فوری مشاوران (experts-force.flag)", () => {
  test("۲-۱ چرخهٔ کامل: ثبت → پرسش مثبت → پاک‌سازی → پرسش منفی", () => {
    expect(peekExpertsForceRefresh()).toBe(false);
    expect(requestExpertsForceRefresh()).toBe(true);
    expect(peekExpertsForceRefresh()).toBe(true);
    clearExpertsForceRefresh();
    expect(peekExpertsForceRefresh()).toBe(false);
  });
});

describe("PN-083 · ۳) قفل بین‌فرایندی update:mX", () => {
  test("۳-۱ قفل زندهٔ بیرونی → withListLock صادقانه رد می‌شود؛ پس از رهاسازی اجرا می‌شود (صفر اجرای موازی)", async () => {
    await db.jobLock.deleteMany({ where: { jobId: "update:m1" } });
    // گام ۱ — مسیر «الف» (مثل چرخهٔ خودکار Worker) قفل را می‌گیرد
    const svcA = new JobLockService(db, "inst:auto:worker");
    const acqA = await svcA.acquire(FOUR_LISTS.m1.lockId);
    expect(acqA.acquired).toBe(true);

    // گام ۲ — مسیر «ب» (مثل دکمهٔ دستی) زیر همان قفل → رد صادقانه، بدون اجرا
    let inside = 0;
    const rejected = await withListLock(db, "m1", async () => {
      inside += 1;
      return "must-not-run";
    });
    expect(rejected.ran).toBe(false);
    expect(rejected.reason).toBeTruthy();
    expect(inside).toBe(0);

    // گام ۳ — پس از رهاسازی «الف»، همان مسیر «ب» با موفقیت اجرا می‌شود
    await svcA.release(FOUR_LISTS.m1.lockId);
    const accepted = await withListLock(db, "m1", async () => {
      inside += 1;
      // درون اجرا، تلاش نمونهٔ سوم هم باید رد شود
      const svcC = new JobLockService(db, "inst:other:process");
      const acqC = await svcC.acquire(FOUR_LISTS.m1.lockId);
      expect(acqC.acquired).toBe(false);
      expect(acqC.reason).toBe("held");
      return "ok";
    });
    expect(accepted.ran).toBe(true);
    expect(accepted.result).toBe("ok");
    expect(inside).toBe(1); // در کل، دقیقاً یک مسیر اجرا شد
  });

  test("۳-۲ listLockHolder دارندهٔ زنده را نشان می‌دهد و پس از رهاسازی خالی می‌شود", async () => {
    await db.jobLock.deleteMany({ where: { jobId: "update:m4" } });
    const res = await withListLock(db, "m4", async () => {
      const holder = await listLockHolder(db, "m4");
      expect(holder).not.toBeNull();
      expect(holder?.stale).toBe(false);
      return true;
    });
    expect(res.ran).toBe(true);
    const after = await listLockHolder(db, "m4");
    expect(after).toBeNull();
  });
});

describe("PN-083 · ۴) وضعیت یکپارچهٔ SyncJobState (list-mX)", () => {
  test("۴-۱ upsert → خواندن در نمای چهارگانه با منبع و پیشرفت", async () => {
    await upsertFourListState(db, "m2", {
      status: "running",
      lastCompletedPage: 1,
      totalPages: 2,
      detail: { source: "manual", stage: "deep-pass", at: new Date().toISOString() },
    });
    const view = await readFourListsUnified(db);
    const m2 = view.lists.m2;
    expect(m2.jobId).toBe(JOB_IDS.listM2);
    expect(m2.status).toBe("running");
    expect(m2.source).toBe("manual");
    expect(m2.sourceLabel).toContain("دستی");
    expect(m2.lastCompletedPage).toBe(1);
    expect(m2.totalPages).toBe(2);
    expect(m2.progressPercent).toBe(50);
  });

  test("۴-۲ readFourListsUnified هر چهار کلید را با برچسب برمی‌گرداند", async () => {
    const view = await readFourListsUnified(db);
    for (const id of FOUR_LIST_IDS) {
      expect(view.lists[id]).toBeTruthy();
      expect(view.lists[id].label).toContain(FOUR_LISTS[id].shortLabel.slice(0, 4));
      expect(typeof view.lists[id].rows).toBe("number");
      expect(["idle", "running", "paused", "done", "failed"]).toContain(view.lists[id].status);
    }
    expect(typeof view.running).toBe("boolean");
  });

  test("۴-۳ چرخهٔ کامل وضعیت: running → done با ثبت lastWritten", async () => {
    await upsertFourListState(db, "m3", { status: "running", lastCompletedPage: 0, totalPages: 2, detail: { source: "auto", stage: "fast-pass" } });
    await upsertFourListState(db, "m3", { status: "done", lastCompletedPage: 2, totalPages: 2, detail: { source: "auto", stage: "done", finishedAt: new Date().toISOString(), lastWritten: 137 } });
    const view = await readFourListsUnified(db);
    const m3 = view.lists.m3;
    expect(m3.status).toBe("done");
    expect(m3.progressPercent).toBe(100);
    expect(m3.lastWritten).toBe(137);
    expect(m3.sourceLabel).toContain("خودکار");
  });
});

describe("PN-083 · ۵) runExpertsListUpdate — بی‌توکن صادقانه", () => {
  test("۵-۱ بدون توکن PM: ran=false + ثبت خطای شفاف در list-m4", async () => {
    await db.syncJobState.deleteMany({ where: { jobId: JOB_IDS.listM4 } });
    const out = await runExpertsListUpdate(db, { pmToken: null, source: "auto" });
    expect(out.ran).toBe(false);
    expect(out.reason).toBe("no-token");
    const view = await readFourListsUnified(db);
    expect(view.lists.m4.status).toBe("failed");
    expect(String(view.lists.m4.detail?.error ?? "")).toContain("PM");
  });
});
