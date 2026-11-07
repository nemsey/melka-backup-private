/**
 * P6545 / BLOCK 0.2 — تحلیل کالیبراسیون سطل ۰٫۴-۰٫۶ روی دادهٔ واقعی ۳۸۴ پیامد
 * تصمیم ۱ شورا: تأیید recalibrate با قید نظارتی (۱۵ پیامد تازه در همان ناحیه)
 */
import { readFileSync } from "node:fs";

type P = { predictionId: string; probability: number; payload?: { transactionProbability?: number } };
type O = { predictionId: string; evidence?: { observed?: number } };

const preds: P[] = readFileSync("/home/z/my-project/intelligence-data/predictions.jsonl", "utf8")
  .trim().split("\n").map((l) => JSON.parse(l));
const outs: O[] = readFileSync("/home/z/my-project/intelligence-data/outcomes.jsonl", "utf8")
  .trim().split("\n").map((l) => JSON.parse(l));
const outMap = new Map(outs.map((o) => [o.predictionId, o.evidence?.observed ?? 0]));

const pairs = preds.map((p) => ({ p: p.payload?.transactionProbability ?? p.probability, y: outMap.get(p.predictionId) ?? 0 }));
console.log("total pairs:", pairs.length);

// توزیع سطل‌ها
const buckets = [[0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.01]] as const;
for (const [lo, hi] of buckets) {
  const inB = pairs.filter((x) => x.p >= lo && x.p < hi);
  const obs = inB.length ? inB.reduce((s, x) => s + x.y, 0) / inB.length : 0;
  console.log(`bucket ${lo}-${hi}: n=${inB.length}, predAvg=${(inB.reduce((s, x) => s + x.p, 0) / (inB.length || 1)).toFixed(4)}, obsAvg=${obs.toFixed(4)}`);
}

// مقادیر یکتای احتمال در سطل ۰٫۴-۰٫۶
const uniq = new Map<number, { n: number; pos: number }>();
for (const x of pairs) {
  const k = Math.round(x.p * 10000) / 10000;
  const e = uniq.get(k) ?? { n: 0, pos: 0 };
  e.n++; e.pos += x.y;
  uniq.set(k, e);
}
console.log("\nunique probabilities:", [...uniq.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}(n=${v.n},+${v.pos})`).join(" | "));

// holdout: نیمهٔ اول fit (کالیبراسیون) → نیمهٔ دوم verify — قید نظارتی تصمیم ۱
const mid = Math.floor(pairs.length / 2);
const fitSet = pairs.slice(0, mid);
const verifySet = pairs.slice(mid);
const inBucket = (arr: typeof pairs, lo = 0.4, hi = 0.6) => arr.filter((x) => x.p >= lo && x.p < hi);
console.log(`\nfitSet: n=${fitSet.length}, bucket0.4-0.6: n=${inBucket(fitSet).length}`);
console.log(`verifySet: n=${verifySet.length}, bucket0.4-0.6: n=${inBucket(verifySet).length}`);

const brier = (arr: typeof pairs, map?: (p: number) => number) =>
  arr.reduce((s, x) => s + (map ? map(x.p) : x.p) - x.y ** 2, 0) / arr.length;

const fitBucketObs = inBucket(fitSet).reduce((s, x) => s + x.y, 0) / (inBucket(fitSet).length || 1);
const fitB024Obs = fitSet.filter((x) => x.p < 0.4).reduce((s, x) => s + x.y, 0) / (fitSet.filter((x) => x.p < 0.4).length || 1);
console.log(`\nfit: bucket0.4-0.6 observedRate=${fitBucketObs.toFixed(4)} | bucket<0.4 observedRate=${fitB024Obs.toFixed(4)}`);

// کالیبراتور: نگاشت احتمال به نرخ مشاهده‌شدهٔ همان ناحیه (از fit فقط)
const cal = (p: number) => (p >= 0.4 && p < 0.6 ? fitBucketObs : p < 0.4 ? fitB024Obs : p);

const beforeVerify = brier(verifySet);
const afterVerify = brier(verifySet, cal);
console.log(`\nVERIFY (holdout n=${verifySet.length}): Brier before=${beforeVerify.toFixed(4)} after=${afterVerify.toFixed(4)} (${afterVerify <= beforeVerify ? "بهبود ✓" : "بدتر ✗"})`);
const beforeAll = brier(pairs);
const afterAll = brier(pairs, cal);
console.log(`ALL (n=${pairs.length}): Brier before=${beforeAll.toFixed(4)} after=${afterAll.toFixed(4)}`);
const vB = inBucket(verifySet);
console.log(`holdout bucket0.4-0.6: n=${vB.length} → پیامد تازه در ناحیه (پاسخ قید نظارتی)`);
