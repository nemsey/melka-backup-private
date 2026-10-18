/**
 * ماژول کاشی «تنظیمات عمومی» — تعریف و ثبت
 * بدون ایجنت (تنظیمات ماهیتاً عمومی‌اند، نه تحلیلی).
 * P6526/الف — نام تازه «تنظیمات عمومی» و جایگاه چهارم صفحه هوم (پیش از داشبورد مدیریتی).
 */

import { defineTile } from "@/core/tiles/tile-contract";
// P6549/۰۳۵-B-ح: بارگذاری تنبل صفحهٔ کاشی (چانک اولیه سبک می‌شود)
import { lazyPage } from "@/core/tiles/lazy-page";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Settings } from "lucide-react";

export const settingsTile = defineTile({
  id: "settings",
  version: "1.0.0",
  title: "تنظیمات عمومی",
  tagline: "زبان، تم، حساب کاربری، مدیریت اتصال و راهنمای اپلیکیشن",
  description:
    "تمام تنظیمات سراسری اپلیکیشن: حالت نمایش، حساب کاربری، مدیریت اتصال به سامانه ملک تبریز (تست و ریست)، و راهنمای کامل استفاده.",
  icon: Settings,
  accent: "settings",
  component: lazyPage(() => import("./SettingsPage")),
  order: 4,
  agent: null,
  settings: [],
});

tileRegistry.register(settingsTile);
