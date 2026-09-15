/**
 * ماژول کاشی «آگهی» — تعریف و ثبت در رجیستری
 * ------------------------------------------------------
 * ثبت دستی (۵ گامی عین فرم آرم) + ثبت خودکار فایل‌های تأییدشده فایل‌یابی +
 * کلید «انتقال به CRM» (ثبت گام‌به‌گام در سامانه آرم) +
 * کلید «انتقال به اینستاگرام» (تولید محتوا + انتشار پس از تأیید).
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Megaphone } from "lucide-react";
import { ListingsPage } from "./ListingsPage";

export const listingTile = defineTile({
  id: "listings",
  version: "1.0.0",
  title: "آگهی",
  tagline: "دفتر مرکزی فایل‌های آگهی: ثبت دستی و خودکار، انتقال گام‌به‌گام به CRM ملک تبریز و انتشار هوشمند در اینستاگرام",
  description:
    "تمام فایل‌های آگهی در یک دفتر واحد: (۱) ثبت دستی برای مالکانی که حضوری درخواست ثبت دارند — با همان فرم ۵ گامی سامانه آرم (اطلاعات مالک، اطلاعات مکانی، اطلاعات معامله، تصاویر و اسناد، توضیحات مشاوران) و بدون دور زدن هیچ گامی؛ (۲) ثبت خودکار فایل‌هایی که در کاشی «فایل‌یابی» تأیید می‌شوند؛ (۳) کلید «انتقال به CRM» هر آگهی: ثبت خودکار در سامانه آرم مثل یک کاربر عادی — جستجوی/ایجاد مالک، شناسه‌های منطقه‌بندی، فرم معامله و ثبت نهایی؛ (۴) کلید «انتقال به اینستاگرام»: از اطلاعات فایل محتوای حرفه‌ای (پست یا رییلز) تولید و پس از تأیید شما در حساب اینستاگرام کسب‌وکار منتشر می‌شود.",
  icon: Megaphone,
  accent: "amber",
  component: ListingsPage,
  order: 6,
  agent: {
    tileId: "listings",
    insightDomains: ["REGISTRY", "CRM", "INSTAGRAM", "COMPLETENESS", "SOURCE"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "defaultTab",
      label: "پنجره پیش‌فرض نمایش",
      type: "select",
      defaultValue: "all",
      options: [
        { value: "all", label: "همه فایل‌ها" },
        { value: "manual", label: "ثبت دستی" },
        { value: "divar", label: "از فایل‌یابی" },
      ],
      hint: "پنجره‌ای که هنگام ورود به کاشی آگهی باز می‌شود",
    },
    {
      key: "showCompleteness",
      label: "نمایش نوار پیشرفت ۵ گامی روی کارت‌ها",
      type: "switch",
      defaultValue: true,
      hint: "نمایش گام‌های کامل/ناقص هر فایل روی کارت",
    },
    {
      key: "pageSize",
      label: "تعداد فایل در هر صفحه",
      type: "number",
      defaultValue: 20,
      min: 5,
      max: 100,
      hint: "حجم اطلاعات نمایشی در لیست فایل‌ها",
    },
  ],
});

tileRegistry.register(listingTile);
