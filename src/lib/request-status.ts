/**
 * قانون شش‌حالتهٔ وضعیت درخواست‌های ARM — P6530 / گام ۲ / M2 (دستور مالک ۱۴۰۵/۰۷/۹)
 * ---------------------------------------------------------------------------
 * شش حالت canonical عین نکته ۳ دستور مالک:
 *   معامله شده / در انتظار معامله / سرنخ / در انتظار تایید /
 *   از دست رفته/خرید از رقبا / سایر
 *
 * نگاشت بر پایهٔ شاهد DB (۷٬۳۹۸ رکورد ARM، 2026-09-29 — توزیع خام):
 *   سرنخ ۵٬۱۸۹ · ready ۱٬۳۴۸ (سایر — وضعیت چرخهٔ عمر داخلی ملکاست نه وضعیت درخواست
 *   در معنای دستور) · از دست رفته/خرید از رقبا ۵۶۱ · معامله شده ۱۷۴ ·
 *   بایگانی ۶۰ (سایر) · فرصت ۳۸ (سایر) · در انتظار تایید ۲۰ · در انتظار معامله ۸
 *   + یک رکورد source=manual (draft) خارج از کاتالوگ ARM است.
 *
 * «سایر» = هر مقدار خام خارج از پنج‌گانهٔ نام‌برده (ready/bایگانی/فرصت/draft…).
 */

/** کلیدهای شش حالت — پایدار برای API/UI/تست‌ها */
export type RequestStateKey =
  | "traded"
  | "pendingTrade"
  | "lead"
  | "pendingApproval"
  | "lostToCompetitors"
  | "other";

export interface RequestStateDef {
  key: RequestStateKey;
  /** برچسب canonical عین دستور مالک */
  label: string;
  /** مقدار(های) خام ARM که به این حالت نگاشت می‌شوند (پس از نرمال‌سازی متن) */
  rawValues: readonly string[];
  /** توضیح کوتاه برای tooltip */
  hint: string;
}

/** نرمال‌سازی متن وضعیت خام (نیم‌فاصله/فاصله — هم‌راستا با listing-status) */
export function normalizeRequestStatusText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** قانون شش‌حالته — ترتیب عین نکته ۳ دستور مالک (سایر در انتها) */
export const REQUEST_STATES: readonly RequestStateDef[] = [
  {
    key: "traded",
    label: "معامله شده",
    rawValues: ["معامله شده"],
    hint: "این درخواست به معامله منجر شده است",
  },
  {
    key: "pendingTrade",
    label: "در انتظار معامله",
    rawValues: ["در انتظار معامله"],
    hint: "در انتظار نهایی‌شدن معامله",
  },
  {
    key: "lead",
    label: "سرنخ",
    rawValues: ["سرنخ"],
    hint: "درخواست در مرحلهٔ سرنخ (Lead) است",
  },
  {
    key: "pendingApproval",
    label: "در انتظار تایید",
    rawValues: ["در انتظار تایید"],
    hint: "در انتظار تأیید مدیر",
  },
  {
    key: "lostToCompetitors",
    label: "از دست رفته/خرید از رقبا",
    rawValues: ["از دست رفته/خرید از رقبا"],
    hint: "مشتری از دست رفته یا از رقبا خریده است",
  },
  {
    key: "other",
    label: "سایر",
    rawValues: [],
    hint: "وضعیت‌های خارج از پنج‌گانهٔ اصلی (بایگانی، فرصت، در جریان کاری و…)",
  },
] as const;

/** کلید → تعریف */
export const REQUEST_STATE_BY_KEY: ReadonlyMap<RequestStateKey, RequestStateDef> = new Map(
  REQUEST_STATES.map((s) => [s.key, s])
);

/** مقدار خام نرمال‌شده → کلید حالت (سایر به‌عنوان الطاق باز برای مقادیر نامعلوم) */
export function classifyRequestStatus(raw: string | null | undefined): RequestStateKey {
  if (!raw) return "other";
  const norm = normalizeRequestStatusText(raw);
  for (const s of REQUEST_STATES) {
    if (s.rawValues.includes(norm)) return s.key;
  }
  return "other";
}

/** برچسب canonical یک وضعیت خام (سایر = متن خام نمایش داده نمی‌شود در ستون) */
export function requestStatusLabel(raw: string | null | undefined): string {
  return REQUEST_STATE_BY_KEY.get(classifyRequestStatus(raw))!.label;
}

/**
 * مقادیر خام DB معادل مجموعه‌ای از کلیدها — برای فیلتر WHERE status IN (...).
 * «other» به‌صورت فهرست منفی پیاده می‌شود (NOT IN پنج‌گانه) در لایهٔ روت.
 */
export function requestStateRawValues(keys: Iterable<RequestStateKey>): string[] {
  const out = new Set<string>();
  for (const k of keys) {
    if (k === "other") continue; // سایر = نقیض پنج‌گانه — در روت با NOT IN اعمال می‌شود
    const def = REQUEST_STATE_BY_KEY.get(k);
    if (!def) continue;
    for (const raw of def.rawValues) out.add(raw);
  }
  return [...out];
}

/** تجزیهٔ پارامتر API — کلیدهای جدا شده با کاما؛ مقادیر ناشناخته نادیده گرفته می‌شوند */
export function parseRequestStateFilter(param: string | null | undefined): RequestStateKey[] {
  if (!param) return [];
  const valid = new Set(RequestStateKeyValues);
  return param
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((w): w is RequestStateKey => valid.has(w as RequestStateKey));
}

/** همهٔ کلیدهای معتبر — برای اعتبارسنجی */
export const RequestStateKeyValues: readonly RequestStateKey[] = REQUEST_STATES.map((s) => s.key);

/** فیلتر شامل «سایر» است؟ (راهنمای لایهٔ روت برای NOT IN) */
export function requestFilterIncludesOther(keys: readonly RequestStateKey[]): boolean {
  return keys.includes("other");
}

/**
 * جمع‌کردن شمارش‌های خام (groupBy status) به توزیع canonical شش‌حالته.
 * خروجی: هر شش حالت + total (سایر خودش یکی از شش حالت است).
 */
export function rollupRequestStatusCounts(
  rawCounts: Iterable<[string | null, number]>
): Record<RequestStateKey, number> & { total: number } {
  const out = {
    traded: 0,
    pendingTrade: 0,
    lead: 0,
    pendingApproval: 0,
    lostToCompetitors: 0,
    other: 0,
    total: 0,
  };
  for (const [raw, n] of rawCounts) {
    out[classifyRequestStatus(raw)] += n;
    out.total += n;
  }
  return out;
}
