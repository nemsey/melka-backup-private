/**
 * DIR-CHANGES-TILE-002 — گام ۱ج: پراب دوم — آگهی دارای تاریخچهٔ غنی + واریانت‌های حذف/ویرایش
 */
import fs from "fs";
import path from "path";

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
  const call = <T>(method: "GET" | "POST" | "PUT" | "DELETE", p: string, opts: { body?: unknown; query?: Record<string, string> } = {}) =>
    armCall<T>({ method, path: p, baseUrl: cfg.armApiBase, token: resolved.token, body: opts.body, query: opts.query, timeoutMs: 90_000, maxRetries: 0 });

  const out: Record<string, unknown> = {};
  const safe = async (label: string, fn: () => Promise<unknown>): Promise<any> => {
    try {
      const v = await fn();
      out[label] = v;
      console.log(`[${label}] OK:`, JSON.stringify(v).slice(0, 400));
      return v;
    } catch (e) {
      const err = e as { message?: string; httpStatus?: number };
      out[label] = { __error: { message: err.message, httpStatus: err.httpStatus } };
      console.error(`[${label}] ERR:`, JSON.stringify(out[label]).slice(0, 300));
      return null;
    }
  };

  // ── ۱) آگهی سیدی (از آینهٔ محلی — کد 57810) ──
  const rcode0 = process.argv[2] ?? "57810";
  const bycode: any = await safe("bycode-lookup", () => call("GET", `properties/info/by-code/${rcode0}`));
  const rich: any = bycode?.data ?? null;
  if (!rich || !rich._id) throw new Error(`آگهی ${rcode0} یافت نشد`);
  if (!rich) throw new Error("آگهی دارای تاریخچهٔ غنی یافت نشد");
  const rid = String(rich._id);
  const rcode = String(rich.code ?? "");
  out.richProperty = {
    id: rid, code: rcode, title: rich.title, relatedRealtor: rich.relatedRealtor,
    statusCount: (rich.status ?? []).length,
    status: (rich.status ?? []).map((s: any) => ({
      _id: s._id, actionType: s.actionType?._id ?? s.actionType, actionName: s.actionType?.name ?? null,
      currentStatus: s.currentStatus?._id ?? s.currentStatus, currentStatusName: s.currentStatus?.name ?? null,
      currentInbox: s.currentInbox?._id ?? s.currentInbox, inboxName: s.currentInbox?.name ?? null,
      realtor: s.realtor?._id ?? s.realtor, realtorName: s.realtor?.fullName ?? null,
      customer: s.customer && typeof s.customer === "object" ? s.customer._id : s.customer ?? null,
      previousRealtor: s.previousRealtor?._id ?? s.previousRealtor ?? null,
      date: s.date,
    })),
  };
  console.log("[rich]", JSON.stringify(out.richProperty).slice(0, 1500));

  // ── ۲) جزئیات آگهی — آیا آرایهٔ status کامل در details هست؟ ──
  await safe("details-rich", () => call("GET", `properties/details/${rid}`));
  await safe("owner-rich", () => call("GET", `properties/owner/${rid}`));
  await safe("bycode-rich", () => call("GET", `properties/info/by-code/${rcode}`));

  // رویداد/بازخورد این آگهی
  await safe("reqevents-rich", () => call("GET", "request-events/list", { query: { property: rid } }));
  await safe("visits-rich", () => call("GET", "visits/list", { query: { property: rid } }));

  // ── ۳) واریانت‌های حذف — دور دوم ──
  await safe("p-info-del", () => call("DELETE", `properties/info/${FAKE}`));
  await safe("p-list-del", () => call("DELETE", `properties/list/${FAKE}`));
  await safe("p-delete-put", () => call("PUT", `properties/delete/${FAKE}`, { body: {} }));
  await safe("p-delete-post", () => call("POST", `properties/delete`, { body: { id: FAKE } }));
  await safe("p-cancel-del", () => call("DELETE", `properties/cancel/${FAKE}`));
  await safe("p-archive-del", () => call("DELETE", `properties/archive/${FAKE}`));
  await safe("p-trash-del", () => call("DELETE", `properties/trash/${FAKE}`));
  await safe("p-update-del", () => call("DELETE", `properties/update/${FAKE}`));
  await safe("r-info-del", () => call("DELETE", `requests/info/${FAKE}`));
  await safe("r-list-del", () => call("DELETE", `requests/list/${FAKE}`));
  await safe("r-delete-put", () => call("PUT", `requests/delete/${FAKE}`, { body: {} }));
  await safe("r-delete-post", () => call("POST", `requests/delete`, { body: { id: FAKE } }));
  await safe("r-cancel-del", () => call("DELETE", `requests/cancel/${FAKE}`));
  await safe("r-archive-del", () => call("DELETE", `requests/archive/${FAKE}`));
  await safe("r-update-del", () => call("DELETE", `requests/update/${FAKE}`));
  await safe("u-delete-del", () => call("DELETE", `users/delete/${FAKE}`));
  await safe("u-delete-post", () => call("POST", `users/delete`, { body: { id: FAKE } }));
  await safe("u-remove-del", () => call("DELETE", `users/remove/${FAKE}`));
  await safe("v-delete-del", () => call("DELETE", `visits/delete/${FAKE}`));

  // ── ۴) users/update با بدنهٔ واقع‌نما روی شناسهٔ جعلی (اعتبارسنجی مسیر) ──
  await safe("u-update-body", () => call("PUT", `users/update/${FAKE}`, { body: { firstName: "تست", lastName: "تستی", mobileNumber: "9120000000" } }));

  // ── ۵) انواع وضعیت/اقدام آگهی ──
  await safe("action-types", () => call("GET", "action-types/list"));
  await safe("status-types", () => call("GET", "status-types/list"));
  await safe("property-statuses", () => call("GET", "property-statuses/list"));
  await safe("inbox-list", () => call("GET", "inboxes/list"));

  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "probe2.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("SAVED scripts/tmp/probe2.json");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
