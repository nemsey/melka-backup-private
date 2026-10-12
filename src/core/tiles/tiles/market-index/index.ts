/**
 * ماژول کاشی «شاخص بازار ملک تبریز» — P6545/گام۲ BLOCK 2.2 (جلسه ۰۳۳)
 * روند قیمت ماهانه (شمسی) · ۱۰ منطقهٔ پرتقاضا · انواع ملک ·
 * معاملات در برابر آگهی‌های فعال · سری سه‌گانهٔ حجم — OWNER-gate · رنگ لیمویی (sec-m6)
 */

import { defineTile } from "@/core/tiles/tile-contract";
// P6549/۰۳۵-B-ح: بارگذاری تنبل صفحهٔ کاشی (چانک اولیه سبک می‌شود)
import { lazyPage } from "@/core/tiles/lazy-page";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { TrendingUp } from "lucide-react";

export const marketIndexTile = defineTile({
  id: "market-index",
  version: "1.0.0",
  title: "شاخص بازار ملک تبریز",
  tagline: "M7 — روند قیمت و حجم بازار از دادهٔ واقعی معاملات، آگهی‌ها و درخواست‌ها",
  description:
    "شاخص بازار از دادهٔ واقعی سامانه ARM: روند قیمت ماهانهٔ معاملات (تقویم شمسی از فروردین ۱۴۰۴)، میانهٔ قیمت هر متر در ۱۰ منطقهٔ پرتقاضا، قیمت بر اساس نوع ملک (آپارتمان/ویلا/زمین/مغازه)، مقایسهٔ معاملات واقعی با آگهی‌های فعال و نمودار سه‌سری حجم (معاملات، آگهی‌ها، درخواست‌ها).",
  icon: TrendingUp,
  accent: "m6",
  component: lazyPage(() => import("./MarketIndexPage")),
  order: 6, // PN-030/گام دوم (شورا-ن۰۳۵ · ۱۴۰۵/۰۷/۲۱) — دستور مالک: شاخص ششم
  container: "management-dashboard",
  minRole: "OWNER",
  agent: {
    tileId: "market-index",
    insightDomains: ["MARKET"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [],
});

tileRegistry.register(marketIndexTile);
