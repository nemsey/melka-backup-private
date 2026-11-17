/**
 * DIR-REG-REQ-099-001 — گام ۱: کاوش زنده (فقط خواندن)
 * ------------------------------------------------------
 * ۱) حل بهترین توکن ARM (resolveBestArmToken)
 * ۲) وضعیت رله (دستگاه آنلاین؟)
 * ۳) فرم پویای دسته «خرید آپارتمان مسکونی» (forms/info/category)
 * ۴) فهرست انواع رویداد (request-event-types/list) — جستجوی «ایجاد مشاور»
 * خروجی: scripts/tmp/probe-arm-live.json (بدون هیچ رازی)
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
  const { relayOverview } = await import("@/lib/melk-api/relay");

  const out: Record<string, unknown> = {};

  // ── ۱) توکن ──
  const resolved = await resolveBestArmToken(db);
  out.token = resolved
    ? {
        source: resolved.source,
        expMs: resolved.expMs,
        expIso: resolved.expMs ? new Date(resolved.expMs).toISOString() : null,
        validNow: resolved.expMs ? resolved.expMs - Date.now() > 120_000 : null,
        vaultHealed: resolved.vaultHealed,
        tokenPreview: resolved.token.slice(0, 12) + "…",
      }
    : null;
  console.log("[token]", JSON.stringify(out.token));

  // ── ۲) رله ──
  try {
    const ov = await relayOverview();
    out.relay = {
      mode: ov.mode,
      active: ov.active,
      devices: ov.devices.map((d) => ({
        deviceId: d.deviceId,
        label: d.label,
        online: d.online,
        lastSeenAt: d.lastSeenAt,
        servedCount: d.servedCount,
        errorCount: d.errorCount,
      })),
      queue: ov.queue,
    };
    console.log("[relay]", JSON.stringify((out.relay as any).devices?.map((d: any) => ({ id: d.deviceId, online: d.online, lastSeen: d.lastSeenAt }))));
    console.log("[queue]", JSON.stringify((out.relay as any).queue));
  } catch (e) {
    out.relayError = String(e);
  }

  if (!resolved) {
    console.error("NO TOKEN — abort");
    process.exit(2);
  }
  const token = resolved.token;
  const cfg = getMelkApiConfig();

  // ── ۳) فرم پویای دسته (عمومی) ──
  const TRADE_SALE = "614ed62da50555f0a54c1eca"; // فروش (برچسب درخواست: خرید)
  const BLDG_MOSKUNI = "614edc35a50555f0a54c1f12"; // مسکونی
  const PROP_APARTMENT = "614ee704a50555f0a54c227d"; // آپارتمان
  try {
    const res = await armCall<{ _id?: string; name?: string; inputs?: unknown[] }>({
      method: "GET",
      path: "forms/info/category",
      baseUrl: cfg.armApiBase,
      query: { tradeType: TRADE_SALE, buildingType: BLDG_MOSKUNI, propertyType: PROP_APARTMENT, type: "request_property" },
      token,
      timeoutMs: 60_000,
      maxRetries: 1,
    });
    const inputs = (res.data?.inputs ?? []) as Array<Record<string, any>>;
    out.form = {
      ok: true,
      name: res.data?.name ?? null,
      inputCount: inputs.length,
      fields: inputs.map((i) => ({
        nameFa: i.nameFa,
        nameEn: i.nameEn,
        request: i.request
          ? {
              inputType: i.request.inputType,
              createName: i.request.createName,
              createNameFrom: i.request.createNameFrom,
              createNameTo: i.request.createNameTo,
              createRange: i.request.createRange,
              unit: i.request.unit,
              options: (i.request.createOptions ?? []).map((o: any) => ({ label: o.label ?? o.name, value: o.value })),
            }
          : null,
      })),
    };
    console.log("[form] ok — inputs:", inputs.length);
  } catch (e) {
    out.form = { ok: false, error: String(e) };
    console.error("[form] FAILED:", String(e));
  }

  // ── ۴) انواع رویداد ──
  try {
    const res = await armCall<{ list?: unknown[] } | unknown[]>({
      method: "GET",
      path: "request-event-types/list",
      baseUrl: cfg.armApiBase,
      token,
      timeoutMs: 60_000,
      maxRetries: 1,
    });
    const list = (Array.isArray(res.data) ? res.data : (res.data as any)?.list ?? []) as Array<Record<string, any>>;
    out.eventTypes = {
      ok: true,
      count: list.length,
      types: list.map((t) => ({
        id: t._id ?? t.id,
        name: t.name,
        needTime: t.needTime,
        needHour: t.needHour,
        needMessage: t.needMessage,
        needProperty: t.needProperty,
      })),
    };
    console.log("[event-types] count:", list.length);
    for (const t of list) console.log("   -", t.name, "|", t._id ?? t.id, "| needTime:", t.needTime, "needHour:", t.needHour, "needProperty:", t.needProperty);
  } catch (e) {
    out.eventTypes = { ok: false, error: String(e) };
    console.error("[event-types] FAILED:", String(e));
  }

  // ── ۵) جستجوی مشتری (users/info/mobile-number/9910756951) ──
  try {
    const res = await armCall<Record<string, any> | null>({
      method: "GET",
      path: "users/info/mobile-number/9910756951",
      baseUrl: cfg.armApiBase,
      token,
      timeoutMs: 60_000,
      maxRetries: 1,
    });
    const d = res.data ?? null;
    out.customerLookup = d
      ? { found: true, id: d.userId ?? d._id, fullName: d.fullName ?? [d.firstName, d.lastName].filter(Boolean).join(" "), mobileNumber: d.mobileNumber }
      : { found: false };
    console.log("[customer]", JSON.stringify(out.customerLookup));
  } catch (e) {
    out.customerLookup = { found: false, error: String(e) };
    console.error("[customer] lookup error:", String(e));
  }

  const dir = path.join(process.cwd(), "scripts", "tmp");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "probe-arm-live.json"), JSON.stringify(out, null, 2), "utf-8");
  console.log("saved → scripts/tmp/probe-arm-live.json");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
