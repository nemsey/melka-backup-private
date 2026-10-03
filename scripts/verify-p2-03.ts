/**
 * P2-03 — اسکریپت راستی‌آزمایی «قبل/بعد»: کوئری‌های مستقیم روت‌ها در برابر Repository
 * ------------------------------------------------------
 * پیاده‌سازی‌های «قبل» عیناً از کد روت‌ها پیش از مهاجرت (کامیت 80e1229) کپی شده‌اند.
 * هر دو مسیر روی همان پایگاه اجرا و خروجی JSON مقایسه می‌شود —
 * قرارداد API (ردیف‌ها/شمارنده‌ها/خلاصه‌ها) باید بایت‌به‌بایت یکسان بماند.
 *
 * ⚠️ طبق E.3 روی پایگاه ایزوله db/test-repository.db اجرا شود (نه test.db که
 * بستهٔ bun run test از آن استفاده می‌کند و نه custom.db تولید):
 *   DATABASE_URL=file:/home/z/my-project/db/test-repository.db MELK_TOKEN_KEY=test bun scripts/verify-p2-03.ts
 * داده کاشته‌شده در پایان پاک می‌شود (اسکریپت خود-تمیزشونده).
 */

import { db } from "../src/lib/db";
import type { Prisma } from "@prisma/client";
import {
  getTransactionRepository,
  getContractRepository,
  getExpertRepository,
  getVisitRepository,
  getMarketRepository,
  getOutcomeRepository,
  getPredictionRepository,
  getListingRepository,
  getRequestRepository,
  type TransactionListFilter,
} from "../src/core/repositories";

let failures = 0;
function assertEqual(name: string, before: unknown, after: unknown) {
  const b = JSON.stringify(before);
  const a = JSON.stringify(after);
  if (b !== a) {
    failures += 1;
    console.error(`✗ ${name}\n  قبل: ${b?.slice(0, 400)}\n  بعد: ${a?.slice(0, 400)}`);
  } else {
    console.log(`✓ ${name}`);
  }
}

// ===================== ۰) کاشت داده حداقلی (فقط پایگاه تست — E.3) =====================
// تا مسیرهای مثبت (یافتن رکورد واقعی) و شاخه‌های where واقعاً اجرا شوند.

async function seedIfEmpty() {
  const marker = await db.divarAd.count();
  if (marker > 0) return;
  await db.divarAd.create({
    data: {
      token: "verify-p2-03-ad-1", category: "apartment-sell", title: "آپارتمان VERIFY-P2-03",
      description: "تست مقایسه قبل/بعد", price: 2_000_000_000, priceText: "۲ میلیارد",
      pricePerMeter: 25_000_000, meterage: 80, rooms: 2, floor: 3, buildYear: 1398,
      locationText: "الگلو، تبریز", matchedAreaId: "1", matchedAreaName: "منطقه ۱",
      matchedLineId: "10", matchedLineName: "محله ۱",
      personalScore: 82, underpriceScore: 75, locationScore: 88, otherScore: 66, totalScore: 79,
      bucket: "hunt", status: "active", publisherType: "personal",
      imagesJson: "[]", specsJson: "[]",
    },
  });
  await db.listingRecord.create({
    data: {
      id: "verify-p2-03-listing-1", customerName: "کاربر تست", customerMobile: "09140000000",
      areaId: "1", lineId: "10", tradeTypeId: "buy", propertyTypeId: "residential", buildingTypeId: "apartment",
      fileFinding: "دیوار", fileTypeJson: "[\"خرید\"]", changeWithJson: "[\"notChangeable\"]",
      inputsJson: "{\"مساحت\":\"80\"}", imagesJson: "[]",
      actorCode: "900001",
    } as never,
  });
  const req = await db.requestRecord.create({
    data: {
      id: "verify-p2-03-request-1", source: "manual", customerName: "درخواست‌دهنده تست",
      customerMobile: "09150000000", tradeTypeName: "خرید", status: "ready", actorCode: "900001",
      armRequestId: "arm-req-1",
    },
  });
  await db.requestEventRecord.createMany({
    data: [
      { requestId: req.id, eventTypeId: "t1", eventTypeName: "تماس", actorCode: "900001", message: "اول" },
      { requestId: req.id, eventTypeId: "t2", eventTypeName: "بازدید", actorCode: "900001", message: "دوم" },
    ],
  });
  await db.transactionRecord.createMany({
    data: [
      { id: "v203-tx-1", contractDate: new Date("2026-05-10T10:00:00Z"), propertyCode: "P-100", propertyCustomer: "فروشنده تست", requestCode: "R-200", requestCustomer: "خریدار تست", contractHolo: "H-300", suggestedPropertyCount: 2, eventsCount: 1 },
      { id: "v203-tx-2", contractDate: new Date("2026-06-11T10:00:00Z"), propertyCode: "P-101", propertyCustomer: null, requestCode: null, requestCustomer: null, contractHolo: null, suggestedPropertyCount: 0, eventsCount: 3 },
    ],
  });
  await db.expertRecord.create({
    data: {
      id: "v203-ex-1", personnelCode: "990001", fullName: "مشاور تست الف", mobile: "09160000000",
      role: "کارشناس و مشاور فروش", businessTitle: "شعبه تست", creator: "ثبت‌کننده تست", active: true,
      createdAt: new Date("2026-01-01T08:00:00Z"),
    },
  });
  await db.visitRecord.create({
    data: {
      id: "v203-vi-1", propertyCode: "P-100", requesterName: "درخواست‌دهنده تست",
      checkerName: "بررسی‌کننده تست", propertyRealtorName: "مشاور تست الف",
      checkTime: new Date("2026-06-01T09:00:00Z"), status: "بررسی شد", createdAt: new Date("2026-06-01T08:00:00Z"),
    },
  });
  console.log("(کاشت داده تست انجام شد — فقط db/test.db)");
}
await seedIfEmpty();

// ===================== ۱) crm/transactions — عین کد قدیم روت =====================

async function legacyTxList(filter: {
  dateFrom?: string;
  dateTo?: string;
  propertyCode?: string;
  requestCode?: string;
  contractHolo?: string;
  matchKind?: string;
}, sortBy = "contractDate", sortDir: Prisma.SortOrder = "desc", limit = 50, offset = 0) {
  const where: Prisma.TransactionRecordWhereInput = {};
  const { dateFrom, dateTo, propertyCode, requestCode, contractHolo, matchKind } = filter;
  if (dateFrom || dateTo) {
    where.contractDate = {
      ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00`) } : {}),
      ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999`) } : {}),
    };
  }
  if (propertyCode) where.propertyCode = { contains: propertyCode };
  if (requestCode) where.requestCode = { contains: requestCode };
  if (contractHolo) where.contractHolo = { contains: contractHolo };
  const baseAnd: Prisma.TransactionRecordWhereInput[] = Array.isArray(where.AND) ? where.AND : [];
  if (matchKind === "event") {
    where.eventsCount = { gt: 0 };
  } else if (matchKind === "suggested") {
    where.suggestedPropertyCount = { gt: 0 };
  } else if (matchKind === "both") {
    where.AND = [...baseAnd, { eventsCount: { gt: 0 } }, { suggestedPropertyCount: { gt: 0 } }];
  }

  const [rows, total] = await Promise.all([
    db.transactionRecord.findMany({ where, orderBy: { [sortBy]: sortDir }, take: limit, skip: offset }),
    db.transactionRecord.count({ where }),
  ]);
  const bothWhere: Prisma.TransactionRecordWhereInput = {
    ...where,
    AND: [...(Array.isArray(where.AND) ? where.AND : []), { eventsCount: { gt: 0 } }, { suggestedPropertyCount: { gt: 0 } }],
  };
  const [totalCount, hasRequestEvent, hasSuggestedProperty, hasBoth, withHolo, withRequest] = await Promise.all([
    db.transactionRecord.count({ where }),
    db.transactionRecord.count({ where: { ...where, eventsCount: { gt: 0 } } }),
    db.transactionRecord.count({ where: { ...where, suggestedPropertyCount: { gt: 0 } } }),
    db.transactionRecord.count({ where: bothWhere }),
    db.transactionRecord.count({ where: { ...where, contractHolo: { not: null } } }),
    db.transactionRecord.count({ where: { ...where, requestCode: { not: null } } }),
  ]);
  return { rows, total, summary: { totalCount, hasRequestEvent, hasSuggestedProperty, hasBoth, withHolo, withRequest } };
}

async function compareTx(name: string, filter: TransactionListFilter, sortBy?: "contractDate" | "eventsCount" | "suggestedPropertyCount", sortDir?: "asc" | "desc") {
  assertEqual(
    `crm/transactions — ${name}`,
    await legacyTxList(filter, sortBy, sortDir),
    await getTransactionRepository().listWithSummary({ filter, sortBy, sortDir })
  );
}

await compareTx("بدون فیلتر", {});
await compareTx("بازه تاریخ", { dateFrom: "2025-01-01", dateTo: "2026-12-31" });
await compareTx("جستجوی کد ملک", { propertyCode: "1" });
await compareTx("matchKind=event", { matchKind: "event" });
await compareTx("matchKind=suggested", { matchKind: "suggested" });
await compareTx("matchKind=both", { matchKind: "both" });
await compareTx("ترتیب eventsCount صعودی", {}, "eventsCount", "asc");

// ===================== ۲) crm/experts — عین کد قدیم روت =====================

async function legacyExperts(filter: { fullName?: string; mobile?: string; personnelCode?: string; role?: string; businessTitle?: string; creator?: string; active?: boolean }, sortDir: "asc" | "desc" = "asc", limit = 50, offset = 0) {
  const where: Prisma.ExpertRecordWhereInput = {};
  if (filter.fullName) where.fullName = { contains: filter.fullName };
  if (filter.mobile) where.mobile = { contains: filter.mobile };
  if (filter.personnelCode) where.personnelCode = { contains: filter.personnelCode };
  if (filter.role) where.role = { contains: filter.role };
  if (filter.businessTitle) where.businessTitle = { contains: filter.businessTitle };
  if (filter.creator) where.creator = { contains: filter.creator };
  if (filter.active !== undefined) where.active = filter.active;

  const [rows, total] = await Promise.all([
    db.expertRecord.findMany({ where, orderBy: { fullName: sortDir }, take: limit, skip: offset }),
    db.expertRecord.count({ where }),
  ]);
  const names = rows.map((r) => r.fullName);
  const [reqGrouped, propGrouped] = await Promise.all([
    db.interactionRecord.groupBy({ by: ["requestRealtorName"], where: { requestRealtorName: { in: names } }, _sum: { count: true } }),
    db.interactionRecord.groupBy({ by: ["propertyRealtorName"], where: { propertyRealtorName: { in: names } }, _sum: { count: true } }),
  ]);
  const reqMap = new Map(reqGrouped.map((g) => [g.requestRealtorName, g._sum.count ?? 0]));
  const propMap = new Map(propGrouped.map((g) => [g.propertyRealtorName, g._sum.count ?? 0]));
  const enriched = rows.map((r) => ({ ...r, interactionTotal: (reqMap.get(r.fullName) ?? 0) + (propMap.get(r.fullName) ?? 0) }));
  return { rows: enriched, total };
}

assertEqual("crm/experts — بدون فیلتر", await legacyExperts({}), await getExpertRepository().listWithInteractions({ filter: {} }));
assertEqual("crm/experts — جستجوی نام", await legacyExperts({ fullName: "ا" }), await getExpertRepository().listWithInteractions({ filter: { fullName: "ا" } }));
assertEqual("crm/experts — فقط فعال + نزولی", await legacyExperts({ active: true }, "desc"), await getExpertRepository().listWithInteractions({ filter: { active: true }, sortDir: "desc" }));

// ===================== ۳) crm/visits — عین کد قدیم روت =====================

async function legacyVisits(filter: { propertyCode?: string; requester?: string; checker?: string; status?: string; dateFrom?: string; dateTo?: string }, limit = 200, offset = 0) {
  const where: Prisma.VisitRecordWhereInput = {};
  if (filter.propertyCode) where.propertyCode = { contains: filter.propertyCode };
  if (filter.requester) where.requesterName = { contains: filter.requester };
  if (filter.checker) where.checkerName = { contains: filter.checker };
  if (filter.status) where.status = { contains: filter.status };
  if (filter.dateFrom || filter.dateTo) {
    where.createdAt = {
      ...(filter.dateFrom ? { gte: new Date(`${filter.dateFrom}T00:00:00`) } : {}),
      ...(filter.dateTo ? { lte: new Date(`${filter.dateTo}T23:59:59.999`) } : {}),
    };
  }
  const [rows, total] = await Promise.all([
    db.visitRecord.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
    db.visitRecord.count({ where }),
  ]);
  const [checkedCount, distinctCodes, distinctRequesters] = await Promise.all([
    db.visitRecord.count({ where: { ...where, checkTime: { not: null } } }),
    db.visitRecord.findMany({ where, select: { propertyCode: true } }).then((rs) => new Set(rs.map((r) => r.propertyCode)).size),
    db.visitRecord.findMany({ where, select: { requesterName: true } }).then((rs) => new Set(rs.map((r) => r.requesterName)).size),
  ]);
  return { rows, total, summary: { totalCount: total, checkedCount, distinctPropertyCodes: distinctCodes, distinctRequesters } };
}

assertEqual("crm/visits — بدون فیلتر", await legacyVisits({}), await getVisitRepository().listWithSummary({}, 200, 0));
assertEqual("crm/visits — وضعیت + بازه", await legacyVisits({ status: "بررسی", dateFrom: "2024-01-01" }), await getVisitRepository().listWithSummary({ status: "بررسی", dateFrom: "2024-01-01" }, 200, 0));

// ===================== ۴) crm/contracts + crm/supply-demand + crm/interactions + crm/meta =====================

assertEqual(
  "crm/contracts — جدیدترین ثبت اول",
  await db.contractRecord.findMany({ orderBy: { createdAt: "desc" } }),
  await getContractRepository().findAllOrderByCreatedAtDesc()
);

assertEqual(
  "crm/supply-demand — مرتب بر اساس تعداد آگهی",
  await db.supplyDemandRecord.findMany({ orderBy: { propertyCount: "desc" } }),
  await getMarketRepository().listSupplyDemandOrderByPropertyCountDesc()
);

async function legacyInteractions(realtor?: string) {
  let where: Prisma.InteractionRecordWhereInput = {};
  if (realtor) {
    where = { OR: [{ requestRealtorName: { contains: realtor } }, { propertyRealtorName: { contains: realtor } }] };
  }
  const [rows, total] = await Promise.all([
    db.interactionRecord.findMany({ where, orderBy: { count: "desc" }, take: 1000 }),
    db.interactionRecord.count({ where }),
  ]);
  return { rows, total };
}
assertEqual("crm/interactions — بدون فیلتر", await legacyInteractions(), await getExpertRepository().listInteractions({}));
assertEqual("crm/interactions — فیلتر مشاور", await legacyInteractions("ا"), await getExpertRepository().listInteractions({ realtor: "ا" }));

async function legacyMeta() {
  const [roles, businesses, creators] = await Promise.all([
    db.expertRecord.findMany({ distinct: ["role"], select: { role: true } }),
    db.expertRecord.findMany({ distinct: ["businessTitle"], select: { businessTitle: true } }),
    db.expertRecord.findMany({ distinct: ["creator"], select: { creator: true } }),
  ]);
  return {
    roles: roles.map((r) => r.role).filter(Boolean).sort((a, b) => a.localeCompare(b, "fa")),
    businesses: businesses.map((b) => b.businessTitle).filter(Boolean).sort((a, b) => a.localeCompare(b, "fa")),
    creators: creators.map((c) => c.creator).filter((c): c is string => Boolean(c)).sort((a, b) => a.localeCompare(b, "fa")),
  };
}
async function newMeta() {
  const { roles, businesses, creators } = await getExpertRepository().distinctFilterFields();
  return {
    roles: [...roles].filter(Boolean).sort((a, b) => a.localeCompare(b, "fa")),
    businesses: [...businesses].filter(Boolean).sort((a, b) => a.localeCompare(b, "fa")),
    creators: [...creators].filter((c): c is string => Boolean(c)).sort((a, b) => a.localeCompare(b, "fa")),
  };
}
assertEqual("crm/meta — مقادیر یکتای فیلترها", await legacyMeta(), await newMeta());

// ===================== ۵) crm/lookup — GET تاریخچه =====================

async function legacyLookupHistory(kind?: string) {
  const where = kind ? { kind } : {};
  const [rows, total] = await Promise.all([
    db.lookupLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
    db.lookupLog.count({ where }),
  ]);
  return { rows, total };
}
assertEqual("crm/lookup — تاریخچه بدون نوع", await legacyLookupHistory(), {
  rows: await getOutcomeRepository().listRecentLookups(50),
  total: await getOutcomeRepository().countLookups(),
});
assertEqual("crm/lookup — تاریخچه PROPERTY", await legacyLookupHistory("PROPERTY"), {
  rows: await getOutcomeRepository().listRecentLookups(50, "PROPERTY"),
  total: await getOutcomeRepository().countLookups("PROPERTY"),
});

// ===================== ۶) crm/price-index — نمونه‌ها + تاریخچه =====================

async function legacyPriceSamples(category?: string) {
  return db.divarAd.findMany({
    where: {
      status: { in: ["active", "registered"] },
      pricePerMeter: { gt: 0 },
      ...(category ? { category } : {}),
    },
    select: {
      token: true, title: true, category: true, pricePerMeter: true,
      matchedLineName: true, matchedAreaName: true, totalScore: true, publisherType: true,
    },
  });
}
assertEqual("crm/price-index — نمونه‌های قیمت (همه)", await legacyPriceSamples(), await getMarketRepository().listPriceSamples());
assertEqual("crm/price-index — نمونه‌های قیمت (دسته)", await legacyPriceSamples("apartment-sell"), await getMarketRepository().listPriceSamples("apartment-sell"));

assertEqual(
  "crm/price-index — تاریخچه اخیر ۴۰۰",
  await db.priceIndexHistory.findMany({ orderBy: { recordedAt: "desc" }, take: 400 }),
  await getPredictionRepository().listRecentHistory(400)
);
assertEqual(
  "crm/price-index — تاریخچه از امروز",
  await db.priceIndexHistory.findMany({ where: { recordedAt: { gte: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`) } } }),
  await getPredictionRepository().listHistorySince(new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`))
);

// ===================== ۷) divar/ads — پنجره فایل‌یابی + شمارنده دسته‌ها =====================

async function legacyAdWindow(bucket: string, category: string | null, lineId: string | null, allowedLineIds: string[] | null, limit: number, offset: number) {
  const whereBase: Record<string, unknown> = { status: "active" };
  if (allowedLineIds) whereBase.matchedLineId = { in: allowedLineIds };
  const where: Record<string, unknown> = { ...whereBase };
  if (bucket !== "all") where.bucket = bucket;
  if (category) where.category = category;
  if (lineId) where.matchedLineId = lineId;

  const [rows, counts] = await Promise.all([
    db.divarAd.findMany({
      where,
      orderBy: { totalScore: "desc" },
      take: limit,
      skip: offset,
      select: {
        token: true, category: true, title: true, price: true, priceText: true, pricePerMeter: true,
        meterage: true, rooms: true, floor: true, buildYear: true, publishedAt: true, bumpedAt: true,
        locationText: true, matchedAreaName: true, matchedLineName: true,
        personalScore: true, underpriceScore: true, otherScore: true, locationScore: true, totalScore: true, bucket: true,
        publisherType: true, publisherName: true,
        imagesJson: true,
      },
    }),
    db.divarAd.groupBy({ by: ["bucket"], where: whereBase, _count: { _all: true } }),
  ]);
  const bucketCounts = { hunt: 0, follow: 0, review: 0 };
  for (const g of counts) {
    if (g.bucket in bucketCounts) bucketCounts[g.bucket as keyof typeof bucketCounts] = g._count._all;
  }
  return { rows, bucketCounts };
}

assertEqual("divar/ads — همه دسته‌ها", await legacyAdWindow("all", null, null, null, 60, 0), await getMarketRepository().listAdsWithBucketCounts({ filter: { bucket: "all" }, limit: 60, offset: 0 }));
assertEqual("divar/ads — شکار", await legacyAdWindow("hunt", null, null, null, 60, 0), await getMarketRepository().listAdsWithBucketCounts({ filter: { bucket: "hunt" }, limit: 60, offset: 0 }));

// ===================== ۸) divar/ads/[token] + divar/scan + listings/[id] + requests/[id] =====================

const anyAd = await db.divarAd.findFirst();
if (anyAd) {
  assertEqual("divar/ads/[token] — یافتن با توکن", await db.divarAd.findUnique({ where: { token: anyAd.token } }), await getMarketRepository().findAdByToken(anyAd.token));
}
assertEqual("divar/ads/[token] — توکن ناموجود", await db.divarAd.findUnique({ where: { token: "__no_such_token__" } }), await getMarketRepository().findAdByToken("__no_such_token__"));

assertEqual(
  "divar/scan — ۱۰ گزارش اخیر",
  await db.divarScanLog.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
  await getMarketRepository().listRecentScanLogs(10)
);

const anyListing = await db.listingRecord.findFirst();
if (anyListing) {
  assertEqual("listings/[id] — یافتن با شناسه", await db.listingRecord.findUnique({ where: { id: anyListing.id } }), await getListingRepository().findById(anyListing.id));
}
assertEqual("listings/[id] — شناسه ناموجود", await db.listingRecord.findUnique({ where: { id: "__no_such_id__" } }), await getListingRepository().findById("__no_such_id__"));

const anyRequest = await db.requestRecord.findFirst();
if (anyRequest) {
  assertEqual("requests/[id] — یافتن با شناسه", await db.requestRecord.findUnique({ where: { id: anyRequest.id } }), await getRequestRepository().findById(anyRequest.id));
  assertEqual(
    "requests/[id]/events — شامل رویدادهای نزولی",
    await db.requestRecord.findUnique({ where: { id: anyRequest.id }, include: { events: { orderBy: { createdAt: "desc" } } } }),
    await getRequestRepository().findByIdWithEventsDesc(anyRequest.id)
  );
}
assertEqual("requests/[id] — شناسه ناموجود", await db.requestRecord.findUnique({ where: { id: "__no_such_id__" } }), await getRequestRepository().findById("__no_such_id__"));

// ===================== نتیجه =====================

// پاک‌سازی داده کاشته‌شده (خود-تمیزشونده — E.3)
await db.divarAd.deleteMany({ where: { token: "verify-p2-03-ad-1" } }).catch(() => undefined);
await db.listingRecord.deleteMany({ where: { id: "verify-p2-03-listing-1" } }).catch(() => undefined);
await db.requestRecord.deleteMany({ where: { id: "verify-p2-03-request-1" } }).catch(() => undefined);
await db.transactionRecord.deleteMany({ where: { id: { in: ["v203-tx-1", "v203-tx-2"] } } }).catch(() => undefined);
await db.expertRecord.deleteMany({ where: { id: "v203-ex-1" } }).catch(() => undefined);
await db.visitRecord.deleteMany({ where: { id: "v203-vi-1" } }).catch(() => undefined);

await db.$disconnect();
if (failures > 0) {
  console.error(`\n${failures} مورد نابرابر است!`);
  process.exit(1);
} else {
  console.log("\nهمه مقایسه‌های قبل/بعد P2-03 یکسان‌اند ✓ (داده کاشت پاک شد)");
}
