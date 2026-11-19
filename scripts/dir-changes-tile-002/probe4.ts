/**
 * DIR-CHANGES-TILE-002 — گام ۱ه: پراب چهارم — منبع «تاریخچه تغییرات آگهی» (الگوی معکوس :id/sub) + رویداد-ویرایش
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
      const s = JSON.stringify(v);
      console.log(`[${label}] OK (${s.length}):`, s.slice(0, 300));
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

  // ── الگوی معکوس properties/{id}/sub ──
  await safe("rev-history", () => call("GET", `properties/${pid}/history`));
  await safe("rev-changes", () => call("GET", `properties/${pid}/changes`));
  await safe("rev-statuses", () => call("GET", `properties/${pid}/statuses`));
  await safe("rev-status", () => call("GET", `properties/${pid}/status`));
  await safe("rev-log", () => call("GET", `properties/${pid}/log`));
  await safe("rev-events", () => call("GET", `properties/${pid}/events`));

  // ── الگوی edit/update با GET ──
  await safe("get-update", () => call("GET", `properties/update/${pid}`));
  await safe("get-edit", () => call("GET", `properties/edit/${pid}`));

  // ── نام‌های محتمل مجموعه ──
  await safe("statuses-list", () => call("GET", "statuses/list", { query: { property: pid } }));
  await safe("processes-list", () => call("GET", "processes/list", { query: { property: pid } }));
  await safe("change-logs", () => call("GET", "change-logs/list", { query: { property: pid } }));
  await safe("property-status-histories", () => call("GET", "property-status-histories/list", { query: { property: pid } }));

  // ── رویداد: ویرایش/حذف (کشف مسیر — شناسهٔ جعلی) ──
  const FAKE = "5f0000000000000000000001";
  await safe("reqevent-update-fake", () => call("PUT", `request-events/update/${FAKE}`, { body: {} }));
  await safe("reqevent-remove-fake", () => call("DELETE", `request-events/remove/${FAKE}`));
  await safe("reqevent-info-fake", () => call("GET", `request-events/info/${FAKE}`));

  // ── انواع رویداد (برای نام‌های اقدام آگهی: بازدید/پیشنهاد…) ──
  await safe("event-types", () => call("GET", "request-event-types/list"));

  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "probe4.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("SAVED scripts/tmp/probe4.json");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
