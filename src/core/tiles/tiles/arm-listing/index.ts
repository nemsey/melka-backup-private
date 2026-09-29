/**
 * ماژول کاشی «آگهی ملک تبریز» — تعریف و ثبت در رجیستری (P6.5-10 + P6526/الف — M1)
 * ------------------------------------------------------
 * رجیستری کامل آگهی‌های سامانه ARM ملک تبریز: لیست تک‌صفحه‌ای با فیلتر
 * «کد آگهی» و «نام و نام خانوادگی کارشناس»؛ ستون‌های کد آگهی، کارشناس،
 * مالک ملک (نام + شماره تماس) و آدرس ملک — با قابلیت استخراج زنده از
 * خود سامانه (فهرست کامل + غنی‌سازی تماس مالک) و ایجنت یادگیرنده مولتی‌بینش.
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Building2 } from "lucide-react";
import { ArmListingsPage } from "./ArmListingsPage";

export const armListingTile = defineTile({
  id: "arm-listings",
  version: "1.0.0",
  title: "آگهی ملک تبریز",
  tagline: "M1 — رجیستری کامل آگهی‌های سامانه ARM: کد آگهی، کارشناس، مالک ملک و تماس او و آدرس ملک — با استخراج زنده از خود سامانه",
  description:
    "همهٔ آگهی‌های ثبت‌شده در «سامانه مدیریت آگهی و درخواست» (آرم) ملک تبریز در یک لیست تک‌صفحه‌ای و بی‌نهایت: کد آگهی، نام و نام خانوادگی کارشناس مسؤول، نام و نام خانوادگی مالک ملک، شماره تماس مالک ملک و آدرس ملک. فیلتر بر اساس کد آگهی و نام کارشناس؛ استخراج و بروزرسانی مستقیم از خود سامانه (فهرست کامل + غنی‌سازی زنجیره‌ای اطلاعات تماس مالک و آدرس دقیق) و ایجنت هوشمند یادگیرندهٔ مولتی‌بینش با تحلیل حجم، کارشناسان پرآگهی، توزیع منطقه‌ای، پوشش اطلاعات و تازگی ثبت.",
  icon: Building2,
  accent: "m1",
  component: ArmListingsPage,
  order: 1,
  container: "management-dashboard",
  agent: {
    tileId: "arm-listings",
    insightDomains: ["VOLUME", "TOP_EXPERTS", "REGION", "COVERAGE", "FRESHNESS", "VISIT_ATTENTION"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "showTitles",
      label: "نمایش عنوان آگهی زیر کد",
      type: "switch",
      defaultValue: true,
      hint: "عنوان ثبت‌شدهٔ هر آگهی در سامانه ARM زیر کد آگهی نمایش داده شود",
    },
  ],
});

tileRegistry.register(armListingTile);
