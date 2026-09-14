/**
 * ماژول کاشی «بازدیدها و پیگیری‌ها» — تعریف کامل و ثبت در رجیستری
 * بر پایه «visits/list» واقعی سامانه ملک تبریز.
 * افزودن این کاشی به هر پروژه‌ای = فقط همین فایل + import در bootstrap.
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Eye } from "lucide-react";
import { VisitsPage } from "./VisitsPage";

export const visitsTile = defineTile({
  id: "visits",
  version: "1.0.0",
  title: "بازدیدها و پیگیری‌ها",
  tagline: "بازدیدهای مشتریان از آگهی‌ها با نرخ بررسی، رتبه‌بندی بررسی‌کنندگان و روند ماهانه",
  description:
    "عین «بازدیدها و نظرات» خود سامانه ملک تبریز: هر بازدید = درخواست‌دهنده × کد آگهی × بررسی‌کننده × زمان ثبت/بررسی — همراه با شاخص‌های نرخ بررسی، آگهی‌های پربازدید، فیلتر تاریخ هجری شمسی و ایجنت تحلیل بازدیدها.",
  icon: Eye,
  accent: "amber",
  component: VisitsPage,
  order: 8,
  agent: {
    tileId: "visits",
    insightDomains: ["VOLUME", "TREND", "STATUS", "LEADERSHIP", "ATTENTION"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "showCharts",
      label: "نمایش نمودار روند ماهانه",
      type: "switch",
      defaultValue: true,
      hint: "نمودار ستونی ثبت بازدید در ماه‌های هجری شمسی",
    },
  ],
});

tileRegistry.register(visitsTile);
