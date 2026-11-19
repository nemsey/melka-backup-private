/**
 * DIR-CHANGES-TILE-002 — گام ۱ز: پراب ششم — جستجوی نهایی منبع تاریخچهٔ آگهی + requests/info مالک
 */
import fs from "fs";
import path from "path";

const CODE = "57810";
const FAKE = "5f0000000000000000000001";
const MY_REQ_ID = "6afbdc419e477125d0a9280d"; // 55920 — درخواست خود مالک

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
  const call = <T>(method: "GET" | "POST" | "PUT" | "DELETE", p: string, opts: { body?: unknown; query?: Record<string, string> } = {}) =>
    armCall<T>({ method, path: p, baseUrl: cfg.armApiBase, token: resolved.token, body: opts.body, query: opts.query, timeoutMs: 90_000, maxRetries: 0 });

  const out: Record<string, unknown> = {};
  const safe = async (label: string, fn: () => Promise<unknown>): Promise<any> => {
    try {
      const v = await fn();
      out[label] = v;
      const s = JSON.stringify(v);
      console.log(`[${label}] OK (${s.length}):`, s.slice(0, 280));
      return v;
    } catch (e) {
      const err = e as { message?: string; httpStatus?: number };
      out[label] = { __error: { message: err.message, httpStatus: err.httpStatus } };
      console.error(`[${label}] ERR:`, err.message);
      return null;
    }
  };

  const bc: any = await call("GET", `properties/info/by-code/${CODE}`);
  const pid = String(bc.data?._id ?? "");
  console.log("[pid]", pid);

  // ── ۱) واریانت‌های نهایی تاریخچهٔ آگهی ──
  await safe("change-history", () => call("GET", `properties/change-history/${pid}`));
  await safe("status-log", () => call("GET", `properties/status-log/${pid}`));
  await safe("logs", () => call("GET", `properties/logs/${pid}`));
  await safe("historic-statuses", () => call("GET", `properties/historic-statuses/${pid}`));
  await safe("property-history", () => call("GET", `properties/property-history/${pid}`));
  await safe("statuses-history", () => call("GET", `properties/statuses-history/${pid}`));
  await safe("generic-history", () => call("GET", `history/${pid}`));
  await safe("generic-histories", () => call("GET", `histories/${pid}`));
  await safe("generic-changes", () => call("GET", `changes/${pid}`));
  await safe("process", () => call("GET", `process/${pid}`));
  await safe("info-status", () => call("GET", `properties/info/${pid}/status`));
  await safe("details-history", () => call("GET", `properties/details/${pid}/history`));
  await safe("status-changes-list", () => call("GET", "status-changes/list", { query: { property: pid } }));
  await safe("property-changes-list", () => call("GET", "property-changes/list", { query: { property: pid } }));
  await safe("property-logs-list", () => call("GET", "property-logs/list", { query: { property: pid } }));
  await safe("ad-process-list", () => call("GET", "ad-process/list", { query: { property: pid } }));
  await safe("prop-one", () => call("GET", `properties/one/${pid}`));
  await safe("prop-show", () => call("GET", `properties/show/${pid}`));
  await safe("prop-view", () => call("GET", `properties/view/${pid}`));
  await safe("prop-full", () => call("GET", `properties/full/${pid}`));

  // ── ۲) requests/info روی درخواست خود مالک (55920) ──
  await safe("my-req-info", () => call("GET", `requests/info/${MY_REQ_ID}`));
  await safe("my-req-history", () => call("GET", `requests/history/${MY_REQ_ID}`));
  await safe("my-req-update-get", () => call("GET", `requests/update/${MY_REQ_ID}`));

  // ── ۳) حذف — واریانت‌های نهایی ──
  await safe("p-inactive", () => call("DELETE", `properties/inactive/${FAKE}`));
  await safe("p-disable", () => call("DELETE", `properties/disable/${FAKE}`));
  await safe("p-deactivate", () => call("DELETE", `properties/deactivate/${FAKE}`));
  await safe("p-expire", () => call("DELETE", `properties/expire/${FAKE}`));
  await safe("r-inactive", () => call("DELETE", `requests/inactive/${FAKE}`));
  await safe("r-disable", () => call("DELETE", `requests/disable/${FAKE}`));
  await safe("p-delete-put-body", () => call("PUT", "properties/delete", { body: { id: FAKE } }));
  await safe("r-delete-put-body", () => call("PUT", "requests/delete", { body: { id: FAKE } }));

  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "probe6.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("SAVED scripts/tmp/probe6.json");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
