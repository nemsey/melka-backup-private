/**
 * ماژول کاشی «فایل یابی ملکا» — تعریف و ثبت در رجیستری (P6526/الف — نام جدید صفحه هوم)
 * ایجنت هوشمند یادگیرنده با سه فیلتر (شخصی/زیرقیمت/مکان) و چهار کلید هر فایل.
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Radar } from "lucide-react";
import { FileFinderPage } from "./FileFinderPage";

export const fileFinderTile = defineTile({
  id: "file-finder",
  version: "1.0.0",
  title: "فایل یابی ملکا",
  tagline: "شکار هوشمند فایل‌های شخصی و زیرقیمت از آگهی‌های دیوار تبریز با زمان انتشار واقعی",
  description:
    "ایجنت اختصاصی فایل‌یابی، آگهی‌های املاک دیوار تبریز را اسکن می‌کند و بر اساس سه فیلتر هوشمند امتیازدهی می‌کند: (۱) شخصی‌بودن آگهی — تشخیص مالک از مشاور املاک؛ (۲) زیرقیمت‌بودن — مقایسه قیمت هر متر با آگهی‌های مشابه همان محله (ترکیبی با سامانه آرم)؛ (۳) مکان — تطبیق با ۱۳۰ منطقه و ۹۲۶ محله تبریز عین منطقه‌بندی سامانه آرم. فایل‌ها به سه پنجره تقسیم می‌شوند: شکار (بالای ۷۰)، پیگیری (۴۰ تا ۷۰)، بررسی (زیر ۴۰). روی هر فایل چهار کلید: پل به دیوار، جزییات با تحلیل امتیاز و پیش‌بینی دلایل رد، رد با چک‌لیست یادگیرنده، و ثبت خودکار در سامانه آرم با پیش‌پر کامل. آگهی‌های ردشده هرگز آرشیو نمی‌شوند — فقط سیگنال یادگیری می‌ماند.",
  icon: Radar,
  accent: "amber",
  component: FileFinderPage,
  order: 1,
  agent: {
    tileId: "file-finder",
    insightDomains: ["SCAN", "PERSONAL", "PRICE", "LOCATION", "LEARNING"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "showScoresInList",
      label: "نمایش امتیاز تفکیکی در کارت‌ها",
      type: "switch",
      defaultValue: true,
      hint: "نمایش امتیاز سه‌گانه (شخصی/زیرقیمت/مکان) روی هر کارت فایل",
    },
    {
      key: "autoRefresh",
      label: "به‌روزرسانی خودکار فهرست",
      type: "switch",
      defaultValue: true,
      hint: "فهرست فایل‌ها هر ۶۰ ثانیه تازه می‌شود",
    },
  ],
});

tileRegistry.register(fileFinderTile);
