/**
 * PN-017 — آزمون قانون فایل v3: همهٔ لینک‌های تحویل باید ۲۰۰ باشند
 * (محلی + مسیر سرو /deliver — عهد عدم-شکست تاریخی نیز وارسی می‌شود)
 * PN-018: export {} — ماژول‌سازی (فایل global-script با mainِ runtime/worker.ts تضاد TS2393 داشت؛
 * link-test پس از CI آخرین PN-017 ساخته شده بود و تضاد در CI نخستِ پس از آن آشکار شد)
 */
export {};

const BASE = "http://localhost:3000";

const pn017Links = [
  "/deliver/pn017/PN-017-FINAL-REPORT.md",
  "/deliver/pn017/lock-form.json",
  "/deliver/pn017/systems-audit.json",
  "/deliver/pn017/e2e.json",
  "/deliver/pn017/screens/01-mtb-section.png",
  "/deliver/pn017/screens/02-mtb-pm-directory.png",
  "/deliver/pn017/screens/03-mtb-promote-prefilled.png",
  "/deliver/pn017/screens/04-mtb-sync-tab.png",
  "/deliver/pn017/screens/05-access-melka-section.png",
  "/deliver/pn017/screens/06-mtb-user-detail-matrix.png",
  "/deliver/pn017/screens/07-settings-full.png",
  "/deliver/pn017-ALL.zip",
  "/deliver/pn017-REJOIN.txt",
  "/deliver/pn017-SHA256SUMS.txt",
  ...Array.from({ length: 10 }, (_, i) => `/deliver/pn017-survival-part${String(i).padStart(2, "0")}.bin`),
];

/** عهد عدم-شکست: نمونه‌ای از لینک‌های تاریخی جلسات پیشین (مسیرهای واقعی موجود) */
const historicalLinks = [
  "/deliver/pn016/e2e.json",
  "/deliver/pn016/deliver-links.json",
  "/deliver/PN-015-FINAL-REPORT.md",
  "/deliver/PN-015-ALL.zip",
  "/deliver/PN-015-survival-part00.bin",
  "/deliver/PN-012-ALL.zip",
];

async function check(path: string): Promise<{ path: string; status: number; bytes: number }> {
  const res = await fetch(BASE + path, { method: "GET" });
  const buf = await res.arrayBuffer();
  return { path, status: res.status, bytes: buf.byteLength };
}

async function main() {
  const results: Array<{ path: string; status: number; bytes: number }> = [];
  for (const link of [...pn017Links, ...historicalLinks]) {
    results.push(await check(link));
  }
  const failed = results.filter((r) => r.status !== 200 || r.bytes === 0);
  const summary = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    ok: results.length - failed.length,
    failed: failed.map((f) => f.path),
    pn017Links: results.slice(0, pn017Links.length),
    historicalNoBreak: results.slice(pn017Links.length),
    verdict: failed.length === 0 ? "PASS — همه ۲۰۰" : `FAIL — ${failed.length} لینک شکسته`,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failed.length > 0) process.exit(1);
}

void main();
