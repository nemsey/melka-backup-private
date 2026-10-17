/**
 * تست‌های P2-04 — همگام‌سازی افزایشی (MELK_SYNC_MODE) + نامه مرده + نقطه ازسرگیری
 * ------------------------------------------------------
 * پوشش:
 *  ۱) پرچم MELK_SYNC_MODE — پیش‌فرض legacy؛ فقط "incremental" حالت افزایشی است
 *  ۲) مسیر افزایشی: upsert بر کلید طبیعی (id / personnelCode)
 *  ۳) idempotency — اجرای دوباره با همان داده ⇒ بدون تکرار
 *  ۴) به‌روزرسانی ردیف موجود (نه حذف/بازسازی)
 *  ۵) جاروی سنگ‌قبرها — ردیف محوشده از سامانه پاک می‌شود
 *  ۶) نامه مرده — ردیف خراب ۳ بار شکست ⇒ attempts=3 (باز)؛ موفقیت بعدی ⇒ حل
 *  ۷) محافظت نامه مرده باز از جارو
 *  ۸) خانواده با واکشی ناموفق ⇒ دست‌نخورده (تفاوت عمدی با legacy)
 *  ۹) مسیر legacy همچنان deleteMany+createMany است (رفتار PHASE 1 دست‌نخورده)
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";

const { db } = await import("@/lib/db");

const TX_IDS = ["p204-tx-a", "p204-tx-b", "p204-tx-bad"];
const EX_CODES = ["204001", "204002"];
const IN_ID = "p204-in-1";
const VI_ID = "p204-vi-1";
const SD_ID = "p204-sd-1";
const CT_ID = "p204-ct-1";

function txRow(id: string, over: Partial<{ contractDate: string; propertyCode: string; eventsCount: number }> = {}) {
  return {
    id,
    contractDate: over.contractDate ?? "2026-06-01T10:00:00.000Z",
    propertyCode: over.propertyCode ?? "P-204",
    propertyCustomer: "فروشنده",
    requestCode: "R-204",
    requestCustomer: "خریدار",
    contractHolo: "H-204",
    suggestedPropertyCount: 1,
    eventsCount: over.eventsCount ?? 2,
  };
}

function exRow(personnelCode: string, over: Partial<{ fullName: string }> = {}) {
  return {
    id: `ex-${personnelCode}`,
    personnelCode,
    fullName: over.fullName ?? `مشاور ${personnelCode}`,
    mobile: "09120000000",
    role: "کارشناس و مشاور فروش",
    businessTitle: "شعبه تست P2-04",
    creator: null,
    active: true,
    createdAt: "2026-01-01T08:00:00.000Z",
  };
}

function inRow(id: string, count = 3) {
  return { id, requestRealtorName: "مشاور الف", propertyRealtorName: "مشاور ب", count };
}

function viRow(id: string) {
  return {
    id,
    propertyCode: "P-204",
    requesterName: "درخواست‌دهنده",
    checkerName: "بررسی‌کننده",
    propertyRealtorName: "مشاور الف",
    checkTime: "2026-06-01T09:00:00.000Z",
    createdAt: "2026-06-01T08:00:00.000Z",
    status: "بررسی شد",
  };
}

function sdRow(id: string, propertyCount = 10) {
  return { id, rangeTitle: "بازه تست", propertyCount, requestPercent: 40, status: "فعال" };
}

function ctRow(id: string) {
  return {
    id,
    status: "waitingForFinance",
    contractHolo: "H-204",
    propertyCode: "P-204",
    requestCode: "R-204",
    contractType: "mobayeName",
    creatorName: "ثبت‌کننده",
    createdAt: "2026-06-01T08:00:00.000Z",
    contractDate: "2026-06-01T08:00:00.000Z",
    documentDate: null,
    deliveryDate: null,
    propertyTitle: "ملک تست",
    propertyAddress: "آدرس تست",
    buyers: [{ fullName: "خریدار", mobileNumber: "09120000000" }],
    sellers: [],
    realtorShares: [],
    canAddRealtor: false,
  };
}

function fullData(over: Partial<{ transactions: unknown[]; experts: unknown[]; interactionsFetched: boolean }> = {}) {
  return {
    transactions: (over.transactions ?? [txRow("p204-tx-a"), txRow("p204-tx-b")]) as never[],
    experts: (over.experts ?? [exRow("204001"), exRow("204002")]) as never[],
    interactions: [inRow(IN_ID)] as never[],
    visits: [viRow(VI_ID)] as never[],
    supplyDemand: [sdRow(SD_ID)] as never[],
    contracts: [ctRow(CT_ID)] as never[],
    interactionsFetched: over.interactionsFetched ?? true,
    visitsFetched: true,
    supplyDemandFetched: true,
    contractsFetched: true,
  };
}

beforeAll(async () => {
  await cleanup();
});

async function cleanup() {
  await db.transactionRecord.deleteMany({ where: { id: { in: TX_IDS } } });
  await db.expertRecord.deleteMany({ where: { personnelCode: { in: EX_CODES } } });
  await db.interactionRecord.deleteMany({ where: { id: IN_ID } });
  await db.visitRecord.deleteMany({ where: { id: VI_ID } });
  await db.supplyDemandRecord.deleteMany({ where: { id: SD_ID } });
  await db.contractRecord.deleteMany({ where: { id: CT_ID } });
  await db.syncDeadLetter.deleteMany({ where: { entity: { in: ["transactions", "experts", "interactions", "visits", "supplyDemand", "contracts"] } } });
  await db.syncState.update({ where: { id: "singleton" }, data: { lastSyncCursor: null, lastWatermark: null, syncRunId: null } }).catch(() => undefined);
}

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

// ==========================================================================
// ۱) پرچم حالت
// ==========================================================================

describe("P2-04 → PN-038 — پرچم MELK_SYNC_MODE (قانون دادهٔ مقدس)", () => {
  test("PN-038/۱.۴: همیشه incremental — legacy برای همیشه بازنشسته شد", async () => {
    const { syncMode } = await import("@/lib/melk-api/sync-mode");
    const saved = process.env.MELK_SYNC_MODE;
    delete process.env.MELK_SYNC_MODE;
    expect(syncMode()).toBe("incremental");
    process.env.MELK_SYNC_MODE = saved;
  });

  test("PN-038: مقدار legacy دیگر بی‌اثر است — هر مقداری ⇒ incremental", async () => {
    const { syncMode } = await import("@/lib/melk-api/sync-mode");
    const saved = process.env.MELK_SYNC_MODE;
    process.env.MELK_SYNC_MODE = "legacy";
    expect(syncMode()).toBe("incremental"); // قانون دادهٔ مقدس: حذف ممنوع
    process.env.MELK_SYNC_MODE = "incremental";
    expect(syncMode()).toBe("incremental");
    process.env.MELK_SYNC_MODE = "garbage";
    expect(syncMode()).toBe("incremental");
    process.env.MELK_SYNC_MODE = saved;
  });
});

// ==========================================================================
// ۲-۵) مسیر افزایشی: upsert / idempotency / به‌روزرسانی / جارو
// ==========================================================================

describe("P2-04 — مسیر افزایشی", () => {
  test("اجرا: ردیفها با کلید طبیعی درج + syncRunId + نقطه ازسرگیری شش‌خانواده‌ای", async () => {
    const { applyIncrementalSync } = await import("@/lib/melk-api/sync");
    await applyIncrementalSync("run-p204-1", fullData());

    expect(await db.transactionRecord.count({ where: { id: { in: ["p204-tx-a", "p204-tx-b"] } } })).toBe(2);
    expect(await db.expertRecord.count({ where: { personnelCode: { in: EX_CODES } } })).toBe(2);
    expect(await db.interactionRecord.count({ where: { id: IN_ID } })).toBe(1);
    expect(await db.visitRecord.count({ where: { id: VI_ID } })).toBe(1);
    expect(await db.supplyDemandRecord.count({ where: { id: SD_ID } })).toBe(1);
    expect(await db.contractRecord.count({ where: { id: CT_ID } })).toBe(1);

    const state = await db.syncState.findUnique({ where: { id: "singleton" } });
    expect(state?.syncRunId).toBe("run-p204-1");
    const cursor = JSON.parse(state!.lastSyncCursor!);
    expect(cursor.runId).toBe("run-p204-1");
    expect(cursor.done).toEqual(["transactions", "experts", "interactions", "visits", "supplyDemand", "contracts"]);
    expect(cursor.detail.every((d: { failed: number }) => d.failed === 0)).toBe(true);
  });

  test("idempotency — اجرای دوباره با همان داده: بدون تکرار، شمارنده ثابت", async () => {
    const { applyIncrementalSync } = await import("@/lib/melk-api/sync");
    await applyIncrementalSync("run-p204-2", fullData());

    expect(await db.transactionRecord.count({ where: { id: { in: ["p204-tx-a", "p204-tx-b"] } } })).toBe(2);
    expect(await db.expertRecord.count({ where: { personnelCode: { in: EX_CODES } } })).toBe(2);
  });

  test("به‌روزرسانی — تغییر داده ردیف موجود، بدون حذف/بازسازی (آپدیت درجا)", async () => {
    const { applyIncrementalSync } = await import("@/lib/melk-api/sync");
    const before = await db.visitRecord.findUnique({ where: { id: VI_ID } });
    await new Promise((r) => setTimeout(r, 20)); // updatedAt حداقل فاصله
    await applyIncrementalSync("run-p204-3", fullData({ transactions: [txRow("p204-tx-a", { eventsCount: 7 }), txRow("p204-tx-b")] }));

    const tx = await db.transactionRecord.findUnique({ where: { id: "p204-tx-a" } });
    expect(tx?.eventsCount).toBe(7); // به‌روزرسانی شد
    const vi = await db.visitRecord.findUnique({ where: { id: VI_ID } });
    expect(vi?.id).toBe(before?.id); // دست‌نخورده (بین دو اجرا همان ردیف)
  });

  test("PN-038/۱.۴ — قانون مقدس: ردیف حذف‌شده از سامانه مبدأ در پایگاه می‌ماند (گزارش بدون حذف)", async () => {
    const { applyIncrementalSync } = await import("@/lib/melk-api/sync");
    // tx-b از فهرست حذف می‌شود؛ tx-bad نامه مرده باز است
    await db.syncDeadLetter.create({
      data: { runId: "run-p204-x", entity: "transactions", naturalKey: "p204-tx-bad", attempts: 3, lastError: "خراب" },
    });
    if (!(await db.transactionRecord.findUnique({ where: { id: "p204-tx-bad" } }))) {
      await db.transactionRecord.create({ data: txRow("p204-tx-bad") as never });
    }

    await applyIncrementalSync("run-p204-4", fullData({ transactions: [txRow("p204-tx-a")] }));

    // PN-038: قانون دادهٔ مقدس — tx-b دیگر در سامانه نیست اما پایگاه نگهش می‌دارد
    expect(await db.transactionRecord.count({ where: { id: "p204-tx-b" } })).toBe(1);
    // tx-bad هم (عین بقیهٔ داده) محفوظ است
    expect(await db.transactionRecord.count({ where: { id: "p204-tx-bad" } })).toBe(1);
  });
});

// ==========================================================================
// ۶) نامه مرده
// ==========================================================================

describe("P2-04 — نامه مرده", () => {
  test("ردیف خراب: بقیه اعمال می‌شوند، شکست ثبت می‌شود؛ ۳ اجرا ⇒ attempts=3؛ اجرای سالم ⇒ حل", async () => {
    const { applyIncrementalSync } = await import("@/lib/melk-api/sync");
    await db.syncDeadLetter.deleteMany({ where: { entity: "transactions" } });
    await db.transactionRecord.deleteMany({ where: { id: "p204-tx-bad" } });

    // تاریخ نامعتبر ⇒ upsert این ردیف شکست می‌خورد
    const badRow = txRow("p204-tx-bad", { contractDate: "not-a-date" });

    for (let run = 1; run <= 3; run++) {
      await applyIncrementalSync(`run-p204-dl-${run}`, fullData({ transactions: [txRow("p204-tx-a"), badRow as never] }));
    }

    const dl = await db.syncDeadLetter.findUnique({
      where: { entity_naturalKey: { entity: "transactions", naturalKey: "p204-tx-bad" } },
    });
    expect(dl).not.toBeNull();
    expect(dl?.attempts).toBe(3); // سه شکست پیاپی ⇒ مرده
    expect(dl?.resolvedAt).toBeNull();

    // ردیف سالم هم‌زمان اعمال شده — شکست منفرد کل اجرا را نشکست
    expect(await db.transactionRecord.count({ where: { id: "p204-tx-a" } })).toBe(1);
    expect(await db.transactionRecord.count({ where: { id: "p204-tx-bad" } })).toBe(0);

    // اجرای چهارم با داده سالم ⇒ نامه مرده حل و ردیف ثبت می‌شود
    await applyIncrementalSync("run-p204-dl-4", fullData({ transactions: [txRow("p204-tx-a"), txRow("p204-tx-bad")] }));
    const resolved = await db.syncDeadLetter.findUnique({
      where: { entity_naturalKey: { entity: "transactions", naturalKey: "p204-tx-bad" } },
    });
    expect(resolved?.resolvedAt).not.toBeNull();
    expect(await db.transactionRecord.count({ where: { id: "p204-tx-bad" } })).toBe(1);
  });
});

// ==========================================================================
// ۸) خانواده با واکشی ناموفق
// ==========================================================================

describe("P2-04 — خانواده با واکشی ناموفق دست‌نخورده می‌ماند", () => {
  test("interactionsFetched=false ⇒ تعاملات موجود حذف/تغییر نمی‌کنند و در cursor با failed=-1 ثبت می‌شود", async () => {
    const { applyIncrementalSync } = await import("@/lib/melk-api/sync");
    // از Tests قبلی یک تعامل موجود است (IN_ID)
    await applyIncrementalSync("run-p204-skip", fullData({ interactionsFetched: false }));

    expect(await db.interactionRecord.count({ where: { id: IN_ID } })).toBe(1); // دست‌نخورده
    const state = await db.syncState.findUnique({ where: { id: "singleton" } });
    const cursor = JSON.parse(state!.lastSyncCursor!);
    const interactionsEntry = cursor.detail.find((d: { entity: string }) => d.entity === "interactions");
    expect(interactionsEntry.failed).toBe(-1); // skipped
  });
});

// ==========================================================================
// ۹) قانون دادهٔ مقدس — مسیر legacy برای همیشه حذف شد (PN-038/۱.۴)
// ==========================================================================

describe("P2-04 → PN-038 — میراث legacy حذف شد", () => {
  test("سورس sync.ts دیگر هیچ deleteMany کدی ندارد — فقط upsert افزودنی (قانون مقدس)", async () => {
    const source = await Bun.file(`${import.meta.dir}/../src/lib/melk-api/sync.ts`).text();
    // هیچ فراخوانی کدی deleteMany باقی نماند (کامنت‌ها مستثنا هستند)
    const codeLines = source.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
    const offenders = codeLines.filter((l) => l.includes("deleteMany("));
    expect(offenders).toEqual([]);
    // شاخه افزایشی موجود است
    expect(source).toContain("applyIncrementalSync");
    expect(source).toContain("sacredNoDelete");
  });

  test("sacredNoDelete — deleteByKeys همیشه بی‌اثر است (حذف ممنوع)", async () => {
    const { buildMainSyncFamily } = await import("@/lib/melk-api/sync");
    const family = buildMainSyncFamily("transactions", [], "run-sacred-1", { fetched: true });
    const r = await family.deleteByKeys(["a", "b", "c"]);
    expect(r).toEqual({ sacredKeep: true, wouldDelete: 3 }); // شمارش بدون حذف
  });
});
