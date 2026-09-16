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
