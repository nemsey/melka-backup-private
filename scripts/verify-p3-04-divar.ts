/**
 * P3-04 — دفع خروجی ایجنت دیوار برای مقایسه قبل/بعد (الگوی P2-07 دو-درختی)
 * ------------------------------------------------------
 * استفاده (در هر دو درخت — baseline worktree و فعلی):
 *   DATABASE_URL=file:/home/z/my-project/db/test-repository.db MELK_TOKEN_KEY=test \
 *     bun scripts/verify-p3-04-divar.ts <out.json>
 *
 * اسکریپت dump-only است: کاشت قطعی p304 → ریست کامل کاشی file-finder →
 * renderInsights + learningStats از DivarAgent → دفع JSON. مقایسه بایت‌به‌بایت
 * دو خروجی = اثبات مهاجرت بدون تغییر رفتار.
 *
 * ⚠️ importها عمداً نسبی‌اند تا در هر دو درخت به کد همان درخت وصل شوند.
 * تاریخ‌ها قدیمی و ثابت (۴۸+ ساعت) — مرز ۶ ساعت تازگی دیوار هرگز لمس نمی‌شود.
 */

const outPath = process.argv[2];
if (!outPath) {
  console.error("مسیر خروجی JSON بدهید: bun scripts/verify-p3-04-divar.ts <out.json>");
  process.exit(2);
}

const ANCHOR = Date.now();
const at = (hoursAgo: number) => new Date(ANCHOR - hoursAgo * 3600_000);

async function main() {
  const { db } = await import("../src/lib/db");
  const { DivarAgent } = await import("../src/core/agent/divar-agent");

  // ---------- ۰) پاک‌سازی idempotent + ریست کامل کاشی ----------
  await db.divarAd.deleteMany({ where: { token: { startsWith: "p304-ad-" } } });
  await db.divarScanLog.deleteMany({ where: { id: { startsWith: "p304-scan-" } } });
  await db.divarRejectLog.deleteMany({ where: { token: { startsWith: "p304-rej-" } } });
  await db.marketPriceStat.deleteMany({ where: { scopeKey: { startsWith: "p304-line:" } } });
  await db.divarSetting.deleteMany({ where: { id: "p304-singleton" } });
  await db.agentMemory.deleteMany({ where: { tileId: "file-finder" } });
  await db.agentFeedback.deleteMany({ where: { tileId: "file-finder" } });
  await db.agentPolicyVersion.deleteMany({ where: { tileId: "file-finder" } });

  // ---------- ۱) ۲۰ آگهی فعال (امتیازها/برچسب‌ها/مکان متنوع) ----------
  const CATS = ["apartment-sell", "house-villa-sell", "apartment-rent", "plot-old"];
  const AREAS = ["لیل", "ائل‌گلی", "باغمیشه", "زعفرانیه", "شهرک ولیعصر"];
  const adRows = Array.from({ length: 20 }, (_, i) => ({
    token: `p304-ad-${i}`,
    category: CATS[i % 4],
    title: `فایل ${AREAS[i % 5]} ${i}`,
    description: "کاشت قطعی p304",
    price: (15 + (i % 7)) * 100_000_000,
    priceText: "توافقی",
    pricePerMeter: i % 9 === 8 ? null : (18 + (i % 5)) * 1_000_000, // یک‌نinth بدون قیمت متر
    meterage: 60 + (i % 8) * 15,
    rooms: (i % 4) + 1,
    floor: i % 9,
    buildYear: 1390 + (i % 14),
    publishedAt: at(48 + i), // همیشه قدیمی — مرز ۶ ساعت هرگز لمس نمی‌شود
    bumpedAt: null,
    locationText: `تبریز، ${AREAS[i % 5]}`,
    matchedAreaId: String((i % 5) + 1),
    matchedAreaName: `منطقه ${(i % 5) + 1}`,
    matchedLineId: String((i % 5) * 4 + 1),
    matchedLineName: i % 3 === 2 ? null : AREAS[i % 5], // یک‌سوم بدون نگاشت محله
    personalScore: 40 + (i % 6) * 10, // ۴۰ تا ۹۰ — برخی زیر ۶۰
    underpriceScore: 50 + (i % 5) * 10, // ۵۰ تا ۹۰ — برخی ۷۰+
    locationScore: 80 + (i % 4) * 4,
    otherScore: 30 + (i % 7) * 10,
    totalScore: 45 + (i % 6) * 9,
    bucket: ["hunt", "follow", "review"][i % 3],
    status: "active",
    publisherType: i % 4 === 3 ? "agent" : i % 4 === 1 ? "business" : "personal",
    publisherName: i % 4 === 3 ? "املاک ولیعصر" : i % 4 === 1 ? `دپارتمان ${AREAS[i % 5]}` : null,
    imagesJson: "[]",
    specsJson: "[]",
  }));
  await db.divarAd.createMany({ data: adRows });

  // ---------- ۲) ۵ اسکن (۱ خطا + ۴ موفق) ----------
  await db.divarScanLog.createMany({
    data: Array.from({ length: 5 }, (_, i) => ({
      id: `p304-scan-${i}`,
      startedAt: at(2 + i * 5),
      durationMs: 3200 + i * 410,
      scanned: 120 + i * 17,
      fetched: 30 + i * 5,
      inWindow: 18 + i * 3,
      outOfArea: i * 2,
      autoRejected: 6 + i,
      newAds: i < 3 ? i + 1 : 0,
      updatedAds: i % 2,
      source: i % 2 === 0 ? "kenar" : "web",
      error: i === 0 ? "network-timeout" : null,
    })),
  });

  // ---------- ۳) ۱۲ رد (۴ broker → هشدار نشت مشاور + سایر دلایل) ----------
  const REASONS = [
    ["broker"], ["broker"], ["broker"], ["broker"],
    ["no-price", "not-underpriced"], ["overpriced"], ["location"], ["condition"],
    ["semi-personal"], ["already-sold"], ["other"], ["no-price"],
  ];
  await db.divarRejectLog.createMany({
    data: REASONS.map((reasons, i) => ({
      token: `p304-rej-${i}`,
      reasons: JSON.stringify(reasons),
      note: i % 3 === 0 ? "توضیح کاربر" : null,
      scoreSnapshotJson: null,
      featureSnapshotJson: null,
      actorCode: "300000",
    })),
  });

  // ---------- ۴) آمار بازار ۵ محله (پیشوند line:) ----------
  await db.marketPriceStat.createMany({
    data: Array.from({ length: 5 }, (_, i) => ({
      scopeKey: `p304-line:${i + 1}`,
      medianPerMeter: (22 + i * 3) * 1_000_000,
      p25PerMeter: (17 + i * 2) * 1_000_000,
      p75PerMeter: (30 + i * 4) * 1_000_000,
      sampleCount: 12 + i * 9,
      armPerMeter: null,
    })),
  });

  // ---------- ۵) تنظیمات فایل‌یابی (فیلتر مکان فعال: ۲ منطقه + ۳ محله) ----------
  await db.divarSetting.create({
    data: {
      id: "p304-singleton",
      dataJson: JSON.stringify({ areaIds: ["1", "2"], lineIds: ["1", "5", "9"], weights: { personal: 30, underprice: 25, location: 20, other: 20, total: 5 } }),
      locFilterInit: true,
    },
  });

  // ---------- ۶) بازخورد/حافظه RAG قطعی ----------
  await db.agentFeedback.createMany({
    data: [
      { tileId: "file-finder", insightKey: "p304-fb-0", insightTitle: "سلامت اسکن دیوار", rating: 1, comment: "سلامت اسکن مفید بود", context: JSON.stringify({ domain: "SCAN" }) },
      { tileId: "file-finder", insightKey: "p304-fb-1", insightTitle: "قانون مالک فعال", rating: 1, comment: null, context: JSON.stringify({ domain: "PERSONAL" }) },
      { tileId: "file-finder", insightKey: "p304-fb-2", insightTitle: "زیرقیمت", rating: -1, comment: "زیرقیمت گنگ بود", context: JSON.stringify({ domain: "PRICE" }) },
      { tileId: "file-finder", insightKey: "p304-fb-3", insightTitle: "سایر فاکتورهای بهینه", rating: 1, comment: null, context: JSON.stringify({ domain: "OTHER" }) },
      { tileId: "file-finder", insightKey: "p304-fb-4", insightTitle: "تطبیق مکان", rating: 1, comment: "مکان دقیق بود", context: JSON.stringify({ domain: "LOCATION" }) },
      { tileId: "file-finder", insightKey: "p304-fb-5", insightTitle: "یادگیری از رد", rating: 1, comment: null, context: JSON.stringify({ domain: "LEARNING" }) },
    ],
  });
  await db.agentMemory.createMany({
    data: [
      { tileId: "file-finder", kind: "INTERACTION", payload: JSON.stringify({ at: at(20).toISOString(), note: "رندر قبلی سلامت اسکن" }) },
      { tileId: "file-finder", kind: "FEEDBACK", payload: JSON.stringify({ at: at(30).toISOString(), note: "بازخورد قانون مالک" }) },
    ],
  });

  // ---------- ۷) دفع خروجی (stats-first عین الگوی P2-07) ----------
  const agent = new DivarAgent();
  const stats = await agent.learningStats();
  const rendered = await agent.renderInsights();
  const result = {
    agentName: agent.name,
    tileId: agent.tileId,
    stats,
    rendered: {
      policyVersion: rendered.policyVersion,
      memoryHits: rendered.memoryHits,
      insights: rendered.insights.map((i) => ({
        key: i.key,
        domain: i.domain,
        title: i.title,
        body: i.body,
        severity: i.severity,
        metrics: i.metrics ?? null,
        finalWeight: i.finalWeight,
        learned: i.learned,
        weightSource: i.weightSource,
      })),
    },
  };

  await Bun.write(outPath, JSON.stringify(result, null, 2));
  console.log(`دفع شد: ${outPath} — ${result.rendered.insights.length} بینش، policyVersion=${result.rendered.policyVersion}، memoryHits=${result.rendered.memoryHits}`);

  // ---------- ۸) پاک‌سازی خود-تمیزشونده ----------
  await db.divarAd.deleteMany({ where: { token: { startsWith: "p304-ad-" } } });
  await db.divarScanLog.deleteMany({ where: { id: { startsWith: "p304-scan-" } } });
  await db.divarRejectLog.deleteMany({ where: { token: { startsWith: "p304-rej-" } } });
  await db.marketPriceStat.deleteMany({ where: { scopeKey: { startsWith: "p304-line:" } } });
  await db.divarSetting.deleteMany({ where: { id: "p304-singleton" } });
  await db.agentMemory.deleteMany({ where: { tileId: "file-finder" } });
  await db.agentFeedback.deleteMany({ where: { tileId: "file-finder" } });
  await db.agentPolicyVersion.deleteMany({ where: { tileId: "file-finder" } });
  console.log("پاک‌سازی p304 انجام شد.");

  await db.$disconnect();
}

main().catch((err) => {
  console.error("خطای verify-p3-04-divar:", err);
  process.exit(1);
});
