/**
 * DIR-CHANGES-TILE-002 — گام ۱ب: تحلیل باندل رسمی arm.melketabriz.ir
 * استخراج همهٔ مسیرهای API مرتبط با properties/requests/users/delete/history
 */
import fs from "fs";
import path from "path";

const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function main() {
  const out: Record<string, unknown> = {};
  const root = await fetchText("https://arm.melketabriz.ir/");
  out["root-length"] = root.length;
  // استخراج چانک‌های JS
  const chunks = Array.from(new Set(root.match(/\/_next\/static\/chunks\/[^"'\\\s)]+\.js/g) ?? []));
  out["chunk-count-root"] = chunks.length;
  console.log(`[root] ${root.length} chars, ${chunks.length} chunks`);

  // فetch buildManifest برای همهٔ مسیرها
  const buildId = root.match(/"buildId":"([^"]+)"/)?.[1] ?? root.match(/\/_next\/static\/([^/]+)\/_buildManifest/)?.[1];
  out["buildId"] = buildId ?? null;
  console.log("[buildId]", buildId);

  let allJs = "";
  const urls = new Set<string>(chunks.map((c) => `https://arm.melketabriz.ir${c}`));
  if (buildId) {
    urls.add(`https://arm.melketabriz.ir/_next/static/${buildId}/_buildManifest.js`);
  }
  let i = 0;
  for (const u of urls) {
    try {
      const t = await fetchText(u);
      allJs += `\n/* ==== ${u} */\n` + t;
      i++;
    } catch (e) {
      /* skip */
    }
  }
  out["fetched-chunks"] = i;
  out["js-total-chars"] = allJs.length;
  console.log(`[chunks] fetched ${i}, total ${allJs.length} chars`);

  // استخراج همهٔ مسیرهای API (الگوی رشته‌ای داخل باندل)
  const apiPaths = new Set<string>();
  // الگو ۱: "properties/xxx" به‌عنوان رشتهٔ literal
  for (const m of allJs.matchAll(/["'`]((?:properties|requests|users|request-events|request-event-types|visits|special-properties|businesses|forms)\/[A-Za-z0-9_\-/${}.:]+)["'`]/g)) {
    apiPaths.add(m[1]);
  }
  // الگو ۲: addToURL داینامیک — N("properties",{addToURL:["list"]}) → ثبت پایه
  for (const m of allJs.matchAll(/["'`](properties|requests|users|request-events|visits|special-properties)["'`]/g)) {
    apiPaths.add(m[1]);
  }
  const sorted = Array.from(apiPaths).sort();
  out["api-paths"] = sorted;
  console.log(`[api-paths] ${sorted.length}`);
  for (const p of sorted) console.log("  ", p);

  // delete-related contexts
  const delCtx: string[] = [];
  for (const m of allJs.matchAll(/.{120}(?:delete|remove|Delete|Remove).{160}/g)) {
    const s = m[0];
    if (/(properties|requests|users|request-events|visits|special)/.test(s)) delCtx.push(s);
  }
  out["delete-contexts"] = delCtx.slice(0, 40);
  console.log(`[delete-contexts] ${delCtx.length}`);

  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "arm-bundle-paths.json"), JSON.stringify(out, null, 2), "utf8");
  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "arm-bundle.js"), allJs, "utf8");
  console.log("SAVED");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
