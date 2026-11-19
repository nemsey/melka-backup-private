/**
 * tests/dir-changes-tile-002.test.ts — کاشی «تغییرات» نسل ۲ (DIR-CHANGES-TILE-002)
 * ---------------------------------------------------------------------------
 * ساختار تازه (دستور مالک ۱۴۰۵/۰۸/۲۹): کدآگهی {تغییر، حذف} + کددرخواست {تغییر، حذف}
 *
 * پوشش:
 *   ۱) قواعد آبشار — لنگر «ایجاد مشاور» · Δ نسبی عین مثال مالک
 *      (۱۴۰۵/۰۶/۰۲ ← ۱۴۰۵/۰۷/۰۵ = +۳۴ روز · انتشار ۱۴۰۵/۰۶/۰۳ ← ۱۴۰۵/۰۷/۰۶)
 *   ۲) محافظ semantics — آرایهٔ ناقص هرگز (بدون خواندن کامل) ساخته نمی‌شود
 *   ۳) نقشهٔ پاکسازی کامل — همهٔ آثار محلی کدآگهی/کددرخواست
 *   ۴) ساختار دو بخش کاشی (فقط تغییر/حذف — سایر بخش‌ها حذف شد)
 *   ۵) مسیرهای اثبات‌شدهٔ زندهٔ این نوبت
 */

import { beforeAll, afterAll, describe, expect, test } from "bun:test";

Object.assign(process.env, {
  NODE_ENV: process.env.NODE_ENV ?? "test",
  DATABASE_URL: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/test.db",
  MELK_TOKEN_KEY: process.env.MELK_TOKEN_KEY ?? "test-only-key-not-a-real-secret",
});

const { db } = await import("@/lib/db");
const V = await import("@/lib/changes/variables");
const E = await import("@/lib/changes/executor");
const P = await import("@/lib/changes/purge");

const ACTOR = { code: V.OWNER_IDENTITY.personnelCode, name: V.OWNER_IDENTITY.fullName };

/* ═══════════ ۱) قواعد آبشار — Δ نسبی از لنگر ═══════════ */

describe("DIR-CHANGES-TILE-002 · ۱) آبشار تاریخ — Δ نسبی از لنگر «ایجاد مشاور»", () => {
  // اسکلت عین اسکرین‌شات مالک (آگهی 57810):
  // ایجاد مشاور ۱۴۰۵/۰۶/۰۲ ۱۸:۴۵ = 2026-08-24T15:15:54.000Z (تهران ۱۸:۴۵)
  const CREATE_REALTOR = "2026-08-24T15:15:54.000Z";
  const PUBLISH = "2026-08-25T15:51:00.000Z"; // انتشار آگهی ۱۴۰۵/۰۶/۰۳ ۱۹:۲۱

  test("۱-۱ لنگر «ایجاد مشاور» انتخاب می‌شود (نه قدیمی‌ترین تصادفی)", () => {
    const entries = [
      { key: "b", label: "بررسی آگهی", date: "2026-08-24T15:16:00.000Z" },
      { key: "a", label: "ایجاد مشاور", date: CREATE_REALTOR },
    ];
    const anchor = E.pickAnchor(entries.map((e) => ({ label: e.label, date: e.date })));
    expect(anchor).not.toBeNull();
    expect(anchor!.isCreateRealtor).toBe(true);
    expect(anchor!.date).toBe(CREATE_REALTOR);
  });

  test("۱-۲ نبود «ایجاد مشاور» → قدیمی‌ترین مدخل (شفاف)", () => {
    const entries = [
      { key: "x", label: "ویرایش آگهی", date: "2026-09-01T00:00:00.000Z" },
      { key: "y", label: "بررسی آگهی", date: "2026-08-24T15:15:54.000Z" },
    ];
    const anchor = E.pickAnchor(entries.map((e) => ({ label: e.label, date: e.date })));
    expect(anchor!.isCreateRealtor).toBe(false);
    expect(anchor!.date).toBe("2026-08-24T15:15:54.000Z");
  });

  test("۱-۳ مثال مالک: ۱۴۰۵/۰۶/۰۲ ← ۱۴۰۵/۰۷/۰۵ = +۳۴ روز · انتشار ۰۶/۰۳ ← ۰۷/۰۶", () => {
    const entries = [
      { key: "create", label: "ایجاد مشاور", date: CREATE_REALTOR },
      { key: "review", label: "بررسی آگهی", date: "2026-08-24T15:16:00.000Z" },
      { key: "publish", label: "انتشار آگهی", date: PUBLISH },
    ];
    // هدف مالک: ۱۴۰۵/۰۷/۰۵ — ساعت حفظ می‌شود (خالی) — ثانیهٔ دقیق لنگر نیز حفظ می‌شود
    const { plan, error } = E.buildCascadePlan(entries, "1405/07/05", null);
    expect(error).toBeUndefined();
    expect(plan).not.toBeNull();
    expect(plan!.deltaDays).toBe(34);
    // هدف = همان لحظهٔ لنگر (۱۸:۴۵:۵۴) در تاریخ جدید ۱۴۰۵/۰۷/۰۵
    expect(plan!.targetDate).toBe("2026-09-27T15:15:54.000Z");
    // انتشار: ۱۴۰۵/۰۶/۰۳ ۱۹:۲۱ → ۱۴۰۵/۰۷/۰۶ ۱۹:۲۱ (همان +۳۴ روز — عین مثال مالک)
    const publishAfter = plan!.entries.find((p) => p.key === "publish")!.after;
    expect(publishAfter).toBe("2026-09-28T15:51:00.000Z");
    expect(V.isoToJalaliHour(publishAfter)).toBe("19:21 | 1405/07/06");
  });

  test("۱-۴ ساعت هدف صریح — Δ دقیق میلی‌ثانیه‌ای", () => {
    const entries = [{ key: "create", label: "ایجاد مشاور", date: CREATE_REALTOR }];
    const { plan } = E.buildCascadePlan(entries, "1405/08/20", "17:30"); // عین شاهکار ۰۹۹
    expect(plan!.targetDate).toBe("2026-11-11T14:00:00.000Z");
    expect(plan!.deltaDays).toBeGreaterThan(70);
  });

  test("۱-۵ تاریخ نامعتبر → خطای شفاف", () => {
    const entries = [{ key: "create", label: "ایجاد مشاور", date: CREATE_REALTOR }];
    const { error } = E.buildCascadePlan(entries, "بی‌تاریخ", null);
    expect(error).toBeTruthy();
  });

  test("۱-۶ بدون مدخل → خطای شفاف", () => {
    const { error } = E.buildCascadePlan([], "1405/07/05", null);
    expect(error).toBeTruthy();
  });

  test("۱-۷ shiftIso خالص — رفت‌وبرگشت با Δ صفر", () => {
    expect(E.shiftIso(CREATE_REALTOR, 0)).toBe(CREATE_REALTOR);
    expect(E.shiftIso(CREATE_REALTOR, 86_400_000)).toBe("2026-08-25T15:15:54.000Z");
  });
});

/* ═══════════ ۲) ساختار کاشی — فقط تغییر/حذف ═══════════ */

describe("DIR-CHANGES-TILE-002 · ۲) ساختار دو بخش — فقط «تغییر» و «حذف»", () => {
  test("۲-۱ دو بخش: کدآگهی و کددرخواست — هر یک فقط تغییر + حذف", () => {
    expect(V.CAPABILITIES.length).toBe(2);
    for (const cap of V.CAPABILITIES) {
      expect(cap.operations.length).toBe(2);
      expect(cap.operations.map((o) => o.key).sort()).toEqual(["change", "delete"]);
    }
  });

  test("۲-۲ شرح تغییر کدآگهی شامل هر دو قابلیت مالک (اطلاعات مالک + تاریخ با آبشار)", () => {
    const listingChange = V.CAPABILITIES[0].operations.find((o) => o.key === "change")!;
    expect(listingChange.description).toContain("اطلاعات مالک آگهی");
    expect(listingChange.description).toContain("ایجاد مشاور");
    expect(listingChange.description).toContain("رویداد و بازخورد");
  });

  test("۲-۳ شرح حذف — پاکسازی کامل و پروفایل کارشناسان", () => {
    for (const cap of V.CAPABILITIES) {
      const del = cap.operations.find((o) => o.key === "delete")!;
      expect(del.description).toContain("هیچ اثری");
      expect(del.description).toContain("پروفایل کارشناس");
    }
  });

  test("۲-۴ قواعد آبشار — نام اقدام لنگر عین دستور مالک", () => {
    expect(V.CASCADE_RULES.anchorActionName).toBe("ایجاد مشاور");
    expect(V.CASCADE_RULES.anchorFallback).toBe("earliest");
  });
});

/* ═══════════ ۳) نقشهٔ پاکسازی کامل ═══════════ */

describe("DIR-CHANGES-TILE-002 · ۳) پاکسازی کامل — هیچ اثری باقی نماند", () => {
  const L_CODE = "99001";
  const L_ARM = "5f00000000000000000000a1";
  const R_CODE = "99002";

  beforeAll(async () => {
    // ساخت آثار محلی یک کدآگهی و یک کددرخواست در همهٔ جدول‌های نقشه (رکوردهای مجزا برای هر طرف)
    await db.propertyRecord.create({ data: { id: "p1", propertyCode: L_CODE, title: "آگهی آزمون", ownerName: "کارشناس آزمون" } });
    await db.listingRecord.create({ data: { id: "l1", armPropertyId: L_ARM, actorCode: "x" } });
    const req = await db.requestRecord.create({ data: { requestCode: R_CODE, customerName: "متقاضی آزمون", actorCode: "x", source: "arm" } });
    await db.requestEventRecord.create({ data: { requestId: req.id, eventTypeId: "t1", eventTypeName: "بازدید آگهی", propertyCode: L_CODE, armPropertyId: L_ARM, actorCode: "x" } });
    await db.visitRecord.create({ data: { id: "v1", propertyCode: L_CODE, requesterName: "الف", checkerName: "ب", propertyRealtorName: "ج", createdAt: new Date() } });
    await db.specialPropertyRecord.create({ data: { id: "sp1", propertyId: L_ARM, propertyCode: L_CODE } });
    await db.transactionRecord.create({ data: { id: "t1", contractDate: new Date(), propertyCode: L_CODE } });
    await db.transactionRecord.create({ data: { id: "t2", contractDate: new Date(), propertyCode: "99003", requestCode: R_CODE } });
    await db.contractRecord.create({ data: { id: "c1", status: "finished", propertyCode: L_CODE } });
    await db.contractRecord.create({ data: { id: "c2", status: "finished", requestCode: R_CODE } });
    await db.matchRejectionRecord.create({ data: { id: "m1", direction: "listing_to_request", listingCode: L_CODE, reasonsJson: "[]" } });
    await db.matchRejectionRecord.create({ data: { id: "m2", direction: "request_to_listing", requestCode: R_CODE, reasonsJson: "[]" } });
    await db.opportunityAlert.create({ data: { id: "a1", direction: "listing_to_request", listingCode: L_CODE, matchScore: 0.9, matchReasons: "[]" } });
    await db.opportunityAlert.create({ data: { id: "a2", direction: "request_to_listing", requestId: req.id, matchScore: 0.8, matchReasons: "[]" } });
    await db.graphNode.create({ data: { graph: "property", nodeType: "property", refId: L_CODE } });
    await db.graphNode.create({ data: { graph: "property", nodeType: "request", refId: R_CODE } });
    await db.graphEdge.create({ data: { graph: "property", fromType: "property", fromRef: L_CODE, toType: "area", toRef: "area1", edgeType: "located_in" } });
    await db.graphEdge.create({ data: { graph: "property", fromType: "request", fromRef: R_CODE, toType: "area", toRef: "area1", edgeType: "located_in" } });
  });

  afterAll(async () => {
    // پاکسازی نهایی آزمون
    await db.propertyRecord.deleteMany({ where: { propertyCode: L_CODE } }).catch(() => undefined);
    await db.listingRecord.deleteMany({ where: { armPropertyId: L_ARM } }).catch(() => undefined);
    await db.requestRecord.deleteMany({ where: { requestCode: R_CODE } }).catch(() => undefined);
    await db.visitRecord.deleteMany({ where: { propertyCode: L_CODE } }).catch(() => undefined);
    await db.specialPropertyRecord.deleteMany({ where: { propertyCode: L_CODE } }).catch(() => undefined);
    await db.transactionRecord.deleteMany({ where: { OR: [{ propertyCode: L_CODE }, { propertyCode: "99003", requestCode: R_CODE }] } }).catch(() => undefined);
    await db.contractRecord.deleteMany({ where: { OR: [{ propertyCode: L_CODE }, { requestCode: R_CODE }] } }).catch(() => undefined);
    await db.matchRejectionRecord.deleteMany({ where: { OR: [{ listingCode: L_CODE }, { requestCode: R_CODE }] } }).catch(() => undefined);
    await db.opportunityAlert.deleteMany({ where: { OR: [{ listingCode: L_CODE }, { requestId: { not: null } }] } }).catch(() => undefined);
    await db.graphNode.deleteMany({ where: { refId: { in: [L_CODE, R_CODE] } } }).catch(() => undefined);
    await db.graphEdge.deleteMany({ where: { OR: [{ fromRef: L_CODE }, { toRef: L_CODE }, { fromRef: R_CODE }, { toRef: R_CODE }] } }).catch(() => undefined);
  });

  test("۳-۱ شمارش آثار پیش از حذف — همهٔ جدول‌ها دیده می‌شوند", async () => {
    const counts = await P.countListingTraces(L_CODE, L_ARM);
    expect(counts.propertyCatalog).toBe(1);
    expect(counts.listingFiles).toBe(1);
    expect(counts.linkedEvents).toBe(1);
    expect(counts.visits).toBe(1);
    expect(counts.specialProperties).toBe(1);
    expect(counts.transactions).toBe(1);
    expect(counts.contracts).toBe(1);
    expect(counts.matchRejections).toBe(1);
    expect(counts.opportunityAlerts).toBe(1);
    expect(counts.graphNodes).toBe(1);
    expect(counts.graphEdges).toBe(1);
  });

  test("۳-۲ پاکسازی کامل کدآگهی — همهٔ آثار صفر", async () => {
    const counts = await P.purgeListingLocally(L_CODE, L_ARM);
    expect(counts.propertyCatalog).toBe(1);
    expect(counts.linkedEvents).toBe(1);
    expect(counts.transactions).toBe(1); // فقط رکورد سمت آگهی — رکورد سمت درخواست دست‌نخورده
    expect(counts.graphEdges).toBe(1);
    const after = await P.countListingTraces(L_CODE, L_ARM);
    const total = Object.values(after).reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  test("۳-۳ شمارش و پاکسازی کامل کددرخواست — رکورد + رویداد cascade + گراف", async () => {
    const before = await P.countRequestTraces(R_CODE);
    expect(before.requestRecords).toBe(1);
    expect(before.transactions).toBe(1);
    expect(before.contracts).toBe(1);
    expect(before.matchRejections).toBe(1);
    expect(before.opportunityAlerts).toBe(1);
    const counts = await P.purgeRequestLocally(R_CODE);
    expect(counts.requestRecords).toBe(1);
    const after = await P.countRequestTraces(R_CODE);
    expect(after.requestRecords).toBe(0);
    expect(after.graphNodes).toBe(0);
  });
});

/* ═══════════ ۴) بدنه‌سازی ویرایش از رکورد زنده ═══════════ */

describe("DIR-CHANGES-TILE-002 · ۴) بازسازی بدنهٔ ویرایش آگهی از رکورد زنده", () => {
  test("۴-۱ مقادیر populated → شناسه خام + پرچم‌ها بازتأیید + status فقط با override", () => {
    const row = {
      _id: "pid",
      customer: { _id: "c1", userId: "u1" },
      country: { _id: "co1" },
      state: { _id: "st1" },
      city: { _id: "ci1" },
      area: { _id: "ar1" },
      line: { _id: "li1" },
      address: "آدرس",
      tradeType: { _id: "tt1" },
      propertyType: { _id: "pt1" },
      buildingType: { _id: "bt1" },
      changeWith: ["land"],
      inputs: { space: 180 },
      priceEvaluation: "pe1",
      fileFinding: "ff1",
      fileType: ["ft1"],
      userSeriousity: "us1",
      realtorDescription: "توضیح",
      urgent: true,
      changeable: false,
      ocasion: false,
      isRental: false,
      confirmSMS: true,
    };
    const payload = E.buildPropertyUpdatePayload(row as any);
    expect(payload.customer).toBe("u1"); // userId مقدم — عین users/create خود سامانه
    expect(payload.area).toBe("ar1");
    expect(payload.tradeType).toBe("tt1");
    expect(payload.urgent).toBe(true);
    expect(payload.confirmSMS).toBe(true);
    expect("status" in payload).toBe(false); // بدون status — محافظ REPLACE
    const shifted = [{ _id: "s1", date: "2026-09-26T15:15:54.000Z" }];
    const payload2 = E.buildPropertyUpdatePayload(row as any, shifted as any);
    expect(payload2.status).toEqual(shifted);
  });
});

/* ═══════════ ۵) مسیرهای اثبات‌شدهٔ زندهٔ این نوبت ═══════════ */

describe("DIR-CHANGES-TILE-002 · ۵) مسیرهای اثبات‌شدهٔ زنده (پراب‌های ۱-۱۱)", () => {
  test("۵-۱ ویرایش/حذف رویداد و اطلاعات کاربر", () => {
    expect(V.ARM_PATHS.requestEventUpdate("X")).toBe("request-events/update/X");
    expect(V.ARM_PATHS.requestEventDelete("X")).toBe("request-events/delete/X");
    expect(V.ARM_PATHS.requestEventsList).toBe("request-events/list");
    expect(V.ARM_PATHS.customerUpdate("X")).toBe("users/update/X");
    expect(V.ARM_PATHS.customerInfo("X")).toBe("users/info/X");
    expect(V.ARM_PATHS.customerDelete("X")).toBe("users/delete/X");
    expect(V.ARM_PATHS.requestInfo("X")).toBe("requests/info/X");
  });

  test("۵-۲ واریانت‌های دروازهٔ تاریخچهٔ آگهی و حذف — آمادهٔ فعال‌شدن آرم", () => {
    const hist = V.ARM_PATHS.propertyHistoryVariants("X");
    expect(hist.length).toBeGreaterThanOrEqual(3);
    expect(hist).toContain("properties/history/X");
    const del = V.ARM_PATHS.propertyDeleteVariants("X");
    expect(del[0].path).toBe("properties/delete/X");
    const rdel = V.ARM_PATHS.requestDeleteVariants("X");
    expect(rdel[0].path).toBe("requests/delete/X");
  });
});

/* ═══════════ ۶) نمایش جلالی — عین UI خود سامانه ═══════════ */

describe("DIR-CHANGES-TILE-002 · ۶) نمایش تاریخ عین UI خود سامانه", () => {
  test("۶-۱ ساعت تهران از ISO (حفظ ساعت لنگر)", () => {
    expect(V.isoToTehranHour("2026-08-24T15:15:54.000Z")).toBe("18:45");
    expect(V.isoToTehranHour("2026-11-11T14:00:00.000Z")).toBe("17:30");
  });
  test("۶-۲ شاهکار ۰۹۹ پابرجا", () => {
    expect(V.jalaliHourToIsoUtc("1405/08/20", "17:30")).toBe("2026-11-11T14:00:00.000Z");
    expect(V.isoToJalaliHour("2026-11-11T14:00:00.000Z")).toBe("17:30 | 1405/08/20");
  });
});
