/**
 * ماژول کاشی «باشگاه مشتریان» — تعریف کامل و ثبت در رجیستری
 * بر پایه فهرست‌های مرجع واقعی سامانه ARM + معاملات و قراردادهای همگام‌شده.
 */

import { defineTile } from "@/core/tiles/tile-contract";
// P6549/۰۳۵-B-ح: بارگذاری تنبل صفحهٔ کاشی (چانک اولیه سبک می‌شود)
import { lazyPage } from "@/core/tiles/lazy-page";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Users } from "lucide-react";

export const customerClubTile = defineTile({
  id: "customer-club",
  version: "1.0.0",
  title: "باشگاه مشتریان ملک تبریز",
  tagline: "تحلیل جامعه مشتریان ملک تبریز — شخصیت‌ها، مشتریان تکراری و رشد زمانی جامعه",
  description:
    "بر پایه لیست‌های واقعی سامانه (شخصیت، شغل و نقش مشتری) تلفیق‌شده با مالکان و درخواست‌دهندگان حاضر در معاملات: توزیع شخصیت‌ها، مشتریان تکراری (خریدار و فروشنده همزمان) و رشد جامعه مشتریان در زمان — برای شناخت عمیق مخاطب، شخصی‌سازی خدمات و برنامه وفادارسازی.",
  icon: Users,
  accent: "consultant",
  component: lazyPage(() => import("./CustomerClubPage")),
  order: 3,
  container: "management-dashboard",
  agent: {
    tileId: "customer-club",
    insightDomains: ["COMMUNITY", "REPEAT", "GROWTH", "LOYALTY", "CATALOG"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "showCharts",
      label: "نمایش نمودار رشد",
      type: "switch",
      defaultValue: true,
      hint: "نمودار روند ماهانه (هجری شمسی) ورود مشتریان جدید به جامعه",
    },
  ],
});

tileRegistry.register(customerClubTile);
