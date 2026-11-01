#!/usr/bin/env bun
/** PN-008 ثانیاً-۲ — کشف کامل باندل SPA سامانه PM: همهٔ چانک‌ها + همهٔ مسیرهای API (بدون پیش‌فرض) */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const js = readFileSync("/tmp/pm-bundle.js", "utf-8");
const chunks = [...new Set([...js.matchAll(/assets\/[a-zA-Z0-9._\-]+\.js/g)].map((m) => m[0]))];
console.log("chunks found:", chunks.length);

const paths = new Set<string>();
let downloaded = 0, okCount = 0;
const t0 = Date.now();

// دانلود موازی ۶تایی (سرور PM کُند است)
const queue = [...chunks];
async function worker() {
  while (queue.length > 0) {
    const c = queue.shift()!;
    try {
      const r = await fetch("https://pm.melketabriz.ir/" + c, { signal: AbortSignal.timeout(75000) });
      if (r.ok) {
        const t = await r.text();
        downloaded += t.length; okCount += 1;
        for (const m of t.matchAll(/["'`]([a-zA-Z][a-zA-Z0-9\-]*(?:\/[a-zA-Z0-9\-\/{}:._]+)+)["'`]/g)) paths.add(m[1]);
      }
    } catch { /* چانک بعدی */ }
  }
}
await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);

const all = [...paths].filter((p) => !/\.(png|jpg|svg|css|woff|ico|webp|map|html)$/.test(p)).sort();
// مسیرهای مرتبط به داده (غیر از asset/داخلی) — معیار: شامل یک سگمنت شناخته‌شدهٔ داده
const relevant = all.filter((p) =>
  /^(authentication|realtors|realtor-reports|real-estates|properties|requests|dashboard|count|statics|public|users|contracts|documents|businesses|apm|special-properties|settings|profile|roles|permissions|reports|financial|image|file|sms|otp|me|auth)\b/.test(p) ||
  /(\/list|\/info|\/count|\/report|\/create|\/update|\/delete|\/edit|\/add|\/export|\/upload)/.test(p)
);
const out = { at: new Date().toISOString(), mainBundleChunks: chunks.length, chunksDownloaded: okCount, downloadedMB: +(downloaded / 1048576).toFixed(1), allPathCount: all.length, relevantEndpoints: relevant, durationS: +((Date.now() - t0) / 1000).toFixed(0) };
writeFileSync("/home/z/my-project/download/pn008/pm-bundle-endpoints.json", JSON.stringify(out, null, 2));
writeFileSync("/tmp/pm-all-paths.json", JSON.stringify(all, null, 1));
console.log(JSON.stringify({ chunks: chunks.length, ok: okCount, MB: out.downloadedMB, paths: all.length, relevant: relevant.length, durS: out.durationS }, null, 1));
console.log(relevant.slice(0, 90).join("\n"));
