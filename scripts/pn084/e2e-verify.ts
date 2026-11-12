/**
 * PN-084 — راستی‌آزمایی زندهٔ موتور تطبیق روی دادهٔ تولید
 * (کاندیدای واقعی + پوشش صادقانه + تازگی تطبیقی + تایمینگ) — فقط خواندن
 */
import { db } from "@/lib/db";
import { MatchingEngine, BASE_MATCH_WEIGHTS } from "@/core/matching/matching-engine";
import { enrichMatchResult } from "@/core/matching/match-analysis";

async function main() {
  const listing = await db.propertyRecord.findFirst({
    where: { status: "منتشر شده", price: { gt: 0 } },
    orderBy: { updatedAt: "desc" },
    select: { propertyCode: true, price: true, areaName: true, tradeTypeName: true },
  });
  if (!listing) { console.log("no listing found"); process.exit(0); }
  console.log("[input listing]", listing.propertyCode, "| price:", listing.price, "| area:", listing.areaName, "| trade:", listing.tradeTypeName);

  const engine = new MatchingEngine({ db, tier: 3, weights: BASE_MATCH_WEIGHTS, topN: 20, candidateLimit: 12000 });

  let t0 = Date.now();
  const res1 = await engine.matchListingToRequests(listing.propertyCode);
  console.log(`\n[direction 1 · listing→requests] ${Date.now() - t0}ms`);
  console.log(" coverage:", JSON.stringify(res1.coverage));
  console.log(" top3:", JSON.stringify(res1.candidates.slice(0, 3).map((c) => ({ code: c.info?.code, score: c.score, customer: c.info?.ownerName }))));
  console.log(" flat signals:", JSON.stringify(res1.signalProfile?.filter((f) => f.flat).map((f) => `${f.factor}=${f.min}`)));
  const fresh = res1.candidates[0]?.reasons.find((r) => r.factor === "تازگی آگهی");
  const met = res1.candidates[0]?.reasons.find((r) => r.factor === "تناسب متراژ");
  const geo = res1.candidates[0]?.reasons.find((r) => r.factor === "نزدیکی جغرافیایی");
  console.log(" freshness:", fresh?.value, fresh?.note, "| meterage:", met?.value, met?.note, "| geo:", geo?.value);

  const req = await db.requestRecord.findFirst({
    where: { status: "سرنخ", priceFrom: { gt: 0 }, priceTo: { gt: 0 }, spaceFrom: { gt: 0 } },
    orderBy: { updatedAt: "desc" },
    select: { requestCode: true, id: true, spaceFrom: true, spaceTo: true },
  });
  if (req) {
    t0 = Date.now();
    const res2 = await engine.matchRequestToListings(req.requestCode ?? req.id);
    console.log(`\n[direction 2 · request→listings] ${Date.now() - t0}ms (request space ${req.spaceFrom}-${req.spaceTo})`);
    console.log(" coverage:", JSON.stringify(res2.coverage));
    console.log(" top3:", JSON.stringify(res2.candidates.slice(0, 3).map((c) => ({ code: c.info?.code, score: c.score }))));
    const m2 = res2.candidates[0]?.reasons.find((r) => r.factor === "تناسب متراژ");
    console.log(" meterage:", m2?.value, m2?.note);
  }

  const { summary } = enrichMatchResult(res1);
  console.log("\n[summary]", summary.headline);
  process.exit(0);
}

main().catch((e) => { console.error("E2E FAIL:", e); process.exit(1); });
