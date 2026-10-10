/**
 * PN-011 ثانیاً — استخراج مقادیر واقعی ستون‌های رنگی فهرست‌های چهارگانه از DB
 * خروجی JSON برای طراحی نقشهٔ رنگ بدون تکرار درون یک ستون
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const out: Record<string, unknown> = {};

  // M1 — نوع ملک آگهی‌ها
  const listingTypes = await db.propertyRecord.groupBy({
    by: ["propertyTypeName"],
    _count: { _all: true },
    orderBy: { _count: { propertyTypeName: "desc" } },
    take: 40,
  });
  out.m1_propertyType = listingTypes
    .map((r) => ({ value: r.propertyTypeName ?? "(خالی)", count: r._count._all }));

  // M1 — دسته‌بندی و شعبه (برای کنترل عدم تکرار)
  const listingTrades = await db.propertyRecord.groupBy({
    by: ["tradeTypeName"],
    _count: { _all: true },
    orderBy: { _count: { tradeTypeName: "desc" } },
    take: 20,
  });
  out.m1_tradeType = listingTrades.map((r) => ({ value: r.tradeTypeName ?? "(خالی)", count: r._count._all }));

  // M2 — نوع ملک درخواست‌ها
  const requestTypes = await db.requestRecord.groupBy({
    by: ["propertyTypeName"],
    _count: { _all: true },
    orderBy: { _count: { propertyTypeName: "desc" } },
    take: 40,
  });
  out.m2_propertyType = requestTypes.map((r) => ({ value: r.propertyTypeName ?? "(خالی)", count: r._count._all }));

  // M2 — نوع ساختمان
  const buildingTypes = await db.requestRecord.groupBy({
    by: ["buildingTypeName"],
    _count: { _all: true },
    orderBy: { _count: { buildingTypeName: "desc" } },
    take: 40,
  });
  out.m2_buildingType = buildingTypes
    .map((r) => ({ value: r.buildingTypeName ?? "(خالی)", count: r._count._all }))
    .filter((r) => r.value !== "(خالی)");

  // M4 — سمت پرسنلی
  const positions = await db.expertProfile.groupBy({
    by: ["roleTitle"],
    _count: { _all: true },
    orderBy: { _count: { roleTitle: "desc" } },
    take: 20,
  });
  out.m4_position = positions
    .map((r) => ({ value: r.roleTitle ?? "(خالی)", count: r._count._all }))
    .filter((r) => r.value !== "(خالی)");

  // شعبه‌های واقعی M1/M2
  const branches = await db.propertyRecord.groupBy({
    by: ["armBranchTitle"],
    _count: { _all: true },
    orderBy: { _count: { armBranchTitle: "desc" } },
    take: 15,
  });
  out.m1_branch = branches.map((r) => ({ value: r.armBranchTitle ?? "(خالی)", count: r._count._all }));

  // M5 تطبیق — درخواست‌ها: فیلدهای کارشناس/شعبه موجود؟
  const reqSample = await db.requestRecord.findFirst({
    select: {
      requestCode: true,
      actorName: true,
      actorCode: true,
      armBranchTitle: true,
      customerName: true,
    },
  });
  out.m2_request_sample = reqSample;

  const propSample = await db.propertyRecord.findFirst({
    select: {
      propertyCode: true,
      ownerCode: true,
      ownerName: true,
      armBranchTitle: true,
    },
  });
  out.m1_listing_sample = propSample;

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error("FAIL:", e.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
