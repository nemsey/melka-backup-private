/**
 * /api/v1/runtime/health — نسخهٔ v1 (PN-012 · BLOCK 4 · بند ۴.۲)
 * آینهٔ سبک مسیر اصلی ‎/api/runtime/health‎ — همهٔ handlerها و configها re-export می‌شوند.
 * صفر تغییر رفتار · تک‌منبع حقیقت در مسیر اصلی · مسیر قدیمی = alias زنده.
 */
export * from "../../../runtime/health/route";
