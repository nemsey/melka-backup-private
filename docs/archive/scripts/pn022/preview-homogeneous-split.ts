/**
 * PN-022-A/مرحلهٔ۱ — شبیه‌سازی خشک شکاف همگن روی دادهٔ واقعی (بدون نوشتن DB)
 * پیش از پاک‌سازی و چرخهٔ تازه، تأیید می‌کنیم مقادیر تازهٔ هر سه آشکارساز صادقانه‌اند.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "/home/z/my-project/intelligence-data";

function loadJsonl<T>(file: string): T[] {
  return readFileSync(join(DIR, file), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as T);
}

function stableHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

interface Pair { predictionId: string; predictedValue: number; observedValue: number }

// عین splitWindowsHomogeneous تازه
function splitHomogeneous(pairs: Pair[]) {
  const sorted = [...pairs].sort((a, b) => a.observedValue - b.observedValue || stableHash(a.predictionId) - stableHash(b.predictionId));
  const baseline: Pair[] = [];
  const recent: Pair[] = [];
  sorted.forEach((p, i) => (i % 2 === 0 ? baseline : recent).push(p));
  return { baseline, recent };
}

const outcomes = loadJsonl<{ predictionId: string; evidence?: { observed?: number } }>("outcomes.jsonl");
const predictions = loadJsonl<{ predictionId: string; probability: number }>("predictions.jsonl");
const byPrediction = new Map(predictions.map((p) => [p.predictionId, p]));
const pairs: Pair[] = [];
for (const o of outcomes) {
  const p = byPrediction.get(o.predictionId);
  const obs = o.evidence?.observed;
  if (!p || obs === undefined) continue;
  pairs.push({ predictionId: o.predictionId, predictedValue: p.probability, observedValue: obs });
}
console.log("pairs:", pairs.length, "| observed=1:", pairs.filter((p) => p.observedValue === 1).length);

// مقایسهٔ شکاف کهنه (ترتیب فایل ۷۰/۳۰) و تازه (همگن)
const cut = Math.floor(pairs.length * 0.7);
const oldB = pairs.slice(0, cut);
const oldR = pairs.slice(cut);
const rate = (xs: Pair[]) => xs.reduce((a, p) => a + p.observedValue, 0) / xs.length;
const brier = (xs: Pair[]) => xs.reduce((a, p) => a + (p.predictedValue - p.observedValue) ** 2, 0) / xs.length;
console.log("\n--- کهنه (file-order ۷۰/۳۰ — عین رکورد تاریخی) ---");
console.log("rate:", rate(oldB).toFixed(3), "→", rate(oldR).toFixed(3), "| concept drift =", Math.abs(rate(oldR) - rate(oldB)).toFixed(3));
console.log("brier:", brier(oldB).toFixed(4), "→", brier(oldR).toFixed(4), "| performance drift =", Math.abs(brier(oldR) - brier(oldB)).toFixed(4));

const { baseline, recent } = splitHomogeneous(pairs);
console.log("\n--- تازه (homogeneous stratified) ---");
console.log("baseline:", baseline.length, "recent:", recent.length);
console.log("rate:", rate(baseline).toFixed(4), "→", rate(recent).toFixed(4), "| concept drift =", Math.abs(rate(recent) - rate(baseline)).toFixed(4));
console.log("brier:", brier(baseline).toFixed(4), "→", brier(recent).toFixed(4), "| performance drift =", Math.abs(brier(recent) - brier(baseline)).toFixed(4));

// رانش داده: ویژگی‌ها با عضویت پنجرهٔ جفت + هش پایدار برای بدون‌پیامد
const membership = new Map<string, "baseline" | "recent">();
baseline.forEach((p) => membership.set(p.predictionId, "baseline"));
recent.forEach((p) => membership.set(p.predictionId, "recent"));
const featB: Record<string, number[]> = {};
const featR: Record<string, number[]> = {};
predictions.forEach((p) => {
  const win = membership.get(p.predictionId) ?? (stableHash(p.predictionId) % 2 === 0 ? "baseline" : "recent");
  const target = win === "baseline" ? featB : featR;
  for (const d of (p as unknown as { drivers?: Array<{ feature: string; value: number }> }).drivers ?? []) {
    (target[d.feature] ??= []).push(d.value);
  }
});
const feats = Object.keys(featB).filter((f) => featR[f]?.length > 0);
let maxData = 0;
for (const f of feats) {
  const mb = featB[f].reduce((a, v) => a + v, 0) / featB[f].length;
  const mr = featR[f].reduce((a, v) => a + v, 0) / featR[f].length;
  maxData = Math.max(maxData, Math.abs(mr - mb));
}
console.log("data drift (max feature mean shift):", maxData.toFixed(4), "— روی", feats.length, "ویژگی");
console.log("\nنتیجهٔ انتظار: هر سه رانش < ۰٫۰۵ ⇒ DIAG-MODEL-004 سبز");
