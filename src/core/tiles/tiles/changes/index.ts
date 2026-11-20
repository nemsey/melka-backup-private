/**
 * ماژول کاشی «تغییرات» — تعریف و ثبت در رجیستری (DIR-CHANGES-TILE-002 · دستور مالک ۱۴۰۵/۰۸/۲۹)
 * ------------------------------------------------------
 * کاشی صاحب‌اختیار مالک برای «تغییر در کد» و «حذف کد» در کدآگهی و کددرخواست
 * سامانه ARM ملک تبریز — با شناخت کامل گزارش‌های dir-reg-req-099-001 و
 * DIR-CHANGES-TILE-001 + کاوش زندهٔ این نوبت.
 *
 * دو بخش (ساختار تازه — سایر بخش‌ها حذف شد):
 *   ۱. کدآگهی: تغییر در کد (اطلاعات مالک + تاریخ ایجاد مشاور با آبشار) · حذف کد
 *   ۲. کددرخواست: تغییر در کد (تاریخ ایجاد مشاور با آبشار) · حذف کد
 *
 * گام سوم: حالت تمام‌ظرفیت — تمام ظرفیت ترموکس به این کاشی + توقف
 * بروزرسانی فهرست‌ها هنگام هر عملیات (نسل O کدنصب).
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { lazyPage } from "@/core/tiles/lazy-page";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { FilePen } from "lucide-react";

export const changesTile = defineTile({
  id: "changes",
  version: "2.0.0",
  title: "تغییرات",
  tagline: "تغییر در کد و حذف کد (کدآگهی و کددرخواست) سامانه ARM",
  description:
    "دو بخش کدآگهی و کددرخواست — تغییر در کد و حذف کد در سامانه ARM ملک تبریز.",
  icon: FilePen,
  accent: "ai",
  component: lazyPage(() => import("./ChangesPage")),
  order: 7, // DIR-FF-TILE-003 (دستور مالک ۱۴۰۵/۰۸/۳۰) — ترتیب هشت‌تایی هوم: تغییرات هفتم
  minRole: "OWNER",
  agent: null,
  settings: [
    {
      key: "autoFullCapacity",
      label: "فعال‌سازی خودکار حالت تمام‌ظرفیت هنگام هر تغییر/حذف",
      type: "switch",
      defaultValue: true,
      hint: "با هر عملیات نوشتاری، بروزرسانی فهرست‌ها موقتاً متوقف و تمام ظرفیت ترموکس به این کاشی اختصاص می‌یابد (انقضای خودکار ۳۰ دقیقه)",
    },
  ],
});

tileRegistry.register(changesTile);
