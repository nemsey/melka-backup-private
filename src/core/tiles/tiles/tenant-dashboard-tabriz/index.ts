/**
 * کاشی «داشبورد ملک تبریز» — ظرف wrapper کاشی‌های M1-M4 (PN-043/فاز ۲ — شورا-ن۰۸۷)
 * ---------------------------------------------------------------------------
 * کاشی‌های M1 (آگهی) · M2 (درخواست) · M3 (معاملات) · M4 (کارشناسان) با
 * container: "tenant-dashboards" درون همین ظرف جمع شده‌اند.
 * PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱): داشبورد ملکتون حذف شد — تنها tabriz زنده است.
 */

import { LayoutDashboard } from "lucide-react";
import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { tenantDashboardTilePage } from "@/components/tiles/TenantDashboard";

export const tenantDashboardTabrizTile = defineTile({
  id: "tenant-dashboard-tabriz",
  version: "1.0.0",
  title: "داشبورد ملک تبریز",
  tagline: "M1 آگهی · M2 درخواست · M3 معاملات · M4 کارشناسان — هویت کاشی‌های ملک تبریز (PN-047)",
  description:
    "داشبورد یکپارچهٔ ملک تبریز: چهار کاشی (آگهی، درخواست، معاملات، کارشناسان) درون یک ظرف مشترک چند-مستأجری — بدون تکرار کد (PN-043/فاز ۲ — شورا-ن۰۸۷).",
  icon: LayoutDashboard,
  accent: "mgmt",
  component: tenantDashboardTilePage("tabriz"),
  order: 5, // PN-043 (شورا-ن۰۸۷) — ترتیب جدید هوم: داشبورد ملک تبریز پنجم
  agent: null, // ایجنت‌های هوشمند روی خود کاشی‌های M1-M4 پیوند خورده‌اند (بدون تغییر)
  settings: [],
});

tileRegistry.register(tenantDashboardTabrizTile);
