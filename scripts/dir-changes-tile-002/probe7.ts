/**
 * DIR-CHANGES-TILE-002 — پراب هفتم — توزیع طول آرایهٔ status در فهرست آگهی‌ها + probe my-req-info دوباره
 */
import fs from "fs";
import path from "path";

async function main() {
  const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
  applyPlatformEnvFallbacks();
  const { db } = await import("@/lib/db");
  const { resolveBestArmToken } = await import("@/lib/melk-api/arm-token-resolver");
  const { armCall } = await import("@/lib/melk-api/client");
  const { getMelkApiConfig } = await import("@/lib/melk-api/config");

  const resolved = await resolveBestArmToken(db);
  if (!resolved || !resolved.token) throw new Error("no token");
  const cfg = getMelkApiConfig();
  const call = <T>(method: "GET", p: string, opts: { query?: Record<string, string> } = {}) =>
    armCall<T>({ method, path: p, baseUrl: cfg.armApiBase, token: resolved.token, query: opts.query, timeoutMs: 90_000, maxRetries: 0 });

  const out: Record<string, unknown> = {};
  const dist: Record<number, number> = {};
  let maxLen = 0;
  let maxRow: any = null;
  for (let page = 1; page <= 5; page++) {
    const res: any = await call("GET", "properties/list", { query: { page: String(page), limit: "50" } });
    const list = res?.data?.list ?? [];
    for (const r of list) {
      const n = Array.isArray(r.status) ? r.status.length : -1;
      dist[n] = (dist[n] ?? 0) + 1;
      if (n > maxLen) { maxLen = n; maxRow = r; }
    }
    console.log(`[p${page}] ${list.length} rows — dist so far:`, JSON.stringify(dist));
  }
  out.distribution = dist;
  out.maxLen = maxLen;
  out.maxRow = maxRow ? { _id: maxRow._id, code: maxRow.code, title: maxRow.title, statusLen: (maxRow.status ?? []).length, status: maxRow.status } : null;
  console.log("MAX:", JSON.stringify(out.maxRow).slice(0, 800));

  // تلاش دوباره: requests/info درخواست خود مالک (گذرا قبلاً خطای شبکه داد)
  try {
    const r: any = await call("GET", "requests/info/6afbdc419e477125d0a9280d");
    out.myReqInfo = r;
    console.log("[my-req-info] OK:", JSON.stringify(r).slice(0, 500));
  } catch (e) {
    out.myReqInfo = { error: String(e) };
    console.error("[my-req-info] ERR:", String(e));
  }

  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "probe7.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("SAVED");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
