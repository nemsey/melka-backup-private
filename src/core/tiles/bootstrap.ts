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
import "@/core/tiles/tiles/extraction";
import "@/core/tiles/tiles/supply-demand";
import "@/core/tiles/tiles/file-finder";
import "@/core/tiles/tiles/customer-club";
import "@/core/tiles/tiles/price-index";
import "@/core/tiles/tiles/listing";
import "@/core/tiles/tiles/request";
import "@/core/tiles/tiles/arm-listing";
import "@/core/tiles/tiles/arm-request";
import "@/core/tiles/tiles/management-dashboard";
import "@/core/tiles/tiles/settings";

export { transactionsContractsTile } from "@/core/tiles/tiles/transactions-contracts";
export { expertsTile } from "@/core/tiles/tiles/experts";
export { extractionTile } from "@/core/tiles/tiles/extraction";
export { supplyDemandTile } from "@/core/tiles/tiles/supply-demand";
export { fileFinderTile } from "@/core/tiles/tiles/file-finder";
export { customerClubTile } from "@/core/tiles/tiles/customer-club";
export { priceIndexTile } from "@/core/tiles/tiles/price-index";
export { listingTile } from "@/core/tiles/tiles/listing";
export { requestTile } from "@/core/tiles/tiles/request";
export { armListingTile } from "@/core/tiles/tiles/arm-listing";
export { armRequestTile } from "@/core/tiles/tiles/arm-request";
export { managementDashboardTile } from "@/core/tiles/tiles/management-dashboard";
export { settingsTile } from "@/core/tiles/tiles/settings";
