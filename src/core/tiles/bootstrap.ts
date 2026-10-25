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
// P6530/گام ۵ — کاشی‌های M5 (شاخص قیمت)، M6 (عرضه و تقاضا) و M7 (استخراج اطلاعات)
// به‌طور کامل حذف شدند (دستور مالک: حذف تمام آثار در همهٔ بخش‌ها و اسناد).
// داده‌های استخراج‌شدهٔ آن‌ها در پایگاه ماندگار است (قانون دادهٔ مقدس).
// PN-038/فاز ۲ (شورا-ن۰۶۳): بازطراحی UI — کوچک‌سازی و متمرکزسازی.
// کاشی‌های M6 (شاخص بازار) و M7 (پوشش داده) از رجیستری حذف شدند؛
// کانتینر «داشبورد مدیریتی» حذف شد و M1-M5 + M8 به ریشهٔ هوم رفتند؛
// کاشی‌های قدیمی «آگهی ملکا» و «درخواست ملکا» از هوم حذف شدند.
// PN-043/فاز ۲ (شورا-ن۰۸۷): یکپارچه‌سازی داشبوردها —
// کاشی‌های M1-M4 به ظرف tenant-dashboards رفتند و درون دو داشبورد
// «داشبورد ملک تبریز» و «داشبورد ملکتون» (wrapper مشترک) رندر می‌شوند.
// ترتیب جدید هوم: فایل یابی ← تطبیق ← مغز ← تنظیمات ← داشبورد ملک تبریز ← داشبورد ملکتون.
// روت مستقیم کاشی‌های M1-M4 (رجیستری + lazyPage) دست‌نخورده باقی می‌ماند.
// دادهٔ همهٔ کاشی‌های حذف/ادغام‌شده در پایگاه ماندگار است (قانون دادهٔ مقدس).
import "@/core/tiles/tiles/file-finder";
// P6.5-12 (بند ب مرحلهٔ قبل): کاشی «مشتریان ملک تبریز» حذف شد —
// دادهٔ مشتریان و ماژول‌های تحلیلی در پایگاه/کتابخانه ماندگارند (قانون دادهٔ مقدس)
import "@/core/tiles/tiles/arm-listing";
import "@/core/tiles/tiles/arm-request";
// P6545/گام۲ — چهار کاشی تازهٔ جلسه ۰۳۳ (BLOCK 2.5)
import "@/core/tiles/tiles/smart-matching";
import "@/core/tiles/tiles/learning-tier";
import "@/core/tiles/tiles/settings";
// PN-043/فاز ۲+۳ (شورا-ن۰۸۷) — داشبوردهای tenant (wrapper مشترک M1-M4): یک کد، دو کاربرد
import "@/core/tiles/tiles/tenant-dashboard-tabriz";
import "@/core/tiles/tiles/tenant-dashboard-melketun";

export { transactionsContractsTile } from "@/core/tiles/tiles/transactions-contracts";
export { expertsTile } from "@/core/tiles/tiles/experts";
export { fileFinderTile } from "@/core/tiles/tiles/file-finder";
// P6.5-12: customerClubTile حذف شد (حذف نما — داده ماندگار)
export { armListingTile } from "@/core/tiles/tiles/arm-listing";
export { armRequestTile } from "@/core/tiles/tiles/arm-request";
// P6545/گام۲ — صادرات چهار کاشی تازه
export { smartMatchingTile } from "@/core/tiles/tiles/smart-matching";
export { learningTierTile } from "@/core/tiles/tiles/learning-tier";
export { settingsTile } from "@/core/tiles/tiles/settings";
// PN-043/فاز ۲+۳ (شورا-ن۰۸۷) — داشبوردهای tenant
export { tenantDashboardTabrizTile } from "@/core/tiles/tiles/tenant-dashboard-tabriz";
export { tenantDashboardMelketunTile } from "@/core/tiles/tiles/tenant-dashboard-melketun";
