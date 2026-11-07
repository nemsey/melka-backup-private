// PN-035 · بنچمارک ظرفیت — سنجهٔ ۷ طرح (۱۰۰۰ رکورد < ۳۰ث؟)
// الف) سمت سرور: enqueue→claim(100)→complete چرخهٔ کامل روی test DB
// ب) سمت گوشی: ادغام دسته (jq -sc) + gzip + امضا روی ۱۰۰۰ نتیجهٔ شبیه‌سازی‌شده
import { execSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DB = "file:/home/z/my-project/db/test.db";
process.env.DATABASE_URL = DB;
process.env.MELK_TOKEN_KEY = "test-only-key-not-a-real-secret";

// ── الف) سرور: چرخهٔ صف ──
const { enqueueRelayRequest, claimRelayBatch, completeRelayRequest, createRelayDevice } = await import(
  "/home/z/my-project/src/lib/melk-api/relay"
);
const { db } = await import("/home/z/my-project/src/lib/db");

await db.relayQueue.deleteMany({ where: { fingerprint: { startsWith: "pn035-bench" } } });
const dev = await createRelayDevice("bench-dev", "pn035-bench");

const tEnq0 = Date.now();
const ids: string[] = [];
for (let i = 0; i < 100; i++) {
  const r = await enqueueRelayRequest({
    method: "GET",
    url: `https://arus-api.melketabriz.ir/api/apm/bench/${i}`,
    source: "pn035-bench",
    priority: 0,
  });
  ids.push(r.id);
}
const tEnqueue = Date.now() - tEnq0;

const tClaim0 = Date.now();
const batch = await claimRelayBatch(dev.deviceId, 100);
const tClaim = Date.now() - tClaim0;

const tComp0 = Date.now();
let completed = 0;
for (const it of batch) {
  const r = await completeRelayRequest({ id: it.id, deviceId: dev.deviceId, httpStatus: 200, body: '{"ok":true}' });
  if (r.ok) completed++;
}
const tComplete = Date.now() - tComp0;

await db.relayQueue.deleteMany({ where: { fingerprint: { startsWith: "pn035-bench" } } });
await db.relayDevice.deleteMany({ where: { deviceId: dev.deviceId } });

// ── ب) گوشی: ادغام + gzip + امضا روی ۱۰۰۰ نتیجه ──
const tmp = mkdtempSync(join(tmpdir(), "pn035-bench-"));
for (let i = 0; i < 1000; i++) {
  const b64 = Buffer.from(`{"data":"bench-row-${i}","value":${i}}`).toString("base64");
  writeFileSync(
    join(tmp, `${String(i + 1).padStart(4, "0")}.json`),
    JSON.stringify({ id: `bench-${i}`, httpStatus: 200, contentType: "application/json", bodyB64: b64 })
  );
}
const tMerge0 = Date.now();
const mergedFile = join(tmp, "merged.json");
execSync(`jq -sc '.' ${tmp}/[0-9]*.json > ${mergedFile}`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const merged = "";
const tMerge = Date.now() - tMerge0;

const tGz0 = Date.now();
const gzFile = join(tmp, "batch.json.gz");
execSync(`gzip -c < ${mergedFile} > ${gzFile}`, { maxBuffer: 64 * 1024 * 1024 });
const tGzip = Date.now() - tGz0;
const gzBytes = execSync(`stat -c %s ${gzFile}`).toString().trim();
const rawBytes = Number(execSync(`stat -c %s ${mergedFile}`).toString().trim());

const tSig0 = Date.now();
execSync(`sha256sum ${gzFile}`);
const tSig = Date.now() - tSig0;
rmSync(tmp, { recursive: true, force: true });

// ── نتیجه ──
const serverCycleMs = tEnqueue + tClaim + tComplete;
const perItemMs = serverCycleMs / 100;
const est1000Ms = perItemMs * 1000 + tMerge + tGzip + tSig;

const out = {
  at: new Date().toISOString(),
  pn: "PN-035",
  metric: "capacity-benchmark (سنجهٔ ۷)",
  server: {
    items: 100,
    enqueueMs: tEnqueue,
    claimBatch100Ms: tClaim,
    complete100Ms: tComplete,
    fullCycleMs: serverCycleMs,
    perItemMs: Math.round(perItemMs * 100) / 100,
    claimed: batch.length,
    completed,
  },
  phone: {
    items: 1000,
    jqMergeMs: tMerge,
    gzipMs: tGzip,
    sha256Ms: tSig,
    rawBytes,
    gzBytes: Number(gzBytes),
    compressionRatio: Math.round((Number(gzBytes) / rawBytes) * 100) / 100,
  },
  estimate1000Records: {
    serverMs: Math.round(perItemMs * 1000),
    phonePipelineMs: tMerge + tGzip + tSig,
    totalMs: Math.round(est1000Ms),
    under30s: est1000Ms < 30_000,
    note: "۱۰۰۰ رکورد = ۱۰ دستهٔ ۱۰۰تایی (poll+result)؛ زمان برآوردی هر دسته از سنجهٔ سرور × ۱۰ + خط لولهٔ گوشی",
  },
  verdict: est1000Ms < 30_000 ? "PASS" : "FAIL",
};
writeFileSync("/home/z/my-project/download/pn035/capacity-benchmark.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
process.exit(0);
