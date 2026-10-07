/**
 * /api/v1/crm/import/[entity] — نسخهٔ v1 (PN-012 · BLOCK 4 · بند ۴.۲)
 * آینهٔ سبک مسیر اصلی ‎/api/crm/import/[entity]‎ — همهٔ handlerها و configها re-export می‌شوند.
 * صفر تغییر رفتار · تک‌منبع حقیقت در مسیر اصلی · مسیر قدیمی = alias زنده.
 */
export * from "../../../../crm/import/[entity]/route";
