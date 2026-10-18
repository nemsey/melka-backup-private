/**
 * /api/v1/agent/[tileId]/stats — نسخهٔ v1 (PN-012 · BLOCK 4 · بند ۴.۲)
 * آینهٔ سبک مسیر اصلی ‎/api/agent/[tileId]/stats‎ — همهٔ handlerها و configها re-export می‌شوند.
 * صفر تغییر رفتار · تک‌منبع حقیقت در مسیر اصلی · مسیر قدیمی = alias زنده.
 */
export * from "../../../../agent/[tileId]/stats/route";
