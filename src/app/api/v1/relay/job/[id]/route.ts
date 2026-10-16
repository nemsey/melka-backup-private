/**
 * /api/v1/relay/job/[id] — نسخهٔ v1 (PN-035 · آینهٔ سبک)
 * آینهٔ سبک مسیر اصلی ‎/api/relay/job/[id]‎ — همهٔ handlerها و configها re-export می‌شوند.
 * صفر تغییر رفتار · تک‌منبع حقیقت در مسیر اصلی · مسیر قدیمی = alias زنده.
 */
export * from "../../../../relay/job/[id]/route";
