/**
 * ماژول کاشی «کارشناسان» — تعریف و ثبت در رجیستری
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Users } from "lucide-react";
import { ExpertsPage } from "./ExpertsPage";

export const expertsTile = defineTile({
  id: "experts",
  version: "1.0.0",
  title: "کارشناسان",
  tagline: "بانک اطلاعات و تحلیل عملکرد کارشناسان ملک تبریز",
  description:
    "اطلاعات کامل کارشناسان با فیلتر نام و نام خانوادگی، موبایل، کد پرسنلی، آدرس، شعبه و وضعیت — همراه با تحلیل عملکرد توسط ایجنت.",
  icon: Users,
  accent: "teal",
  component: ExpertsPage,
  order: 2,
  agent: {
    tileId: "experts",
    insightDomains: ["RANKING", "ACTIVITY", "SEGMENT", "RISK", "CAPACITY"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "viewMode",
      label: "نوع نمایش",
      type: "select",
      defaultValue: "cards",
      options: [
        { value: "cards", label: "کارت‌های حرفه‌ای" },
        { value: "table", label: "جدول فشرده" },
      ],
      hint: "نحوه نمایش فهرست کارشناسان",
    },
  ],
});

tileRegistry.register(expertsTile);
