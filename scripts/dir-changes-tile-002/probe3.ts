/**
 * DIR-CHANGES-TILE-002 — گام ۱د: پراب سوم — یافتن منبع کامل «تاریخچه تغییرات آگهی»
 * آگهی 57810 (سیدی · createdAt=2026-08-24=۱۴۰۵/۰۶/۰۲ — عین اسکرین‌شات مالک)
 */
import fs from "fs";
import path from "path";

const CODE = "57810";

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
      console.log(`[${label}] OK:`, JSON.stringify(v).slice(0, 350));
      return v;
    } catch (e) {
      const err = e as { message?: string; httpStatus?: number };
      out[label] = { __error: { message: err.message, httpStatus: err.httpStatus } };
      console.error(`[${label}] ERR:`, err.message);
      return null;
    }
  };

  // شناسهٔ آگهی
  const bc: any = await safe("bycode", () => call("GET", `properties/info/by-code/${CODE}`));
  const pid = String(bc?.data?._id ?? "");
  console.log("[pid]", pid);

  // ۱) فهرست با فیلتر کد — طول آرایهٔ status ردیف
  await safe("list-by-code", () => call("GET", "properties/list", { query: { code: CODE } }));

  // ۲) مسیرهای محتمل تاریخچهٔ آگهی
  await safe("prop-info-id", () => call("GET", `properties/info/${pid}`));
  await safe("property-histories", () => call("GET", "property-histories/list", { query: { property: pid } }));
  await safe("ad-processes", () => call("GET", "ad-processes/list", { query: { property: pid } }));
  await safe("status-hist", () => call("GET", `properties/status-history/${pid}`));
  await safe("statuses", () => call("GET", `properties/statuses/${pid}`));
  await safe("changes-list", () => call("GET", "properties/changes", { query: { property: pid } }));
  await safe("histories-list", () => call("GET", "properties/histories", { query: { property: pid } }));
  await safe("prop-events-list", () => call("GET", "properties/events", { query: { property: pid } }));

  // ۳) الگوی requests/history برای properties — با پسوند list
  await safe("history-list", () => call("GET", "properties/history", { query: { property: pid } }));
  await safe("history-list2", () => call("GET", "properties/history/list", { query: { property: pid } }));

  // ۴) آیا PUT properties/update با آرایهٔ status کار می‌کند؟ (بدون نوشتن — فقط مسیر با شناسهٔ جعلی)
  const FAKE = "5f0000000000000000000001";
  await safe("update-fake-min", () => call("PUT", `properties/update/${FAKE}`, { body: { address: "x" } }));

  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "probe3.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("SAVED scripts/tmp/probe3.json");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
