/**
 * ماژول کاشی «کارشناسان» — تعریف و ثبت در رجیستری
 * بازنویسی بر پایه «فهرست کاربران» و «تعاملات مشاوران» واقعی سامانه ملک تبریز.
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Users } from "lucide-react";
import { ExpertsPage } from "./ExpertsPage";

export const expertsTile = defineTile({
  id: "experts",
  version: "2.0.0",
  title: "کارشناسان",
  tagline: "بانک اطلاعات کاربران و شبکه همکاری مشاوران ملک تبریز",
  description:
    "عین «فهرست کاربران» خود سامانه: نام، موبایل، نقش، کسب‌وکار، ثبت‌کننده، تاریخ ثبت (هجری شمسی) و وضعیت — به‌علاوه «تعاملات مشاوران با یکدیگر» و درجه همکاری هر مشاور.",
  icon: Users,
  accent: "teal",
  component: ExpertsPage,
  order: 2,
  agent: {
    tileId: "experts",
    insightDomains: ["COMPOSITION", "ACTIVITY", "GROWTH", "NETWORK", "RISK"],
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
      hint: "نحوه نمایش فهرست کاربران",
    },
  ],
});

tileRegistry.register(expertsTile);
