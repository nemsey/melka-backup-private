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
// PN-043/فاز ۲ (شورا-ن۰۸۷): M1-M4 به ظرف tenant-dashboards رفتند (wrapper مشترک).
// PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱): کاشی «داشبورد ملکتون» حذف شد.
// PN-086/گام ۱ (دستور مالک ۱۴۰۵/۰۸/۲۵ ساعت ۰۷:۴۵ تهران) — انحلال ظرف و هفت‌تایی‌شدن هوم:
//   · کاشی «داشبورد ملک تبریز» (wrapper) حذف شد؛ M1-M4 به ریشهٔ هوم صعود کردند.
//   · کاشی «فایل‌یابی» به حکم صریح مالک حذف شد — دادهٔ دیوار/فرصت‌ها و
//     خط‌لولهٔ اسکن در پایگاه و Worker ماندگارند (قانون دادهٔ مقدس).
//   · ترتیب هفت‌تایی هوم: آگهی ← درخواست ← معاملات ← کارشناسان ← تطبیق ← مغز ملکا ← تنظیمات.
//   · گام ۲: در هر چهار کاشی M1-M4 قاب «بروزرسانی چهار فهرست» + «نوار لینک به
//     کاشی‌های دیگر» (M1-M4 + تطبیق) حفظ شد (FourListsTileChrome).
// P6.5-12 (بند ب مرحلهٔ قبل): کاشی «مشتریان ملک تبریز» حذف شد —
// دادهٔ مشتریان و ماژول‌های تحلیلی در پایگاه/کتابخانه ماندگارند (قانون دادهٔ مقدس)
import "@/core/tiles/tiles/arm-listing";
import "@/core/tiles/tiles/arm-request";
// P6545/گام۲ — چهار کاشی تازهٔ جلسه ۰۳۳ (BLOCK 2.5)
import "@/core/tiles/tiles/smart-matching";
import "@/core/tiles/tiles/learning-tier";
import "@/core/tiles/tiles/settings";
// DIR-CHANGES-TILE-001 (دستور مالک ۱۴۰۵/۰۸/۲۸) — کاشی «تغییرات»: ایجاد و انجام
// تغییرات در کدآگهی و کد درخواست سامانه ARM طبق نظر مالک (شناخت ۰۹۹) +
// حالت تمام‌ظرفیت ترموکس (گام سوم · کدنصب نسل O).
import "@/core/tiles/tiles/changes";

export { transactionsContractsTile } from "@/core/tiles/tiles/transactions-contracts";
export { expertsTile } from "@/core/tiles/tiles/experts";
// PN-086/گام ۱: fileFinderTile حذف شد (حذف نما — داده/خط‌لولهٔ دیوار مقدس و ماندگار)
// P6.5-12: customerClubTile حذف شد (حذف نما — داده ماندگار)
export { armListingTile } from "@/core/tiles/tiles/arm-listing";
export { armRequestTile } from "@/core/tiles/tiles/arm-request";
// P6545/گام۲ — صادرات چهار کاشی تازه
export { smartMatchingTile } from "@/core/tiles/tiles/smart-matching";
export { learningTierTile } from "@/core/tiles/tiles/learning-tier";
export { settingsTile } from "@/core/tiles/tiles/settings";
// DIR-CHANGES-TILE-001 — صادرات کاشی «تغییرات»
export { changesTile } from "@/core/tiles/tiles/changes";
// PN-086/گام ۱: tenantDashboardTabrizTile حذف شد — ظرف منحل؛ M1-M4 اکنون ریشه‌اند
