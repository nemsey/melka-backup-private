/**
 * Bootstrap کاشی‌ها — تنها نقطه‌ای که ماژول‌های کاشی import می‌شوند.
 * افزودن کاشی جدید در آینده = یک خط import در همین فایل؛
 * حذف کاشی = حذف همان خط. هسته و سایر کاشی‌ها دست‌نخورده می‌مانند.
 */

import "@/core/tiles/tiles/transactions";
import "@/core/tiles/tiles/experts";
import "@/core/tiles/tiles/settings";

export { transactionsTile } from "@/core/tiles/tiles/transactions";
export { expertsTile } from "@/core/tiles/tiles/experts";
export { settingsTile } from "@/core/tiles/tiles/settings";
