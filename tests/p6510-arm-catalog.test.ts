/**
 * تست‌های P6.5-10 — کاشی‌های «آگهی‌های ملک تبریز» و «درخواست‌های ملک تبریز»
 * ------------------------------------------------------
 *  بند ۱ — تغییر نام‌ها:
 *    A) داشبورد مدیریتی → «داشبورد مدیریتی ملک تبریز» + هر ۱۶ کاشی «ملک تبریز» در نام
 *  بند ۲ و ۳ — دو کاشی جدید:
 *    B) ثبت در رجیستری + فرزند داشبورد مدیریتی (ترتیب ۱۰/۱۱) + ایجنت مولتی‌بینش متصل
 *    C) نگاشت‌های خالص ردیف فهرست ARM (عین شکل پاسخ زندهٔ پروب ۱۴۰۵/۰۶/۲۹)
 *    D) مخازن: کاتالوگ + فیلتر کد/کارشناس + شمارش غنی‌سازی + برش در انتظار (روی DB تست)
 *    E) دامنه: arm-request تجمیعی (§۵.۳) + محافظت کاشی «درخواست ملک» از رکوردهای arm
 *    F) مسیرهای واقعی فهرست‌ها (رفع باگ 404) + قواعد ساختاری تک‌صفحه‌ای/فیلتر
 */

import { beforeAll, describe, expect, test } from "bun:test";

const { db } = await import("@/lib/db");

// ===================== الف) تغییر نام‌ها =====================

describe("P6.5-10 بند ۱ — تغییر نام داشبورد و کاشی‌ها", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("A1) نام کاشی داشبورد مدیریتی = «داشبورد مدیریتی ملک تبریز»", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const tile = tileRegistry.get("management-dashboard");
    expect(tile?.title).toBe("داشبورد مدیریتی ملک تبریز");
  });

  test("A2) نام هر ۱۲ کاشی «ملک تبریز» دارد (P6.5-12: ۱۳ − ۱ حذف مشتریان)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const all = tileRegistry.listAll("OWNER");
    expect(all.length).toBe(12);
    for (const t of all) {
      expect(t.title).toContain("ملک تبریز");
    }
  });

  test("A3) مثال دستور دقیقاً اجرا شده: «کارشناسان» → «کارشناسان ملک تبریز»", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    expect(tileRegistry.get("experts")?.title).toBe("کارشناسان ملک تبریز");
  });
});

// ===================== ب) دو کاشی جدید =====================

describe("P6.5-10 بند ۲و۳ — کاشی‌های جدید کاتالوگ ARM", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("B1) دو کاشی با نام‌های دقیق دستور ثبت شده‌اند", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    expect(tileRegistry.get("arm-listings")?.title).toBe("آگهی‌های ملک تبریز");
    expect(tileRegistry.get("arm-requests")?.title).toBe("درخواست‌های ملک تبریز");
  });

  test("B2) داخل داشبورد مدیریتی ملک تبریز — ۷ فرزند (P6.5-12: ادغام سه‌گانه + حذف بازدیدها و مشتریان)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const children = tileRegistry.listChildren("management-dashboard", "OWNER").map((t) => t.id);
    expect(children).toEqual([
      "transactions-contracts", "price-index",
      "experts", "supply-demand", "extraction", "arm-listings", "arm-requests",
    ]);
  });

  test("B3) هر دو کاشی ایجنت هوشمند یادگیرندهٔ مولتی‌بینش متصل دارند (حافظه/بازخورد/نسخه/بازگشت)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    for (const id of ["arm-listings", "arm-requests"] as const) {
      const tile = tileRegistry.get(id);
      expect(tile?.agent).not.toBeNull();
      expect(tile?.agent?.tileId).toBe(id);
      expect(tile?.agent?.insightDomains.length).toBeGreaterThanOrEqual(4);
      expect(tile?.agent?.capabilities).toEqual(["memory", "feedback", "policy-versions", "rollback"]);
    }
  });

  test("B4) ایجنت‌ها در رجیستری ایجنت‌ها ثبت شده‌اند و بینش واقعی تولید می‌کنند", async () => {
    const { getAgent, listAgents } = await import("@/core/agent");
    const listingAgent = getAgent("arm-listings");
    const requestAgent = getAgent("arm-requests");
    expect(listingAgent?.name).toBe("ایجنت آگهی‌های ملک تبریز");
    expect(requestAgent?.name).toBe("ایجنت درخواست‌های ملک تبریز");
    const names = listAgents().map((a) => a.tileId);
    expect(names).toContain("arm-listings");
    expect(names).toContain("arm-requests");
    // تولید بینش واقعی روی DB تست (خالی هم допустاست — نباید خطا بدهد)
    const rendered = await listingAgent?.renderInsights();
    expect(Array.isArray(rendered?.insights)).toBe(true);
    const requestRendered = await requestAgent?.renderInsights();
    expect(Array.isArray(requestRendered?.insights)).toBe(true);
  });
});

// ===================== ج) نگاشت‌های خالص ردیف فهرست =====================

describe("P6.5-10 — نگاشت ردیف فهرست ARM (شکل عین پاسخ زندهٔ پروب)", () => {
  const propertyRow = {
    _id: "6aaf5ab5ddf09123e06287c6",
    isRental: true,
    businessId: { _id: "6447c45e0bcf236f1e3e25bb", title: "ملک تبریز" },
    status: [{ currentStatus: { _id: "x", name: "در انتظار تایید مدیر" }, realtor: { fullName: "شهریار بابایان" } }],
    state: { _id: "s1", name: "آذربایجان شرقی" },
    city: { _id: "c1", name: "تبریز" },
    area: { _id: "a1", name: "خاوران" },
    line: { _id: "l1", name: "جزیره بزرگ" },
    updatedAt: "2026-09-20T04:02:13.777Z",
    code: 59115,
    title: "رهن و اجاره آپارتمان مسکونی 200 متری",
    rent_price: 30000000,
    deposite_price: 1000000000,
    pricePerMeter: null,
    relatedRealtor: "شهریار بابایان",
  } as unknown as Record<string, unknown>;

  const requestRow = {
    _id: "6aaf01a1b2bb594693f0a054",
    status: [{ currentStatus: { _id: "x", name: "سرنخ" }, realtor: { fullName: "پیام عبدی" } }],
    createdAt: "2026-09-19T21:41:53.920Z",
    title: "خرید زمین یا ملک کلنگی مسکونی 300 الی 400 متری",
    code: 52378,
    relatedRealtor: "پیام عبدی",
    relatedCustomer: "آقایی",
  } as unknown as Record<string, unknown>;

  test("C1) آگهی: کد/عنوان/وضعیت/کارشناس/آدرس ترکیبی/قیمت — هیچ ستون کلیدی تهی نمی‌ماند", async () => {
    const { mapArmPropertyListRow } = await import("@/lib/melk-api/arm-catalog");
    const mapped = mapArmPropertyListRow(propertyRow);
    expect(mapped).not.toBeNull();
    expect(mapped?.propertyCode).toBe("59115");
    expect(mapped?.title).toBe("رهن و اجاره آپارتمان مسکونی 200 متری");
    expect(mapped?.status).toBe("در انتظار تایید مدیر");
    expect(mapped?.ownerName).toBe("شهریار بابایان"); // کارشناس مسؤول
    expect(mapped?.address).toBe("آذربایجان شرقی، تبریز، خاوران، جزیره بزرگ");
    expect(mapped?.price).toBe(1000000000); // ودیعه (رهن و اجاره)
    expect(mapped?.areaName).toBe("خاوران");
    expect(mapped?.lineName).toBe("جزیره بزرگ");
    expect(mapped?.createdAt?.toISOString()).toBe("2026-09-20T04:02:13.777Z");
  });

  test("C2) درخواست: کد/عنوان/وضعیت/کارشناس/نام‌خانوادگی درخواست‌دهنده از خود فهرست", async () => {
    const { mapArmRequestListRow } = await import("@/lib/melk-api/arm-catalog");
    const mapped = mapArmRequestListRow(requestRow);
    expect(mapped).not.toBeNull();
    expect(mapped?.requestCode).toBe("52378");
    expect(mapped?.title).toBe("خرید زمین یا ملک کلنگی مسکونی 300 الی 400 متری");
    expect(mapped?.status).toBe("سرنخ");
    expect(mapped?.actorName).toBe("پیام عبدی"); // کارشناس ثبت‌کننده
    expect(mapped?.customerName).toBe("آقایی"); // نام‌خانوادگی عین فهرست — روز نخست خالی نیست
    expect(mapped?.createdAt?.toISOString()).toBe("2026-09-19T21:41:53.920Z");
  });

  test("C3) ردیف بی‌کد رد می‌شود؛ وضعیت و آدرس ترکیبی مقاوم به ردیف ناقص", async () => {
    const { mapArmPropertyListRow, mapArmRequestListRow, composeLocationAddress, currentStatusName } = await import("@/lib/melk-api/arm-catalog");
    expect(mapArmPropertyListRow({ _id: "x" })).toBeNull(); // بدون کدآگهی — کلید طبیعی ندارد
    expect(mapArmRequestListRow({ _id: "y", title: "بی‌کد" })).toBeNull(); // بدون کددرخواست
    expect(currentStatusName({ status: [] })).toBeNull();
    expect(currentStatusName({ status: "بدون آرایه" as unknown as never[] })).toBeNull();
    expect(composeLocationAddress({ city: { name: "تبریز" } })).toBe("تبریز");
    expect(composeLocationAddress({})).toBeNull();
  });
});

// ===================== د) مخازن روی DB تست =====================

const T_PREFIX = "p6510t";

describe("P6.5-10 — مخازن کاتالوگ (روی DB تست)", () => {
  test("D1) آگهی: upsert → کاتالوگ + فیلتر کد/کارشناس + شمارش غنی‌سازی + برش در انتظار", async () => {
    const { getPropertyRecordRepository } = await import("@/core/repositories");
    const repo = getPropertyRecordRepository();
    await repo.upsertBulk(
      [
        {
          id: `${T_PREFIX}-p1`,
          propertyCode: `${T_PREFIX}-911`,
          title: "فروش آپارتمان",
          ownerName: "کارشناس تست آلفا",
          address: "تبریز، خاوران",
          status: "در انتظار تایید مدیر",
          createdAt: new Date("2026-09-20T10:00:00Z"),
        },
        {
          id: `${T_PREFIX}-p2`,
          propertyCode: `${T_PREFIX}-912`,
          title: "رهن و اجاره ویلا",
          ownerName: "کارشناس تست بتا",
          address: "تبریز، ولیعصر",
          createdAt: new Date("2026-09-19T10:00:00Z"),
        },
      ],
      { sourceRunId: `${T_PREFIX}-run1` }
    );

    // کاتالوگ کامل — جدیدترین اول
    const all = await repo.listArmCatalog({}, 100);
    const mine = all.rows.filter((r) => r.propertyCode.startsWith(`${T_PREFIX}-`));
    expect(mine.length).toBe(2);
    expect(mine[0].propertyCode).toBe(`${T_PREFIX}-911`);

    // فیلتر کد (contains)
    const byCode = await repo.listArmCatalog({ code: `${T_PREFIX}-912` }, 100);
    expect(byCode.rows.length).toBe(1);
    expect(byCode.rows[0].ownerName /* کارشناس */).toBeNull(); // ownerName نمایشی = مالک؛ هنوز غنی نشده

    // فیلتر نام کارشناس (contains روی ownerName ستون دامنه)
    const byRealtor = await repo.listArmCatalog({ realtorName: "تست آلفا" }, 100);
    expect(byRealtor.rows.some((r) => r.propertyCode === `${T_PREFIX}-911`)).toBe(true);
    expect(byRealtor.rows.some((r) => r.propertyCode === `${T_PREFIX}-912`)).toBe(false);

    // غنی‌سازی: هر دو در انتظاراند → برش → علامت → شمارش می‌افتد
    const countsBefore = await repo.countEnrichment();
    const pendingMine = (await repo.listPendingEnrichment(500)).filter((r) => r.naturalKey.startsWith(`${T_PREFIX}-`));
    expect(pendingMine.length).toBe(2);
    expect(countsBefore.pending).toBeGreaterThanOrEqual(2);

    await repo.upsertBulk(
      [
        {
          id: `${T_PREFIX}-p1`,
          propertyCode: `${T_PREFIX}-911`,
          rawOwnerName: "امانی",
          ownerMobile: "09144113295",
          address: "تبریز، خاوران، جزیره بزرگ، پلاک ۱۲",
          extractedAt: new Date(),
          extractionBatchId: `${T_PREFIX}-enr1`,
          normalizationVersion: "arm-catalog-v1",
        },
      ],
      { sourceRunId: `${T_PREFIX}-enr1` }
    );
    const countsAfter = await repo.countEnrichment();
    expect(countsAfter.pending).toBe(countsBefore.pending - 1);
    const enriched = (await repo.listArmCatalog({ code: `${T_PREFIX}-911` }, 5)).rows[0];
    expect(enriched.ownerName).toBe("امانی"); // مالک ملک
    expect(enriched.ownerMobile).toBe("09144113295");
    expect(enriched.address).toBe("تبریز، خاوران، جزیره بزرگ، پلاک ۱۲");
  });

  test("D2) درخواست: upsertArmBulk → کاتالوگ + فیلترها + غنی‌سازی درخواست‌دهنده", async () => {
    const { getRequestRepository } = await import("@/core/repositories");
    const repo = getRequestRepository();
    await repo.upsertArmBulk(
      [
        {
          id: `${T_PREFIX}-r1`,
          requestCode: `${T_PREFIX}-511`,
          customerName: "آقایی",
          status: "سرنخ",
          actorName: "پیام تستی",
          title: "خرید آپارتمان ۱۲۰ متری",
          createdAt: new Date("2026-09-19T21:41:53Z"),
        },
        {
          id: `${T_PREFIX}-r2`,
          requestCode: `${T_PREFIX}-512`,
          customerName: "اصلانی",
          status: "در دست اقدام",
          actorName: "مجتبی تستی",
          createdAt: new Date("2026-09-18T10:00:00Z"),
        },
      ],
      { sourceRunId: `${T_PREFIX}-rrun1` }
    );

    const all = await repo.listArmCatalog({}, 100);
    const mine = all.rows.filter((r) => r.requestCode.startsWith(`${T_PREFIX}-`));
    expect(mine.length).toBe(2);
    expect(mine[0].requestCode).toBe(`${T_PREFIX}-511`); // جدیدترین اول
    expect(mine[0].actorName).toBe("پیام تستی");
    expect(mine[0].customerName).toBe("آقایی");

    const byRealtor = await repo.listArmCatalog({ realtorName: "مجتبی تستی" }, 100);
    expect(byRealtor.rows.length).toBe(1);
    expect(byRealtor.rows[0].requestCode).toBe(`${T_PREFIX}-512`);

    // غنی‌سازی: نام کامل + موبایل درخواست‌دهنده
    const pendingBefore = (await repo.listPendingArmEnrichment(500)).filter((r) => r.naturalKey.startsWith(`${T_PREFIX}-`));
    expect(pendingBefore.length).toBe(2);
    await repo.upsertArmBulk(
      [
        {
          id: `${T_PREFIX}-r1`,
          requestCode: `${T_PREFIX}-511`,
          customerName: "رضا آقایی",
          customerMobile: "09143007104",
          rawCustomerName: "رضا آقایی",
          rawCustomerMobile: "989143007104",
          extractedAt: new Date(),
          extractionBatchId: `${T_PREFIX}-renr1`,
          normalizationVersion: "arm-catalog-v1",
        },
      ],
      { sourceRunId: `${T_PREFIX}-renr1` }
    );
    const enriched = (await repo.listArmCatalog({ code: `${T_PREFIX}-511` }, 5)).rows[0];
    expect(enriched.customerName).toBe("رضا آقایی");
    expect(enriched.customerMobile).toBe("09143007104");
    const counts = await repo.countArmEnrichment();
    expect(counts.complete).toBeGreaterThanOrEqual(1);
  });
});

// ===================== هـ) دامنه و محافظت کاشی درخواست ملک =====================

describe("P6.5-10 — دامنه arm-request و محافظت کاشی «درخواست ملک»", () => {
  test("E1) arm-request تجمیعی است: مالک شاهد owner.read، مشاور هم ALL (§۵.۳)", async () => {
    const { resolveEntityAccess, isOwnerSession } = await import("@/lib/access/scope");
    const ownerAccess = resolveEntityAccess({ personnelCode: "410031320", role: "OWNER" }, "arm-request");
    expect(ownerAccess.clause.kind).toBe("ALL");
    expect(ownerAccess.isOwnerRead).toBe(true);
    const consultantAccess = resolveEntityAccess({ personnelCode: "910001", role: "CONSULTANT" }, "arm-request");
    expect(consultantAccess.clause.kind).toBe("ALL");
    expect(consultantAccess.isOwnerRead).toBe(false);
    expect(isOwnerSession({ personnelCode: "410031320", role: "OWNER" })).toBe(true);
  });

  test("E2) listRequests رکوردهای source='arm' را به کاشی «درخواست ملک» نمی‌آورد", async () => {
    const { listRequests } = await import("@/lib/request/store");
    const res = await listRequests();
    expect(res.rows.every((r) => (r as unknown as { source?: string }).source !== "arm")).toBe(true);
  });
});

// ===================== و) مسیرها و ساختار تک‌صفحه‌ای =====================

describe("P6.5-10 — مسیرهای واقعی ARM و ساختار UI", () => {
  test("F1) مسیر فهرست‌ها با پسوند /list ثبت شده‌اند (رفع باگ 404 کشف‌شده در پروب)", async () => {
    const { MELK_ENDPOINTS } = await import("@/lib/melk-api/endpoints");
    expect(MELK_ENDPOINTS.arm.propertiesList).toBe("properties/list");
    expect(MELK_ENDPOINTS.arm.requestsList).toBe("requests/list");
  });

  test("F2) هر دو صفحه کاشی: تک‌صفحه‌ای (بدون صفحه‌بندی) + دو فیلتر الزامی + دکمه استخراج", async () => {
    const { readFileSync } = await import("fs");
    const listingsPage = readFileSync("src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx", "utf8");
    const requestsPage = readFileSync("src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx", "utf8");
    for (const [name, src] of [["آگهی", listingsPage], ["درخواست", requestsPage]] as const) {
      expect(src.includes("pageSize"), `${name}: بدون صفحه‌بندی`).toBe(false);
      expect(src.includes("slice(0,"), `${name}: بدون برش ردیف`).toBe(false);
      expect(src.includes('id="arm-'), `${name}: فیلترهای برچسب‌دار`).toBe(true);
      expect(src.includes("بروزرسانی از سامانه"), `${name}: دکمه استخراج`).toBe(true);
      expect(src.includes("AgentPanel"), `${name}: ایجنت متصل`).toBe(true);
    }
    expect(listingsPage.includes("شماره تماس مالک")).toBe(true);
    expect(listingsPage.includes("آدرس ملک")).toBe(true);
    // P6521/M2 — تغییر نام ستون‌های درخواست (دستور ۰۲۰): متقاضی + شماره تماس متقاضی
    expect(requestsPage.includes("شماره تماس متقاضی")).toBe(true);
    expect(requestsPage.includes("متقاضی")).toBe(true);
    expect(requestsPage.includes('">منطقه</TableHead>')).toBe(true);
  });

  test("F3) سقف تک‌صفحه‌ای سرور ۲۵٬۰۰۰ (کل کاتالوگ ۱۱٬۳۶۳ آگهی + ۲۰٬۳۹۲ درخواست در یک پاسخ)", async () => {
    const { readFileSync } = await import("fs");
    const lRoute = readFileSync("src/app/api/crm/arm-catalog/listings/route.ts", "utf8");
    const rRoute = readFileSync("src/app/api/crm/arm-catalog/requests/route.ts", "utf8");
    expect(lRoute.includes("25000")).toBe(true);
    expect(rRoute.includes("25000")).toBe(true);
    expect(lRoute.includes("resolveEntityAccess")).toBe(true);
    expect(rRoute.includes("resolveEntityAccess")).toBe(true);
    expect(lRoute.includes("witnessScopedRead")).toBe(true);
    expect(rRoute.includes("witnessScopedRead")).toBe(true);
  });
});

// ===================== پاک‌سازی =====================

import { afterAll } from "bun:test";
afterAll(async () => {
  await db.propertyRecord.deleteMany({ where: { propertyCode: { startsWith: `${T_PREFIX}-` } } }).catch(() => undefined);
  await db.requestRecord.deleteMany({ where: { requestCode: { startsWith: `${T_PREFIX}-` } } }).catch(() => undefined);
  await db.$disconnect();
});
