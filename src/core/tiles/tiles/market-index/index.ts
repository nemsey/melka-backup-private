/**
 * ماژول کاشی M6 «شاخص بازار ملک تبریز» — P6545/گام۲ BLOCK 2.2 (جلسه ۰۳۳)
 * روند قیمت ماهانه (شمسی) · ۱۰ منطقهٔ پرتقاضا · انواع ملک ·
 * معاملات در برابر آگهی‌های فعال · سری سه‌گانهٔ حجم — OWNER-gate · رنگ لیمویی (sec-m6)
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { TrendingUp } from "lucide-react";
import { MarketIndexPage } from "./MarketIndexPage";

export const marketIndexTile = defineTile({
  id: "market-index",
  version: "1.0.0",
  title: "شاخص بازار ملک تبریز",
  tagline: "M6 — روند قیمت و حجم بازار از دادهٔ واقعی معاملات، آگهی‌ها و درخواست‌ها",
  description:
    "شاخص بازار از دادهٔ واقعی سامانه ARM: روند قیمت ماهانهٔ معاملات (تقویم شمسی از فروردین ۱۴۰۴)، میانهٔ قیمت هر متر در ۱۰ منطقهٔ پرتقاضا، قیمت بر اساس نوع ملک (آپارتمان/ویلا/زمین/مغازه)، مقایسهٔ معاملات واقعی با آگهی‌های فعال و نمودار سه‌سری حجم (معاملات، آگهی‌ها، درخواست‌ها).",
  icon: TrendingUp,
  accent: "m6",
  component: MarketIndexPage,
  order: 6,
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
