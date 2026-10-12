/**
 * تست‌های JobLock Lease Renewal — PN-012 / BLOCK 2 (بند ۲.۲ و ۲.۳)
 * ------------------------------------------------------
 * پوشش (۱۵ تست — دستور جلسهٔ ۰۱۲):
 *   · متد renew(jobId, extensionMs): تمدید صریح + حفظ مالکیت
 *   · تشخیص از‌دست‌رفتن اجاره (leaseLost + onLeaseLost + LeaseGuard)
 *   · بند ۲.۳: شبیه‌سازی کار ۵ دقیقه‌ای → صفر Duplicate (مقایسهٔ بدون-renew)
 *   · سازگاری: heartbeat روی بنیان renew
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";

const { db } = await import("@/lib/db");
const {
  JobLockService,
  withLock,
  ensureJobLockTable,
  generateInstanceId,
  LOCK_TTL_MS_DEFAULT,
  HEARTBEAT_INTERVAL_MS_DEFAULT,
} = await import("@/core/runtime/joblock");

const J = "pn012-renewal-lock";

beforeAll(async () => {
  await ensureJobLockTable(db);
  await db.jobLock.deleteMany({});
});

afterAll(async () => {
  await db.jobLock.deleteMany({});
  await db.$disconnect();
});

describe("PN-012 BLOCK 2 — JobLock Lease Renewal (بند ۲.۲)", () => {
  test("۲-ر-۱ renew توسط دارنده → true و expiresAt دقیقاً +۹۰s تمدید می‌شود", async () => {
    await db.jobLock.deleteMany({});
    const svc = new JobLockService(db, generateInstanceId("r1"));
    expect((await svc.acquire(J, { ttlMs: 1000 })).acquired).toBe(true);
    const now = new Date();
    const ok = await svc.renew(J, 90_000, { now });
    expect(ok).toBe(true);
    const row = await db.jobLock.findUnique({ where: { jobId: J } });
    expect(row).not.toBeNull();
    expect(row?.instanceId).toBe(svc.id);
    expect(Math.abs(row!.expiresAt.getTime() - (now.getTime() + 90_000))).toBeLessThan(50); // دقت میلی‌ثانیه SQLite
    expect(row!.lastHeartbeat.getTime()).toBe(now.getTime());
  });

  test("۲-ر-۲ renew توسط غیردارنده → false (سرقت ممکن نیست)", async () => {
    await db.jobLock.deleteMany({});
    const holder = new JobLockService(db, generateInstanceId("holder"));
    const stranger = new JobLockService(db, generateInstanceId("stranger"));
    expect((await holder.acquire(J)).acquired).toBe(true);
    expect(await stranger.renew(J, 90_000)).toBe(false);
    const row = await db.jobLock.findUnique({ where: { jobId: J } });
    expect(row?.instanceId).toBe(holder.id); // مالکیت دست‌نخورده
  });

  test("۲-ر-۳ تمدید پیاپی → انقضا یکنواخت جلو می‌رود (monotonic)", async () => {
    await db.jobLock.deleteMany({});
    const svc = new JobLockService(db, generateInstanceId("r3"));
    expect((await svc.acquire(J)).acquired).toBe(true);
    const t1 = await svc.renew(J, 60_000, { now: new Date() });
    const first = (await db.jobLock.findUnique({ where: { jobId: J } }))!.expiresAt.getTime();
    const t2 = await svc.renew(J, 60_000, { now: new Date(Date.now() + 30_000) });
    const second = (await db.jobLock.findUnique({ where: { jobId: J } }))!.expiresAt.getTime();
    expect(t1).toBe(true);
    expect(t2).toBe(true);
    expect(second).toBeGreaterThan(first);
  });

  test("۲-ر-۴ قفلِ منقضیِ هنوز‌متعلق‌به‌خود → تمدید می‌شود (خوددرمانی، نه سرقت)", async () => {
    await db.jobLock.deleteMany({});
    const svc = new JobLockService(db, generateInstanceId("r4"));
    expect((await svc.acquire(J, { ttlMs: 500, now: new Date(Date.now() - 60_000) })).acquired).toBe(true);
    // منقضی شده ولی کسی نبرداشته — دارنده هنوز با renew برمی‌گردد
    expect(await svc.renew(J, 90_000)).toBe(true);
  });

  test("۲-ر-۵ قفلِ منقضی و تصرف‌شده توسط دیگری → renew=false (مالکیت رفته)", async () => {
    await db.jobLock.deleteMany({});
    const a = new JobLockService(db, generateInstanceId("a5"));
    const b = new JobLockService(db, generateInstanceId("b5"));
    expect((await a.acquire(J, { ttlMs: 500, now: new Date(Date.now() - 60_000) })).acquired).toBe(true);
    expect((await b.acquire(J)).acquired).toBe(true); // متروکه را تصرف می‌کند
    expect(await a.renew(J, 90_000)).toBe(false); // دیگری برده — تمدید ناموفق
    expect(await b.renew(J, 90_000)).toBe(true); // دارندهٔ تازه موفق
  });

  test("۲-ر-۶ heartbeat = renew با TTL پیش‌فرض (سازگاری بند ۲.۳ جلسهٔ ۰۱۰)", async () => {
    await db.jobLock.deleteMany({});
    const svc = new JobLockService(db, generateInstanceId("r6"));
    expect((await svc.acquire(J)).acquired).toBe(true);
    const now = new Date();
    expect(await svc.heartbeat(J, { now })).toBe(true);
    const row = await db.jobLock.findUnique({ where: { jobId: J } });
    expect(Math.abs(row!.expiresAt.getTime() - (now.getTime() + LOCK_TTL_MS_DEFAULT))).toBeLessThan(50);
  });

  test("۲-ر-۷ renew روی قفل ناموجود → false", async () => {
    await db.jobLock.deleteMany({});
    const svc = new JobLockService(db, generateInstanceId("r7"));
    expect(await svc.renew("no-such-lock", 90_000)).toBe(false);
  });
});

describe("PN-012 BLOCK 2 — withLock با تمدید و تشخیص اجاره (بند ۲.۲)", () => {
  test("۲-ر-۸ بند ۲.۳: کار ۵ دقیقه‌ای با renew هر ۳۰s → قفل هرگز منقضی نمی‌شود → صفر Duplicate", async () => {
    await db.jobLock.deleteMany({});
    const holder = new JobLockService(db, generateInstanceId("long"));
    const rival = new JobLockService(db, generateInstanceId("rival"));
    // شبیه‌سازی ساعت‌محور: کل ۵ دقیقه در چند گام منطقی فشرده می‌شود
    let clock = new Date("2026-10-07T10:00:00Z");
    const clockNow = () => clock;
    expect((await holder.acquire(J, { ttlMs: LOCK_TTL_MS_DEFAULT, now: clock })).acquired).toBe(true);

    let duplicates = 0;
    // «۵ دقیقه» کار = ۱۰ تمدید ۳۰ ثانیه‌ای (بند ۲.۳: هر ۳۰s → renew +۹۰s)
    for (let beat = 0; beat < 10; beat++) {
      clock = new Date(clock.getTime() + HEARTBEAT_INTERVAL_MS_DEFAULT);
      const ok = await holder.renew(J, LOCK_TTL_MS_DEFAULT, { now: clock });
      expect(ok).toBe(true);
      // رقیب در همین لحظه تلاش می‌کند — هر بار باید رد شود
      const tryRival = await rival.acquire(J, { now: clock });
      if (tryRival.acquired) duplicates++;
    }
    expect(duplicates).toBe(0); // ✅ صفر Duplicate
  });

  test("۲-ر-۹ مقایسه (حالت بدون renew): کار ۵ دقیقه‌ای با TTL ۹۰s → رقیب می‌برد → Duplicate رخ می‌دهد", async () => {
    await db.jobLock.deleteMany({});
    const holder = new JobLockService(db, generateInstanceId("norenew"));
    const rival = new JobLockService(db, generateInstanceId("rival2"));
    let clock = new Date("2026-10-07T10:00:00Z");
    expect((await holder.acquire(J, { ttlMs: LOCK_TTL_MS_DEFAULT, now: clock })).acquired).toBe(true);
    // بدون هیچ تمدیدی، زمان ۵ دقیقه جلو می‌رود
    clock = new Date(clock.getTime() + 5 * 60_000);
    const tryRival = await rival.acquire(J, { now: clock });
    // این همان حفرهٔ قدیمی است که renew بست — اثبات مثبت مسئله (بند ۲.۱)
    expect(tryRival.acquired).toBe(true);
  });

  test("۲-ر-۱۰ withLock: fn با LeaseGuard و تمدید خودکار — leaseLost=false", async () => {
    await db.jobLock.deleteMany({});
    const res = await withLock(
      db,
      J,
      async (lease) => {
        expect(lease).toBeDefined();
        expect(lease!.lost).toBe(false);
        expect(await lease!.renewNow()).toBe(true); // تمدید دستی
        expect(lease!.lost).toBe(false);
        return "done";
      },
      { heartbeatIntervalMs: 3_600_000 }, // ضربان دور — کنترل دستی با renewNow
    );
    expect(res.ran).toBe(true);
    expect(res.result).toBe("done");
    expect(res.leaseLost).toBe(false);
  });

  test("۲-ر-۱۱ withLock: سرقت قفل در میانه → leaseLost=true + onLeaseLost صدا می‌شود", async () => {
    await db.jobLock.deleteMany({});
    const thief = new JobLockService(db, generateInstanceId("thief"));
    let lostCalls = 0;
    const res = await withLock(
      db,
      J,
      async (lease) => {
        // قفلِ منقضی‌شده توسط رقیب تصرف می‌شود (سرخت)
        await db.jobLock.deleteMany({ where: { jobId: J } });
        await thief.acquire(J);
        // تمدید بعدی شکست می‌خورد → lost
        expect(await lease!.renewNow()).toBe(false);
        expect(lease!.lost).toBe(true);
        return "finished-anyway";
      },
      {
        heartbeatIntervalMs: 3_600_000,
        onLeaseLost: () => {
          lostCalls++;
        },
      },
    );
    expect(res.ran).toBe(true);
    expect(res.leaseLost).toBe(true);
    expect(lostCalls).toBe(1); // دقیقاً یک‌بار
  });

  test("۲-ر-۱۲ onLeaseLost خطاده هم حلقه را نمی‌شکند", async () => {
    await db.jobLock.deleteMany({});
    const res = await withLock(
      db,
      J,
      async (lease) => {
        await db.jobLock.deleteMany({ where: { jobId: J } });
        await lease!.renewNow();
        return "ok";
      },
      {
        heartbeatIntervalMs: 3_600_000,
        onLeaseLost: () => {
          throw new Error("callback خطا داد");
        },
      },
    );
    expect(res.ran).toBe(true);
    expect(res.leaseLost).toBe(true);
  });

  test("۲-ر-۱۳ تمدید ضربانی خودکار در withLock: قفل زنده می‌ماند (فراخوانی واقعی تایمر)", async () => {
    await db.jobLock.deleteMany({});
    const rival = new JobLockService(db, generateInstanceId("rival3"));
    const res = await withLock(
      db,
      J,
      async () => {
        // کار ۸۰ میلی‌ثانیه‌ای با ضربان ۲۵ms و TTL ۱۰۰ms — بدون تمدید منقضی می‌شد
        await new Promise((r) => setTimeout(r, 80));
        const tryRival = await rival.acquire(J);
        expect(tryRival.acquired).toBe(false); // تمدید خودکار زنده نگه داشته
        return "survived";
      },
      { ttlMs: 100, heartbeatIntervalMs: 25 },
    );
    expect(res.ran).toBe(true);
    expect(res.leaseLost).toBe(false);
  });

  test("۲-ر-۱۴ release پس از پایان → نمونهٔ بعدی فوراً می‌گیرد (بند ۲.۳: اگر تمام شد release)", async () => {
    await db.jobLock.deleteMany({});
    const a = new JobLockService(db, generateInstanceId("rel"));
    const b = new JobLockService(db, generateInstanceId("rel2"));
    expect((await a.acquire(J)).acquired).toBe(true);
    expect(await a.release(J)).toBe(true);
    expect((await b.acquire(J)).acquired).toBe(true); // بدون انتظار برای انقضا
  });

  test("۲-ر-۱۵ باقی‌ماندهٔ نتیجهٔ acquire ناموفق: reason=held و leaseLost=false", async () => {
    await db.jobLock.deleteMany({});
    const holder = new JobLockService(db, generateInstanceId("h15"));
    expect((await holder.acquire(J)).acquired).toBe(true);
    const res = await withLock(db, J, async () => "never");
    expect(res.ran).toBe(false);
    expect(res.reason).toBe("held");
    expect(res.leaseLost).toBe(false);
  });
});
