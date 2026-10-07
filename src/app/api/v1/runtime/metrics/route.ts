/**
 * /api/v1/runtime/metrics — نسخهٔ v1 (PN-013 فاز ۴ · مرحلهٔ ۶)
 * آینهٔ سبک مسیر اصلی ‎/api/runtime/metrics‎ — همهٔ handlerها و configها
 * re-export می‌شوند (الگوی BLOCK 4 ن۰۱۲). صفر تغییر رفتار · تک‌منبع حقیقت
 * در مسیر اصلی · مسیر قدیمی = alias زنده.
 */

export * from "../../../runtime/metrics/route";
