/**
 * P6546/BLOCK 0-ت — شکل کامل رکورد apu/properties + کشف مسیرهای gap-api
 */
import { writeFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36";

async function get(url: string, timeoutMs = 30000, init?: RequestInit) {
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

(async () => {
  const OUT: any = { probeAt: new Date().toISOString() };

  // ===== ۱) apu/properties/list — شکل کامل =====
  const r1 = await get("https://arus-api.melketabriz.ir/api/apu/properties/list?page=1&limit=2");
  if (r1.status === 200) {
    try {
      const j = JSON.parse(r1.body);
      OUT.apuListEnvelope = { statusCode: j.statusCode, topKeys: Object.keys(j), dataKeys: Object.keys(j.data ?? {}) };
      OUT.apuListMeta = { count: j.data?.count, totalPages: j.data?.totalPages, page: j.data?.page, limit: j.data?.limit };
      OUT.apuFirstRecord = j.data?.list?.[0];
      console.log("apu list meta:", JSON.stringify(OUT.apuListMeta));
      console.log("first record keys:", Object.keys(OUT.apuFirstRecord ?? {}));
      console.log("first record:", JSON.stringify(OUT.apuFirstRecord).slice(0, 1500));
    } catch (e: any) {
      console.log("parse err", e.message);
    }
  }

  // ===== ۲) apu جزئیات/کد =====
  for (const p of [
    "properties/info/by-code/58398",
    "properties/details/635945ee6975593b2e7c071b",
    "requests/list?page=1&limit=2",
  ]) {
    const r = await get("https://arus-api.melketabriz.ir/api/apu/" + p, 20000);
    OUT["apu:" + p] = { status: r.status, head: r.body.slice(0, 500) };
    console.log("\napu", p, "→", r.status, r.body.slice(0, 300).replace(/\n/g, " "));
  }

  // ===== ۳) gap-api — الگوهای Express =====
  const gapPaths = [
    "api/v1",
    "api/v1/",
    "api/health",
    "api/auth",
    "api/auth/login",
    "api/authentication/otp/login",
    "api/v1/auth/otp",
    "api/chats",
    "api/v1/chats",
    "api/rooms",
    "api/messages",
    "api-docs",
    "api/swagger",
    "api/v1/api-service/subscribe",
  ];
  for (const p of gapPaths) {
    const r = await get("https://gap-api.melketabriz.ir/" + p, 12000);
    OUT["gap:" + p] = { status: r.status, ct: r.ct.slice(0, 40), head: r.body.slice(0, 200) };
    console.log("gap", p, "→", r.status, r.ct.slice(0, 30), r.body.slice(0, 120).replace(/\n/g, " "));
  }

  // ===== ۴) gap.melketabriz.ir ریشهٔ SPA — مسیرهای اپ (لینک‌های داخلی) =====
  const gapRoot = await get("https://gap.melketabriz.ir", 20000);
  const hrefs = [...new Set(gapRoot.body.match(/href="\/[a-zA-Z0-9_\-\/]{1,40}"/g) ?? [])].slice(0, 20);
  OUT.gapRootHrefs = hrefs;
  console.log("\ngap root hrefs:", hrefs);

  // ===== ۵) melketabriz.com — مسیرهای اپ عمومی =====
  const mpRoot = await get("https://www.melketabriz.com/android", 40000);
  const mpHrefs = [...new Set(mpRoot.body.match(/href="\/[a-zA-Z0-9_\-\/]{1,40}"/g) ?? [])].slice(0, 30);
  OUT.mpRootHrefs = mpHrefs;
  console.log("melk public hrefs:", mpHrefs);

  writeFileSync("/home/z/my-project/download/p6546/systems-discovery-shape.json", JSON.stringify(OUT, null, 2));
  console.log("\nsaved → download/p6546/systems-discovery-shape.json");
})();
