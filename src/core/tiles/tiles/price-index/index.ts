/**
 * ماژول کاشی «شاخص قیمت روز مناطق» — تعریف کامل و ثبت در رجیستری
 * بر پایه شاخص‌های رسمی سامانه ARM (configs/current-prices) + داده واقعی بازار.
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Gauge } from "lucide-react";
import { PriceIndexPage } from "./PriceIndexPage";

export const priceIndexTile = defineTile({
  id: "price-index",
  version: "1.0.0",
  title: "شاخص قیمت روز مناطق",
  tagline: "نمایش و تحلیل شاخص قیمت‌های روز ملک تبریز به تفکیک منطقه — روند، مقایسه و هشدار جهش",
  description:
    "بر پایه «شاخص قیمت‌های روز» رسمی سامانه ملک تبریز به تفکیک منطقه و مشخصات فنی ملک + آمار واقعی بازار: روند تغییر شاخص‌ها در زمان، مقایسه بین مناطق، هشدار تغییرات جهشی و پایش سلامت قیمت‌گذاری کارشناسان (آگهی‌هایی که از شاخص منطقه فاصله معنادار دارند) — مرجع سریع قیمت‌گذاری برای جلسات مذاکره.",
  icon: Gauge,
  accent: "amber",
  component: PriceIndexPage,
  order: 5,
  container: "management-dashboard",
  agent: {
    tileId: "price-index",
    insightDomains: ["MARKET", "REGION", "TREND", "ALERT", "HEALTH"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "defaultCategory",
      label: "دسته پیش‌فرض تحلیل",
      type: "select",
      defaultValue: "all",
      options: [
        { value: "all", label: "همه دسته‌ها" },
        { value: "apartment-sell", label: "آپارتمان (فروش)" },
        { value: "apartment-rent", label: "آپارتمان (اجاره)" },
      ],
      hint: "دسته آگهی‌های مبنای محاسبه شاخص هنگام ورود به کاشی",
    },
    {
      key: "showCharts",
      label: "نمایش نمودار روند",
      type: "switch",
      defaultValue: true,
      hint: "نمودار خطی روند زمانی شاخص مناطق (پس از ثبت‌های روزانه)",
    },
  ],
});

tileRegistry.register(priceIndexTile);
