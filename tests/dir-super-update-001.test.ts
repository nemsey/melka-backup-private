/**
 * DIR-MULTI-AREA-001 (گام اول) + DIR-SUPER-UPDATE-001 (گام دوم) — تست‌های رگرسیون
 * ---------------------------------------------------------------------------
 * اجرا: bun test tests/dir-super-update-001.test.ts
 *
 * گام اول — فیلتر چندمنطقه/چندمحله در فهرست آگهی (M1) و فهرست درخواست (M2):
 *   · رجیستری عین سامانه ملک تبریز (۱۳۰ منطقه × ۹۲۶ محله) سرراست قابل گزینش است
 *   · ریپازیتوری M1: اجتماع (OR) منطقه یا محله + نرمال‌سازی P6525 (ي/ی · ك/ک · نیم‌فاصله)
 *   · ریپازیتوری M2: عضویت هر یک از مناطق/محله‌های درخواست در انتخاب‌ها (OR)
 *
 * گام دوم — بخش بروزرسانی فهرست فوق پیشرفته (ادغام سه بخش):
 *   · نمای یکپارچه چهار فهرست شامل پوشش غنی‌سازی + نقطهٔ ازسرگیری است
 *   · قاب کاشی: بخش فوق پیشرفته «اولین بخش» هر کاشی است؛ نوار قدیمی حذف شد
 *   · صفحات فقط «فهرست»‌اند: اجرا از بخش فوق پیشرفته، تازه‌سازی با رویداد
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// env آزمون — عین package.json test script (بدون بازنویسی NODE_ENV فقط-خواندنی)
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:/home/z/my-project/db/test.db";
process.env.MELK_TOKEN_KEY = process.env.MELK_TOKEN_KEY ?? "test-only-key-not-a-real-secret";

import { TABRIZ_AREAS, ALL_LINES, DEFAULT_LOCATION_AREA_NAMES, resolveAreaIdsByNames } from "@/lib/divar/tabriz-locations";
import { PrismaPropertyRecordRepository, PrismaRequestRepository } from "../src/core/repositories";
import { readFourListsUnified, FOUR_LIST_IDS } from "@/lib/melk-api/four-lists";
import { ensureJobLockTable } from "@/core/runtime/joblock";

const ROOT = "/home/z/my-project";

// ───────────────────────── گام اول — رجیستری آرم ─────────────────────────

describe("DIR-MULTI-AREA-001 · ۱) رجیستری عین سامانه ملک تبریز", () => {
  test("۱-۱ همان مقیاس شناخته‌شدهٔ آرم: ۱۳۰ منطقه و ۹۲۶ محله", () => {
    expect(TABRIZ_AREAS.length).toBe(130);
    expect(ALL_LINES.length).toBe(926);
  });

  test("۱-۲ ۱۷ منطقهٔ پیش‌فرض مالک همگی روی شناسه‌های رسمی آرم حل می‌شوند", () => {
    const { ids, missing } = resolveAreaIdsByNames(DEFAULT_LOCATION_AREA_NAMES);
    expect(missing).toEqual([]);
    expect(ids.length).toBe(DEFAULT_LOCATION_AREA_NAMES.length);
  });
});

// ───────────── گام اول — فیلتر چندمنطقه/چندمحله روی DB ایزوله ─────────────

const SU_PREFIX = "su-test-";
const db = new PrismaClient();
const propertyRepo = new PrismaPropertyRecordRepository({ client: db });
const requestRepo = new PrismaRequestRepository({ client: db });

/** مناطق/محله‌های واقعی رجیستری برای سناریوها (بدون هاردکد نام) */
const A0 = TABRIZ_AREAS[0];
const A1 = TABRIZ_AREAS[1];
const A2 = TABRIZ_AREAS[2];
const L0 = A0.l[0];
const L1 = A1.l[0];

beforeAll(async () => {
  await ensureJobLockTable(db).catch(() => undefined);
  await db.propertyRecord.deleteMany({ where: { id: { startsWith: SU_PREFIX } } });
  await db.requestRecord.deleteMany({ where: { id: { startsWith: SU_PREFIX } } });

  // M1 — چهار آگهی: دو در منطقهٔ A0 · یک در A1 (با محله) · یک بی‌مکان
  await db.propertyRecord.createMany({
    data: [
      { id: `${SU_PREFIX}p1`, propertyCode: `${SU_PREFIX}91001`, areaName: A0.n, lineName: L0.n, tenantId: "melk-tabriz", createdAt: new Date("2026-11-16T08:00:00Z") },
      { id: `${SU_PREFIX}p2`, propertyCode: `${SU_PREFIX}91002`, areaName: A0.n, lineName: A0.l[1] ? A0.l[1].n : L0.n, tenantId: "melk-tabriz", createdAt: new Date("2026-11-16T08:01:00Z") },
      { id: `${SU_PREFIX}p3`, propertyCode: `${SU_PREFIX}91003`, areaName: A1.n, lineName: L1.n, tenantId: "melk-tabriz", createdAt: new Date("2026-11-16T08:02:00Z") },
      { id: `${SU_PREFIX}p4`, propertyCode: `${SU_PREFIX}91004`, areaName: null, lineName: null, tenantId: "melk-tabriz", createdAt: new Date("2026-11-16T08:03:00Z") },
    ],
  });

  // M2 — سه درخواست: R1 منطقهٔ A0 · R2 محلهٔ L1 · R3 دو منطقهٔ دیگر
  await db.requestRecord.createMany({
    data: [
      { id: `${SU_PREFIX}r1`, source: "arm", actorCode: `${SU_PREFIX}actor`, requestCode: `${SU_PREFIX}92001`, areaNamesJson: JSON.stringify([A0.n]), lineNamesJson: "[]", createdAt: new Date("2026-11-16T08:00:00Z") },
      { id: `${SU_PREFIX}r2`, source: "arm", actorCode: `${SU_PREFIX}actor`, requestCode: `${SU_PREFIX}92002`, areaNamesJson: "[]", lineNamesJson: JSON.stringify([L1.n]), createdAt: new Date("2026-11-16T08:01:00Z") },
      { id: `${SU_PREFIX}r3`, source: "arm", actorCode: `${SU_PREFIX}actor`, requestCode: `${SU_PREFIX}92003`, areaNamesJson: JSON.stringify([A2.n, TABRIZ_AREAS[3].n]), lineNamesJson: "[]", createdAt: new Date("2026-11-16T08:02:00Z") },
    ],
  });
});

afterAll(async () => {
  await db.propertyRecord.deleteMany({ where: { id: { startsWith: SU_PREFIX } } });
  await db.requestRecord.deleteMany({ where: { id: { startsWith: SU_PREFIX } } });
  await db.$disconnect();
});

describe("DIR-MULTI-AREA-001 · ۲) فهرست آگهی (M1) — چندمنطقه/چندمحله", () => {
  test("۲-۱ انتخاب یک منطقه = همهٔ آگهی‌های همان منطقه", async () => {
    const { rows } = await propertyRepo.listArmCatalog({ tenantId: "melk-tabriz", areaNames: [A0.n] }, 100);
    const codes = rows.map((r) => r.propertyCode).sort();
    expect(codes).toEqual([`${SU_PREFIX}91001`, `${SU_PREFIX}91002`]);
  });

  test("۲-۲ انتخاب یک محله = فقط آگهی‌های همان محله", async () => {
    const { rows } = await propertyRepo.listArmCatalog({ tenantId: "melk-tabriz", lineNames: [L1.n] }, 100);
    expect(rows.map((r) => r.propertyCode)).toEqual([`${SU_PREFIX}91003`]);
  });

  test("۲-۳ اجتماع (OR): منطقه + محله با هم — هر که مطابق باشد عبور می‌کند", async () => {
    const { rows } = await propertyRepo.listArmCatalog({ tenantId: "melk-tabriz", areaNames: [A0.n], lineNames: [L1.n] }, 100);
    expect(rows.length).toBe(3);
  });

  test("۲-۴ چند منطقهٔ هم‌زمان: A0 + A1 با هم", async () => {
    const { rows } = await propertyRepo.listArmCatalog({ tenantId: "melk-tabriz", areaNames: [A0.n, A1.n] }, 100);
    expect(rows.length).toBe(3);
  });

  test("۲-۵ نام خارج از رجیستری = صفر ردیف (نه خطا، نه تطبیق کاذب)", async () => {
    const { rows } = await propertyRepo.listArmCatalog({ tenantId: "melk-tabriz", areaNames: ["منطقه‌ای-که-در-آرم-نیست"] }, 100);
    expect(rows.length).toBe(0);
  });

  test("۲-۶ نرمال‌سازی P6525: حرف عربی ي در ورودی = همان ی فارسی رجیستری", async () => {
    // جایگزینی تمام «ی»های فارسی نام منطقه با «ي» عربی — نتیجه باید عین ۲-۱ باشد
    const arabized = A0.n.replace(/ی/g, "ي");
    if (arabized !== A0.n) {
      const { rows } = await propertyRepo.listArmCatalog({ tenantId: "melk-tabriz", areaNames: [arabized] }, 100);
      expect(rows.length).toBe(2);
    }
  });

  test("۲-۷ فیلتر خاموش (بدون انتخاب) = همه — رفتار پیشین دست‌نخورده", async () => {
    const { rows } = await propertyRepo.listArmCatalog({ tenantId: "melk-tabriz", code: SU_PREFIX.slice(0, -1) || undefined }, 100);
    expect(rows.filter((r) => r.propertyCode.startsWith(SU_PREFIX)).length).toBe(4);
  });
});

describe("DIR-MULTI-AREA-001 · ۳) فهرست درخواست (M2) — چندمنطقه/چندمحله", () => {
  test("۳-۱ عضویت هر یک از مناطق درخواست در انتخاب‌ها", async () => {
    const { rows } = await requestRepo.listArmCatalog({ areaNames: [A0.n] }, 100);
    expect(rows.map((r) => r.requestCode)).toContain(`${SU_PREFIX}92001`);
    expect(rows.length).toBe(1);
  });

  test("۳-۲ درخواستِ چندمنطقه‌ای با هر یک از مناطقش مطابق می‌شود", async () => {
    const { rows } = await requestRepo.listArmCatalog({ areaNames: [A2.n] }, 100);
    expect(rows.map((r) => r.requestCode)).toEqual([`${SU_PREFIX}92003`]);
  });

  test("۳-۳ محلهٔ منتخب درخواست (lineNames) با فیلتر محله مطابق می‌شود", async () => {
    const { rows } = await requestRepo.listArmCatalog({ lineNames: [L1.n] }, 100);
    expect(rows.map((r) => r.requestCode)).toEqual([`${SU_PREFIX}92002`]);
  });

  test("۳-۴ اجتماع (OR): منطقه + محله با هم", async () => {
    const { rows } = await requestRepo.listArmCatalog({ areaNames: [A0.n], lineNames: [L1.n] }, 100);
    expect(rows.length).toBe(2);
  });
});

// ───────────── گام دوم — بخش بروزرسانی فهرست فوق پیشرفته ─────────────

describe("DIR-SUPER-UPDATE-001 · ۴) نمای یکپارچهٔ چهار فهرست (منبع یگانه)", () => {
  test("۴-۱ هر چهار فهرست + فیلدهای تازهٔ غنی‌سازی/نقطهٔ ازسرگیری", async () => {
    const view = await readFourListsUnified(db);
    expect(Object.keys(view.lists).sort()).toEqual([...FOUR_LIST_IDS].sort());
    for (const id of FOUR_LIST_IDS) {
      expect("enrich" in view.lists[id]).toBe(true);
      expect("checkpoint" in view.lists[id]).toBe(true);
    }
    // غنی‌سازی فقط برای M1/M2 معنا دارد؛ M3/M4 صریحاً null
    expect(view.lists.m3.enrich).toBeNull();
    expect(view.lists.m4.enrich).toBeNull();
  });

  test("۴-۲ پوشش غنی‌سازی M1/M2 شمارش واقعی DB است (total ≥ complete ≥ 0)", async () => {
    const view = await readFourListsUnified(db);
    for (const id of ["m1", "m2"] as const) {
      const e = view.lists[id].enrich;
      if (e) {
        expect(e.total).toBeGreaterThanOrEqual(e.complete);
        expect(e.complete).toBeGreaterThanOrEqual(0);
        expect(e.pending).toBe(e.total - e.complete);
      }
    }
  });
});

describe("DIR-SUPER-UPDATE-001 · ۵) گاردهای معماری (ادغام سه بخش)", () => {
  const chrome = readFileSync(`${ROOT}/src/components/tiles/FourListsTileChrome.tsx`, "utf8");
  const superUpdate = readFileSync(`${ROOT}/src/components/tiles/SuperListUpdate.tsx`, "utf8");
  const m1 = readFileSync(`${ROOT}/src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx`, "utf8");
  const m2 = readFileSync(`${ROOT}/src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx`, "utf8");
  const m3 = readFileSync(`${ROOT}/src/core/tiles/tiles/transactions-contracts/TransactionsContractsPage.tsx`, "utf8");
  const m4 = readFileSync(`${ROOT}/src/core/tiles/tiles/experts/ExpertsPage.tsx`, "utf8");

  test("۵-۱ بخش فوق پیشرفته «اولین بخش» هر کاشی است", () => {
    const first = chrome.indexOf("SuperListUpdate");
    expect(first).toBeGreaterThan(-1);
    expect(chrome).toContain("listId={listId}");
    // DIR-DESC-CLEANUP-001/ثانیاً — نوار «دسترسی سریع» M1-M5 به دستور مالک حذف شد
    expect(chrome).not.toContain("TileLinkBar");
    expect(chrome).not.toContain('data-testid="tile-link-bar"');
  });

  test("۵-۲ نوار قدیمی چهار-فهرست حذف شد (ادغام — نه تکثیر)", () => {
    expect(existsSync(`${ROOT}/src/components/tiles/FourListsUpdateBar.tsx`)).toBe(false);
    expect(chrome).not.toContain("FourListsUpdateBar");
  });

  test("۵-۳ سه مسیر اجرا در بخش فوق پیشرفته: برشی · فوری همین فهرست · هر چهار فهرست", () => {
    expect(superUpdate).toContain("بروزرسانی برشی همین فهرست");
    expect(superUpdate).toContain("چرخهٔ فوری همین فهرست");
    expect(superUpdate).toContain("هر چهار فهرست");
  });

  test("۵-۴ هماهنگی با کارهای پس‌زمینه: نوار کارها از /api/sync/jobs", () => {
    expect(superUpdate).toContain("/api/sync/jobs");
    expect(superUpdate).toContain("کارهای پس‌زمینهٔ هماهنگ");
    for (const j of ["catalog-listings", "catalog-requests", "catalog-enrich-listings", "catalog-enrich-requests", "main-sync", "crm-sync"]) {
      expect(superUpdate).toContain(j);
    }
  });

  test("۵-۵ هر چهار صفحه فقط «فهرست»‌اند: تازه‌سازی با رویداد melk:super-update", () => {
    expect(m1).toContain('detail?.list === "m1"');
    expect(m2).toContain('detail?.list === "m2"');
    expect(m3).toContain('detail?.list === "m3"');
    expect(m4).toContain('detail?.list === "m4"');
    for (const src of [m1, m2, m3, m4]) {
      expect(src).toContain('melk:super-update');
    }
  });

  test("۵-۶ کارت بروزرسانی داخل صفحات حذف شد (ادغام کامل — نه دوباره‌کاری)", () => {
    expect(m1).not.toContain("arm-listing-last-update");
    expect(m2).not.toContain("arm-request-last-update");
    expect(m3).not.toContain("updateSection=");
    expect(m3).not.toContain('id="m3-update-section"');
    expect(m4).not.toContain('id="m4-update-section"');
  });
});
