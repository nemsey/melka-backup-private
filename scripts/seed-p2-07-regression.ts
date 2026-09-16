/**
 * P2-07 — کاشت قطعی داده رگرسیون (۱۰۰۰ نمونه) برای پایگاه ایزوله
 * ------------------------------------------------------
 * استفاده: DATABASE_URL=file:…test-repository.db bun scripts/seed-p2-07-regression.ts
 *
 * ویژگی‌ها:
 *  • قطعی (deterministic): PRNG با seed ثابت — هر اجرا همان داده
 *  • کامل: همه خانواده‌های داده‌ای که ایجنت‌ها می‌خوانند
 *    (معاملات ۱۰۰۰، کارشناس ۲۰۰، تعامل ۵۰۰، بازدید ۳۰۰، عرضه/تقاضا ۳۰،
 *     قرارداد ۱۲۰، آگهی دیوار ۵۰، اسکن ۱۰، رد ۲۰، بازخورد/حافظه ایجنت)
 *  • تاریخ‌ها قدیمی و ثابت (بدون مرز ۶ ساعت دیوار → freshAds=0 همیشه)
 *  • idempotent: ابتدا پاک‌سازی رکوردهای با پیشوند p207-
 */

import { db } from "../src/lib/db";

// ---------- PRNG قطعی (mulberry32) ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260916);
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));

const AREAS = ["لیل", "جنت‌آباد", "شهرک ولیعصر", "ائل‌گلی", "زعفرانیه", "باغمیشه", "کوی بارنج", "سعیدآباد"];
const FIRST = ["علی", "محمد", "حسن", "رضا", "امیر", "سعید", "مهدی", "بابک", "کامران", "آرش"];
const LAST = ["محمدی", "احمدی", "حسینی", "کریمی", "موسوی", "صادقی", "جعفری", "نادری", "شریفی", "قاسمی"];
const ROLES = ["کارشناس و مشاور فروش", "مدیر شعبه", "کارشناس ارزیابی", "مشاور خرید"];
const STATUSES = ["waitingForFinance", "waitingForDocument", "payed", "waitingForSeller", "waitingForBuyer", "canceledBySeller", "canceledByBuyer"];
const name = () => `${pick(FIRST)} ${pick(LAST)}`;

async function main() {
  console.log("پاک‌سازی رکوردهای قبلی p207-…");
  // حافظه/بازخورد ۱۲ کاشی به‌طور کامل پاک می‌شوند — این پایگاه ایزوله تست است و
  // ثبت‌های INTERACTION رندرهای قبلی نیز باید برای قطعیت پاک شوند
  const TILES = ["transactions", "experts", "visits", "contracts", "file-finder", "finance-commission", "price-index", "customer-club", "extraction", "supply-demand", "listings", "requests"];
  await db.agentMemory.deleteMany({ where: { tileId: { in: TILES } } });
  await db.agentFeedback.deleteMany({ where: { tileId: { in: TILES } } });
  await db.divarRejectLog.deleteMany({ where: { token: { startsWith: "p207-ad-" } } });
  await db.divarScanLog.deleteMany({ where: { id: { startsWith: "p207-scan-" } } });
  await db.divarAd.deleteMany({ where: { token: { startsWith: "p207-ad-" } } });
  await db.contractRecord.deleteMany({ where: { id: { startsWith: "p207-ct-" } } });
  await db.supplyDemandRecord.deleteMany({ where: { id: { startsWith: "p207-sd-" } } });
  await db.visitRecord.deleteMany({ where: { id: { startsWith: "p207-vi-" } } });
  await db.interactionRecord.deleteMany({ where: { id: { startsWith: "p207-in-" } } });
  await db.expertRecord.deleteMany({ where: { id: { startsWith: "p207-ex-" } } });
  await db.transactionRecord.deleteMany({ where: { id: { startsWith: "p207-tx-" } } });

  // ---------- ۱) ۱۰۰۰ معامله ----------
  const txData = Array.from({ length: 1000 }, (_, i) => ({
    id: `p207-tx-${i}`,
    contractDate: new Date(Date.UTC(2025, int(0, 11), int(1, 28), int(8, 18), int(0, 59))),
    propertyCode: `P${100000 + i}`,
    propertyCustomer: rnd() < 0.9 ? name() : null,
    requestCode: rnd() < 0.7 ? `R${200000 + i}` : null,
    requestCustomer: rnd() < 0.7 ? name() : null,
    contractHolo: rnd() < 0.6 ? `H${300000 + i}` : null,
    suggestedPropertyCount: int(0, 12),
    eventsCount: int(0, 25),
  }));
  await db.transactionRecord.createMany({ data: txData });

  // ---------- ۲) ۲۰۰ کارشناس + ۵۰۰ تعامل ----------
  const expertNames: string[] = [];
  const exData = Array.from({ length: 200 }, (_, i) => {
    const fullName = name();
    expertNames.push(fullName);
    return {
      id: `p207-ex-${i}`,
      personnelCode: String(300000 + i),
      fullName,
      mobile: `0914${String(1000000 + i).slice(0, 7)}`,
      role: pick(ROLES),
      businessTitle: `املاک ${pick(AREAS)}`,
      creator: rnd() < 0.8 ? "مدیر تست" : null,
      active: rnd() < 0.85,
      createdAt: new Date(Date.UTC(2024, int(0, 11), int(1, 28))),
    };
  });
  await db.expertRecord.createMany({ data: exData });

  const inData = Array.from({ length: 500 }, (_, i) => ({
    id: `p207-in-${i}`,
    requestRealtorName: pick(expertNames),
    propertyRealtorName: pick(expertNames),
    count: int(1, 40),
  }));
  await db.interactionRecord.createMany({ data: inData });

  // ---------- ۳) ۳۰۰ بازدید ----------
  const viData = Array.from({ length: 300 }, (_, i) => ({
    id: `p207-vi-${i}`,
    propertyCode: `P${100000 + int(0, 999)}`,
    requesterName: name(),
    checkerName: pick(expertNames),
    propertyRealtorName: pick(expertNames),
    checkTime: rnd() < 0.75 ? new Date(Date.UTC(2026, int(0, 7), int(1, 28), int(9, 17))) : null,
    createdAt: new Date(Date.UTC(2026, int(0, 7), int(1, 28), int(8, 18))),
    status: pick(["بررسی شد", "در انتظار", "لغو شد", "پیگیری لازم"]),
  }));
  await db.visitRecord.createMany({ data: viData });

  // ---------- ۴) ۳۰ عرضه/تقاضا ----------
  const sdData = Array.from({ length: 30 }, (_, i) => ({
    id: `p207-sd-${i}`,
    rangeTitle: `بازه ${pick(AREAS)} - ${pick(["زیر ۵۰ متر", "۵۰ تا ۸۰", "۸۰ تا ۱۲۰", "بالای ۱۲۰"])}`,
    propertyCount: int(5, 900),
    requestPercent: int(5, 95),
    status: pick(["فعال", "فعال", "فعال", "پایان‌یافته"]),
  }));
  await db.supplyDemandRecord.createMany({ data: sdData });

  // ---------- ۵) ۱۲۰ قرارداد ----------
  const ctData = Array.from({ length: 120 }, (_, i) => {
    const status = pick(STATUSES);
    return {
      id: `p207-ct-${i}`,
      status,
      contractHolo: `H${300000 + int(0, 999)}`,
      propertyCode: `P${100000 + int(0, 999)}`,
      requestCode: rnd() < 0.7 ? `R${200000 + int(0, 999)}` : null,
      contractType: pick(["mobayeName", "rahnName", "pishForoosh"]),
      creatorName: pick(expertNames),
      createdAt: new Date(Date.UTC(2026, int(0, 7), int(1, 28))),
      contractDate: new Date(Date.UTC(2026, int(0, 7), int(1, 28))),
      documentDate: rnd() < 0.5 ? new Date(Date.UTC(2026, int(0, 7), int(1, 28))) : null,
      deliveryDate: rnd() < 0.3 ? new Date(Date.UTC(2026, int(0, 7), int(1, 28))) : null,
      propertyTitle: `آپارتمان ${pick(AREAS)}`,
      propertyAddress: `تبریز، ${pick(AREAS)}`,
      buyerListJson: JSON.stringify([{ fullName: name(), mobileNumber: "09140000000" }]),
      sellerListJson: JSON.stringify([{ fullName: name(), mobileNumber: "09140000000" }]),
      realtorListJson: JSON.stringify(
        Array.from({ length: int(1, 3) }, () => ({
          name: pick(expertNames),
          unitPercent: int(10, 60),
          confirmation: pick(["confirm", "pending", "reject"]),
        }))
      ),
      canAddRealtor: rnd() < 0.5,
    };
  });
  await db.contractRecord.createMany({ data: ctData });

  // ---------- ۶) ۵۰ آگهی دیوار + ۱۰ اسکن + ۲۰ رد ----------
  const adData = Array.from({ length: 50 }, (_, i) => ({
    token: `p207-ad-${i}`,
    category: pick(["apartment-sell", "house-villa-sell", "apartment-rent", "plot-old"]),
    title: `فایل ${pick(AREAS)} ${i}`,
    description: "توضیحات تست قطعی",
    price: int(500, 5000) * 1_000_000_000,
    priceText: "توافقی",
    pricePerMeter: int(15, 60) * 1_000_000,
    meterage: int(45, 250),
    rooms: int(1, 4),
    floor: int(0, 12),
    buildYear: int(1380, 1403),
    publishedAt: new Date(Date.now() - 48 * 3600_000), // قدیمی ثابت — مرز ۶ ساعت هرگز لمس نمی‌شود
    bumpedAt: null,
    locationText: `تبریز، ${pick(AREAS)}`,
    matchedAreaId: String(int(1, 8)),
    matchedAreaName: `منطقه ${int(1, 8)}`,
    matchedLineId: String(int(1, 20)),
    matchedLineName: pick(AREAS),
    personalScore: int(30, 95),
    underpriceScore: int(20, 90),
    locationScore: int(40, 98),
    otherScore: int(20, 85),
    totalScore: int(35, 92),
    bucket: pick(["hunt", "follow", "review"]),
    status: "active",
    publisherType: pick(["personal", "personal", "agent", "business"]),
    publisherName: rnd() < 0.4 ? `املاک ${pick(AREAS)}` : null,
    imagesJson: "[]",
    specsJson: "[]",
  }));
  await db.divarAd.createMany({ data: adData });

  await db.divarScanLog.createMany({
    data: Array.from({ length: 10 }, (_, i) => ({
      id: `p207-scan-${i}`,
      startedAt: new Date(Date.now() - (i + 1) * 3600_000),
      durationMs: int(2000, 9000),
      scanned: int(80, 300),
      fetched: int(20, 90),
      inWindow: int(10, 60),
      outOfArea: int(0, 15),
      autoRejected: int(0, 40),
      newAds: int(0, 12),
      updatedAds: int(0, 8),
      source: pick(["web", "kenar"]),
      error: i === 0 ? null : rnd() < 0.8 ? null : "network-timeout",
    })),
  });

  await db.divarRejectLog.createMany({
    data: Array.from({ length: 20 }, (_, i) => ({
      token: `p207-ad-rejected-${i}`,
      reasons: JSON.stringify([pick(["broker", "overpriced", "no-price", "location", "semi-personal"]), pick(["broker", "not-underpriced", "condition"])]),
      note: rnd() < 0.5 ? "توضیح کاربر" : null,
      scoreSnapshotJson: null,
      featureSnapshotJson: null,
      actorCode: "300000",
    })),
  });

  // ---------- ۷) آمار قیمت بازار برای فیلتر زیرقیمت ----------
  await db.marketPriceStat.deleteMany({ where: { scopeKey: { startsWith: "p207-line:" } } });
  await db.marketPriceStat.createMany({
    data: AREAS.slice(0, 5).map((area, i) => ({
      scopeKey: `p207-line:${i + 1}`,
      medianPerMeter: int(20, 45) * 1_000_000,
      p25PerMeter: int(15, 25) * 1_000_000,
      p75PerMeter: int(40, 60) * 1_000_000,
      sampleCount: int(10, 120),
      armPerMeter: null,
    })),
  });

  // ---------- ۸) بازخورد/حافظه ایجنت‌ها (برای مسیر یادگیری RAG) ----------
  const tiles = ["transactions", "experts", "visits", "contracts", "file-finder", "finance", "price-index", "customer-club", "extraction", "supply-demand", "listing", "request"];
  for (const tile of tiles) {
    await db.agentFeedback.createMany({
      data: Array.from({ length: 7 }, (_, i) => ({
        tileId: tile,
        insightKey: `p207-key-${i}`,
        insightTitle: `بینش تست ${tile} ${i}`,
        rating: i < 5 ? 1 : -1,
        comment: i % 2 === 0 ? `بینش تست ${tile} مفید بود` : null,
        context: JSON.stringify({ domain: pick(["SCAN", "PERSONAL", "PRICE", "OTHER", "LOCATION", "LEARNING", "COMMUNITY_MGMT", "FINANCE"]) }),
      })),
    });
    await db.agentMemory.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        tileId: tile,
        kind: pick(["FEEDBACK", "INTERACTION", "POLICY_CHANGE"]),
        payload: JSON.stringify({ at: new Date(Date.now() - (i + 1) * 86400_000).toISOString(), note: `خاطره قطعی ${tile} ${i}`, marker: "p207-marker" }),
      })),
    });
  }

  // سیاست‌ها: هیچ — ensurePolicy در هر دو سمت نسخه ۱ پیش‌فرض یکسان می‌سازد

  const counts = {
    transactions: await db.transactionRecord.count(),
    experts: await db.expertRecord.count(),
    interactions: await db.interactionRecord.count(),
    visits: await db.visitRecord.count(),
    supplyDemand: await db.supplyDemandRecord.count(),
    contracts: await db.contractRecord.count(),
    divarAds: await db.divarAd.count(),
  };
  console.log("کاشت قطعی انجام شد:", JSON.stringify(counts));
  await db.$disconnect();
}

main().catch((err) => {
  console.error("خطای کاشت:", err);
  process.exit(1);
});
