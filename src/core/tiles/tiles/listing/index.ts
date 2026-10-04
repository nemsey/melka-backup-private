/**
 * ماژول کاشی «آگهی» — تعریف و ثبت در رجیستری
 * ------------------------------------------------------
 * ثبت دستی (۵ گامی عین فرم آرم) + ثبت خودکار فایل‌های تأییدشده فایل‌یابی +
 * کلید «انتقال به CRM» (ثبت گام‌به‌گام در سامانه آرم) +
 * کلید «انتقال به اینستاگرام» (تولید محتوا + انتشار پس از تأیید).
 */

import { defineTile } from "@/core/tiles/tile-contract";
// P6549/۰۳۵-B-ح: بارگذاری تنبل صفحهٔ کاشی (چانک اولیه سبک می‌شود)
import { lazyPage } from "@/core/tiles/lazy-page";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Megaphone } from "lucide-react";

export const listingTile = defineTile({
  id: "listings",
  version: "1.0.0",
  title: "آگهی ملکا",
  tagline: "دفتر مرکزی فایل‌های آگهی: ثبت دستی و خودکار، انتقال گام‌به‌گام به CRM ملک تبریز و انتشار هوشمند در اینستاگرام",
  description:
    "تمام فایل‌های آگهی در یک دفتر واحد: (۱) ثبت دستی برای مالکانی که حضوری درخواست ثبت دارند — با همان فرم ۵ گامی سامانه آرم (اطلاعات مالک، اطلاعات مکانی، اطلاعات معامله، تصاویر و اسناد، توضیحات مشاوران) و بدون دور زدن هیچ گامی؛ (۲) ثبت خودکار فایل‌هایی که در کاشی «فایل‌یابی» تأیید می‌شوند؛ (۳) کلید «انتقال به CRM» هر آگهی: ثبت خودکار در سامانه آرم مثل یک کاربر عادی — جستجوی/ایجاد مالک، شناسه‌های منطقه‌بندی، فرم معامله و ثبت نهایی؛ (۴) کلید «انتقال به اینستاگرام»: از اطلاعات فایل محتوای حرفه‌ای (پست یا رییلز) تولید و پس از تأیید شما در حساب اینستاگرام کسب‌وکار منتشر می‌شود.",
  icon: Megaphone,
  accent: "melka-listing",
  component: lazyPage(() => import("./ListingsPage")),
  order: 2,
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
    // P6.5-09 — تنظیم «تعداد فایل در هر صفحه» حذف شد: لیست تک‌صفحه‌ای و بی‌نهایت است
  ],
});

tileRegistry.register(listingTile);
