/**
 * ماژول کاشی M5 «تطبیق هوشمند ملک تبریز» — P6545/گام۲ BLOCK 2.1 (جلسه ۰۳۳)
 * تب ۱: آگهی → ۵ درخواست برتر · تب ۲: درخواست → ۵ آگهی برتر
 * فیلتر سخت + امتیاز نرم ۵عامله + حلقهٔ یادگیری (پذیرش/رد) + Tier-aware
 * OWNER-gate · رنگ بنفش ارغوانی (sec-m5 — جلسه ۰۲۶)
 */

import { defineTile } from "@/core/tiles/tile-contract";
// P6549/۰۳۵-B-ح: بارگذاری تنبل صفحهٔ کاشی (چانک اولیه سبک می‌شود)
import { lazyPage } from "@/core/tiles/lazy-page";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { Sparkles } from "lucide-react";

export const smartMatchingTile = defineTile({
  id: "smart-matching",
  version: "1.0.0",
  title: "تطبیق هوشمند ملک تبریز",
  tagline: "M5 — تطبیق دوجهتهٔ آگهی ↔ درخواست: ۵ گزینهٔ برتر با امتیاز و دلیل شفاف",
  description:
    "تطبیق هوشمند دو جهت: با ورود کد ملک، ۵ درخواست فعال برتر و با ورود درخواست، ۵ آگهی منتشرشدهٔ برتر پیشنهاد می‌شود. فیلتر سخت (معکوس نوع معامله، تلاقی قیمت و منطقه، نوع ملک) + امتیاز نرم پنج‌عامله (فاصله قیمت، نزدیکی جغرافیایی، تناسب متراژ، تازگی، سابقه کارشناس) با پوشش سیگنال شفاف. هر پذیرش/رد در حلقهٔ یادگیری ثبت و وزن‌ها تدریجاً شخصی می‌شوند. Tier-aware. صفر اجرای خودکار — پیشنهاد فقط.",
  icon: Sparkles,
  accent: "m5",
  component: lazyPage(() => import("./SmartMatchingPage")),
  order: 5,
  container: "management-dashboard",
  minRole: "OWNER",
  agent: {
    tileId: "smart-matching",
    insightDomains: ["MATCH"],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "showReasons",
      label: "نمایش دلایل امتیاز هر تطبیق",
      type: "switch",
      defaultValue: true,
      hint: "پنج عامل نرم با مقدار و وزن برای هر کاندیدا نمایش داده شود",
    },
  ],
});

tileRegistry.register(smartMatchingTile);
