/**
 * ماژول کاشی «استخراج اطلاعات» — تعریف کامل و ثبت در رجیستری
 * استعلام زنده اطلاعات مالک/درخواست‌دهنده از سامانه واقعی ملک تبریز.
 * افزودن این کاشی به هر پروژه‌ای = فقط همین فایل + import در bootstrap.
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { FileSearch } from "lucide-react";
import { ExtractionPage } from "./ExtractionPage";

export const extractionTile = defineTile({
  id: "extraction",
  version: "1.0.0",
  title: "استخراج اطلاعات",
  tagline: "استعلام زنده نام، شماره تماس و آدرس از سامانه واقعی ملک تبریز با کدآگهی یا کددرخواست",
  description:
    "دو مسیر تخصصی: (۱) با کدآگهی، نام و نام خانوادگی آگهی‌دهنده (مالک ملک)، شماره تماس او و آدرس ملک را مستقیماً از سامانه آرم دریافت کنید؛ (۲) با کددرخواست، نام و نام خانوادگی درخواست‌دهنده (مشتری ملک) و شماره تماس او را ببینید. داده هرگز کش نمی‌شود و هر استعلام با حسابرسی کامل ثبت می‌گردد.",
  icon: FileSearch,
  accent: "teal",
  component: ExtractionPage,
  order: 3,
  agent: {
    tileId: "extraction",
    insightDomains: ["LOOKUP", "COVERAGE", "QUALITY", "SECURITY"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "showHistory",
      label: "نمایش تاریخچه استعلام‌ها",
      type: "switch",
      defaultValue: true,
      hint: "فهرست آخرین استعلام‌های زنده از سامانه ملک تبریز (فقط افزودنی)",
    },
  ],
});

tileRegistry.register(extractionTile);
