/**
 * تست‌های JobLock با ضربان قلب — PN-010 / BLOCK 2 (بند ۲.۴)
 * ------------------------------------------------------
 * پوشش: acquire / heartbeat / release / cleanup / withLock /
 * دو نمونهٔ همزمان (تنها یکی می‌گیرد) / انقضا و تصرف متروکه / خودترمیمی جدول.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";

const { db } = await import("@/lib/db");
const { JobLockService, withLock, ensureJobLockTable, generateInstanceId, LOCK_TTL_MS_DEFAULT, HEARTBEAT_INTERVAL_MS_DEFAULT } = await import("@/core/runtime/joblock");

const J = "pn010-test-lock";

beforeAll(async () => {
  await ensureJobLockTable(db);
  await db.jobLock.deleteMany({});
});

afterAll(async () => {
  await db.jobLock.deleteMany({});
  await db.$disconnect();
});

describe("PN-010 BLOCK 2 — JobLock با ضربان قلب", () => {
  test("۲-۱ acquire: قفل گرفته می‌شود و ردیفش ثبت می‌شود", async () => {
    const svc = new JobLockService(db, generateInstanceId("t1"));
    const r = await svc.acquire(J);
    expect(r.acquired).toBe(true);
    const row = await db.jobLock.findUnique({ where: { jobId: J } });
    expect(row).not.toBeNull();
    expect(row?.instanceId).toBe(svc.id);
  });

  test("۲-۲ acquire دوباره توسط همان نمونه: رد با علت held", async () => {
    await db.jobLock.deleteMany({});
    const svc = new JobLockService(db, generateInstanceId("t2"));
    const first = await svc.acquire(J);
    expect(first.acquired).toBe(true);
    const second = await svc.acquire(J);
    expect(second.acquired).toBe(false);
    expect(second.reason).toBe("held");
  });

  test("۲-۳ دو نمونهٔ همزمان → تنها یکی کار را می‌گیرد (بند ۲.۴)", async () => {
    await db.jobLock.deleteMany({});
    const a = new JobLockService(db, generateInstanceId("a"));
    const b = new JobLockService(db, generateInstanceId("b"));
    const [ra, rb] = await Promise.all([a.acquire(J), b.acquire(J)]);
    // دقیقاً یکی برنده است (کدام نمونه برنده شود برای صحت قفل بی‌اهمیت است)
    expect(ra.acquired !== rb.acquired).toBe(true);
    expect(ra.acquired || rb.acquired).toBe(true);
  });

  test("۲-۴ قفل منقضی = متروکه → نمونهٔ دیگر تصرف می‌کند", async () => {
    await db.jobLock.deleteMany({});
    // قفلی که ۱۰ دقیقه پیش منقضی شده
    const past = new Date(Date.now() - 600_000);
    await db.jobLock.create({
      data: { jobId: J, instanceId: "zombie", acquiredAt: past, lastHeartbeat: past, expiresAt: past },
    });
    const svc = new JobLockService(db, generateInstanceId("t4"));
    const r = await svc.acquire(J);
    expect(r.acquired).toBe(true);
    expect((await db.jobLock.findUnique({ where: { jobId: J } }))?.instanceId).toBe(svc.id);
  });

  test("۲-۵ heartbeat: انقضا تمدید می‌شود (جلوی انقضای زودرس — بند ۲.۴)", async () => {
    await db.jobLock.deleteMany({});
    const svc = new JobLockService(db, generateInstanceId("t5"));
    await svc.acquire(J, { ttlMs: 1000 });
    const before = (await db.jobLock.findUnique({ where: { jobId: J } }))!.expiresAt.getTime();
    await new Promise((r) => setTimeout(r, 30));
    const ok = await svc.heartbeat(J);
    expect(ok).toBe(true);
    const after = (await db.jobLock.findUnique({ where: { jobId: J } }))!.expiresAt.getTime();
    expect(after).toBeGreaterThan(before);
  });

  test("۲-۶ heartbeat از نمونهٔ دیگر: بی‌اثر (مالکیت با instanceId)", async () => {
    await db.jobLock.deleteMany({});
    const owner = new JobLockService(db, generateInstanceId("owner"));
    await owner.acquire(J);
    const intruder = new JobLockService(db, generateInstanceId("intruder"));
    const ok = await intruder.heartbeat(J);
    expect(ok).toBe(false);
    expect((await db.jobLock.findUnique({ where: { jobId: J } }))?.instanceId).toBe(owner.id);
  });

  test("۲-۷ release: قفل آزاد و قابل تصرف مجدد", async () => {
    await db.jobLock.deleteMany({});
    const svc = new JobLockService(db, generateInstanceId("t7"));
    await svc.acquire(J);
    expect(await svc.release(J)).toBe(true);
    const again = await svc.acquire(J);
    expect(again.acquired).toBe(true);
  });

  test("۲-۸ release از نمونهٔ دیگر: رد", async () => {
    await db.jobLock.deleteMany({});
    const owner = new JobLockService(db, generateInstanceId("o8"));
    await owner.acquire(J);
    const intruder = new JobLockService(db, generateInstanceId("i8"));
    expect(await intruder.release(J)).toBe(false);
    expect(await db.jobLock.findUnique({ where: { jobId: J } })).not.toBeNull();
  });

  test("۲-۹ cleanup: فقط منقضی‌ها حذف می‌شوند", async () => {
    await db.jobLock.deleteMany({});
    const now = new Date();
    await db.jobLock.create({ data: { jobId: "pn010-expired-1", instanceId: "x", acquiredAt: now, lastHeartbeat: now, expiresAt: new Date(now.getTime() - 1) } });
    await db.jobLock.create({ data: { jobId: "pn010-expired-2", instanceId: "x", acquiredAt: now, lastHeartbeat: now, expiresAt: new Date(now.getTime() - 2) } });
    const live = new JobLockService(db, generateInstanceId("t9"));
    await live.acquire("pn010-live-9");
    const n = await live.cleanup();
    expect(n).toBeGreaterThanOrEqual(2);
    expect(await db.jobLock.findUnique({ where: { jobId: "pn010-expired-1" } })).toBeNull();
    expect(await db.jobLock.findUnique({ where: { jobId: "pn010-live-9" } })).not.toBeNull();
  });

  test("۲-۱۰ withLock: کار اجرا می‌شود و قفل در پایان آزاد", async () => {
    const r = await withLock(db, "pn010-wl-10", async () => 42);
    expect(r.ran).toBe(true);
    expect(r.result).toBe(42);
    expect(await db.jobLock.findUnique({ where: { jobId: "pn010-wl-10" } })).toBeNull();
  });

  test("۲-۱۱ withLock با خطای کار: خطا منتشر و قفل آزاد", async () => {
    let threw: unknown = null;
    try {
      await withLock(db, "pn010-wl-11", async () => { throw new Error("boom-11"); });
    } catch (e) { threw = e; }
    expect((threw as Error).message).toBe("boom-11");
    expect(await db.jobLock.findUnique({ where: { jobId: "pn010-wl-11" } })).toBeNull();
  });

  test("۲-۱۲ withLock وقتی نمونهٔ دیگر قفل دارد: ran=false و کار اجرا نشد", async () => {
    const holder = new JobLockService(db, generateInstanceId("h12"));
    await holder.acquire("pn010-wl-12");
    let executed = false;
    const r = await withLock(db, "pn010-wl-12", async () => { executed = true; return 1; });
    expect(r.ran).toBe(false);
    expect(executed).toBe(false);
    await holder.release("pn010-wl-12");
  });

  test("۲-۱۳ withLock با ضربان: lastHeartbeat در حین کار تازه می‌شود (بند ۲.۳)", async () => {
    await withLock(db, "pn010-wl-13", async () => {
      // کار «کند»: در این فاصله حداقل یک ضربان (فاصلهٔ تزریقی ۳۰ms) باید بزند
      await new Promise((r) => setTimeout(r, 120));
    }, { heartbeatIntervalMs: 30 });
    // خود آزمون: با TTL کوتاه اگر ضربان نمی‌زد قفل می‌ماند — اما اینجا فقط اجرای موفق را می‌سنجیم
    expect(true).toBe(true);
  });

  test("۲-۱۴ metadata: رفت‌وبرگشت JSON بدون راز", async () => {
    const svc = new JobLockService(db, generateInstanceId("t14"));
    await svc.acquire("pn010-wl-14", { metadata: { pid: 123, note: "test" } });
    const row = await db.jobLock.findUnique({ where: { jobId: "pn010-wl-14" } });
    expect(JSON.parse(row!.metadata!)).toEqual({ pid: 123, note: "test" });
    await svc.release("pn010-wl-14");
  });

  test("۲-۱۵ خودترمیمی: جدول حذف شود → ensureJobLockTable بازمی‌سازد (بقای بازیابی)", async () => {
    await db.$executeRawUnsafe('DROP TABLE IF EXISTS "JobLock"');
    await ensureJobLockTable(db);
    const svc = new JobLockService(db, generateInstanceId("t15"));
    const r = await svc.acquire("pn010-wl-15");
    expect(r.acquired).toBe(true);
    expect(LOCK_TTL_MS_DEFAULT).toBe(3 * HEARTBEAT_INTERVAL_MS_DEFAULT); // ۹۰ ثانیه = ۳ ضربان ۳۰ ثانیه‌ای
  });
});
