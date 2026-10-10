/**
 * قانون ستون‌های سایهٔ نرمال — PN-027 · ۵-پ-۱/۲ (جلسهٔ ۰۳۴ فرم ۵-پ)
 * ============================================================================
 * ریشهٔ ایجاد: فیلترهای متنی M1/M2 پس از واکشی تا ۲۵/۲۷ هزار ردیفِ سنگین
 * در JS اعمال می‌شدند (P95 = ۲٬۹۵۵ms برای «سند» M2 — گلوگاه ۱ نقشهٔ سرعت).
 *
 * راه‌حل: ستون‌های نرمال‌شدهٔ ازپیش‌محاسبه + فیلتر در سطح SQL (contains).
 *
 * قوانین این ماژول (برای همیشه):
 *   ۱. هم‌ارزی عینی با JS قدیم: هر فیلتری که نام/موبایل/سند/آدرس را
 *      می‌پذیرفت، همان نتیجه را روی ستون نرمال می‌گیرد (تست رگرسیون گارد می‌کند).
 *   ۲. جداکنندهٔ ␟ (U+001F — unit separator): در ورودی UI غیرقابل تولید است؛
 *      جست‌وجوی چندمیدانی (نام+موبایل / آدرس+محله+خط) را در یک ستون ممکن
 *      می‌کند بدون تطبیق کاذب بین‌مرزی.
 *   ۳. نرمال‌سازی = منبع یگانهٔ موجود: normalizeFilterInput (P6525).
 *   ۴. نوشتن در هر مسیر ثبت/همگام‌سازی الزامی است — writeProps* را در upsert ها
 *      نشاندن (گارد پُری ستون‌ها در دروازه).
 */

import { normalizeFilterInput } from "@/lib/normalize-input";

/** جداکنندهٔ غیرقابل‌تولید از ورودی کاربر (رابط کاربری متنی نمی‌تواند U+001F بسازد) */
export const SEARCH_FIELD_SEP = "\u001F";

function norm(v: string | null | undefined): string {
  return normalizeFilterInput(v ?? "");
}

function joinSep(parts: (string | null | undefined)[]): string | null {
  const joined = parts.map((p) => norm(p)).join(SEARCH_FIELD_SEP);
  return joined.replaceAll(SEARCH_FIELD_SEP, "") === "" ? null : joined;
}

/** M2 — ستون‌های نرمال RequestRecord از ردیف خام */
export function requestNormColumns(row: {
  customerName?: string | null;
  rawCustomerName?: string | null;
  customerMobile?: string | null;
  sanadNames?: string | null;
  actorName?: string | null;
}): { customerNameNorm: string | null; sanadNamesNorm: string | null; actorNameNorm: string | null } {
  return {
    customerNameNorm: joinSep([row.customerName ?? row.rawCustomerName, row.customerMobile]),
    sanadNamesNorm: norm(row.sanadNames) || null,
    actorNameNorm: norm(row.actorName) || null,
  };
}

/** M1 — ستون‌های نرمال PropertyRecord از ردیف خام */
export function propertyNormColumns(row: {
  ownerName?: string | null;
  rawOwnerName?: string | null;
  ownerMobile?: string | null;
  address?: string | null;
  areaName?: string | null;
  lineName?: string | null;
}): { realtorNameNorm: string | null; ownerSearchNorm: string | null; addressSearchNorm: string | null } {
  return {
    realtorNameNorm: norm(row.ownerName) || null,
    ownerSearchNorm: joinSep([row.rawOwnerName, row.ownerMobile]),
    addressSearchNorm: joinSep([row.address, row.areaName, row.lineName]),
  };
}
