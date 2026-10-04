/**
 * P6546/BLOCK 0-ج — تحلیل همهٔ ۲۲ چانک واقعی GAP از مرورگر زنده
 */
import { writeFileSync } from "node:fs";

const CHUNKS = [
  "1524f60996f4fb86", "4738479eb33af51c", "c9dd956cd07257d3", "b792853841e8e310",
  "afe65815de2cd7a2", "ff1a16fafef87110", "d2be314c3ece3fbe", "291b1d7e34b77edd",
  "a6dad97d9634a72d", "dde35481c96acf95", "4442f04af37870b7", "2d6d3ebbe7468df5",
  "a69d9d5d1b4bffe6", "f76a1eaa47f3c45b", "1add363ac69d97ad", "2db66dd189826c90",
  "74c927d95139401a", "5e2e2a9c0bd13a0c", "2f86b555f7f67ba0", "ff5bea455944e65d",
  "32e10c48fb13fe0c", "8da835781d923426",
];

const UA = "Mozilla/5.0 (Linux; Android 10) Chrome/124 Mobile Safari/537.36";

async function get(url: string, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", headers: { "User-Agent": UA } });
    return { status: res.status, body: await res.text() };
  } catch (e: any) {
    return { status: 0, body: String(e?.message ?? e) };
  } finally {
    clearTimeout(t);
  }
}

(async () => {
  const apiPaths = new Set<string>();
  const baseUrls = new Set<string>();
  const socketHints = new Set<string>();
  const contexts: string[] = [];
  for (const c of CHUNKS) {
    const r = await get(`https://gap.melketabriz.ir/_next/static/chunks/${c}.js`);
    if (r.status !== 200) { console.log(c, "→", r.status); continue; }
    const js = r.body;
    console.log(c, "bytes:", js.length);
    for (const m of js.matchAll(/["'`](\/?(?:api|auth|v1|v2)\/[a-zA-Z0-9_\-\/{}\.:\$]{2,90})["'`]/g)) apiPaths.add(m[1]);
    for (const m of js.matchAll(/["'`]((?:authentication|otp|login|logout|refresh-token|register|send-?code|verify)[a-zA-Z0-9_\-\/{}\.]{0,60})["'`]/g)) apiPaths.add(m[1]);
    for (const m of js.matchAll(/["'`](https?:\/\/[a-zA-Z0-9\-\.]+melketabriz\.ir[a-zA-Z0-9_\-\/\.]*)["'`]/g)) baseUrls.add(m[1]);
    for (const m of js.matchAll(/["'`](socket\.io[a-zA-Z0-9_\-\/\?=]{0,60})["'`]/g)) socketHints.add(m[1]);
    // بافت url: در fetch/axios
    for (const m of js.matchAll(/url:\s*[\"'`]([^\"'`]{3,90})[\"'`]/g)) contexts.push(m[1]);
  }
  console.log("\n=== API PATHS ==="); [...apiPaths].slice(0, 60).forEach((a) => console.log(" ", a));
  console.log("\n=== BASE URLS ==="); [...baseUrls].forEach((a) => console.log(" ", a));
  console.log("\n=== SOCKET ==="); [...socketHints].forEach((a) => console.log(" ", a));
  console.log("\n=== url: literals ==="); [...new Set(contexts)].slice(0, 40).forEach((a) => console.log(" ", a));
  writeFileSync("/home/z/my-project/download/p6546/gap-chunk-analysis.json", JSON.stringify({ at: new Date().toISOString(), apiPaths: [...apiPaths], baseUrls: [...baseUrls], urlLiterals: [...new Set(contexts)] }, null, 2));
})();
