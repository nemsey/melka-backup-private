/**
 * ماژول کاشی M6 «مغز ملکا — یادگیری و Tier» — P6545/گام۲ BLOCK 2.4 (جلسه ۰۳۳)
 * Tier + نوار پیشرفت · روند Brier (کالیبرهٔ مصوب) · تصمیم‌های در انتظار شورا ·
 * نمایشگر تختهٔ سیاه · ۲۵ بررسی خودتشخیصی — OWNER-gate · رنگ فیروزه‌ای (sec-m8)
 */

import { defineTile } from "@/core/tiles/tile-contract";
// P6549/۰۳۵-B-ح: بارگذاری تنبل صفحهٔ کاشی (چانک اولیه سبک می‌شود)
import { lazyPage } from "@/core/tiles/lazy-page";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Brain } from "lucide-react";

export const learningTierTile = defineTile({
  id: "learning-tier",
  version: "1.0.0",
  title: "مغز ملکا — یادگیری و Tier",
  tagline: "M6 — Tier مستقل مدل‌ها، روند یادگیری، تصمیم‌های در انتظار شورا و تختهٔ سیاه",
  description:
    "پنل یادگیری مغز ملکا: Tier فعلی با نوار پیشرفت و نتیجه‌های باقی‌مانده تا Tier بعدی، اثر ترمیم مصوب جلسه ۰۳۳ (بازکالیبراسیون)، تصمیم‌ها و ترمیم‌های در انتظار تأیید شورا (صفر اجرای خودکار)، نمایشگر رویدادهای بین‌کاشی (تختهٔ سیاه) و خلاصهٔ ۲۵ بررسی خودتشخیصی با وضعیت هر بررسی.",
  icon: Brain,
  accent: "m8",
  component: lazyPage(() => import("./LearningTierPage")),
  order: 8, // PN-028/خامساً-ق — دستور مالک: مغز ملکا هشتم
  container: "management-dashboard",
  minRole: "OWNER",
  agent: {
    tileId: "learning-tier",
    insightDomains: ["LEARNING", "DIAGNOSIS"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [],
});

tileRegistry.register(learningTierTile);
