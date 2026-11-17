/**
 * DIR-REG-REQ-099-001 — گام ۶: راستی‌آزمایی مستقل (فقط خواندن)
 * تطبیق تک‌تک فیلدهای اعلامی مالک با دادهٔ زندهٔ ARM + رکورد محلی
 */

import fs from "fs";
import path from "path";

const ARM_REQUEST_ID = "6afbdc419e477125d0a9280d";
const ARM_CODE = "55920";

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
  const out: Record<string, unknown> = {};

  // ── ۱) جزئیات زندهٔ ARM (عین صفحهٔ «جزئیات درخواست» خود سامانه) ──
  const dres = await armCall<Record<string, any>>({
    method: "GET",
    path: `requests/details/${ARM_REQUEST_ID}`,
    baseUrl: cfg.armApiBase,
    token: resolved.token,
    timeoutMs: 90_000,
    maxRetries: 1,
  });
  const details = ((dres.data as any)?.details ?? []) as Array<{ label: string; value: string; unit?: string }>;
  const options = ((dres.data as any)?.options ?? []) as Array<{ label: string; value: string }>;
  out.details = details;
  out.options = options;
  console.log("── جزئیات (عین صفحهٔ خود سامانه) ──");
  for (const d of details) console.log(`  ${d.label}: ${d.value}${d.unit ? " " + d.unit : ""}`);
  console.log("── امکانات (options) ──");
  for (const o of options) console.log(`  ${o.label}: ${o.value}`);

  // ── ۲) اطلاعات متقاضی (عین تب مشتری خود سامانه) ──
  const ares = await armCall<Record<string, any>>({
    method: "GET",
    path: `requests/applicant/${ARM_REQUEST_ID}`,
    baseUrl: cfg.armApiBase,
    token: resolved.token,
    timeoutMs: 90_000,
    maxRetries: 1,
  });
  const ap = ares.data ?? {};
  out.applicant = {
    fullName: ap.fullName ?? [ap.firstName, ap.lastName].filter(Boolean).join(" "),
    mobileNumber: ap.mobileNumber,
    userId: ap.userId ?? ap._id,
  };
  console.log("── متقاضی ──");
  console.log("  ", JSON.stringify(out.applicant));

  // ── ۳) تاریخچهٔ تغییرات زندهٔ ARM ──
  const hres = await armCall<Record<string, any>>({
    method: "GET",
    path: `requests/history/${ARM_REQUEST_ID}`,
    baseUrl: cfg.armApiBase,
    token: resolved.token,
    timeoutMs: 90_000,
    maxRetries: 1,
  });
  const entries = ((hres.data as any)?.list ?? []) as Array<Record<string, any>>;
  out.armHistory = entries.map((e) => ({ اقدام: e.actionType?.name, توسط: e.realtor?.fullName, تاریخ: e.date }));
  console.log("── تاریخچهٔ تغییرات ARM (زنده) ──");
  for (const e of entries) console.log(`  اقدام: ${e.actionType?.name} · توسط: ${e.realtor?.fullName} · تاریخ: ${e.date}`);

  // ── ۴) تطبیق تک‌تک موارد اعلامی ──
  const dv = (name: string) => details.find((d) => (d as any).name === name)?.value ?? null;
  const expected: Array<[string, string, boolean]> = [
    ["نوع معامله", dv("tradeType"), dv("tradeType") === "فروش"],
    ["نوع کاربری", dv("buildingType"), dv("buildingType") === "مسکونی"],
    ["نوع ملک", dv("propertyType"), dv("propertyType") === "آپارتمان"],
    ["متراژ", dv("space"), dv("space") === "140 تا 180"],
    ["قیمت کل", dv("totalPrice"), dv("totalPrice") === "۳۵٬۰۰۰٬۰۰۰٬۰۰۰ تا ۴۰٬۰۰۰٬۰۰۰٬۰۰۰"],
    ["طبقه", dv("floor"), dv("floor") === "2 تا 8"],
    ["تعداد اتاق", dv("room_whole"), dv("room_whole") === "2 تا 3"],
    ["کل طبقات", dv("floor_whole"), dv("floor_whole") === "1 تا 8"],
    ["واحد در طبقه", dv("unit"), dv("unit") === "1 تا 2"],
    ["سال ساخت", dv("year"), dv("year") === "1395 تا 1405"],
    ["موقعیت", dv("side"), dv("side") === "جنوبی"],
    ["نوع ساخت", dv("construct_type"), dv("construct_type") === "شخصی ساز"],
    ["نوع سند", dv("sanad"), dv("sanad") === "شش دانگ"],
  ];
  const opt = (label: string) => options.find((o) => o.label === label)?.value ?? null;
  expected.push(["آسانسور", opt("آسانسور"), opt("آسانسور") === "دارد"]);
  expected.push(["پارکینگ", opt("پارکینگ"), opt("پارکینگ") === "دارد"]);
  const pass = expected.filter(([, , ok]) => ok).length;
  out.check = { expected, pass, total: expected.length };
  console.log("── تطبیق موارد اعلامی ──");
  for (const [label, value, ok] of expected) console.log(`  ${ok ? "✓" : "✗"} ${label}: ${value}`);
  console.log(`  نتیجه: ${pass}/${expected.length}`);

  // ── ۵) رکورد محلی + رویداد تاریخچه ──
  const rec = await db.requestRecord.findUnique({ where: { requestCode: ARM_CODE }, include: { events: true } });
  if (rec) {
    out.local = {
      id: rec.id,
      requestCode: rec.requestCode,
      armRequestId: rec.armRequestId,
      source: rec.source,
      status: rec.status,
      customerName: rec.customerName,
      customerMobile: rec.customerMobile,
      actorCode: rec.actorCode,
      actorName: rec.actorName,
      title: rec.title,
      priceFrom: rec.priceFrom,
      priceTo: rec.priceTo,
      spaceFrom: rec.spaceFrom,
      spaceTo: rec.spaceTo,
      events: rec.events.map((e) => ({
        اقدام: e.eventTypeName,
        توسط: e.actorCode,
        تاریخ: e.hour ? `${e.hour}|${e.date}` : e.date,
        armSync: e.armSyncJson ? JSON.parse(e.armSyncJson).kind : null,
      })),
    };
    console.log("── رکورد محلی ──");
    console.log("  ", JSON.stringify(out.local));
  } else {
    console.log("!! رکورد محلی با کد 55920 یافت نشد");
  }

  const dir = path.join(process.cwd(), "scripts", "tmp");
  fs.writeFileSync(path.join(dir, "verify-result.json"), JSON.stringify(out, null, 2), "utf-8");
  console.log("saved → scripts/tmp/verify-result.json");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
