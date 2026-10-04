/**
 * P6546/BLOCK 0-ث — یافتن بافت استفادهٔ gap-api در باندل melketabriz.com
 */
import { writeFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Linux; Android 10) Chrome/124 Mobile Safari/537.36";

async function get(url: string, timeoutMs = 30000) {
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
  const root = await get("https://www.melketabriz.com/android", 40000);
  const chunks = [...new Set(root.body.match(/\/_next\/static\/chunks\/[a-zA-Z0-9_\-\/\.]+\.js/g) ?? [])];
  const contexts: string[] = [];
  for (const c of chunks) {
    const js = await get("https://www.melketabriz.com" + c);
    if (js.status !== 200) continue;
    let idx = js.body.indexOf("gap-api");
    while (idx !== -1 && contexts.length < 12) {
      contexts.push(js.body.slice(Math.max(0, idx - 350), idx + 350).replace(/\n/g, " "));
      idx = js.body.indexOf("gap-api", idx + 1);
    }
    // همچنین بافت postCreateContactChat
    let idx2 = js.body.indexOf("postCreateContactChat");
    while (idx2 !== -1 && contexts.length < 20) {
      contexts.push("CCC: " + js.body.slice(Math.max(0, idx2 - 400), idx2 + 250).replace(/\n/g, " "));
      idx2 = js.body.indexOf("postCreateContactChat", idx2 + 1);
    }
  }
  console.log("=== GAP-API USAGE CONTEXTS ===");
  contexts.forEach((c, i) => console.log(`\n[${i}]`, c));
  writeFileSync("/home/z/my-project/download/p6546/gap-usage-contexts.json", JSON.stringify({ at: new Date().toISOString(), contexts }, null, 2));
})();
