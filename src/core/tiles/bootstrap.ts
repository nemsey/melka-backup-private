/**
 * Bootstrap کاشی‌ها — تنها نقطه‌ای که ماژول‌های کاشی import می‌شوند.
 * افزودن کاشی جدید در آینده = یک خط import در همین فایل؛
 * حذف کاشی = حذف همان خط. هسته و سایر کاشی‌ها دست‌نخورده می‌مانند.
 *
 * P6.5-11 (بندهای پ و ج):
 *   · سه کاشی «معاملات» + «قراردادها و اسناد» + «مالی و کمیسیون» در کاشی
 *     ادغامی «معاملات و قراردادهای ملک تبریز» ادغام شدند (سه → یک).
 *   · کاشی «بازدیدها و پیگیری‌ها» به‌کلی حذف شد (بینش‌ها به کاشی‌های مرتبط
 *     مهاجرت کردند: ایجنت ادغامی + کارشناسان + آگهی‌های ARM).
 *   · دادهٔ استخراج‌شدهٔ همهٔ کاشی‌های حذف/ادغام‌شده در پایگاه ماندگار است
 *     (نکتهٔ بسیار مهم ۲ — هیچ داده‌ای با تغییرات اپلیکیشن حذف نمی‌شود).
 */

import "@/core/tiles/tiles/transactions-contracts";
import "@/core/tiles/tiles/experts";
// بازسازی فازهای ۷-۸-۹ (دستور مالک ۱۴۰۵/۰۷/۷ — داشبورد مدیریتی = دقیقاً M1 تا M4):
// سه کاشی «استخراج اطلاعات» (M7)، «عرضه و تقاضا» (M6) و «شاخص قیمت» (M5)
// از داشبورد حذف شدند — عین رویهٔ مشتریان (P6.5-12: حذف نما — داده مقدس):
// ماژول‌ها و همهٔ داده‌های استخراج‌شده در پایگاه/کتابخانه ماندگارند.
// import "@/core/tiles/tiles/extraction";
// import "@/core/tiles/tiles/supply-demand";
import "@/core/tiles/tiles/file-finder";
// P6.5-12 (بند ب مرحلهٔ قبل): کاشی «مشتریان ملک تبریز» حذف شد —
// دادهٔ مشتریان و ماژول‌های تحلیلی در پایگاه/کتابخانه ماندگارند (قانون دادهٔ مقدس)
// بازسازی فازهای ۷-۸-۹: M5/M6/M7 نیز از داشبورد حذف شدند (حذف نما — داده ماندگار)
// import "@/core/tiles/tiles/price-index";
import "@/core/tiles/tiles/listing";
import "@/core/tiles/tiles/request";
import "@/core/tiles/tiles/arm-listing";
import "@/core/tiles/tiles/arm-request";
import "@/core/tiles/tiles/management-dashboard";
import "@/core/tiles/tiles/settings";

export { transactionsContractsTile } from "@/core/tiles/tiles/transactions-contracts";
export { expertsTile } from "@/core/tiles/tiles/experts";
// بازسازی فازهای ۷-۸-۹: M5/M6/M7 از داشبورد حذف شدند (حذف نما — ماژول‌ها ماندگار)
// export { extractionTile } from "@/core/tiles/tiles/extraction";
// export { supplyDemandTile } from "@/core/tiles/tiles/supply-demand";
export { fileFinderTile } from "@/core/tiles/tiles/file-finder";
// P6.5-12: customerClubTile حذف شد (حذف نما — داده ماندگار)
// بازسازی فازهای ۷-۸-۹: priceIndexTile حذف شد (حذف نما — داده ماندگار)
// export { priceIndexTile } from "@/core/tiles/tiles/price-index";
export { listingTile } from "@/core/tiles/tiles/listing";
export { requestTile } from "@/core/tiles/tiles/request";
export { armListingTile } from "@/core/tiles/tiles/arm-listing";
export { armRequestTile } from "@/core/tiles/tiles/arm-request";
export { managementDashboardTile } from "@/core/tiles/tiles/management-dashboard";
export { settingsTile } from "@/core/tiles/tiles/settings";
