/**
 * P6546/BLOCK 0-پ — کاوش متمرکز:
 * ۱) همهٔ مسیرهای apu از باندل melketabriz.com
 * ۲) پروب زندهٔ gap-api.melketabriz.ir (الگوی NestJS ملک تبریز)
 * ۳) جست‌وجوی کد ملک در HTML سامانهٔ عمومی
 */
import { writeFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36";

async function get(url: string, timeoutMs = 25000, init?: RequestInit): Promise<{ status: number; ct: string; body: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", ...init, headers: { "User-Agent": UA, Accept: "*/*", ...(init?.headers ?? {}) } });
    return { status: res.status, ct: res.headers.get("content-type") ?? "", body: await res.text() };
  } catch (e: any) {
    return { status: 0, ct: "", body: String(e?.message ?? e) };
  } finally {
    clearTimeout(t);
  }
}
const uniq = (a: string[]) => [...new Set(a)];

(async () => {
  const OUT: any = { probeAt: new Date().toISOString() };

  // ===== ۱) melketabriz.com — همهٔ chunkها + مسیرهای apu =====
  const root = await get("https://www.melketabriz.com/android", 40000);
  console.log("android page:", root.status, "len:", root.body.length);
  const allChunks = uniq(root.body.match(/\/_next\/static\/chunks\/[a-zA-Z0-9_\-\/\.]+\.js/g) ?? []);
  console.log("total chunks:", allChunks.length);
  const apuPaths = new Set<string>();
  const allApiLiterals = new Set<string>();
  for (const c of allChunks) {
    const js = await get("https://www.melketabriz.com" + c, 30000);
    if (js.status !== 200 || !js.body) continue;
    for (const m of js.body.matchAll(/["'`]((?:\/?api\/)?apu\/[a-zA-Z0-9_\-\/{}\.]{2,90})["'`]/g)) apuPaths.add(m[1]);
    for (const m of js.body.matchAll(/["'`](apu[a-zA-Z0-9_\-\/{}\.]{2,90})["'`]/g)) apuPaths.add(m[1]);
    for (const m of js.body.matchAll(/["'`](properties\/[a-zA-Z0-9_\-\/{}\.]{2,60})["'`]/g)) allApiLiterals.add(m[1]);
    for (const m of js.body.matchAll(/["'`](realtors?\/[a-zA-Z0-9_\-\/{}\.]{2,60})["'`]/g)) allApiLiterals.add(m[1]);
    for (const m of js.body.matchAll(/["'`](authentication[a-zA-Z0-9_\-\/{}\.]{0,60})["'`]/g)) allApiLiterals.add(m[1]);
  }
  OUT.melkPublic = { apuPaths: uniq([...apuPaths]), otherApiLiterals: uniq([...allApiLiterals]) };
  console.log("APU paths:", OUT.melkPublic.apuPaths);
  console.log("other literals:", OUT.melkPublic.otherApiLiterals.slice(0, 40));

  // کد ملک در HTML خود صفحه (دادهٔ inline)
  const codeRe = /(?:کد\s*(?:ملک|آگهی)|property\s*code|fileCode)[^0-9]{0,15}([0-9]{3,8})/g;
  const codes = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(root.body))) codes.add(m[1]);
  OUT.melkPublic.inlineCodesSample = [...codes].slice(0, 40);
  console.log("inline property codes sample:", OUT.melkPublic.inlineCodesSample);

  // ===== ۲) gap-api پروب زنده =====
  const gapBase = "https://gap-api.melketabriz.ir/api/";
  OUT.gapProbes = {};
  for (const p of ["", "public/portalInfo", "statics/enums-persian", "authentication/otp/12345", "docs", "swagger.json"]) {
    const r = await get(gapBase + p, 12000);
    OUT.gapProbes[p || "(root)"] = { status: r.status, ct: r.ct.slice(0, 50), head: r.body.slice(0, 300) };
    console.log("gap-api", p || "(root)", "→", r.status, r.ct.slice(0, 40), r.body.slice(0, 150).replace(/\n/g, " "));
  }

  // ===== ۳) arus-api /api/apu/ پروب =====
  const apuBase = "https://arus-api.melketabriz.ir/api/apu/";
  OUT.apuProbes = {};
  for (const p of ["realtors/info/by-code/12345", "statics/enums-persian", "properties/list?page=1&limit=5", "configs/current-prices/list"]) {
    const r = await get(apuBase + p, 15000);
    OUT.apuProbes[p] = { status: r.status, ct: r.ct.slice(0, 50), head: r.body.slice(0, 400) };
    console.log("apu", p, "→", r.status, r.ct.slice(0, 40), r.body.slice(0, 200).replace(/\n/g, " "));
  }

  writeFileSync("/home/z/my-project/download/p6546/systems-discovery-focus.json", JSON.stringify(OUT, null, 2));
  console.log("\nsaved → download/p6546/systems-discovery-focus.json");
})();
