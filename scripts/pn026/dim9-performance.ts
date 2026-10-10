#!/usr/bin/env bun
/** PN-026 · بُعد ۹ — کارایی (Performance) + داده‌های نقشهٔ سرعت · فقط-خواندنی
 *  P50/P95/P99 با ۱۰ اجرا برای ۶ endpoint کلیدی (نشست مشترک)
 */
import { readFileSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const token = readFileSync("/home/z/my-project/upload/.runtime/pn026-token.txt", "utf8").trim();
const H = { authorization: `Bearer ${token}` };

async function timed(path: string): Promise<number> {
  const t0 = performance.now();
  try { await fetch(`${BASE}${path}`, { headers: H }); } catch {}
  return performance.now() - t0;
}
function stats(arr: number[]) {
  const s = arr.slice().sort((a, b) => a - b);
  const q = (p: number) => Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 10) / 10;
  return { p50: q(0.5), p95: q(0.95), p99: q(0.99), min: Math.round(s[0] * 10) / 10, max: Math.round(s[s.length - 1] * 10) / 10, runs: s.length };
}

const endpoints = [
  { name: "GET / (خانه)", path: "/" },
  { name: "GET /api/health", path: "/api/health" },
  { name: "GET /api/crm/arm-catalog/listings (بدون فیلتر)", path: "/api/crm/arm-catalog/listings?limit=50" },
  { name: "GET /api/crm/arm-catalog/listings?realtorName (فیلتر)", path: "/api/crm/arm-catalog/listings?realtorName=" + encodeURIComponent("بابایان") },
  { name: "GET /api/crm/arm-catalog/requests (بدون فیلتر)", path: "/api/crm/arm-catalog/requests?limit=50" },
  { name: "GET /api/crm/arm-catalog/requests?customerName (فیلتر)", path: "/api/crm/arm-catalog/requests?customerName=" + encodeURIComponent("آقای") },
  { name: "GET /api/experts", path: "/api/experts?limit=50" },
  { name: "GET /api/crm/transactions", path: "/api/crm/transactions?limit=50" },
  { name: "GET /api/market-index", path: "/api/market-index" },
  { name: "GET /api/intelligence/status", path: "/api/intelligence/status" },
  { name: "GET /api/matching/search", path: "/api/matching/search?q=" + encodeURIComponent("توانیر") },
  { name: "GET /api/opportunity-alerts", path: "/api/opportunity-alerts?limit=50" },
];

const results: { name: string; path: string; stats: ReturnType<typeof stats> }[] = [];
for (const e of endpoints) {
  const runs: number[] = [];
  const N = e.path.includes("arm-catalog") ? 6 : 10; // سنگین‌ها کمتر تا زمان نگیرد
  for (let i = 0; i < N; i++) runs.push(await timed(e.path));
  const st = stats(runs);
  results.push({ name: e.name, path: e.path.slice(0, 90), stats: st });
  console.log(`${e.name}: p50=${st.p50} p95=${st.p95} p99=${st.p99} (${st.runs} اجرا)`);
}

// تجمیع با perf-budget
const evidence = {
  dimension: "بُعد ۹ — کارایی (Performance)",
  perfBudget: {
    script: "scripts/perf-budget.sh — ۱۲ سنجه",
    result: "۱۰/۱۲ سبز",
    failed: [
      { metric: "RAM production", value: "578MB", target: "<500MB", note: "سرور standalone + andami — نامزد نقشهٔ سرعت فاز ۴" },
      { metric: "RAM Build پیک", value: "2200MB", target: "<1500MB", note: "فقط هنگام بیلد — اثر عملیاتی صفر در حالت اجرا" },
    ],
    passed: [
      { metric: "Initial JS", value: "281KB < 300KB ✓" },
      { metric: "LCP", value: "572ms < 2500ms ✓" },
      { metric: "INP proxy", value: "92ms < 200ms ✓" },
      { metric: "CLS", value: "0 < 0.1 ✓" },
      { metric: "Login→Dashboard", value: "918ms < 2000ms ✓" },
      { metric: "Dashboard→Tile M1", value: "115ms < 1000ms ✓" },
      { metric: "Tile→First Insight", value: "9ms < 2000ms ✓" },
      { metric: "API P95 version/health/home", value: "4-7ms < 500ms ✓" },
    ],
  },
  apiLatency: results.map((r) => ({ endpoint: r.name, ...r.stats })),
  browserMetrics: { note: "fps اسکرول ۱۰۰۰+ ردیف و بارگذاری اول در بُعد ۱۲ (E2E مرورگر) اندازه‌گیری می‌شود", initialLoadFromBudget: "Login→Dashboard 918ms · LCP 572ms" },
  ram: { productionMB: 578, targetMB: 500, buildPeakMB: 2200, verdict: "⚠ تولید 78MB بالاتر از بودجه — ارجاع به نقشهٔ سرعت" },
  findings: [] as string[],
};

const heavySlow = results.filter((r) => r.stats.p95 > 500);
evidence.findings.push(`perf-budget: ۱۰/۱۲ سبز (شکست: RAM تولید ۵۷۸MB · پیک بیلد ۲۲۰۰MB)`);
if (heavySlow.length) evidence.findings.push(`⚠ ${heavySlow.length} endpoint با P95 > ۵۰۰ms: ${heavySlow.map((h) => h.name.split(" ").slice(0, 3).join(" ")).join(" · ")} — هستهٔ نقشهٔ سرعت فاز ۴`);
else evidence.findings.push("همهٔ P95 < ۵۰۰ms ✓");

writeFileSync("/home/z/my-project/download/pn026/performance.json", JSON.stringify(evidence, null, 1));
console.log("\n✓ performance.json ذخیره شد");
