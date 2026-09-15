/**
 * تست‌های HOTFIX-05 — قفل همزمانی sync (B6)
 * ------------------------------------------------------
 * پوشش:
 *  ۱) دو ensureSeeded موازی با کش خالی → فقط «یک» sync واقعی اجرا می‌شود
 *     و هر دو فراخوان پاسخ موفق می‌گیرند (پیوستن به اجرای جاری، نه شروع مجدد)
 *  ۲) متریک: دلتای شمارنده اجرای sync در پنجره تست همزمانی = ۱
 *  ۳) sync موازی مستقیم (syncFromArm ×۳ هم‌زمان) → یک اجرا، سه نتیجه یکسان
 *  ۴) یکسان‌سازی reset: clearCrmCacheTables هر ۶ جدول را پاک می‌کند
 *  ۵) connection/reset با withData=true همان تابع واحد را صدا می‌زند (۶ جدول خالی)
 */

import { describe, expect, test, afterAll } from "bun:test";
import { createHash } from "crypto";

const { db } = await import("@/lib/db");

const createdSessions: string[] = [];

afterAll(async () => {
  for (const t of createdSessions) {
    await db.session.deleteMany({ where: { tokenHash: createHash("sha256").update(t).digest("hex") } }).catch(() => undefined);
  }
  await db.$disconnect();
});

/** شبیه‌ساز پاسخ موفق سامانه ARM (NestJS envelope، فهرست خالی) با تأخیر مصنوعی برای هم‌پوشانی */
function fakeArmFetch(delayMs = 60): typeof fetch {
  return (async () => {
    await new Promise((r) => setTimeout(r, delayMs));
    return new Response(JSON.stringify({ data: [], message: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

async function seedOneRowEach() {
  // پاک‌سازی اولیه (تست‌های قبلی ممکن است رکوردی گذاشته باشند)
  await db.transactionRecord.deleteMany({ where: { id: { startsWith: "b6-" } } });
  await db.expertRecord.deleteMany({ where: { id: { startsWith: "b6-" } } });
  await db.interactionRecord.deleteMany({ where: { id: { startsWith: "b6-" } } });
  await db.visitRecord.deleteMany({ where: { id: { startsWith: "b6-" } } });
  await db.supplyDemandRecord.deleteMany({ where: { id: { startsWith: "b6-" } } });
  await db.contractRecord.deleteMany({ where: { id: { startsWith: "b6-" } } });

  await db.transactionRecord.create({
    data: { id: "b6-tx-1", contractDate: new Date(), propertyCode: "P1" },
  });
  await db.expertRecord.create({
    data: { id: "b6-ex-1", personnelCode: "950001", fullName: "تست", mobile: "09120000000", role: "realtor", businessTitle: "شعبه تست", createdAt: new Date() },
  });
  await db.interactionRecord.create({
    data: { id: "b6-in-1", requestRealtorName: "A", propertyRealtorName: "B" },
  });
  await db.visitRecord.create({
    data: { id: "b6-vi-1", propertyCode: "P1", requesterName: "X", checkerName: "Y", propertyRealtorName: "Z", createdAt: new Date() },
  });
  await db.supplyDemandRecord.create({
    data: { id: "b6-sd-1", rangeTitle: "بازه تست" },
  });
  await db.contractRecord.create({
    data: { id: "b6-ct-1", status: "preDefined" },
  });
}

async function countAll(): Promise<[number, number, number, number, number, number]> {
  const [tx, ex, inn, vi, sd, ct] = await Promise.all([
    db.transactionRecord.count(),
    db.expertRecord.count(),
    db.interactionRecord.count(),
    db.visitRecord.count(),
    db.supplyDemandRecord.count(),
    db.contractRecord.count(),
  ]);
  return [tx, ex, inn, vi, sd, ct];
}

// ==========================================================================
// ۱+۲) همزمانی ensureSeeded
// ==========================================================================

describe("HOTFIX-05 — قفل همزمانی sync (B6)", () => {
  test("دو ensureSeeded موازی با کش خالی → یک sync، دو پاسخ موفق", async () => {
    const { ensureSeeded, getArmSyncExecutionCount } = await import("@/lib/melk-api/sync");
    const before = getArmSyncExecutionCount();

    // کش خالی + شبیه‌سازی ARM موفق با تأخیر (تا دو فراخوان هم‌پوشان شوند)
    await db.transactionRecord.deleteMany({});
    await db.expertRecord.deleteMany({});

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fakeArmFetch(60);
    try {
      const [r1, r2] = await Promise.all([
        ensureSeeded("fake-arm-token-b6-a"),
        ensureSeeded("fake-arm-token-b6-b"),
      ]);

      // هر دو فراخوان پاسخ موفق گرفتند
      expect(r1.liveError).toBeUndefined();
      expect(r2.liveError).toBeUndefined();

      // متریک: فقط «یک» اجرای واقعی sync در پنجره تست همزمانی
      const delta = getArmSyncExecutionCount() - before;
      expect(delta).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("سه syncFromArm هم‌زمان → یک اجرا، سه نتیجه یکسان", async () => {
    const { syncFromArm, getArmSyncExecutionCount } = await import("@/lib/melk-api/sync");
    const before = getArmSyncExecutionCount();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fakeArmFetch(50);
    try {
      const [a, b, c] = await Promise.all([
        syncFromArm("tok-1"),
        syncFromArm("tok-2"),
        syncFromArm("tok-3"),
      ]);
      expect(getArmSyncExecutionCount() - before).toBe(1);
      // هر سه به همان نتیجه مشترک پیوستند
      expect(a.syncedAt).toBe(b.syncedAt);
      expect(b.syncedAt).toBe(c.syncedAt);
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      expect(c.ok).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("اجرای متوالی (نه موازی) → دو اجرا (قفل فقط هم‌پوشانی را می‌گیرد)", async () => {
    const { syncFromArm, getArmSyncExecutionCount } = await import("@/lib/melk-api/sync");
    const before = getArmSyncExecutionCount();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fakeArmFetch(10);
    try {
      await syncFromArm("seq-1");
      await syncFromArm("seq-2");
      expect(getArmSyncExecutionCount() - before).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ==========================================================================
// ۴+۵) یکسان‌سازی reset
// ==========================================================================

describe("HOTFIX-05 — یکسان‌سازی reset (۶ جدول، تابع واحد)", () => {
  test("clearCrmCacheTables هر ۶ جدول را پاک می‌کند", async () => {
    await seedOneRowEach();
    const beforeCounts = await countAll();
    expect(beforeCounts[0]).toBeGreaterThanOrEqual(1);
    expect(beforeCounts[5]).toBeGreaterThanOrEqual(1);

    const { clearCrmCacheTables } = await import("@/lib/melk-api/sync");
    await clearCrmCacheTables();

    const after = await countAll();
    expect(after).toEqual([0, 0, 0, 0, 0, 0]);
  });

  test("connection/reset با withData=true همان ۶ جدول را از طریق تابع واحد پاک می‌کند", async () => {
    const { NextRequest } = await import("next/server");
    const { createSession } = await import("@/lib/auth/session");
    const route = await import("@/app/api/connection/reset/route");

    const { token } = await createSession(
      { personnelCode: "950002", displayName: "تست reset", role: "OWNER" },
      { ip: "127.0.0.1" },
      null // بدون توکن ARM → resync خطای شفاف می‌دهد ولی پاک‌سازی انجام می‌شود
    );
    createdSessions.push(token);

    await seedOneRowEach();
    const req = new NextRequest("http://localhost/api/connection/reset", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ withData: true }),
    });
    const res = await route.POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; resync: { ok: boolean; errorCode?: string } };
    expect(body.ok).toBe(true);
    expect(body.resync.ok).toBe(false); // بدون توکن ARM — پیام شفاف

    const after = await countAll();
    expect(after).toEqual([0, 0, 0, 0, 0, 0]); // هر ۶ جدول (نه ۳ جدول قدیمی)
  });

  test("سورس: connection/reset دیگر deleteMany inline ندارد — فقط تابع واحد", async () => {
    const text = await Bun.file("src/app/api/connection/reset/route.ts").text();
    expect(text).toContain("clearCrmCacheTables");
    expect(text).not.toMatch(/db\.(transactionRecord|expertRecord|interactionRecord)\.deleteMany/);
  });
});
