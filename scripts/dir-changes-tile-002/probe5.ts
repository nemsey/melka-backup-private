/**
 * DIR-CHANGES-TILE-002 — گام ۱و: پراب پنجم — همهٔ مجهول‌های باقی‌مانده
 *   ۱) منبع کامل «تاریخچه تغییرات آگهی» (واریانت‌های باقی‌مانده)
 *   ۲) مسیر ویرایش رویداد (request-events/update)
 *   ۳) مسیرهای حذف آگهی/درخواست (دور سوم + swagger)
 *   ۴) requests/info/{id} — رکورد کامل درخواست برای بازسازی بدنهٔ ویرایش
 *   ۵) statuses/list — کاتالوگ وضعیت‌های آگهی
 */
import fs from "fs";
import path from "path";

const CODE = "57810";
const FAKE = "5f0000000000000000000001";

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
  const call = <T>(method: "GET" | "POST" | "PUT" | "DELETE", p: string, opts: { body?: unknown; query?: Record<string, string> } = {}, base?: string) =>
    armCall<T>({ method, path: p, baseUrl: base ?? cfg.armApiBase, token: resolved.token, body: opts.body, query: opts.query, timeoutMs: 90_000, maxRetries: 0 });

  const out: Record<string, unknown> = {};
  const safe = async (label: string, fn: () => Promise<unknown>): Promise<any> => {
    try {
      const v = await fn();
      out[label] = v;
      const s = JSON.stringify(v);
      console.log(`[${label}] OK (${s.length}):`, s.slice(0, 260));
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

  // ── ۱) تاریخچهٔ آگهی — واریانت‌های باقی‌مانده ──
  await safe("rev-history", () => call("GET", `properties/${pid}/history`));
  await safe("rev-statuses", () => call("GET", `properties/${pid}/statuses`));
  await safe("get-update", () => call("GET", `properties/update/${pid}`));
  await safe("statuses-list", () => call("GET", "statuses/list"));
  await safe("statuses-noauth", () => call("GET", "statuses/list", {}, cfg.melkPublicApiBase));
  await safe("apu-bycode", () => call("GET", `properties/info/by-code/${CODE}`, {}, cfg.melkPublicApiBase));
  await safe("prop-statuses", () => call("GET", "property-statuses/list"));

  // ── ۲) ویرایش رویداد ──
  await safe("reqevent-update-fake", () => call("PUT", `request-events/update/${FAKE}`, { body: {} }));
  await safe("reqevent-info-fake", () => call("GET", `request-events/info/${FAKE}`));
  await safe("reqevent-remove-fake", () => call("DELETE", `request-events/remove/${FAKE}`));

  // ── ۳) حذف آگهی/درخواست — دور سوم ──
  await safe("p-one-del", () => call("DELETE", `properties/one/${FAKE}`));
  await safe("p-one-delete", () => call("DELETE", `properties/one-delete/${FAKE}`));
  await safe("p-force-delete", () => call("DELETE", `properties/force-delete/${FAKE}`));
  await safe("p-delete-many", () => call("POST", `properties/delete-many`, { body: { ids: [FAKE] } }));
  await safe("p-bulk-delete", () => call("POST", `properties/bulk-delete`, { body: { ids: [FAKE] } }));
  await safe("p-list-delete", () => call("POST", `properties/list/delete`, { body: { ids: [FAKE] } }));
  await safe("r-one-del", () => call("DELETE", `requests/one/${FAKE}`));
  await safe("r-one-delete", () => call("DELETE", `requests/one-delete/${FAKE}`));
  await safe("r-force-delete", () => call("DELETE", `requests/force-delete/${FAKE}`));
  await safe("r-delete-many", () => call("POST", `requests/delete-many`, { body: { ids: [FAKE] } }));
  await safe("r-bulk-delete", () => call("POST", `requests/bulk-delete`, { body: { ids: [FAKE] } }));
  await safe("r-list-delete", () => call("POST", `requests/list/delete`, { body: { ids: [FAKE] } }));
  await safe("r-remove-one", () => call("DELETE", `requests/remove-one/${FAKE}`));

  // ── ۴) رکورد کامل درخواست ──
  const rl: any = await call("GET", "requests/list", { query: { page: "1", limit: "5" } });
  const reqRow = (rl.data?.list ?? [])[0];
  const reqId = String(reqRow?._id ?? "");
  console.log("[reqId]", reqId, "code:", reqRow?.code);
  await safe("req-info", () => call("GET", `requests/info/${reqId}`));
  await safe("req-history", () => call("GET", `requests/history/${reqId}`));
  await safe("req-applicant", () => call("GET", `requests/applicant/${reqId}`));

  // ── ۵) swagger ──
  await safe("swagger", () => call("GET", "../swagger", {}, "https://arus-api.melketabriz.ir/api"));
  await safe("swagger-json", () => call("GET", "../swagger-json", {}, "https://arus-api.melketabriz.ir/api"));
  await safe("docs", () => call("GET", "../docs", {}, "https://arus-api.melketabriz.ir/api"));

  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "probe5.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("SAVED scripts/tmp/probe5.json");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
