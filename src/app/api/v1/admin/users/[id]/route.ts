/**
 * /api/v1/admin/users/[id] — نسخهٔ v1 (PN-012 · BLOCK 4 · بند ۴.۲)
 * آینهٔ سبک مسیر اصلی ‎/api/admin/users/[id]‎ — همهٔ handlerها و configها re-export می‌شوند.
 * صفر تغییر رفتار · تک‌منبع حقیقت در مسیر اصلی · مسیر قدیمی = alias زنده.
 */
export * from "../../../../admin/users/[id]/route";
