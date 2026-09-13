/**
 * Bootstrap کاشی‌ها — تنها نقطه‌ای که ماژول‌های کاشی import می‌شوند.
 * افزودن کاشی جدید در آینده = یک خط import در همین فایل؛
 * حذف کاشی = حذف همان خط. هسته و سایر کاشی‌ها دست‌نخورده می‌مانند.
 */

import "@/core/tiles/tiles/transactions";
import "@/core/tiles/tiles/experts";
import "@/core/tiles/tiles/extraction";
import "@/core/tiles/tiles/visits";
import "@/core/tiles/tiles/supply-demand";
import "@/core/tiles/tiles/file-finder";
import "@/core/tiles/tiles/settings";

export { transactionsTile } from "@/core/tiles/tiles/transactions";
export { expertsTile } from "@/core/tiles/tiles/experts";
export { extractionTile } from "@/core/tiles/tiles/extraction";
export { visitsTile } from "@/core/tiles/tiles/visits";
export { supplyDemandTile } from "@/core/tiles/tiles/supply-demand";
export { fileFinderTile } from "@/core/tiles/tiles/file-finder";
export { settingsTile } from "@/core/tiles/tiles/settings";
