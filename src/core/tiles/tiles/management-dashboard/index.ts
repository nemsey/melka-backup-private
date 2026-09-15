/**
 * ماژول کاشی «داشبورد مدیریتی» — ظرف کاشی‌های مدیریتی و تحلیلی
 * ------------------------------------------------------
 * صفحه خانه کارگاه اصلی دفتر (فایل‌یابی، آگهی، درخواست ملک) و همین کاشی را
 * نشان می‌دهد؛ سایر کاشی‌ها با فیلد container به همین کاشی منتقل می‌شوند.
 * «تنظیمات عمومی» مستثناست — به‌عنوان آخرین کاشی ریشه روی صفحه هوم می‌ماند.
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
  title: "داشبورد مدیریتی",
  tagline: "مرکز فرمان تحلیل‌ها و مدیریت: معاملات، قراردادها، باشگاه مشتریان، مالی، شاخص قیمت، کارشناسان، بازدیدها، عرضه و تقاضا و استخراج",
  description:
    "ظرف یکپارچه کاشی‌های مدیریتی و تحلیلی داشبورد. صفحه خانه روی کارگاه اصلی دفتر (فایل‌یابی، آگهی، درخواست ملک) و آخرین کاشی یعنی تنظیمات عمومی متمرکز می‌ماند و همه کاشی‌های تحلیلی و مدیریتی — معاملات، قراردادها و اسناد، باشگاه مشتریان، مالی و کمیسیون، شاخص قیمت روز مناطق، کارشناسان، بازدیدها و پیگیری‌ها، عرضه و تقاضا و استخراج اطلاعات — درون همین کاشی سازمان‌دهی می‌شوند. هر کاشی فرزند همان ساختار پلاگینی و ایجنت اختصاصی خود را حفظ می‌کند و دکمه بازگشت آن، به همین داشبورد برمی‌گردد.",
  icon: LayoutDashboard,
  accent: "emerald",
  component: ManagementDashboardPage,
  order: 4,
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
