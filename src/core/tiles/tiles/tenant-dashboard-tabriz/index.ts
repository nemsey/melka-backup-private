/**
 * کاشی «داشبورد ملک تبریز» — ظرف wrapper کاشی‌های M1-M4 (PN-043/فاز ۲ — شورا-ن۰۸۷)
 * ---------------------------------------------------------------------------
 * کاشی‌های M1 (آگهی) · M2 (درخواست) · M3 (معاملات) · M4 (کارشناسان) با
 * container: "tenant-dashboards" درون همین ظرف جمع شده‌اند.
 * «wrapper، نه تکرار» (قانون ۱۰): یک کد، دو کاربرد (tabriz + melketun).
 */

import { LayoutDashboard } from "lucide-react";
import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { tenantDashboardTilePage } from "@/components/tiles/TenantDashboard";

export const tenantDashboardTabrizTile = defineTile({
  id: "tenant-dashboard-tabriz",
  version: "1.0.0",
  title: "داشبورد ملک تبریز",
  tagline: "M1-M4 در یک داشبورد: آگهی · درخواست · معاملات · کارشناسان (wrapper مشترک tenant — PN-043)",
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
