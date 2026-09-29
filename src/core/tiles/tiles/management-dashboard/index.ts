/**
 * ماژول کاشی «داشبورد مدیریتی ملک تبریز» — ظرف کاشی‌های مدیریتی و تحلیلی
 * -------------------------------------------------------------------
 * بازسازی فازهای ۷-۸-۹ (دستور مالک ۱۴۰۵/۰۷/۷) — چهار کاشی فرزند با ترتیب و نام الزامی مالک:
 *   M1 آگهی ملک تبریز · M2 درخواست ملک تبریز · M3 معاملات ملک تبریز ·
 *   M4 کارشناسان ملک تبریز
 * کاشی‌های فرزند از رجیستری خوانده می‌شوند (پلاگین‌محور) — افزودن کاشی مدیریتی
 * جدید تنها با تعیین container: "management-dashboard" در تعریف خودش انجام می‌شود.
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { LayoutDashboard } from "lucide-react";
import { ManagementDashboardPage } from "./ManagementDashboardPage";

export const managementDashboardTile = defineTile({
  id: "management-dashboard",
  version: "1.1.0",
  title: "داشبورد مدیریتی ملک تبریز",
  tagline: "مرکز فرمان تحلیل‌ها و مدیریت: آگهی، درخواست، معاملات و کارشناسان ملک تبریز",
  description:
    "ظرف یکپارچهٔ چهار کاشی مدیریتی و تحلیلی ملک تبریز — به ترتیب: M1 آگهی ملک تبریز، M2 درخواست ملک تبریز، M3 معاملات ملک تبریز و M4 کارشناسان ملک تبریز. صفحهٔ هوم روی کارگاه اصلی دفتر (فایل یابی ملکا، آگهی ملکا، درخواست ملکا و تنظیمات عمومی) متمرکز می‌ماند. هر کاشی فرزند همان ساختار پلاگینی و ایجنت اختصاصی خود را حفظ می‌کند و دکمهٔ بازگشت آن، به همین داشبورد برمی‌گردد.",

  icon: LayoutDashboard,
  accent: "emerald",
  component: ManagementDashboardPage,
  order: 5,
  agent: null,
  settings: [
    {
      key: "showTaglines",
      label: "نمایش توضیح یک‌خطی روی کارت‌ها",
      type: "switch",
      defaultValue: true,
      hint: "توضیح کوتاه هر کاشی مدیریتی روی کارت نمایش داده شود",
    },
  ],
});

tileRegistry.register(managementDashboardTile);
