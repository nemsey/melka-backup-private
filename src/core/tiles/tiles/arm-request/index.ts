/**
 * ماژول کاشی «درخواست‌های ملک تبریز» — تعریف و ثبت در رجیستری (P6.5-10)
 * ------------------------------------------------------
 * کاتالوگ کامل درخواست‌های سامانه ARM ملک تبریز: لیست تک‌صفحه‌ای با فیلتر
 * «کد درخواست» و «نام و نام خانوادگی کارشناس»؛ ستون‌های کد درخواست،
 * کارشناس، درخواست‌دهنده (نام + شماره تماس) — با قابلیت استخراج زنده از
 * خود سامانه و ایجنت یادگیرنده مولتی‌بینش.
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { ClipboardList } from "lucide-react";
import { ArmRequestsPage } from "./ArmRequestsPage";

export const armRequestTile = defineTile({
  id: "arm-requests",
  version: "1.0.0",
  title: "درخواست‌های ملک تبریز",
  tagline: "کاتالوگ کامل درخواست‌های سامانه ARM: کد درخواست، کارشناس، درخواست‌دهنده و تماس او — با استخراج زنده از خود سامانه",
  description:
    "همهٔ درخواست‌های ثبت‌شده در «سامانه مدیریت آگهی و درخواست» (آرم) ملک تبریز در یک لیست تک‌صفحه‌ای و بی‌نهایت: کد درخواست، نام و نام خانوادگی کارشناس ثبت‌کننده، نام و نام خانوادگی درخواست‌دهنده و شماره تماس او. فیلتر بر اساس کد درخواست و نام کارشناس؛ استخراج و بروزرسانی مستقیم از خود سامانه (فهرست کامل + غنی‌سازی زنجیره‌ای نام کامل و موبایل درخواست‌دهنده) و ایجنت هوشمند یادگیرندهٔ مولتی‌بینش با تحلیل حجم، کارشناسان پرثبت، ترکیب وضعیت‌ها، پوشش اطلاعات و تازگی ثبت.",
  icon: ClipboardList,
  accent: "teal",
  component: ArmRequestsPage,
  order: 11,
  container: "management-dashboard",
  agent: {
    tileId: "arm-requests",
    insightDomains: ["VOLUME", "TOP_EXPERTS", "COMPOSITION", "COVERAGE", "FRESHNESS"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "showTitles",
      label: "نمایش عنوان درخواست زیر کد",
      type: "switch",
      defaultValue: true,
      hint: "عنوان ثبت‌شدهٔ هر درخواست در سامانه ARM زیر کد درخواست نمایش داده شود",
    },
  ],
});

tileRegistry.register(armRequestTile);
