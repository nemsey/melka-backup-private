/**
 * ماژول کاشی «تنظیمات عمومی» — تعریف و ثبت
 * بدون ایجنت (تنظیمات ماهیتاً عمومی‌اند، نه تحلیلی).
 * روی صفحه خانه به‌عنوان آخرین کاشی ریشه نمایش داده می‌شود (order: 99).
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Settings } from "lucide-react";
import { SettingsPage } from "./SettingsPage";

export const settingsTile = defineTile({
  id: "settings",
  version: "1.0.0",
  title: "تنظیمات عمومی",
  tagline: "زبان، تم، حساب کاربری، مدیریت اتصال و راهنمای اپلیکیشن",
  description:
    "تمام تنظیمات سراسری اپلیکیشن: حالت نمایش، حساب کاربری، مدیریت اتصال به سامانه ملک تبریز (تست و ریست)، و راهنمای کامل استفاده.",
  icon: Settings,
  accent: "stone",
  component: SettingsPage,
  order: 99,
  agent: null,
  settings: [],
});

tileRegistry.register(settingsTile);
