/**
 * P6546/BLOCK 0-ب — کاوش عمیق باندل‌های gap و www.melketabriz.com
 * استخراج مسیرهای API از chunkهای JS
 */
import { writeFileSync, readFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36";

async function get(url: string, timeoutMs = 30000): Promise<{ status: number; ct: string; body: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", headers: { "User-Agent": UA, Accept: "*/*" } });
    return { status: res.status, ct: res.headers.get("content-type") ?? "", body: await res.text() };
  } catch (e: any) {
    return { status: 0, ct: "", body: String(e?.message ?? e) };
  } finally {
    clearTimeout(t);
  }
}

function uniq(arr: string[]): string[] {
  return [...new Set(arr)];
}

(async () => {
  const OUT: any = { probeAt: new Date().toISOString(), gap: {}, melkPublic: {} };

  // ============ GAP: استخراج همهٔ chunkها از HTML کامل ============
  const gapRoot = await get("https://gap.melketabriz.ir");
  OUT.gap.rootStatus = gapRoot.status;
  OUT.gap.rootLength = gapRoot.body.length;
  // همهٔ ارجاع‌های استاتیک
  const chunkRe = /\/_next\/static\/[a-zA-Z0-9_\-\/\.]+\.js/g;
  const chunks = uniq(gapRoot.body.match(chunkRe) ?? []).slice(0, 40);
  OUT.gap.chunks = chunks;
  console.log("GAP chunks:", chunks.length, chunks.slice(0, 10));

  const apiPaths = new Set<string>();
  const baseUrls = new Set<string>();
  for (const c of chunks.slice(0, 25)) {
    const js = await get("https://gap.melketabriz.ir" + c);
    if (js.status !== 200 || !js.body) continue;
    // مسیرهای fetch/axios
    for (const m of js.body.matchAll(/["'`](\/?(?:api|v\d|graphql|auth|authentication|sessions?|users?|chats?|messages?|conversations?|tickets?)\/[a-zA-Z0-9_\-\/{}\.:\$]{1,80})["'`]/g)) apiPaths.add(m[1]);
    for (const m of js.body.matchAll(/["'`](https?:\/\/[a-zA-Z0-9\-\.]*melketabriz\.ir[a-zA-Z0-9_\-\/\.]*)["'`]/g)) baseUrls.add(m[1]);
    // الگوی NestJS: ee("...") یا addToURL
    for (const m of js.body.matchAll(/["'`](authentication[a-zA-Z0-9_\-\/{}\.]{0,60})["'`]/g)) apiPaths.add(m[1]);
  }
  OUT.gap.apiPaths = uniq([...apiPaths]).slice(0, 120);
  OUT.gap.baseUrls = uniq([...baseUrls]).slice(0, 30);
  console.log("GAP apiPaths:", OUT.gap.apiPaths.slice(0, 40));
  console.log("GAP baseUrls:", OUT.gap.baseUrls);

  // ============ MELK PUBLIC: صفحهٔ /android ============
  const mpRoot = await get("https://www.melketabriz.com/android");
  OUT.melkPublic.androidStatus = mpRoot.status;
  OUT.melkPublic.androidLength = mpRoot.body.length;
  OUT.melkPublic.androidHead = mpRoot.body.slice(0, 1200);
  const mpChunks = uniq([...(mpRoot.body.match(/\/_next\/static\/[a-zA-Z0-9_\-\/\.]+\.js/g) ?? []), ...(mpRoot.body.match(/(?:src|href)=["']([^"']+\.js)["']/g) ?? []).map((s) => s.replace(/^(?:src|href)=["']|["']$/g, ""))]).slice(0, 40);
  OUT.melkPublic.chunks = mpChunks;
  console.log("\nMELK /android status:", mpRoot.status, "len:", mpRoot.body.length);
  console.log("MELK head:", mpRoot.body.slice(0, 500).replace(/\n/g, " "));
  console.log("MELK chunks:", mpChunks.slice(0, 10));

  const mpApi = new Set<string>();
  const mpBase = new Set<string>();
  for (const c of mpChunks.slice(0, 25)) {
    const url = c.startsWith("http") ? c : "https://www.melketabriz.com" + (c.startsWith("/") ? "" : "/") + c;
    const js = await get(url);
    if (js.status !== 200 || !js.body) continue;
    for (const m of js.body.matchAll(/["'`](\/?(?:api|v\d|graphql|properties?|posts?|listings?|search|melks?)[a-zA-Z0-9_\-\/{}\.:\$]{0,80})["'`]/g)) mpApi.add(m[1]);
    for (const m of js.body.matchAll(/["'`](https?:\/\/[a-zA-Z0-9\-\.]*(?:melketabriz|arus)[a-zA-Z0-9\-\.]*\/[a-zA-Z0-9_\-\/\.]*)["'`]/g)) mpBase.add(m[1]);
  }
  OUT.melkPublic.apiPaths = uniq([...mpApi]).slice(0, 120);
  OUT.melkPublic.baseUrls = uniq([...mpBase]).slice(0, 30);
  console.log("MELK apiPaths:", OUT.melkPublic.apiPaths.slice(0, 40));
  console.log("MELK baseUrls:", OUT.melkPublic.baseUrls);

  // پروب مسیرهای عمومی پرکاربرد سامانهٔ عمومی
  for (const p of ["/api/properties", "/api/properties/list", "/api/posts", "/api/v1/properties", "/api/search", "/api/property/list"]) {
    const r = await get("https://www.melketabriz.com" + p, 12000);
    OUT.melkPublic["probe:" + p] = { status: r.status, ct: r.ct.slice(0, 40), head: r.body.slice(0, 200) };
    console.log("probe", p, "→", r.status, r.ct.slice(0, 30), r.body.slice(0, 100).replace(/\n/g, " "));
  }

  writeFileSync("/home/z/my-project/download/p6546/systems-discovery-deep.json", JSON.stringify(OUT, null, 2));
  console.log("\nsaved → download/p6546/systems-discovery-deep.json");
})();
