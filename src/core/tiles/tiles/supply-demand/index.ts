/**
 * ماژول کاشی «عرضه و تقاضا» — تعریف کامل و ثبت در رجیستری
 * بر پایه «realtor-reports/supply-demand» واقعی سامانه ملک تبریز.
 * افزودن این کاشی به هر پروژه‌ای = فقط همین فایل + import در bootstrap.
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Scale } from "lucide-react";
import { SupplyDemandPage } from "./SupplyDemandPage";

export const supplyDemandTile = defineTile({
  id: "supply-demand",
  version: "1.0.0",
  title: "عرضه و تقاضا",
  tagline: "تعادل بازار ملک تبریز: بازه‌های گرم و سرد، فشار تقاضا و هدایت قیمت‌گذاری",
  description:
    "عین «گزارش عرضه و تقاضا» خود سامانه ملک تبریز: بازه × تعداد آگهی × درصد درخواست × وضعیت — همراه با شاخص تعادل بازار، بازه‌های با فشار تقاضای بالا/پایین و ایجنت تحلیل بازار برای هدایت قیمت‌گذاری آگهی‌های جدید.",
  icon: Scale,
  accent: "rose",
  component: SupplyDemandPage,
  order: 9,
  agent: {
    tileId: "supply-demand",
    insightDomains: ["BALANCE", "PRESSURE", "STRATEGY"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "showCharts",
      label: "نمایش نمودار مقایسه بازه‌ها",
      type: "switch",
      defaultValue: true,
      hint: "نوارهای مقایسه عرضه (تعداد آگهی) و فشار تقاضا (درصد درخواست)",
    },
  ],
});

tileRegistry.register(supplyDemandTile);
