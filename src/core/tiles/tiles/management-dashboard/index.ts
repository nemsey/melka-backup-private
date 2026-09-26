/**
 * ماژول کاشی «داشبورد مدیریتی ملک تبریز» — ظرف کاشی‌های مدیریتی و تحلیلی
 * -------------------------------------------------------------------
 * P6526/الف — هفت کاشی فرزند با ترتیب و نام الزامی مالک:
 *   M1 آگهی ملک تبریز · M2 درخواست ملک تبریز · M3 معاملات ملک تبریز ·
 *   M4 کارشناسان ملک تبریز · M5 شاخص قیمت ملک تبریز ·
 *   M6 عرضه و تقاضای ملک تبریز · M7 استخراج اطلاعات ملک تبریز
 * کاشی‌های فرزند از رجیستری خوانده می‌شوند (پلاگین‌محور) — افزودن کاشی مدیریتی
 * جدید تنها با تعیین container: "management-dashboard" در تعریف خودش انجام می‌شود.
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { LayoutDashboard } from "lucide-react";
import { ManagementDashboardPage } from "./ManagementDashboardPage";

export const managementDashboardTile = defineTile({
  id: "management-dashboard",
  version: "1.0.0",
  title: "داشبورد مدیریتی ملک تبریز",
  tagline: "مرکز فرمان تحلیل‌ها و مدیریت: آگهی، درخواست، معاملات، کارشناسان، شاخص قیمت، عرضه و تقاضا و استخراج اطلاعات ملک تبریز",
  description:
    "ظرف یکپارچهٔ هفت کاشی مدیریتی و تحلیلی ملک تبریز — به ترتیب: M1 آگهی ملک تبریز، M2 درخواست ملک تبریز، M3 معاملات ملک تبریز، M4 کارشناسان ملک تبریز، M5 شاخص قیمت ملک تبریز، M6 عرضه و تقاضای ملک تبریز و M7 استخراج اطلاعات ملک تبریز. صفحهٔ هوم روی کارگاه اصلی دفتر (فایل یابی ملکا، آگهی ملکا، درخواست ملکا و تنظیمات عمومی) متمرکز می‌ماند. هر کاشی فرزند همان ساختار پلاگینی و ایجنت اختصاصی خود را حفظ می‌کند و دکمهٔ بازگشت آن، به همین داشبورد برمی‌گردد.",

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
