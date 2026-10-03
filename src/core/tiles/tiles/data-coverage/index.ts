/**
 * ماژول کاشی M7 «پوشش اطلاعات ملک تبریز» — P6545/گام۲ BLOCK 2.3 (جلسه ۰۳۳)
 * جدول پوشش هر ستون M1-M4 · نمودار درصد · رکوردهای ناقص · مسیر پر شدن ·
 * نمایش Tier — OWNER-gate · رنگ آبی (sec-m7)
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Database } from "lucide-react";
import { DataCoveragePage } from "./DataCoveragePage";

export const dataCoverageTile = defineTile({
  id: "data-coverage",
  version: "1.0.0",
  title: "پوشش اطلاعات ملک تبریز",
  tagline: "M7 — درصد پر بودن هر ستون در کاشی‌های M1-M4 و مسیر پر شدن آن",
  description:
    "پوشش اطلاعات چهار کاشی مدیریتی: جدول درصد پوشش هر ستون، نمودار میله‌ای، فهرست رکوردهای ناقص با لینک مستقیم، پیشنهاد مسیر پر شدن هر ستون (همگام‌سازی/غنی‌سازی/کارشناس) و نمایش Tier فعلی برای بینش Tier-aware.",
  icon: Database,
  accent: "m7",
  component: DataCoveragePage,
  order: 7,
  container: "management-dashboard",
  minRole: "OWNER",
  agent: {
    tileId: "data-coverage",
    insightDomains: ["COVERAGE"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [],
});

tileRegistry.register(dataCoverageTile);
