/**
 * ماژول کاشی «قراردادها و اسناد» — تعریف کامل و ثبت در رجیستری
 * بر پایه «صورت وضعیت‌های» واقعی سامانه ARM (trade-overviews).
 * افزودن این کاشی = فقط همین فایل + import در bootstrap.
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { ScrollText } from "lucide-react";
import { ContractsPage } from "./ContractsPage";

export const contractsTile = defineTile({
  id: "contracts",
  version: "1.0.0",
  title: "قراردادها و اسناد",
  tagline: "ردیابی چرخه کامل عمر قراردادهای ملکی از پیش‌نویس تا تنظیم سند با تحلیل گلوگاه‌های اداری",
  description:
    "عین «صورت وضعیت‌های» خود سامانه: نُه وضعیت واقعی (پیش‌نویس، در انتظار افزودن مشاور، در انتظار تایید مشاوران، تایید حق‌السهم، در انتظار تایید مالی، تایید شده مالی، رد شده مالی، در انتظار تنظیم سند، رد شده) — نمودار قیفی توقف مراحل، جدول حق‌السهم و درصد مشاوران هر قرارداد، تاریخ سند/قرارداد/تحویل و خریداران.",
  icon: ScrollText,
  accent: "teal",
  component: ContractsPage,
  order: 2,
  agent: {
    tileId: "contracts",
    insightDomains: ["FUNNEL", "BOTTLENECK", "STALLED", "SHARE", "DOCUMENT", "REJECT"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "defaultStatus",
      label: "وضعیت پیش‌فرض فیلتر",
      type: "select",
      defaultValue: "all",
      options: [
        { value: "all", label: "همه وضعیت‌ها" },
        { value: "rejected", label: "رد / فسخ‌شده‌ها" },
        { value: "waitingForFinance", label: "در انتظار تایید مالی" },
        { value: "waitingForDocument", label: "در انتظار تنظیم سند" },
      ],
      hint: "وضعیت پیش‌فرض نمایش لیست قراردادها هنگام ورود به کاشی",
    },
    {
      key: "pageSize",
      label: "تعداد ردیف در هر صفحه",
      type: "number",
      defaultValue: 30,
      min: 10,
      max: 100,
      hint: "حجم اطلاعات نمایشی در لیست صورت وضعیت‌ها",
    },
    {
      key: "showFunnel",
      label: "نمایش نمودار قیفی",
      type: "switch",
      defaultValue: true,
      hint: "نمودار قیف چرخه عمر قراردادها از پیش‌نویس تا تنظیم سند",
    },
  ],
});

tileRegistry.register(contractsTile);
