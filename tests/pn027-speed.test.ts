/**
 * تست‌های رگرسیون PN-027 · ۵-پ — بهینه‌سازی سرعت با حفظ هم‌ارزی رفتاری
 * ------------------------------------------------------------------------
 * قانون جلسهٔ ۰۳۴: هر بهینه‌سازی باید نتیجهٔ فیلترها را عیناً حفظ کند.
 * ستون‌های سایهٔ نرمال (search-norm) + فیلتر SQL باید همان نتیجهٔ JS قدیم بدهد:
 *   · نام مشتری با ارقام فارسی/عربی/لاتین یکسان تطبیق می‌یابد
 *   · جست‌وجوی موبایل در کادر «نام مشتری» کار می‌کند (نام+موبایل با ␟)
 *   · سند با نیم‌فاصله و بدون نیم‌فاصله یکسان است
 *   · M1: مالک (نام یا موبایل) · آدرس (متن/محله/خط) · کارشناس
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHash } from "crypto";
import { readFileSync } from "node:fs";

const { db } = await import("@/lib/db");
const { requestNormColumns, propertyNormColumns, SEARCH_FIELD_SEP } = await import("@/lib/search-norm");
const { toArmRequestData } = await import("@/core/repositories/prisma/request.repository");

const P = "PN027-SPD-";
const created: string[] = [];

beforeAll(async () => {
  // بستر: ردیف‌های کنترل‌شده با نیم‌فاصله/ارقام/حروف مرزی
  const rows = [
    {
      id: `${P}r1`, requestCode: `${P}9001`, source: "arm", actorCode: "pn027-t1",
      customerName: `${P}سیما اژدرزاده`, customerMobile: "09141003439",
      actorName: `${P}محمدرضا قلیپور`, sanadNames: "شش‌دانگ، قراردادی", status: "ready",
    },
    {
      id: `${P}r2`, requestCode: `${P}9002`, source: "arm", actorCode: "pn027-t2",
      customerName: `${P}يوسف احمدپور`, customerMobile: "09308834242", // ي عربی
      actorName: `${P}مهرداد مرادی`, sanadNames: "قولنامه", status: "ready",
    },
    {
      id: `${P}r3`, requestCode: `${P}9003`, source: "arm", actorCode: "pn027-t3",
      customerName: null, rawCustomerName: `${P}ساقی`, customerMobile: null,
      actorName: null, sanadNames: null, status: "ready",
    },
  ];
  for (const r of rows) {
    await db.requestRecord.upsert({
      where: { id: r.id },
      create: { ...(r as unknown as object), createdAt: new Date(), ...requestNormColumns(r) } as never,
      update: { ...(r as unknown as object), ...requestNormColumns(r) } as never,
    });
    created.push(r.id);
  }
  const p1 = {
    id: `${P}p1`, propertyCode: `${P}7001`, ownerName: `${P}ناصر رحیمی فر`,
    rawOwnerName: `${P}حسین زاده`, ownerMobile: "09149971537",
    address: `${P}تبریز، میرداماد، دانش`, areaName: `${P}میرداماد`, lineName: `${P}دانش`,
  };
  await db.propertyRecord.upsert({
    where: { propertyCode: `${P}7001` },
    create: { ...(p1 as unknown as object), createdAt: new Date(), ...propertyNormColumns(p1) } as never,
    update: { ...(propertyNormColumns(p1) as unknown as object) } as never,
  });
  created.push(`${P}p1`);
});

afterAll(async () => {
  await db.requestRecord.deleteMany({ where: { id: { startsWith: P } } });
  await db.propertyRecord.deleteMany({ where: { id: { startsWith: P } } });
  await db.$disconnect();
});

describe("PN-027 · ۵-پ-۱ — ستون‌های نرمال M2 (هم‌ارزی JS قدیم)", () => {
  test("نرمال‌سازی: نیم‌فاصله→فاصله + ي→ی + ارقام فارسی→لاتین", async () => {
    const n = requestNormColumns({ customerName: "شش‌دانگ يوسف ۱۲", customerMobile: "۰۹۱۴", sanadNames: "قولنامه", actorName: "كاظم" });
    expect(n.customerNameNorm).toBe(`شش دانگ یوسف 12${SEARCH_FIELD_SEP}0914`);
    expect(n.sanadNamesNorm).toBe("قولنامه");
    expect(n.actorNameNorm).toBe("کاظم");
  });

  test("جست‌وجوی نام مشتری — فیلتر SQL روی ستون نرمال", async () => {
    const rows = await db.requestRecord.findMany({
      where: { source: "arm", id: { startsWith: P }, customerNameNorm: { contains: "سیما اژدر" } },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].customerName).toContain("سیما اژدرزاده");
  });

  test("جست‌وجوی موبایل در کادر نام — هم‌ارز (SEP مرز ایمن)", async () => {
    const rows = await db.requestRecord.findMany({
      where: { source: "arm", id: { startsWith: P }, customerNameNorm: { contains: "09141003439" } },
    });
    expect(rows.length).toBe(1);
  });

  test("حرف عربی ي در دادهٔ ذخیره‌شده با فیلتر فارسی ی تطبیق می‌یابد", async () => {
    const rows = await db.requestRecord.findMany({
      where: { source: "arm", id: { startsWith: P }, customerNameNorm: { contains: "یوسف احمدپور" } },
    });
    expect(rows.length).toBe(1); // ي stored → normalized to ی in column
  });

  test("سند با نیم‌فاصله در داده، فیلتر با فاصله — تطبیق", async () => {
    const rows = await db.requestRecord.findMany({
      where: { source: "arm", id: { startsWith: P }, sanadNamesNorm: { contains: "شش دانگ" } },
    });
    expect(rows.length).toBe(1);
  });

  test("ردیف بدون نام/موبایل → ستون نرمال تهی (نه رشتهٔ خالی SEP)", async () => {
    const r3 = await db.requestRecord.findUnique({ where: { id: `${P}r3` } });
    expect(r3?.customerNameNorm).not.toBeNull(); // rawCustomerName دارد
    expect(r3?.sanadNamesNorm).toBeNull();
    expect(r3?.actorNameNorm).toBeNull();
  });

  test("مپر نوشتن toArmRequestData ستون‌های نرمال را می‌نویسد (مسیر sync)", async () => {
    const data = toArmRequestData({
      id: `${P}mapper-test`, requestCode: `${P}9009`, customerName: "تست مپر", customerMobile: "09120000000",
      actorName: "کارشناس تست", sanadNames: "شش‌دانگ",
    } as never);
    expect(data.customerNameNorm).toBe(`تست مپر${SEARCH_FIELD_SEP}09120000000`);
    expect(data.sanadNamesNorm).toBe("شش دانگ");
    expect(data.actorNameNorm).toBe("کارشناس تست");
  });
});

describe("PN-027 · ۵-پ-۲ — ستون‌های نرمال M1 (هم‌ارزی JS قدیم)", () => {
  test("ترکیب مالک: نام خام + موبایل · آدرس: آدرس+محله+خط", async () => {
    const n = propertyNormColumns({ ownerName: "کارشناس", rawOwnerName: "حسین", ownerMobile: "09149971537", address: "تبریز", areaName: "میرداماد", lineName: "دانش" });
    expect(n.realtorNameNorm).toBe("کارشناس");
    expect(n.ownerSearchNorm).toBe(`حسین${SEARCH_FIELD_SEP}09149971537`);
    expect(n.addressSearchNorm).toBe(`تبریز${SEARCH_FIELD_SEP}میرداماد${SEARCH_FIELD_SEP}دانش`);
  });

  test("فیلتر «مالک» با موبایل → ردیف M1", async () => {
    const rows = await db.propertyRecord.findMany({
      where: { id: { startsWith: P }, ownerSearchNorm: { contains: "09149971537" } },
    });
    expect(rows.length).toBe(1);
  });

  test("فیلتر «آدرس» با نام خط → همان ردیف (هم‌ارز منطق سه‌تایی قدیم)", async () => {
    const byLine = await db.propertyRecord.findMany({ where: { id: { startsWith: P }, addressSearchNorm: { contains: "دانش" } } });
    const byArea = await db.propertyRecord.findMany({ where: { id: { startsWith: P }, addressSearchNorm: { contains: "میرداماد" } } });
    expect(byLine.length).toBe(1);
    expect(byArea.length).toBe(1);
    expect(byLine[0].id).toBe(byArea[0].id);
  });

  test("فیلتر «کارشناس» (ownerName) روی realtorNameNorm", async () => {
    const rows = await db.propertyRecord.findMany({ where: { id: { startsWith: P }, realtorNameNorm: { contains: "رحیمی فر" } } });
    expect(rows.length).toBe(1);
  });
});

describe("PN-027 · ۵-پ-۸ — سقف RAM بیلد مستند در کد", () => {
  test("سقف ۳۰۰۰MB در build script تنظیم شده", () => {
    const pkg = readFileSync("/home/z/my-project/package.json", "utf8");
    expect(pkg).toContain("--max-old-space-size=3000");
  });
});

/* ==========================================================================
 * PN-027 · ۵-پ-۳/۴ — کش شاخص بازار (TTL ۳۰د) + پرچم enrich (پیش‌فرض خاموش)
 * ========================================================================== */

describe("PN-027 · ۵-پ-۳ — کش TTL شاخص بازار", () => {
  test("invalidateMarketIndexCache قابل فراخوانی است و کش پس از محاسبه پر می‌شود", async () => {
    const mi = await import("@/lib/services/market-index");
    expect(typeof mi.invalidateMarketIndexCache).toBe("function");
    mi.invalidateMarketIndexCache();
    const t0 = performance.now();
    const r1 = await mi.getMarketIndex(); // سرد — محاسبهٔ کامل
    const coldMs = performance.now() - t0;
    const t1 = performance.now();
    const r2 = await mi.getMarketIndex(); // گرم — از کش
    const warmMs = performance.now() - t1;
    expect(r2.generatedAt).toBe(r1.generatedAt); // همان لحظهٔ محاسبه — شکل پاسخ عیناً حفظ
    expect(warmMs).toBeLessThan(coldMs); // گرم سریع‌تر است
    expect(warmMs).toBeLessThan(50); // هدف قرارداد: پاسخ گرم < ۵۰ms
  });
});

describe("PN-027 · ۵-پ-۴ — پرچم enrich=1 صریح (پیش‌فرض خاموش)", () => {
  test("سورس روت: پیش‌فرض بدون enrichment — فقط enrich=1 مسیر شبکه را باز می‌کند", async () => {
    const src = readFileSync("/home/z/my-project/src/app/api/crm/arm-catalog/listings/route.ts", "utf8");
    expect(src).toContain('sp.get("enrich") === "1"');
    expect(src).toContain("ENRICH_CACHE_TTL_MS = 5 * 60 * 1000"); // کش ۵ دقیقه‌ای
    // جست‌وجوی کد دیگر خودکار غنی‌سازی نمی‌کند (enrichExplicit در شرط)
    expect(src).toMatch(/enrichExplicit && code && guard\.armTokens/);
  });
});
