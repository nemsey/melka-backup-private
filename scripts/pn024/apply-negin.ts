/**
 * PN-024 · مرحلهٔ ۴ — اعمال نگین روی ۱۱ کاشی (فقط className — قانون ۷: صفر تغییر منطق)
 * ---------------------------------------------------------------------------
 * درج میلهٔ گوهر (negin-bar) به‌عنوان نخستین فرزند ریشهٔ هر صفحه + data-negin.
 * اجرا: bun scripts/pn024/apply-negin.ts  (idempotent — دوبار اجرا = هیچ)
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = "/home/z/my-project";

const MAP: Array<{ file: string; gem: string }> = [
  { file: "src/core/tiles/tiles/file-finder/FileFinderPage.tsx", gem: "yaghut-kamani" },
  { file: "src/core/tiles/tiles/listing/ListingsPage.tsx", gem: "kahroba-talaee" },
  { file: "src/core/tiles/tiles/request/RequestsPage.tsx", gem: "aqiq-limoonee" },
  { file: "src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx", gem: "zomorrod-koohi" },
  { file: "src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx", gem: "marjan-daryayi" },
  { file: "src/core/tiles/tiles/transactions-contracts/TransactionsContractsPage.tsx", gem: "yaghut-banafsh" },
  { file: "src/core/tiles/tiles/experts/ExpertsPage.tsx", gem: "yaghut-kabud" },
  { file: "src/core/tiles/tiles/smart-matching/SmartMatchingPage.tsx", gem: "kuartz-soorati" },
  { file: "src/core/tiles/tiles/learning-tier/LearningTierPage.tsx", gem: "nili" },
  { file: "src/core/tiles/tiles/market-index/MarketIndexPage.tsx", gem: "topaz-abee" },
  { file: "src/core/tiles/tiles/data-coverage/DataCoveragePage.tsx", gem: "morvarid" },
];

const results: Array<{ tile: string; gem: string; applied: boolean; note: string }> = [];

for (const { file, gem } of MAP) {
  const path = join(ROOT, file);
  let src = readFileSync(path, "utf-8");
  if (src.includes(`data-negin="${gem}"`)) {
    results.push({ tile: file.split("/").pop()!, gem, applied: false, note: "از قبل اعمال شده (idempotent)" });
    continue;
  }
  const before = src;
  // ریشهٔ صفحه: فقط div با className=space-y-6 یا space-y-4 p-4 md:p-6 که یکتاست
  const rootRe = /(<div className="(?:space-y-6|space-y-4 p-4 md:p-6)">)\n/;
  const m = src.match(rootRe);
  if (!m) {
    results.push({ tile: file.split("/").pop()!, gem, applied: false, note: "ریشهٔ صفحه یافت نشد — بازبینی دستی" });
    continue;
  }
  src = src.replace(
    rootRe,
    `${m[1].replace('<div className=', '<div data-negin="' + gem + '" className=')}\n      {/* نگین (PN-024) — میلهٔ گوهر ${gem} */}\n      <div className="negin-bar" aria-hidden />\n`,
  );
  if (src !== before) {
    writeFileSync(path, src);
    results.push({ tile: file.split("/").pop()!, gem, applied: true, note: "میلهٔ نگین + data-negin درج شد" });
  } else {
    results.push({ tile: file.split("/").pop()!, gem, applied: false, note: "بدون تغییر (ناسازگاری الگو)" });
  }
}

const applied = results.filter((r) => r.applied).length;
const pre = results.filter((r) => !r.applied && r.note.includes("از قبل")).length;
console.log(`اعمال‌شده: ${applied} · از قبل: ${pre} · خطا: ${results.filter((r) => !r.applied && !r.note.includes("از قبل")).length}`);
writeFileSync(
  join(ROOT, "download/pn024/negin-applied-raw.json"),
  JSON.stringify({ ranAt: new Date().toISOString(), applied, preApplied: pre, results }, null, 2),
);
