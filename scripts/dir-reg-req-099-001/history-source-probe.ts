/**
 * DIR-REG-REQ-099-001 — گام ۴: کشف منبع «تاریخچه تغییرات» (فقط خواندن)
 * آزمای مسیرهای محتمل فهرست رویداد/تغییرات یک درخواست تازه
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
  if (!resolved) throw new Error("no token");
  const cfg = getMelkApiConfig();
  const requestId = process.argv[2] ?? "6afb53904ff81bffbe0cdc0c";

  const variants: Array<{ label: string; path: string; query?: Record<string, string> }> = [
    { label: "request-events/list?request", path: "request-events/list", query: { request: requestId } },
    { label: "request-events/list?requestProperty", path: "request-events/list", query: { requestProperty: requestId } },
    { label: "requests/changes", path: `requests/changes/${encodeURIComponent(requestId)}` },
    { label: "requests/history", path: `requests/history/${encodeURIComponent(requestId)}` },
  ];

  const out: Record<string, unknown> = {};
  for (const v of variants) {
    try {
      const res = await armCall<unknown>({
        method: "GET",
        path: v.path,
        baseUrl: cfg.armApiBase,
        query: v.query,
        token: resolved.token,
        timeoutMs: 90_000,
        maxRetries: 0,
      });
      const s = JSON.stringify(res.data, null, 2);
      out[v.label] = res.data;
      console.log(`[${v.label}] OK (${s.length} chars):`);
      console.log(s.slice(0, 2200));
      console.log("…");
    } catch (e) {
      out[v.label] = { error: String(e) };
      console.error(`[${v.label}] FAILED:`, String(e).slice(0, 160));
    }
  }
  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "history-source-probe.json"), JSON.stringify(out, null, 2), "utf-8");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
