/**
 * E2E زنده: اجرای اسکن واقعی روی پایگاه production (custom.db) و نمایش
 * تشخیص آگهی‌دهنده (برچسب زیر نقشه دیوار) برای فایل‌های فعال.
 */
process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";

export {}; // ماژولی شدن — جلوگیری از تداخل main سراسری بین اسکریپت‌ها

async function main() {
  const { runDivarScan } = await import("@/lib/divar/scan");
  const summary = await runDivarScan();
  console.log("=== SCAN SUMMARY ===");
  console.log(JSON.stringify(summary, null, 1));

  const { db } = await import("@/lib/db");
  const ads = await db.divarAd.findMany({
    where: { status: "active" },
    orderBy: { totalScore: "desc" },
    take: 40,
    select: { token: true, title: true, publisherType: true, publisherName: true, publisherAdCount: true, publisherBrandUrl: true, personalScore: true, bucket: true },
  });
  console.log(`\n=== ${ads.length} فایل فعال — نمونه آگهی‌دهندگان ===`);
  const byType: Record<string, number> = {};
  for (const a of ads) {
    const t = a.publisherType ?? "(قدیمی—بدون برچسب)";
    byType[t] = (byType[t] ?? 0) + 1;
  }
  console.log("توزیع نوع آگهی‌دهنده:", JSON.stringify(byType));
  for (const a of ads.slice(0, 12)) {
    console.log(
      `${a.token} | ${a.publisherType ?? "—"} | ${a.publisherName ?? "—"} | ${a.publisherAdCount ?? "—"} آگهی فعال | شخصی=${a.personalScore} | ${a.bucket}`
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
