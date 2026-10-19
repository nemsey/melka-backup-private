/**
 * ماژول کاشی «کارشناسان» — تعریف و ثبت در رجیستری
 * بازنویسی بر پایه «فهرست کاربران» و «تعاملات مشاوران» واقعی سامانه ملک تبریز.
 */

import { defineTile } from "@/core/tiles/tile-contract";
// P6549/۰۳۵-B-ح: بارگذاری تنبل صفحهٔ کاشی (چانک اولیه سبک می‌شود)
import { lazyPage } from "@/core/tiles/lazy-page";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Users } from "lucide-react";

export const expertsTile = defineTile({
  id: "experts",
  version: "2.0.0",
  title: "کارشناسان", // PN-038/۲.۴ — نام کوتاه
  tagline: "M4 — فهرست کارشناسان و کارکنان: کد پرسنلی، شعبه، مبایعه نامه (با پیش‌فروش)، اجاره نامه (با تمدید)، آدرس و وضعیت — با فیلتر تمام ستون‌ها و بروزرسانی زنده از سامانه‌های ARM و PM",
  description:
    "عین «فهرست کاربران» خود سامانه: نام، موبایل، نقش، کسب‌وکار، ثبت‌کننده، تاریخ ثبت (هجری شمسی) و وضعیت — به‌علاوه «تعاملات مشاوران با یکدیگر» و درجه همکاری هر مشاور.",
  icon: Users,
  accent: "m4",
  component: lazyPage(() => import("./ExpertsPage")),
  order: 5, // PN-038/۲.۵ — ترتیب جدید هوم: کارشناسان پنجم
  agent: {
    tileId: "experts",
    insightDomains: ["COMPOSITION", "ACTIVITY", "GROWTH", "NETWORK", "RISK"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "viewMode",
      label: "نوع نمایش",
      type: "select",
      defaultValue: "cards",
      options: [
        { value: "cards", label: "کارت‌های حرفه‌ای" },
        { value: "table", label: "جدول فشرده" },
      ],
      hint: "نحوه نمایش فهرست کاربران",
    },
  ],
});

tileRegistry.register(expertsTile);
