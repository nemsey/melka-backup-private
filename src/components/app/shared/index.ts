/**
 * اشتراک‌های UI صفحات گزارش CRM (PHASE 1 / P1-01)
 * ------------------------------------------------------
 * چهار جزء مشترک استخراج‌شده از ۸ صفحه CRM + ۲ دیالوگ گام —
 * بدون هیچ تغییر DOM یا رفتار (شرط پذیرش: اسکرین‌شات‌ها یکسان).
 */

export { KpiCard, type KpiCardProps } from "./kpi-card";
export {
  StepReportList,
  type StepReportItem,
  type StepReportListProps,
  type StepReportStatus,
} from "./step-report-list";
export {
  DataSourceAlert,
  DataSourceWarning,
  type DataSourceInfo,
  type DataSourceAlertProps,
  type DataSourceWarningProps,
} from "./data-source";
export { useTileData, type UseTileDataOptions, type UseTileDataResult } from "./use-tile-data";
// P6546/گام پنجم — مؤلفه‌های مشترک کاشی‌های چهارگانه
export { TileCoverageTable, type CoverageColumn } from "./coverage-table";
export { TopRankingTable, type RankRow } from "./top-ranking-table";
// PN-003 گام ۴-۲ — دکمهٔ بارگذاری اکسل (ایمپورت کل فهرست)
export { ExcelImportButton } from "./excel-import-button";
