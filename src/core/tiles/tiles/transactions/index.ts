/**
 * ماژول کاشی «معاملات» — تعریف کامل و ثبت در رجیستری
 * افزودن این کاشی به هر پروژه‌ای = فقط همین فایل + import در bootstrap.
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Banknote } from "lucide-react";
import { TransactionsPage } from "./TransactionsPage";

export const transactionsTile = defineTile({
  id: "transactions",
  version: "1.0.0",
  title: "معاملات",
  tagline: "تحلیل کامل معاملات ملک تبریز با فیلتر پیشرفته و روند بازار",
  description:
    "اطلاعات کامل معاملات انجام‌شده در ملک تبریز با امکان فیلتر بر اساس تاریخ، کارشناس، کد آگهی، کد درخواست، مبلغ، محله و نوع ملک.",
  icon: Banknote,
  accent: "emerald",
  component: TransactionsPage,
  order: 1,
  agent: {
    tileId: "transactions",
    insightDomains: ["TREND", "VOLUME", "TOP_EXPERTS", "DISTRICT", "ANOMALY", "CONVERSION"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "sortBy",
      label: "مرتب‌سازی پیش‌فرض جدول",
      type: "select",
      defaultValue: "dealDate",
      options: [
        { value: "dealDate", label: "تاریخ معامله" },
        { value: "price", label: "مبلغ معامله" },
        { value: "expertName", label: "نام کارشناس" },
      ],
      hint: "ترتیب پیش‌فرض نمایش ردیف‌های جدول معاملات",
    },
    {
      key: "pageSize",
      label: "تعداد ردیف در هر صفحه",
      type: "number",
      defaultValue: 10,
      min: 5,
      max: 50,
      hint: "حجم اطلاعات نمایشی در هر صفحه جدول",
    },
    {
      key: "showCharts",
      label: "نمایش نمودارها",
      type: "switch",
      defaultValue: true,
      hint: "نمودار روند ماهانه و توزیع محله‌ای",
    },
    {
      key: "showCommission",
      label: "نمایش ستون کمیسیون",
      type: "switch",
      defaultValue: true,
      hint: "ستون کمیسیون در جدول و شاخص مجموع کمیسیون",
    },
  ],
});

tileRegistry.register(transactionsTile);
