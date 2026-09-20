/**
 * ماژول کاشی «معاملات» — تعریف کامل و ثبت در رجیستری
 * بازنویسی بر پایه «گزارش تطابق معاملات» واقعی سامانه ملک تبریز.
 * افزودن این کاشی به هر پروژه‌ای = فقط همین فایل + import در bootstrap.
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { FileCheck2 } from "lucide-react";
import { TransactionsPage } from "./TransactionsPage";

export const transactionsTile = defineTile({
  id: "transactions",
  version: "2.0.0",
  title: "معاملات ملک تبریز",
  tagline: "گزارش تطابق معاملات سامانه ملک تبریز با تحلیل هوشمند روند و ترکیب",
  description:
    "عین «گزارش تطابق معاملات» خود سامانه: هر معامله = تطبیق آگهی ملک با درخواست خرید + قرارداد (تاریخ، هولوگرام) + رویداد و آگهی پیشنهادی — همراه با شاخص‌های چهارگانه، فیلتر تاریخ هجری شمسی و نمودارهای روند.",
  icon: FileCheck2,
  accent: "emerald",
  component: TransactionsPage,
  order: 1,
  container: "management-dashboard",
  agent: {
    tileId: "transactions",
    insightDomains: ["VOLUME", "TREND", "COMPOSITION", "CONVERSION", "DOCUMENT", "ANOMALY"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "sortBy",
      label: "مرتب‌سازی پیش‌فرض جدول",
      type: "select",
      defaultValue: "contractDate",
      options: [
        { value: "contractDate", label: "تاریخ معامله" },
        { value: "eventsCount", label: "تعداد رویداد" },
        { value: "suggestedPropertyCount", label: "تعداد آگهی پیشنهادی" },
      ],
      hint: "ترتیب پیش‌فرض نمایش ردیف‌های جدول معاملات",
    },
    {
      // P6.5-09 — تنظیم «تعداد ردیف در هر صفحه» حذف شد: جدول تک‌صفحه‌ای و بی‌نهایت است
      key: "showCharts",
      label: "نمایش نمودارها",
      type: "switch",
      defaultValue: true,
      hint: "نمودار روند ماهانه (هجری شمسی) و ترکیب تطبیق",
    },
  ],
});

tileRegistry.register(transactionsTile);
