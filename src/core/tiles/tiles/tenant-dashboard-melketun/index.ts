/**
 * کاشی «داشبورد ملکتون» — ظرف wrapper کاشی‌های ملکتون (PN-043/فاز ۲+۳ — شورا-ن۰۸۷)
 * ---------------------------------------------------------------------------
 * PN-047/گام اول-۱ (دستور مالک ۱۴۰۵/۰۷/۲۹) — هویت مستقل کاشی‌های ملکتون:
 *   M7 آگهی · M8 درخواست · M9 معاملات · M10 کارشناسان
 * همان کامپوننت مشترک TenantDashboard با tenantId="melketun" — Multi-tenant
 * از روز اول (قانون ۱۱): یک کد، دو کاربرد. اتصال به سامانهٔ ملکتون از
 * تنظیمات یکپارچهٔ ملکتون (/settings/melketun) مدیریت می‌شود.
 */

import { Landmark } from "lucide-react";
import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { tenantDashboardTilePage } from "@/components/tiles/TenantDashboard";

export const tenantDashboardMelketunTile = defineTile({
  id: "tenant-dashboard-melketun",
  version: "1.1.0", // PN-047 — هویت مستقل M7-M10
  title: "داشبورد ملکتون",
  tagline: "M7 آگهی · M8 درخواست · M9 معاملات · M10 کارشناسان — هویت مستقل کاشی‌های ملکتون (PN-047)",
  description:
    "داشبورد یکپارچهٔ ملکتون: چهار کاشی با هویت مستقل (M7 آگهی، M8 درخواست، M9 معاملات، M10 کارشناسان — دستور مالک PN-047) درون ظرف مشترک چند-مستأجری — همان کد ملک تبریز با tenant مستقل (PN-043/فاز ۳ — شورا-ن۰۸۷).",
  icon: Landmark,
  accent: "mgmt",
  component: tenantDashboardTilePage("melketun"),
  order: 6, // PN-043 (شورا-ن۰۸۷) — ترتیب جدید هوم: داشبورد ملکتون ششم
  agent: null, // ایجنت‌های هوشمند روی خود کاشی‌های M1-M4 پیوند خورده‌اند (بدون تغییر)
  settings: [],
});

tileRegistry.register(tenantDashboardMelketunTile);
