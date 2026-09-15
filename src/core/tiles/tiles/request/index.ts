/**
 * ماژول کاشی «درخواست ملک» — تعریف و ثبت در رجیستری
 * ------------------------------------------------------
 * ثبت دستی (۴ گامی عین فرم آرم — مالک حضوری) + ثبت اتوماتیک (فرم پرشونده ← ثبت مستقیم در آرم) +
 * کلید «ویرایش» + کلید «ثبت رویداد» (عین request-events خود سامانه) +
 * ایجنت «مدیریت مشتریان» (شاهکار: پروفایل ۳۶۰ درجه + امتیاز سلامت + چرخه عمر + اقدام بعدی + تطبیق درخواست-آگهی).
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { ClipboardList } from "lucide-react";
import { RequestsPage } from "./RequestsPage";

export const requestTile = defineTile({
  id: "requests",
  version: "1.0.0",
  title: "درخواست ملک",
  tagline: "دفتر مرکزی درخواست‌های ملک: ثبت دستی و اتوماتیک (گام‌به‌گام عین سامانه آرم)، ویرایش، ثبت رویداد و ایجنت مدیریت مشتریان",
  description:
    "تمام درخواست‌های ملک در یک دفتر واحد — با همان فرم ۴ گامی سامانه آرم و بدون دور زدن هیچ گامی: (۱) «ثبت دستی» برای مشتریانی که حضوری (در دفتر) درخواست ثبت دارند — اطلاعات مشتری، اطلاعات مکانی درخواست، جزییات درخواست و اطلاعات تکمیلی؛ (۲) «ثبت اتوماتیک» — فرم پرشونده که با تکمیل اطلاعات، درخواست همانند یک کاربر عادی مرحله‌به‌مرحله در سامانه آرم ملک تبریز ثبت می‌شود (جستجو/ایجاد مشتری، شناسه‌های منطقه‌بندی، فرم دسته‌بندی و ثبت نهایی)؛ (۳) کلید «ویرایش» و کلید «ثبت رویداد» برای هر درخواست — رویدادها عین سامانه آرم (نوع رویداد + تاریخ + ساعت + کدآگهی + پیام)؛ (۴) ایجنت «مدیریت مشتریان»: پروفایل ۳۶۰ درجه هر مشتری، امتیاز سلامت، چرخه عمر، اقدام بعدی هوشمند و تطبیق درخواست با آگهی‌های دفتر آگهی.",
  icon: ClipboardList,
  accent: "teal",
  component: RequestsPage,
  order: 3,
  agent: {
    tileId: "requests",
    insightDomains: ["COMMUNITY_MGMT", "CUST_HEALTH", "LIFECYCLE_MGMT", "NEXT_ACTION", "MATCH", "CHURN", "EVENT_MGMT", "ARM_SYNC"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "defaultTab",
      label: "پنجره پیش‌فرض نمایش",
      type: "select",
      defaultValue: "all",
      options: [
        { value: "all", label: "همه درخواست‌ها" },
        { value: "manual", label: "ثبت دستی" },
        { value: "auto", label: "ثبت اتوماتیک" },
        { value: "customers", label: "مدیریت مشتریان" },
      ],
      hint: "پنجره‌ای که هنگام ورود به کاشی درخواست ملک باز می‌شود",
    },
    {
      key: "showCompleteness",
      label: "نمایش نوار پیشرفت ۴ گامی روی کارت‌ها",
      type: "switch",
      defaultValue: true,
      hint: "نمایش گام‌های کامل/ناقص هر درخواست روی کارت",
    },
    {
      key: "pageSize",
      label: "تعداد درخواست در هر صفحه",
      type: "number",
      defaultValue: 20,
      min: 5,
      max: 100,
      hint: "حجم اطلاعات نمایشی در لیست درخواست‌ها",
    },
  ],
});

tileRegistry.register(requestTile);
