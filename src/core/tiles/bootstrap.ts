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
import "@/core/tiles/tiles/contracts";
import "@/core/tiles/tiles/customer-club";
import "@/core/tiles/tiles/finance-commission";
import "@/core/tiles/tiles/price-index";
import "@/core/tiles/tiles/listing";
import "@/core/tiles/tiles/request";
import "@/core/tiles/tiles/management-dashboard";
import "@/core/tiles/tiles/settings";

export { transactionsTile } from "@/core/tiles/tiles/transactions";
export { expertsTile } from "@/core/tiles/tiles/experts";
export { extractionTile } from "@/core/tiles/tiles/extraction";
export { visitsTile } from "@/core/tiles/tiles/visits";
export { supplyDemandTile } from "@/core/tiles/tiles/supply-demand";
export { fileFinderTile } from "@/core/tiles/tiles/file-finder";
export { contractsTile } from "@/core/tiles/tiles/contracts";
export { customerClubTile } from "@/core/tiles/tiles/customer-club";
export { financeCommissionTile } from "@/core/tiles/tiles/finance-commission";
export { priceIndexTile } from "@/core/tiles/tiles/price-index";
export { listingTile } from "@/core/tiles/tiles/listing";
export { requestTile } from "@/core/tiles/tiles/request";
export { managementDashboardTile } from "@/core/tiles/tiles/management-dashboard";
export { settingsTile } from "@/core/tiles/tiles/settings";
