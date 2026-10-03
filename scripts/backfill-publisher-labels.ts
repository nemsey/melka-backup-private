/**
 * تکمیل یک‌بارهٔ برچسب آگهی‌دهنده (زیر نقشه دیوار) برای فایل‌های ذخیره‌شدهٔ قدیمی
 * + بازامتیازدهی شخصی/کل/دسته با سیگنال رسمی جدید.
 */
process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";

export {}; // ماژولی شدن — جلوگیری از تداخل main سراسری بین اسکریپت‌ها

async function main() {
  const { db } = await import("@/lib/db");
  const { webGetPostDetail, parseActiveAdCount } = await import("@/lib/divar/client");
  const { scorePersonalAd, computeTotalScore } = await import("@/lib/divar/scoring");
  const { loadDivarSettings } = await import("@/lib/divar/store");

  const settings = await loadDivarSettings();
  const ads = await db.divarAd.findMany({
    where: { status: "active", publisherType: null },
    select: { token: true, title: true, description: true, underpriceScore: true, locationScore: true, analysisJson: true },
  });
  console.log(`فایل‌های فعال بدون برچسب آگهی‌دهنده: ${ads.length}`);

  let updated = 0;
  let failed = 0;
  for (const ad of ads) {
    const detail = await webGetPostDetail(ad.token).catch(() => null);
    if (!detail || !detail.publisherType) {
      failed += 1;
      continue;
    }
    const personal = scorePersonalAd({
      title: ad.title,
      description: ad.description,
      publisherType: detail.publisherType,
      publisherName: detail.publisherName,
    });
    const total = computeTotalScore({
      personal: personal.score,
      underprice: ad.underpriceScore,
      other: 0,
      location: ad.locationScore,
      settings,
    });
    let analysisObj: Record<string, unknown> = {};
    try {
      analysisObj = JSON.parse(ad.analysisJson ?? "{}") as Record<string, unknown>;
    } catch {
      analysisObj = {};
    }
    analysisObj.personal = { score: personal.score, isBroker: personal.isBroker, confidence: personal.confidence, signals: personal.signals };
    await db.divarAd.update({
      where: { token: ad.token },
      data: {
        publisherType: detail.publisherType,
        publisherName: detail.publisherName,
        publisherAdCount: detail.publisherAdCountText ? parseActiveAdCount(detail.publisherAdCountText) : null,
        publisherBrandUrl: detail.publisherBrandUrl,
        personalScore: personal.score,
        totalScore: total.total,
        bucket: total.bucket,
        analysisJson: JSON.stringify(analysisObj),
      },
    });
    updated += 1;
    console.log(`${ad.token} → ${detail.publisherType}${detail.publisherName ? ` (${detail.publisherName})` : ""} | شخصی=${personal.score} | ${total.bucket}`);
    // مکث کوتاه برای احترام به سرور دیوار
    await new Promise((r) => setTimeout(r, 350));
  }
  console.log(`\nتکمیل شد: ${updated} به‌روز شد، ${failed} ناموفق (آگهی حذف‌شده/شبکه)`);

  const dist = await db.divarAd.groupBy({ by: ["publisherType"], where: { status: "active" }, _count: { _all: true } });
  console.log("توزیع نهایی نوع آگهی‌دهنده:", JSON.stringify(dist.map((d) => ({ type: d.publisherType ?? "—", count: d._count._all }))));
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
