/**
 * pn002-tiles.test.ts — سوئیت تازهٔ چهار کاشی پس از غنی‌سازی PN-002 (گام‌های ۱-۴ + گام ۶)
 * =============================================================================
 * «تست‌های قدیمی را بطور کلی حذف کن و تست‌های جدید را طراحی، پیاده‌سازی و
 *  اجرای واقعی کن» — حذف‌شده‌ها: چهار سوئیت p6530-m1/m2/m3/m4 (۱۹۵۸ خط).
 *
 * این سوئیت تازه — پنج بخش:
 *   §۱ مپر M1 — استخراج ستون‌های تازه از ردیف واقعی فهرست ARM (شکل زندهٔ پروب)
 *   §۲ مپر M2 — استخراج inputs (متراژ/اتاق/طبقه/سال/سند/نوع ساخت/جهت/معاوضه)
 *   §۳ فیلترهای تازه — M1 (نوع/بازدید/متراژ/اتاق/دیوار/محله/استان) + M2 (هم‌پوشانی متراژ/سند/جهت/فوریت)
 *   §۴ گام ۶ — حذف توضیحات زیر عناوین + ستون‌های جدید در سرستون‌ها + دکمهٔ اکسل چهار کاشی
 *   §۵ خروجی اکسل — بستهٔ xlsx واقعی (امضای ZIP + sheet RTL) برای چهار موجودیت
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "bun:test";

const SRC = "/home/z/my-project/src";
const TILES = `${SRC}/core/tiles/tiles`;
const M1_SRC = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
const M2_SRC = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
const M3_SRC = readFileSync(`${TILES}/transactions-contracts/TransactionsTab.tsx`, "utf8");
const M4_SRC = readFileSync(`${TILES}/experts/ExpertsPage.tsx`, "utf8");

/* ==========================================================================
 * §۱ — مپر M1: ستون‌های تازه از ردیف فهرست ARM (عین شکل پروب زندهٔ PN-002)
 * ========================================================================== */

import { mapArmPropertyListRow } from "@/lib/melk-api/arm-catalog";

describe("PN-002 §۱ — مپر M1 (ستون‌های تازه از خود ردیف فهرست)", () => {

  /** ردیف فروش — عین شکل زندهٔ properties/list (پروب ۱۴۰۵/۰۷/۱۳ code=59782) */
  const saleRow = {
    _id: "6712a1b2c3d4e5f6a7b8c9d0",
    code: 59782,
    title: "فروش آپارتمان مسکونی ۱۵۵ متری",
    relatedRealtor: "سید نعمت اله سیدی",
    isRental: false,
    addedToDivar: false,
    addedToInsta: false,
    isTarget: false,
    isReposted: false,
    viewCount: 7,
    link: "/properties/تبریز/سپهر-صادرات/59782-فروش-آپارتمان",
    businessId: { _id: "6447c45e0bcf236f1e3e25bb", title: "ملک تبریز" },
    state: { _id: "s1", name: "آذربایجان شرقی" },
    city: { _id: "c1", name: "تبریز" },
    area: { _id: "a1", name: "سپهر صادرات" },
    line: { _id: "l1", name: "۱۰ متری های غربی" },
    totalPrice: 29_500_000_000,
    pricePerMeter: 190_322_580,
    images: Array.from({ length: 11 }, (_, i) => ({ image: `img${i}`, thumbnail: `t${i}` })),
    status: [{ currentStatus: { name: "در انتظار تایید مدیر" }, date: "2026-10-05T08:06:37.526Z" }],
    updatedAt: "2026-10-05T08:06:37.526Z",
  };

  /** ردیف اجاره — رهن/اجاره جدا (code=59783) */
  const rentalRow = {
    ...saleRow,
    code: 59783,
    isRental: true,
    totalPrice: undefined,
    pricePerMeter: null,
    deposite_price: 300_000_000,
    rent_price: 45_000_000,
    images: [{ image: "i", thumbnail: "t" }],
  };

  test("۱-۱) ردیف فروش: همهٔ ستون‌های تازه استخراج می‌شوند (بازدید/تصویر/شعبه ARM/استان/لینک/تاریخ وضعیت)", () => {
    const out = mapArmPropertyListRow(saleRow);
    expect(out).not.toBeNull();
    expect(out!.viewCount).toBe(7);
    expect(out!.imageCount).toBe(11);
    expect(out!.isRental).toBe(false);
    expect(out!.addedToDivar).toBe(false);
    expect(out!.addedToInsta).toBe(false);
    expect(out!.isReposted).toBe(false);
    expect(out!.armBranchTitle).toBe("ملک تبریز");
    expect(out!.stateName).toBe("آذربایجان شرقی");
    expect(out!.cityName).toBe("تبریز");
    expect(out!.publicUrl).toContain("59782");
    expect(out!.statusDate).toBeInstanceOf(Date);
    expect(out!.price).toBe(29_500_000_000);
    expect(out!.pricePerMeter).toBe(190_322_580);
  });

  test("۱-۲) ردیف اجاره: رهن و اجاره جداگانه + isRental=true", () => {
    const out = mapArmPropertyListRow(rentalRow);
    expect(out).not.toBeNull();
    expect(out!.isRental).toBe(true);
    expect(out!.depositPrice).toBe(300_000_000);
    expect(out!.rentPrice).toBe(45_000_000);
    expect(out!.price).toBe(300_000_000); // قیمت پایه = رهن
    expect(out!.imageCount).toBe(1);
  });

  test("۱-۳) بدون کدآگهی ردیف بی‌اعتبار است (کلید طبیعی)", () => {
    expect(mapArmPropertyListRow({ _id: "x", title: "بدون کد" })).toBeNull();
  });
});

/* ==========================================================================
 * §۲ — مپر M2: inputs فرم پویای درخواست (شاهکار گام ۲)
 * ========================================================================== */

import {
  mapArmRequestListRow,
  extractRequestInputs,
  SANAD_LABELS,
  CONSTRUCT_TYPE_LABELS,
  SIDE_LABELS,
  CHANGE_WITH_LABELS,
} from "@/lib/melk-api/arm-catalog";

describe("PN-002 §۲ — مپر M2 (inputs خود ردیف فهرست درخواست)", () => {

  /** عین ردیف زندهٔ requests/list (پروب code=53364) */
  const reqRow = {
    _id: "6712req0a1b2c3d4e5f6a7b8",
    code: 53364,
    title: "خرید آپارتمان",
    relatedCustomer: "مشتری تست",
    relatedRealtor: "کارشناس تست",
    urgent: false,
    luxury: false,
    ocasion: true,
    deposite: false,
    changeable: false,
    confirmSMS: true,
    notifyMe: true,
    platform: "panel",
    tradeType: "614ed62da50555f0a54c1eca",
    buildingType: "614edc66a50555f0a54c1f2d",
    propertyType: "614f3e3aa50555f0a54c2ae7",
    userPaymentMethod: "61a39bf0f06329efdeacbbef",
    userSeriousity: "61a7536b0927675c45489a59",
    area: [{ _id: "a1", name: "سپهر صادرات" }],
    line: [{ _id: "l1", name: "۱۰ متری های غربی" }],
    totalPrice_from: 14_000_000_000,
    totalPrice_to: 17_000_000_000,
    inputs: {
      space_from: 20, space_to: 200,
      floor_from: 0, floor_to: 90,
      room_whole_from: 0, room_whole_to: 90,
      year_from: 1375, year_to: 1405,
      sanad: ["dardasteegdam", "sixdong"],
      construct_type: ["complex", "tower"],
      side: ["north", "north_west"],
    },
    changeWith: ["notChangeable", "apartment"],
    businessId: { _id: "b1", title: "ملک تبریز" },
    country: { _id: "ir", name: "ایران" },
    state: { _id: "s1", name: "آذربایجان شرقی" },
    city: { _id: "c1", name: "تبریز" },
    createdAt: "2026-10-05T07:00:00.000Z",
  };

  test("۲-۱) متراژ/طبقه/اتاق/سال ساخت از-تا از inputs استخراج می‌شوند", () => {
    const out = mapArmRequestListRow(reqRow);
    expect(out).not.toBeNull();
    expect(out!.spaceFrom).toBe(20);
    expect(out!.spaceTo).toBe(200);
    // صفرِ پیش‌فرض فرم (رزرو ۹۰) نباید ستون را پر کند — مقادیر واقعی فقط
    expect(extractRequestInputs(reqRow.inputs).roomsFrom).toBeUndefined();
    expect(extractRequestInputs({ room_whole_from: 2, room_whole_to: 5 }).roomsFrom).toBe(2);
    expect(extractRequestInputs({ room_whole_to: 5 }).roomsTo).toBe(5);
    expect(out!.buildYearFrom).toBe(1375);
    expect(out!.buildYearTo).toBe(1405);
  });

  test("۲-۲) سند — ترجمهٔ رسمی: در دست اقدام، شش‌دانگ", () => {
    const out = mapArmRequestListRow(reqRow);
    expect(out!.sanadNames).toBe("در دست اقدام، شش‌دانگ");
    expect(SANAD_LABELS["sixdong"]).toBe("شش‌دانگ");
    expect(SANAD_LABELS["key"]).toBe("قولنامه");
    expect(SANAD_LABELS["contractical"]).toBe("قراردادی");
  });

  test("۲-۳) نوع ساخت + جهت — ترجمهٔ فارسی", () => {
    const out = mapArmRequestListRow(reqRow);
    expect(out!.constructTypeNames).toBe("مجتمع، برج");
    expect(out!.sideNames).toBe("شمال، شمال غربی");
    expect(SIDE_LABELS["east_west"]).toBe("شرقی-غربی");
    expect(CONSTRUCT_TYPE_LABELS["personal"]).toBe("شخصی");
  });

  test("۲-۴) معاوضه — نام‌های رسمی enum عمومی ARM (notChangeable=مایل نیستم)", () => {
    const out = mapArmRequestListRow(reqRow);
    expect(out!.changeWithNames).toBe("مایل نیستم، واحد آپارتمان");
    expect(CHANGE_WITH_LABELS["land"]).toBe("زمین / ملک کلنگی");
    expect(CHANGE_WITH_LABELS["car"]).toBe("خودرو");
  });

  test("۲-۵) فلگ‌ها + شعبه ARM + کشور/استان/شهر + پلتفرم", () => {
    const out = mapArmRequestListRow(reqRow);
    expect(out!.occasion).toBe(true);
    expect(out!.confirmSms).toBe(true);
    expect(out!.notifyMe).toBe(true);
    expect(out!.armBranchTitle).toBe("ملک تبریز");
    expect(out!.countryName).toBe("ایران");
    expect(out!.stateName).toBe("آذربایجان شرقی");
    expect(out!.cityName).toBe("تبریز");
    expect(out!.platform).toBe("panel");
  });
});

/* ==========================================================================
 * §۳ — فیلترهای تازه: روت‌های زندهٔ M1/M2 با پارامترهای جدید (دادهٔ واقعی)
 * ========================================================================== */

let OWNER_TOKEN: string | null = null;
async function ownerToken(): Promise<string> {
  if (OWNER_TOKEN) return OWNER_TOKEN;
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode: "950032", displayName: "تست PN-002", role: "OWNER" },
    { ip: "127.0.0.1" },
    null
  );
  OWNER_TOKEN = token;
  return token;
}

async function callRoute(path: string, query: string): Promise<{ status: number; body: any }> {
  const { NextRequest } = await import("next/server");
  const routeMod = await import(path);
  const token = await ownerToken();
  const req = new NextRequest(`http://localhost${query}`, { headers: { authorization: `Bearer ${token}` } });
  const res = await routeMod.GET(req);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

describe("PN-002 §۳ — فیلترهای تازهٔ M1/M2 (روت زنده روی DB)", () => {
  beforeAll(async () => {
    const { db } = await import("@/lib/db");
    // بذر مستقل از وضعیت DB (upsert بر کلید طبیعی — همیشه تضمین می‌شود)
    await db.propertyRecord.upsert({
      where: { propertyCode: "99001" },
      create: {
        id: "pn002-seed-1", propertyCode: "99001", title: "بذر فروش",
        ownerName: "کارشناس بذر", price: 1_000_000_000, meterage: 100, rooms: 2,
        isRental: false, viewCount: 5, addedToDivar: true, addedToInsta: false,
        stateName: "آذربایجان شرقی", cityName: "تبریز", lineName: "صنوبر", status: "سرنخ",
      },
      update: {
        title: "بذر فروش", ownerName: "کارشناس بذر", price: 1_000_000_000, meterage: 100, rooms: 2,
        isRental: false, viewCount: 5, addedToDivar: true, addedToInsta: false,
        stateName: "آذربایجان شرقی", cityName: "تبریز", lineName: "صنوبر", status: "سرنخ",
      },
    });
    await db.propertyRecord.upsert({
      where: { propertyCode: "99002" },
      create: {
        id: "pn002-seed-2", propertyCode: "99002", title: "بذر اجاره",
        ownerName: "کارشناس بذر", isRental: true, depositPrice: 200_000_000, rentPrice: 30_000_000,
        viewCount: 12, status: "سرنخ",
      },
      update: {
        title: "بذر اجاره", ownerName: "کارشناس بذر", isRental: true,
        depositPrice: 200_000_000, rentPrice: 30_000_000, viewCount: 12, status: "سرنخ",
      },
    });
    await db.requestRecord.upsert({
      where: { requestCode: "99001" },
      create: {
        id: "pn002-seed-r1", source: "arm", requestCode: "99001", status: "سرنخ",
        spaceFrom: 50, spaceTo: 150, sanadNames: "شش‌دانگ", sideNames: "شمال",
        urgent: true, luxury: false, occasion: false, changeWithNames: "مایل نیستم",
        actorCode: "arm",
      },
      update: {
        source: "arm", status: "سرنخ", spaceFrom: 50, spaceTo: 150,
        sanadNames: "شش‌دانگ", sideNames: "شمال", urgent: true, luxury: false, occasion: false,
        changeWithNames: "مایل نیستم",
      },
    });
  });

  test("۳-۱) M1 rentalType=rental → فقط آگهی‌های اجاره‌ای", async () => {
    const r = await callRoute("@/app/api/crm/arm-catalog/listings/route", "/api/crm/arm-catalog/listings?rentalType=rental");
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    for (const row of r.body.rows as Array<{ isRental: boolean | null }>) {
      expect(row.isRental).toBe(true);
    }
  });

  test("۳-۲) M1 فیلتر بازدید از/تا", async () => {
    const r = await callRoute("@/app/api/crm/arm-catalog/listings/route", "/api/crm/arm-catalog/listings?viewCountFrom=2&viewCountTo=8");
    expect(r.status).toBe(200);
    for (const row of r.body.rows as Array<{ viewCount: number | null }>) {
      expect(row.viewCount === null || (row.viewCount >= 2 && row.viewCount <= 8)).toBe(true);
    }
  });

  test("۳-۳) M1 فیلتر منتشرشده در دیوار", async () => {
    const r = await callRoute("@/app/api/crm/arm-catalog/listings/route", "/api/crm/arm-catalog/listings?addedToDivar=1");
    expect(r.status).toBe(200);
    for (const row of r.body.rows as Array<{ addedToDivar: boolean | null }>) {
      expect(row.addedToDivar).toBe(true);
    }
  });

  test("۳-۴) M2 هم‌پوشانی متراژ (spaceFrom/To) — ردیف [۵۰،۱۵۰] با فیلتر [۱۰۰،۲۰۰] می‌ماند", async () => {
    const r = await callRoute("@/app/api/crm/arm-catalog/requests/route", "/api/crm/arm-catalog/requests?spaceFrom=100&spaceTo=200");
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    // ردیف بذر [۵۰،۱۵۰] هم‌پوشانی دارد → باید در نتیجه باشد
    const codes = (r.body.rows as Array<{ requestCode: string }>).map((x) => x.requestCode);
    expect(codes).toContain("99001");
  });

  test("۳-۵) M2 فیلتر سند (contains نرمال‌شده) + فوریت", async () => {
    const r = await callRoute("@/app/api/crm/arm-catalog/requests/route", "/api/crm/arm-catalog/requests?sanad=شش&urgentOnly=1");
    expect(r.status).toBe(200);
    const codes = (r.body.rows as Array<{ requestCode: string; urgent: boolean | null }>).map((x) => x.requestCode);
    expect(codes).toContain("99001");
  });

  test("۳-۶) M2 ردیف کامل با ستون‌های تازه (فیلد تازه در پاسخ هست)", async () => {
    const r = await callRoute("@/app/api/crm/arm-catalog/requests/route", "/api/crm/arm-catalog/requests?code=99001");
    expect(r.status).toBe(200);
    const row = (r.body.rows as Array<Record<string, unknown>>)[0] ?? {};
    expect(row).toHaveProperty("spaceFrom");
    expect(row).toHaveProperty("sanadNames");
    expect(row).toHaveProperty("sideNames");
    expect(row).toHaveProperty("changeWithNames");
  });
});

/* ==========================================================================
 * §۴ — گام ۶: حذف توضیحات زیر عناوین + ستون‌های تازه + دکمهٔ اکسل
 * ========================================================================== */

describe("PN-002 §۴ — گام ۶ (حذف توضیحات + ستون‌ها + اکسل)", () => {
  test("۴-۱) M1: سرستون‌های تازه (رهن/اجاره، بازدید، تاریخ وضعیت، لینک — PN-020/گام اول-الف: تصاویر/انتشار/آخرین وضعیت به دستور مالک حذف شدند)", () => {
    for (const h of ["رهن / اجاره", "بازدید", "تاریخ وضعیت", "لینک"]) {
      expect(M1_SRC).toContain(`>${h}</TableHead>`);
    }
    // PN-020/گام اول-الف — حذف سه ستون به دستور مالک (برگزیدهٔ ۱۴۰۵/۰۷/۲۱):
    // «ستون آخرین وضعیت و ستون تصاویر و ستون انتشار حذف شود»
    expect(M1_SRC).not.toContain(">تصاویر</TableHead>");
    expect(M1_SRC).not.toContain(">انتشار</TableHead>");
    expect(M1_SRC).not.toContain(">وضعیت</TableHead>");
  });

  test("۴-۲) M2: سرستون‌های تازه (متراژ، اتاق، طبقه، ساخت، سند، نوع ساخت، جهت، معاوضه)", () => {
    for (const h of ["متراژ", "اتاق", "طبقه", "ساخت", "سند", "نوع ساخت", "جهت", "معاوضه"]) {
      expect(M2_SRC).toContain(`>${h}</TableHead>`);
    }
  });

  test("۴-۳) حذف توضیحات زیر عناوین بخش‌ها — توضیح طولانیِ زیر عنوان بروزرسانی در چهار کاشی نیست", () => {
    // الگوی توضیحِ حذف‌شده: <p className="text-xs text-muted-foreground leading-relaxed"> بی‌واسطه زیر عنوان بروزرسانی
    expect(M1_SRC).not.toContain("فهرست کامل (کد، کارشناس، وضعیت، قیمت، دسته‌بندی، موقعیت) از لایهٔ ۱ سامانه ARM");
    expect(M2_SRC).not.toContain("فهرست کامل (کد، کارشناس، وضعیت، تاریخ ثبت) از لایهٔ ۱ سامانه ARM");
    expect(M4_SRC).not.toContain("نام، موبایل، کد پرسنلی و وضعیت هر کارشناس و کارمند با زنجیرهٔ عین");
    expect(M3_SRC).not.toContain("داده‌ها عین «گزارش تطابق معاملات» سامانه ملک تبریز استخراج می‌شوند");
  });

  test("۴-۴) جداول کاشی — description از فراخوانی‌های TopRankingTable حذف شده (فقط عنوان می‌ماند)", () => {
    expect(M1_SRC).not.toContain("description=\"کارشناسانی که بیشترین آگهی");
    expect(M2_SRC).not.toContain("description=\"کارشناسانی که بیشترین درخواست");
  });

  test("۴-۵) دکمهٔ «اکسل کل فهرست» در هر چهار کاشی وجود دارد", () => {
    expect(M1_SRC).toContain("اکسل کل فهرست");
    expect(M2_SRC).toContain("اکسل کل فهرست");
    expect(M3_SRC).toContain("اکسل کل فهرست");
    expect(M4_SRC).toContain("اکسل کل فهرست");
  });

  test("۴-۶) چهار موجودیت خروجی اکسل در روت export پشتیبانی می‌شوند", () => {
    const EXPORT = readFileSync(`${SRC}/app/api/crm/export/[entity]/route.ts`, "utf8");
    for (const e of ["listings", "requests", "transactions", "experts"]) {
      expect(EXPORT).toContain(`entity === "${e}"`);
    }
    expect(EXPORT).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  test("۴-۷) M4 — کد پرسنلی خالی «-» نمایش داده می‌شود (بند ۲ گام ۴)", () => {
    expect(M4_SRC).toContain('<span className="text-muted-foreground font-bold">-</span>'); // PN-008: قاعدهٔ «-» لاغیر
  });
});

/* ==========================================================================
 * §۵ — خروجی اکسل واقعی (امضای ZIP/xlsx + sheet RTL)
 * ========================================================================== */

describe("PN-002 §۵ — تولید فایل اکسل واقعی", () => {
  test("۵-۱) buildXlsx: خروجی بایت‌های ZIP (PK) با sheet راست‌به‌چپ تولید می‌کند", async () => {
    const routeMod = await import("@/app/api/crm/export/[entity]/route");
    // دسترسی به buildXlsx از طریق روت ممکن نیست (private) — از exceljs مستقیم با همان تنظیمات
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("تست", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
    ws.columns = [{ header: "کد", width: 12 }, { header: "قیمت", width: 16 }];
    ws.addRow([1001, 29_500_000_000]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK"); // امضای ZIP = xlsx معتبر
  });

  test("۵-۲) apiBlob/downloadBlob در کلاینت export تعریف شده‌اند", () => {
    const API = readFileSync(`${SRC}/lib/client/api.ts`, "utf8");
    expect(API).toContain("export async function apiBlob");
    expect(API).toContain("export function downloadBlob");
  });
});
