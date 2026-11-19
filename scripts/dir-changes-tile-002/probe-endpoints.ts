/**
 * DIR-CHANGES-TILE-002 — گام ۱: کاوش زندهٔ نقاط اتصال تازه (فقط خواندی + کشف مسیر با شناسهٔ جعلی)
 * --------------------------------------------------------------------------------------
 * خواستهٔ مالک: تغییر/حذف کدآگهی و کد درخواست + تغییر «اطلاعات مالک آگهی» +
 * تغییر تاریخ «ایجاد مشاور» آگهی با آبشار اتوماتیک تاریخچه‌ها.
 *
 * این پراب:
 *   ۱) توکن + رله
 *   ۲) یک آگهی واقعی (از properties/list) + تاریخچهٔ تغییرات آگهی (properties/history)
 *   ۳) ساختار مالک آگهی (properties/owner)
 *   ۴) رویداد/بازخورد مرتبط با آگهی (request-events/list?property=… · visits/list)
 *   ۵) کشف مسیرهای حذف/ویرایش مالک با شناسهٔ جعلی ۵f…۰۱ (چیزی واقعی حذف نمی‌شود)
 *
 * خروجی: scripts/tmp/probe-endpoints.json
 */

import fs from "fs";
import path from "path";

const FAKE = "5f0000000000000000000001"; // ObjectId معتبر در قالب، ناموجود در واقعیت

async function main() {
  const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
  applyPlatformEnvFallbacks();

  const { db } = await import("@/lib/db");
  const { resolveBestArmToken } = await import("@/lib/melk-api/arm-token-resolver");
  const { armCall } = await import("@/lib/melk-api/client");
  const { getMelkApiConfig } = await import("@/lib/melk-api/config");
  const { relayOverview } = await import("@/lib/melk-api/relay");

  const out: Record<string, unknown> = {};

  // ── ۱) توکن ──
  const resolved = await resolveBestArmToken(db);
  if (!resolved || !resolved.token) throw new Error("هیچ توکن ARM در دسترس نیست");
  out.token = { source: resolved.source, expIso: resolved.expMs ? new Date(resolved.expMs).toISOString() : null };
  console.log("[token]", JSON.stringify(out.token));

  // ── رله ──
  try {
    const ov = await relayOverview();
    out.relay = {
      mode: ov.mode,
      active: ov.active,
      devices: ov.devices.map((d) => ({ label: d.label, online: d.online, lastSeenAt: d.lastSeenAt })),
      queue: ov.queue,
    };
    console.log("[relay]", JSON.stringify((out.relay as any).devices));
  } catch (e) {
    out.relayError = String(e);
  }

  const cfg = getMelkApiConfig();
  const call = <T>(method: "GET" | "POST" | "PUT" | "DELETE", p: string, opts: { body?: unknown; query?: Record<string, string> } = {}) =>
    armCall<T>({ method, path: p, baseUrl: cfg.armApiBase, token: resolved.token, body: opts.body, query: opts.query, timeoutMs: 90_000, maxRetries: 0 });

  const safe = async (label: string, fn: () => Promise<unknown>): Promise<unknown> => {
    try {
      const v = await fn();
      out[label] = v;
      console.log(`[${label}] OK:`, JSON.stringify(v).slice(0, 600));
      return v;
    } catch (e) {
      // خطا را با شکل کامل نگه می‌داریم — کشف مسیر از شکل خطا
      const err = e as { message?: string; httpStatus?: number; code?: string };
      out[label] = { __error: { message: err.message, httpStatus: err.httpStatus, code: err.code } };
      console.error(`[${label}] ERR:`, JSON.stringify(out[label]).slice(0, 400));
      return null;
    }
  };

  // ── ۲) یک آگهی واقعی از فهرست ──
  let propRow: any = null;
  for (let page = 1; page <= 3 && !propRow; page++) {
    const res: any = await safe(`properties-list-p${page}`, () => call("GET", "properties/list", { query: { page: String(page), limit: "10" } }));
    const list = res?.data?.list ?? [];
    // آگهی سیدی؟ اگر نبود، همان اولی
    propRow = list.find((r: any) => String(r.relatedRealtor ?? "").includes("سیدی")) ?? list[0] ?? null;
  }
  if (!propRow) throw new Error("هیچ آگهی در فهرست نیست");
  const pid = String(propRow._id);
  const pcode = String(propRow.code ?? propRow.propertyCode ?? "");
  out.chosenProperty = { id: pid, code: pcode, title: propRow.title, relatedRealtor: propRow.relatedRealtor, status: propRow.status, createdAt: propRow.createdAt };
  console.log("[chosen]", JSON.stringify(out.chosenProperty));

  // ── ۳) تاریخچهٔ تغییرات آگهی — مسیرهای محتمل ──
  await safe("prop-history", () => call("GET", `properties/history/${pid}`));
  await safe("prop-changes", () => call("GET", `properties/changes/${pid}`));
  await safe("prop-status", () => call("GET", `properties/status/${pid}`));
  await safe("prop-events", () => call("GET", `properties/events/${pid}`));

  // ── ۴) مالک آگهی ──
  await safe("prop-owner", () => call("GET", `properties/owner/${pid}`));

  // ── ۵) رویداد/بازخورد مرتبط ──
  await safe("reqevents-by-property", () => call("GET", "request-events/list", { query: { property: pid } }));
  await safe("reqevents-by-propertyCode", () => call("GET", "request-events/list", { query: { propertyCode: pcode } }));
  await safe("visits-by-property", () => call("GET", "visits/list", { query: { property: pid } }));
  await safe("visits-by-code", () => call("GET", "visits/list", { query: { propertyCode: pcode } }));

  // ── ۶) کشف مسیرها با شناسهٔ جعلی (هیچ دادهٔ واقعی در خطر نیست) ──
  // مبنا: مسیر ناموجود در NestJS → 404 «Cannot <METHOD> /api/apm/…»
  await safe("baseline-missing-route", () => call("GET", `properties/zzz-missing-route/${FAKE}`));
  await safe("prop-history-fake", () => call("GET", `properties/history/${FAKE}`));
  await safe("prop-delete-fake", () => call("DELETE", `properties/delete/${FAKE}`));
  await safe("prop-remove-fake", () => call("DELETE", `properties/remove/${FAKE}`));
  await safe("prop-delete-id-body-fake", () => call("DELETE", "properties/delete", { body: { id: FAKE } }));
  await safe("req-delete-fake", () => call("DELETE", `requests/delete/${FAKE}`));
  await safe("req-remove-fake", () => call("DELETE", `requests/remove/${FAKE}`));
  await safe("req-delete-id-body-fake", () => call("DELETE", "requests/delete", { body: { id: FAKE } }));
  await safe("user-update-fake", () => call("PUT", `users/update/${FAKE}`, { body: {} }));
  await safe("user-info-fake", () => call("GET", `users/info/${FAKE}`));
  await safe("reqevent-delete-fake", () => call("DELETE", `request-events/delete/${FAKE}`));

  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "probe-endpoints.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("SAVED scripts/tmp/probe-endpoints.json");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
