/**
 * ماژول کاشی «مالی و کمیسیون» — تعریف کامل و ثبت در رجیستری
 * بر پایه محاسبه‌گر کمیسیون واقعی سامانه مالی ملک تبریز (fm-api) و
 * تجمیع حق‌السهم صورت وضعیت‌های همگام‌شده.
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Calculator } from "lucide-react";
import { FinancePage } from "./FinancePage";

export const financeCommissionTile = defineTile({
  id: "finance-commission",
  version: "1.0.0",
  title: "مالی و کمیسیون ملک تبریز",
  tagline: "محاسبه و پیگیری مالی قراردادها — تعرفه اتحادیه، تجمیع حق‌السهم مشاوران و شعبه‌ها",
  description:
    "دسترسی به محاسبه‌گر کمیسیون سامانه (تعرفه خرید و فروش/اجاره بر پایه نرخ‌نامه اتحادیه، ثمن معامله، شماره هولوگرام، صدور قبض) + تجمیع حق‌السهم قراردادهای نهایی‌شده به تفکیک مشاور و شعبه در بازه‌های زمانی — برای پیش‌بینی درآمد، تسویه‌حساب شفاف مشاوران و مقایسه عملکرد مالی شعبه‌ها.",
  icon: Calculator,
  accent: "emerald",
  component: FinancePage,
  order: 4,
  container: "management-dashboard",
  agent: {
    tileId: "finance-commission",
    insightDomains: ["TARIFF", "REVENUE", "SETTLEMENT", "BRANCH", "PIPELINE"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [],
});

tileRegistry.register(financeCommissionTile);
