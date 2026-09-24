/**
 * قانون شش‌حالتهٔ وضعیت آگهی‌های ARM — P6521 / M1 (دستور ۰۲۰ مالک)
 * ---------------------------------------------------------------------------
 * الگوی مرجع: `src/lib/contract-classify.ts` (پروندهٔ M3 — ملکا-شورا-۱۴۰۵-۰۱۸).
 *
 * شش حالت canonical عین دستور مالک:
 *   منتشر شده / منقضی شده / معامله شده / رد توسط مدیر / نمایش خصوصی / فایل غیر قابل احیا
 *
 * نگاشت بر پایهٔ شاهد DB (۱۱٬۳۹۸ رکورد، 2026-09-24): مقادیر خام ARM دقیقاً شش مقدار
 * برابر حالت‌های دستور دارند (دو مورد فقط تفاوت برچسب: «رد شده توسط مدیر» → «رد توسط مدیر»
 * و «اکران خصوصی» → «نمایش خصوصی»). پنج مقدار انتظاریِ باقیمانده (در انتظار بررسی مشاوران،
 * فایل قابل احیا، در انتظار تایید مشاور، در انتظار معامله، در انتظار تایید مدیر) جزء شش‌گانه
 * نیستند: خارج از طبقه‌بندی می‌مانند (سایر) و **هیچ نگاشت اختراعی روی آن‌ها انجام نمی‌شود**
 * (تصمیم §۳ docs/decision-preview-publish-v2.md).
 */

/** کلیدهای شش حالت — پایدار برای API/UI/تست‌ها */
export type ListingStateKey =
  | "published"
  | "expired"
  | "traded"
  | "rejected"
  | "private"
  | "unrecoverable";

export interface ListingStateDef {
  key: ListingStateKey;
  /** برچسب canonical عین دستور مالک */
  label: string;
  /** مقدار(های) خام ARM که به این حالت نگاشت می‌شوند (پس از نرمال‌سازی متن) */
  rawValues: readonly string[];
  /** توضیح کوتاه برای tooltip */
  hint: string;
}

/** نرمال‌سازی متن وضعیت خام: حذف فاصله‌های ابتدایی/انتهایی + یکسان‌سازی نیم‌فاصله/فاصله */
export function normalizeListingStatusText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/\u200c/g, " ") // نیم‌فاصله → فاصله
    .replace(/\s+/g, " ") // فاصله‌های تکراری → یکی
    .trim();
}

/**
 * قانون شش‌حالته — ترتیب عین دستور مالک.
 * rawValues عین مقادیر مشاهده‌شده در DB زندهٔ ARM است (با نیم‌فاصله نرمال‌شده).
 */
export const LISTING_STATES: readonly ListingStateDef[] = [
  {
    key: "published",
    label: "منتشر شده",
    rawValues: ["منتشر شده"],
    hint: "آگهی در سامانه ARM منتشر است",
  },
  {
    key: "expired",
    label: "منقضی شده",
    rawValues: ["منقضی شده"],
    hint: "اعتبار آگهی در سامانه به پایان رسیده است",
  },
  {
    key: "traded",
    label: "معامله شده",
    rawValues: ["معامله شده"],
    hint: "ملک این آگهی معامله شده است",
  },
  {
    key: "rejected",
    label: "رد توسط مدیر",
    rawValues: ["رد شده توسط مدیر"],
    hint: "آگهی توسط مدیر سامانه رد شده است",
  },
  {
    key: "private",
    label: "نمایش خصوصی",
    rawValues: ["اکران خصوصی"],
    hint: "آگهی فقط به‌صورت خصوصی نمایش داده می‌شود",
  },
  {
    key: "unrecoverable",
    label: "فایل غیر قابل احیا",
    rawValues: ["فایل غیر قابل احیا"],
    hint: "فایل آگهی در سامانه غیرقابل احیاست",
  },
] as const;

/** کلید → تعریف */
export const LISTING_STATE_BY_KEY: ReadonlyMap<ListingStateKey, ListingStateDef> = new Map(
  LISTING_STATES.map((s) => [s.key, s])
);

/** مقدار خام نرمال‌شده → کلید حالت */
const RAW_TO_KEY: ReadonlyMap<string, ListingStateKey> = (() => {
  const m = new Map<string, ListingStateKey>();
  for (const s of LISTING_STATES) {
    for (const raw of s.rawValues) m.set(normalizeListingStatusText(raw), s.key);
  }
  return m;
})();

/**
 * طبقه‌بندی وضعیت خام ARM → کلید حالت canonical.
 * خروجی null یعنی «خارج از شش‌گانه» (سایر) — ردیف با متن خام خودش و Badge خنثی نمایش داده می‌شود.
 */
export function classifyListingStatus(raw: string | null | undefined): ListingStateKey | null {
  if (!raw) return null;
  return RAW_TO_KEY.get(normalizeListingStatusText(raw)) ?? null;
}

/** برچسب canonical یک وضعیت خام؛ خروجی fallback متن خام نرمال‌شده است */
export function listingStatusLabel(raw: string | null | undefined): string {
  const key = classifyListingStatus(raw);
  if (key) return LISTING_STATE_BY_KEY.get(key)!.label;
  return normalizeListingStatusText(raw) || "—";
}

/**
 * مقادیر خام DB معادل مجموعه‌ای از کلیدهای حالت — برای فیلتر WHERE status IN (...).
 * فقط مقادیر ثبت‌شدهٔ قانون را برمی‌گرداند (نگاشت اختراعی وجود ندارد).
 */
export function listingStateRawValues(keys: Iterable<ListingStateKey>): string[] {
  const out = new Set<string>();
  for (const k of keys) {
    const def = LISTING_STATE_BY_KEY.get(k);
    if (!def) continue;
    for (const raw of def.rawValues) out.add(raw);
  }
  return [...out];
}

/** تجزیهٔ پارامتر API — کلیدهای جدا شده با کاما؛ مقادیر ناشناخته نادیده گرفته می‌شوند */
export function parseListingStateFilter(param: string | null | undefined): ListingStateKey[] {
  if (!param) return [];
  const wanted = param
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = new Set(ListingStateKeyValues);
  return wanted.filter((w): w is ListingStateKey => valid.has(w as ListingStateKey));
}

/** همهٔ کلیدهای معتبر — برای اعتبارسنجی */
export const ListingStateKeyValues: readonly ListingStateKey[] = LISTING_STATES.map((s) => s.key);

/**
 * جمع‌کردن شمارش‌های خام (خروجی groupBy) به توزیع canonical.
 * خروجی: هر شش حالت + «other» برای خارج از شش‌گانه.
 */
export function rollupStatusCounts(
  rawCounts: Iterable<[string | null, number]>
): Record<ListingStateKey | "other", number> & { total: number } {
  const out = {
    published: 0,
    expired: 0,
    traded: 0,
    rejected: 0,
    private: 0,
    unrecoverable: 0,
    other: 0,
    total: 0,
  };
  for (const [raw, n] of rawCounts) {
    const key = classifyListingStatus(raw);
    if (key) out[key] += n;
    else out.other += n;
    out.total += n;
  }
  return out;
}
