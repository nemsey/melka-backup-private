/**
 * P6-10 — گواهی پایه پیش‌بینی: توزیع احتمال‌ها + مقایسه با baseline ساده
 * ------------------------------------------------------
 * طبق دستور: اجرای پیش‌بینی روی ۱۰۰ رکورد تستی + جدول توزیع + جدول مقایسه
 * heuristic با baseline (میانگین ساده) + ثبت گزارش که این‌ها «پایه PHASE 7»
 * هستند — نه ادعای کیفیت (قانون H).
 *
 * روش صادقانه بدون Outcome واقعی:
 *  - ۱۰۰ رکورد قطعی (فرمول‌محور، بدون شانس — بازتولیدپذیر)
 *  - برچسب ساختگی «مستقل از وزن‌های مدل» (قاعده دیگر + نویز قطعی PRNG)
 *    فقط برای اثبات کارکرد چرخه ارزیابی (Brier/کالیبراسیون) — صریحاً
 *    «ساختگی» برچسب می‌خورد؛ کیفیت واقعی فقط در PHASE 7 با Outcome واقعی
 *  - baseline = احتمال ثابت برابر میانگین (میانگین ساده)
 *
 * شاهد ذخیره: همه ۱۰۰ رکورد در PredictionRepository ذخیره و شمرده می‌شوند.
 *
 * اجرا: bun scripts/verify-p6-10.ts (بدون DB)
 */

import { buildPropertyFeatures, type PropertyInput } from "../src/core/intelligence/feature/builders/property-features";
import { buildMarketFeatures } from "../src/core/intelligence/feature/builders/market-features";
import { PropertyPredictor } from "../src/core/intelligence/prediction/predictors/property-predictor";
import { InMemoryPredictionRepository } from "../src/core/intelligence/prediction/prediction-repository";
import type { PropertyPredictionPayload } from "../src/core/intelligence/prediction/prediction-record";

// ===================== PRNG قطعی (mulberry32) =====================

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260916); // ثابت — بازتولیدپذیر

// ===================== ۱۰۰ رکورد قطعی =====================

const N = 100;

function recordInputs(i: number): { property: PropertyInput; marketTrend30d: number; marketSupplyDemandRatio: number } {
  const publisherType = (["personal", "agency", "unknown"] as const)[i % 3]!;
  const price = 2_000_000_000 + (i % 40) * 50_000_000;
  const meterage = 60 + (i % 50);
  const pricePerMeter = price / meterage;
  // میانه منطقه: بین 0.8x تا 1.3x قیمت هر متر — نسبت ارزانی متنوع می‌سازد
  const medianFactor = 0.8 + ((i * 7) % 50) / 100; // 0.8 .. 1.29
  const median = pricePerMeter * medianFactor;
  return {
    property: {
      id: `p610-prop-${i}`,
      areaId: `area-${i % 8}`,
      areaName: `منطقه-${i % 8}`,
      price,
      pricePerMeter,
      propertyType: "apartment",
      tradeType: "sell",
      meterage,
      rooms: 1 + (i % 4),
      floor: i % 10,
      age: i % 25,
      hasElevator: i % 2 === 0,
      hasParking: i % 3 !== 0,
      photoCount: i % 25,
      hasVideo: i % 5 === 0,
      description: "توضیح".repeat(1 + (i % 60)),
      publisherType,
      publishedHoursAgo: (i * 13) % 1000,
      priceChangeCount: i % 4,
      previousPriceDelta: i % 3 === 0 ? -80_000_000 : 20_000_000,
    },
    marketTrend30d: ((i % 7) - 3) / 100, // -0.03 .. +0.03
    marketSupplyDemandRatio: 0.5 + (i % 20) / 10, // 0.5 .. 2.4
  };
}

/** برچسب ساختگی مستقل — قاعده دیگر (وزن‌های متفاوت) + نویز قطعی */
function syntheticOutcome(personalBase: number, underpriceSignal: number, ageSignal: number, freshness: number): 0 | 1 {
  const score = 0.45 * personalBase + 0.35 * underpriceSignal + 0.10 * (1 - ageSignal) + 0.10 * freshness;
  const noise = (rng() - 0.5) * 0.5; // نویز قطعی ±0.25
  return score + noise > 0.55 ? 1 : 0;
}

// ===================== اجرا =====================

function binOf(p: number): number {
  if (p < 0.2) return 0;
  if (p < 0.4) return 1;
  if (p < 0.6) return 2;
  if (p < 0.8) return 3;
  return 4;
}

const BIN_LABELS = ["۰٫۰–۰٫۲", "۰٫۲–۰٫۴", "۰٫۴–۰٫۶", "۰٫۶–۰٫۸", "۰٫۸–۱٫۰"];

async function main() {
  const predictor = new PropertyPredictor();
  const repo = new InMemoryPredictionRepository();
  const NOW = new Date("2026-09-16T12:00:00.000Z");

  const payloads: PropertyPredictionPayload[] = [];
  const truths: (0 | 1)[] = [];

  for (let i = 0; i < N; i++) {
    const { property, marketTrend30d, marketSupplyDemandRatio } = recordInputs(i);
    // بازار هر رکورد: میانه از medianFactor + روند/نسبت مستقیم
    const market = buildMarketFeatures({
      areaId: property.areaId,
      snapshotDate: NOW,
      samples: [
        { pricePerMeter: property.pricePerMeter * 0.8 + ((i * 11) % 30) * 1_000_000 },
        { pricePerMeter: property.pricePerMeter * 1.2 },
        { pricePerMeter: property.pricePerMeter * (0.9 + (i % 20) / 100) },
        { pricePerMeter: property.pricePerMeter * 1.05 },
        { pricePerMeter: property.pricePerMeter * 1.35 },
      ],
      priceTrend7d: marketTrend30d / 3,
      priceTrend30d: marketTrend30d,
      volumeTrend7d: -0.01,
      volatility: 0.06,
      supplyDemandRatio: marketSupplyDemandRatio,
    });

    const features = buildPropertyFeatures(property, market, { keywordScore: ((i * 13) % 50) / 10 });
    const record = predictor.predict(features, market, { now: NOW, entityId: property.id });

    await repo.save(record);
    payloads.push(record.payload);
    truths.push(
      syntheticOutcome(
        property.publisherType === "personal" ? 1 : property.publisherType === "agency" ? 0 : 0.5,
        Math.min(1, Math.max(0, features.underpriceRatio * 5)),
        Math.min(1, property.publishedHoursAgo / 720),
        1 - Math.min(1, property.publishedHoursAgo / 336),
      ),
    );
  }

  // شاهد ذخیره
  const storedCount = (await repo.findByModel("property-predictor-v0.1")).length;
  if (storedCount !== N) throw new Error(`شمارش انبار ${storedCount} ≠ ${N}`);

  // ---------- جدول ۱: توزیع احتمال‌ها ----------
  const probKeys = [
    "personalProbability", "underpriceProbability", "contactProbability",
    "ownerVerificationProbability", "negotiationProbability",
    "crmRegistrationProbability", "transactionProbability",
  ] as const;

  const lines: string[] = [];
  lines.push("P6-10 — گواهی پایه پیش‌بینی (۱۰۰ رکورد قطعی · property-predictor-v0.1)");
  lines.push("==================================================================");
  lines.push("");
  lines.push("جدول ۱ — توزیع احتمال‌ها (درصد رکوردها در هر بازه)");
  lines.push("احتمال                       | ۰٫۰–۰٫۲ | ۰٫۲–۰٫۴ | ۰٫۴–۰٫۶ | ۰٫۶–۰٫۸ | ۰٫۸–۱٫۰ | میانگین | انحراف");
  lines.push("-----------------------------|---------|---------|---------|---------|---------|---------|------");
  for (const key of probKeys) {
    const values = payloads.map((p) => p[key] as number);
    const bins = [0, 0, 0, 0, 0];
    for (const v of values) bins[binOf(v)]!++;
    const mean = values.reduce((s, v) => s + v, 0) / N;
    const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / N);
    lines.push(
      `${key.padEnd(29)} | ${bins.map((b) => `${((b / N) * 100).toFixed(0)}٪`.padStart(7)).join(" | ")} | ${mean.toFixed(3).padStart(7)} | ${std.toFixed(3)}`,
    );
  }

  // ---------- جدول ۲: مقایسه با baseline (میانگین ساده) روی برچسب ساختگی ----------
  const probs = payloads.map((p) => p.transactionProbability);
  const meanP = probs.reduce((s, v) => s + v, 0) / N;
  const brierHeuristic = probs.reduce((s, p, i) => s + (p - truths[i]!) ** 2, 0) / N;
  const brierBaseline = truths.reduce((s, t) => s + (meanP - t) ** 2, 0) / N;

  lines.push("");
  lines.push("جدول ۲ — مقایسه heuristic با baseline میانگین ساده");
  lines.push("روی برچسب ساختگی مستقل (قاعده دیگر + نویز قطعی) — فقط اثبات کارکرد چرخه ارزیابی");
  lines.push("سنجه                          | heuristic | baseline (میانگین ثابت)");
  lines.push("------------------------------|-----------|------------------------");
  lines.push(`میانگین احتمال                | ${meanP.toFixed(3).padStart(9)} | ${meanP.toFixed(3).padStart(9)}`);
  const stdP = Math.sqrt(probs.reduce((s, v) => s + (v - meanP) ** 2, 0) / N);
  lines.push(`انحراف معیار (توان تفکیک)      | ${stdP.toFixed(3).padStart(9)} | ${"0.000".padStart(9)}`);
  lines.push(`Brier (روی برچسب ساختگی)      | ${brierHeuristic.toFixed(4).padStart(9)} | ${brierBaseline.toFixed(4).padStart(9)}`);
  lines.push("");

  // ---------- جدول ۳: کالیبراسیون (روی برچسب ساختگی) ----------
  lines.push("جدول ۳ — کالیبراسیون روی برچسب ساختگی (پایپ‌لاین PHASE 7)");
  lines.push("بازه پیش‌بینی   | تعداد | میانگین پیش‌بینی | فراوانی واقعی ساختگی");
  lines.push("----------------|-------|------------------|---------------------");
  for (let b = 0; b < 5; b++) {
    const idx = probs.map((p, i) => ({ p, i })).filter(({ p }) => binOf(p) === b);
    const count = idx.length;
    const meanBin = count > 0 ? idx.reduce((s, x) => s + x.p, 0) / count : 0;
    const freq = count > 0 ? idx.filter((x) => truths[x.i] === 1).length / count : 0;
    lines.push(
      `${BIN_LABELS[b]!.padEnd(16)} | ${String(count).padStart(5)} | ${meanBin.toFixed(3).padStart(16)} | ${(freq * 100).toFixed(0)}٪`,
    );
  }

  // ---------- جمع‌بندی صادقانه ----------
  const totalExpectedRevenue = payloads.reduce((s, p) => s + p.expectedRevenue, 0);
  const avgMostLikelyDays = payloads.reduce((s, p) => s + p.expectedTimeToConversionDays, 0) / N;
  lines.push("");
  lines.push("جمع‌بندی");
  lines.push(`- مجموع درآمد موردانتظار ۱۰۰ رکورد: ${Math.round(totalExpectedRevenue / 1_000_000).toLocaleString("en")} میلیون تومان (کارمزد فرضی ۱٪)`);
  lines.push(`- میانگین روزِ محتمل‌ترین تبدیل: ${avgMostLikelyDays.toFixed(1)} روز`);
  lines.push(`- شمارش انبار پیش‌بینی: ${storedCount}/${N} ذخیره شد (شاهد findByModel)`);
  lines.push("");
  lines.push("قانون H: این اعداد «پایه ارزیابی PHASE 7» هستند — نه ادعای کیفیت.");
  lines.push("برچسب‌ها ساختگی و مستقل بودند؛ کیفیت واقعی فقط با Outcome واقعی و Brier/کالیبراسیون در PHASE 7 سنجیده می‌شود.");

  const report = lines.join("\n");
  console.log(report);

  await Bun.write("/home/z/my-project/download/phase6-verification/p610-prediction-baseline.txt", report);
  console.log("\nگواهی در download/phase6-verification/p610-prediction-baseline.txt ذخیره شد.");
}

main().catch((err) => {
  console.error("خطای verify-p6-10:", err);
  process.exit(1);
});
