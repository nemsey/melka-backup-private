/**
 * ماژول کاشی «آگهی ملک تبریز» — تعریف و ثبت در رجیستری (P6.5-10 + P6526/الف + P6530/گام ۱ — M1)
 * ------------------------------------------------------
 * فهرست ده‌ستونی عین دستور مالک (گام ۱): ردیف · کد آگهی · کارشناس · شعبه ·
 * مالک (نام + موبایل زیر نام) · قیمت ملک (تومان) · آدرس ملک (منطقه، کوی، پلاک) ·
 * دسته‌بندی · وضعیت (ده‌حالته) · آخرین فعالیت — فیلتر بر اساس تمام ستون‌ها؛
 * بینش توزیع وضعیت ده‌حالته؛ بروزرسانی با زنجیرهٔ عین سامانه ARM (لایه ۱ فهرست +
 * لایه ۲ غنی‌سازی) + تاریخ دقیق آخرین بروزرسانی + ادامه از نقطهٔ قطع (checkpoint).
 */

import { defineTile } from "@/core/tiles/tile-contract";
// P6549/۰۳۵-B-ح: بارگذاری تنبل صفحهٔ کاشی (چانک اولیه سبک می‌شود)
import { lazyPage } from "@/core/tiles/lazy-page";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Building2 } from "lucide-react";

export const armListingTile = defineTile({
  id: "arm-listings",
  version: "2.0.0",
  title: "آگهی ملک تبریز",
  tagline: "M1 — رجیستری کامل آگهی‌های سامانه ARM: کد آگهی، کارشناس، شعبه، مالک و تماس او، قیمت، آدرس دقیق، دسته‌بندی، وضعیت ده‌حالته — با فیلتر تمام ستون‌ها و بروزرسانی زنده از خود سامانه",
  description:
    "همهٔ آگهی‌های ثبت‌شده در «سامانه مدیریت آگهی و درخواست» (آرم) ملک تبریز در یک لیست تک‌صفحه‌ای و بی‌نهایت: کد آگهی، نام و نام خانوادگی کارشناس مسؤول، نام و نام خانوادگی مالک ملک، شماره تماس مالک ملک و آدرس ملک. فیلتر بر اساس کد آگهی و نام کارشناس؛ استخراج و بروزرسانی مستقیم از خود سامانه (فهرست کامل + غنی‌سازی زنجیره‌ای اطلاعات تماس مالک و آدرس دقیق) و ایجنت هوشمند یادگیرندهٔ مولتی‌بینش با تحلیل حجم، کارشناسان پرآگهی، توزیع منطقه‌ای، پوشش اطلاعات و تازگی ثبت.",
  icon: Building2,
  accent: "m1",
  component: lazyPage(() => import("./ArmListingsPage")),
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
