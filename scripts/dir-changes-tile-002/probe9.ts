/**
 * DIR-CHANGES-TILE-002 — پراب نهم — آیا تاریخچهٔ آگهی از مسیر requests/history با شناسهٔ آگهی می‌آید؟
 * + تست بدنهٔ users/update روی ساختار + بررسی hour/dateTime رویدادها
 */
import fs from "fs";
import path from "path";

const PID = "6a8c602a73557ed181ad4cc4"; // 57810

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
  const call = <T>(method: "GET" | "PUT", p: string, opts: { body?: unknown; query?: Record<string, string> } = {}) =>
    armCall<T>({ method, path: p, baseUrl: cfg.armApiBase, token: resolved.token, body: opts.body, query: opts.query, timeoutMs: 90_000, maxRetries: 0 });

  const out: Record<string, unknown> = {};
  const safe = async (label: string, fn: () => Promise<unknown>): Promise<any> => {
    try {
      const v = await fn();
      out[label] = v;
      const s = JSON.stringify(v);
      console.log(`[${label}] OK (${s.length}):`, s.slice(0, 500));
      return v;
    } catch (e) {
      const err = e as { message?: string; httpStatus?: number };
      out[label] = { __error: { message: err.message, httpStatus: err.httpStatus } };
      console.error(`[${label}] ERR:`, err.message);
      return null;
    }
  };

  // ۱) requests/history با شناسهٔ آگهی
  await safe("req-history-with-propid", () => call("GET", `requests/history/${PID}`));

  // ۲) special-properties برای آگهی 57810 (کارگزاری‌ها)
  await safe("special-props", () => call("GET", "special-properties/list", { query: { property: PID } }));

  // ۳) همهٔ رویدادهای 57810 — شکل کامل (hour/dateTime/visitTime)
  await safe("events-57810", () => call("GET", "request-events/list", { query: { property: PID, limit: "50" } }));

  // ۴) ساختار کامل یک رویداد (برای بدنهٔ update)
  const ev: any = out["events-57810"];
  const first = (ev?.data?.list ?? [])[0];
  if (first) {
    out.eventShape = first;
    console.log("[eventShape]:", JSON.stringify(first, null, 1).slice(0, 1200));
  }

  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "probe9.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("SAVED");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
