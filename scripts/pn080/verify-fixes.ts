#!/usr/bin/env bun
/**
 * PN-080 · راستی‌آزمایی اصلاحات گام ۲ — پیش از بیلد
 * -----------------------------------------------------------
 * ۱) اولویت صف رله برای خانوادهٔ ثبت آگهی (properties/create · users/*) = ۵
 * ۲) هر ترکیب DIVAR_CATEGORY_TO_ARM معتبر است در برابر رجیستری‌های «زندهٔ» آرم:
 *    tradeType ∈ tradeTypes · buildingType ∈ buildingTypes ·
 *    tradeType مجازِ building · propertyType مجازِ building (نقشهٔ آبشاری)
 * ۳) buildCreatePayload: شناسه‌های خام کشور/استان/شهر (قرارداد آرم)
 * منبع زنده: download/PN-080/live-arm-registries.json (کشف رلهٔ تولید)
 */
import { readFileSync } from "node:fs";

const live = JSON.parse(readFileSync(`${import.meta.dir}/../../download/PN-080/live-arm-registries.json`, "utf-8")).registries as Record<string, { _id: string; name: string }[]>;

const { relayPriorityForUrl } = await import("../../src/lib/melk-api/relay");
const { DIVAR_CATEGORY_TO_ARM } = await import("../../src/lib/listing/store");
const { buildCreatePayload, IRAN_COUNTRY_ID, AZ_SHARGHI_STATE_ID } = await import("../../src/lib/listing/crm-transfer");

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
};

// ── ۱) اولویت رله ──
console.log("== ۱) اولویت صف رله (PN-080) ==");
check(relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/properties/create") === 5, "properties/create → اولویت ۵");
check(relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/users/create") === 5, "users/create → اولویت ۵");
check(relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/users/info/mobile-number/9141234567") === 5, "users/info/mobile-number → اولویت ۵");
check(relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/authentication/otp/123") === 5, "authentication/otp → اولویت ۵ (پابرجا)");
check(relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/realtor-reports/traded-count-total?page=1") === 2, "realtor-reports → اولویت ۲ (پابرجا)");
check(relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/requests/list?page=1") === 1, "requests/list → اولویت ۱ (پابرجا)");
check(relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/properties/details/abc") === 0, "مسیرهای دیگر → اولویت ۰ (پابرجا)");

// ── ۲) اعتبار نگاشت دسته‌ها در برابر رجیستری زنده ──
console.log("\n== ۲) نگاشت دسته‌های دیوار در برابر رجیستری زندهٔ آرم ==");
const tradeIds = new Set(live.tradeTypes.map((t) => t._id));
const buildingIds = new Set(live.buildingTypes.map((b) => b._id));
const propAll = new Set(live.propertyTypes.map((p) => p._id));
// نقشهٔ آبشاری زنده: building → tradeTypes مجاز و propertyTypes مجاز
// (کشف زندهٔ قبلی: property-types/list?buildingType — عین src/lib/request/types.ts)
const { BUILDING_TYPES: REQ_BUILDINGS, PROPERTY_TYPES: REQ_PROPS } = await import("../../src/lib/request/types");
const allowedTrade = new Map(REQ_BUILDINGS.map((b) => [b.id, new Set(b.tradeTypeIds)]));
const allowedProps = new Map(Object.entries(REQ_PROPS).map(([bid, list]) => [bid, new Set(list.map((p) => p.id))]));

for (const [cat, m] of Object.entries(DIVAR_CATEGORY_TO_ARM)) {
  const okTrade = tradeIds.has(m.tradeType);
  const okBuilding = buildingIds.has(m.buildingType);
  const okProp = propAll.has(m.propertyType);
  const okTradeOfBuilding = allowedTrade.get(m.buildingType)?.has(m.tradeType) ?? false;
  const okPropOfBuilding = allowedProps.get(m.buildingType)?.has(m.propertyType) ?? false;
  check(
    okTrade && okBuilding && okProp && okTradeOfBuilding && okPropOfBuilding,
    `${cat} (${m.tradeTypeName} × ${m.buildingTypeName} × ${m.propertyTypeName})`,
    `trade:${okTrade ? "✓" : "❌"} building:${okBuilding ? "✓" : "❌"} prop:${okProp ? "✓" : "❌"} آبشاری-معامله:${okTradeOfBuilding ? "✓" : "❌"} آبشاری-ملک:${okPropOfBuilding ? "✓" : "❌"}`
  );
}

// ── ۳) بدنهٔ ثبت: شناسه‌های خام ──
console.log("\n== ۳) بدنهٔ properties/create (قرارداد شناسه‌ای) ==");
const payload = buildCreatePayload({
  customerId: "USER123",
  areaId: "6158168f6cd8d114dcd010fd",
  areaName: "17 شهریور جدید",
  lineId: "61781957601cbd30c974d74b",
  lineName: "ارگ",
  address: "آدرس آزمون",
  tradeTypeId: "614ed62da50555f0a54c1eca",
  propertyTypeId: "614ee704a50555f0a54c227d",
  buildingTypeId: "614edc35a50555f0a54c1f12",
  changeWith: ["notChangeable"],
  inputs: { مساحت: "120" },
  images: [],
  videos: [],
  priceEvaluation: "61a7dae115a8b67e5ef937ad",
  fileFinding: "divar",
  fileType: ["private"],
  userSeriousness: "61a7535f0927675c45489a3b",
  description: "تست",
});
check(payload.country === IRAN_COUNTRY_ID && live.countries[0]._id === IRAN_COUNTRY_ID, "country = شناسهٔ خام ایران (زنده)");
check(payload.state === AZ_SHARGHI_STATE_ID && live.states[0]._id === AZ_SHARGHI_STATE_ID, "state = شناسهٔ خام آذربایجان شرقی (زنده)");
check(typeof payload.customer === "string", "customer = شناسهٔ خام کاربر (نه شیء نام/موبایل)");
check(typeof payload.area === "string" && typeof payload.line === "string", "area/line = شناسهٔ خام (نه شیء {name,_id})");
check(live.tradeTypes.some((t) => t._id === payload.tradeType), "tradeType ∈ فهرست زنده");
check(live.buildingTypes.some((b) => b._id === payload.buildingType), "buildingType ∈ فهرست زنده");
check(live.priceEvaluations.some((p) => p._id === payload.priceEvaluation), "priceEvaluation ∈ فهرست زنده (دسته‌ای)");
check(live.userSeriousness.some((s) => s._id === payload.userSeriousity), "userSeriousity ∈ فهرست زنده");

console.log(`\n${failures === 0 ? "همهٔ راستی‌آزمایی‌ها ✓ (PN-080)" : `${failures} شکست ❌`}`);
process.exit(failures === 0 ? 0 : 1);
