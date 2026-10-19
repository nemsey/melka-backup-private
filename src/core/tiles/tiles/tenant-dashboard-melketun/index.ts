/**
 * کاشی «داشبورد ملکتون» — ظرف wrapper کاشی‌های M1-M4 (PN-043/فاز ۲+۳ — شورا-ن۰۸۷)
 * ---------------------------------------------------------------------------
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
  version: "1.0.0",
  title: "داشبورد ملکتون",
  tagline: "M1-M4 در یک داشبورد: آگهی · درخواست · معاملات · کارشناسان (wrapper مشترک tenant — PN-043)",
  description:
    "داشبورد یکپارچهٔ ملکتون: چهار کاشی (آگهی، درخواست، معاملات، کارشناسان) درون ظرف مشترک چند-مستأجری — همان کد ملک تبریز با tenant مستقل (PN-043/فاز ۳ — شورا-ن۰۸۷).",
  icon: Landmark,
  accent: "mgmt",
  component: tenantDashboardTilePage("melketun"),
  order: 6, // PN-043 (شورا-ن۰۸۷) — ترتیب جدید هوم: داشبورد ملکتون ششم
  agent: null, // ایجنت‌های هوشمند روی خود کاشی‌های M1-M4 پیوند خورده‌اند (بدون تغییر)
  settings: [],
});

tileRegistry.register(tenantDashboardMelketunTile);
