#!/usr/bin/env bun
/** PN-026 · نهایی‌سازی بُعد ۶ — ثبت باگ ۵۰۰ و یافته‌های سرعت */
import { readFileSync, writeFileSync } from "node:fs";

const d6 = JSON.parse(readFileSync("/home/z/my-project/download/pn026/filter-list.json", "utf8"));

d6.bugs = [
  {
    id: "BUG-D6-1",
    title: "خطای ۵۰۰ در فیلتر «فعال» کاشی M4 کارشناسان",
    repro: "GET /api/experts?active=true (با نشست معتبر)",
    rootCause: "src/lib/experts/profile-store.ts:453 — where.active = { in: [...] } روی فیلد Boolean؛ Prisma فقط equals/not را برای Boolean می‌پذیرد",
    trigger: "هر استفادهٔ فیلتر active (تک‌مقداری هم — چون getAll تک‌مقدار را هم می‌گیرد)",
    impact: "۵۰۰ کامل endpoint — فیلتر فعال کار نمی‌کند (سایر فیلترهای M4 سالم)",
    severity: "🔴",
    proposedFix: "فاز ۵: تبدیل منطقی — [true]→{equals:true} · [false]→{equals:false} · مخلوط→حذف فیلتر",
    evidence: "server.log: prisma:error Invalid prisma.expertProfile.count() — Unknown argument `in`",
  },
];
d6.speedFindings = {
  note: "برای نقشهٔ سرعت فاز ۴ ثبت شد",
  slowEndpoints: [
    { endpoint: "/api/crm/arm-catalog/requests (فیلترها)", ms: "۵٬۳۰۰ تا ۷٬۱۶۰", note: "۲۵٬۵۳۰ درخواست — احتمال نبود ایندکس روی ستون‌های فیلتر یا اسکن کامل" },
    { endpoint: "/api/crm/arm-catalog/listings (کد آگهی)", ms: "۲٬۰۴۹", note: "شامل غنی‌سازی هدفمند زنده (طراحی — enrich از ARM)" },
    { endpoint: "/api/crm/arm-catalog/listings (فیلترهای دیگر)", ms: "۱٬۱۵۰ تا ۱٬۴۳۵", note: "۲۷٬۷۸۰ آگهی" },
    { endpoint: "/api/market-index", ms: "۶۳۷", note: "محاسبهٔ شاخص" },
    { endpoint: "/api/intelligence/status", ms: "۸۱۱", note: "گردآوری ۱۶ موتور" },
  ],
};
d6.accuracyClarification = {
  rowLevel: "۱۹/۱۹ = ۱۰۰٪ — هر ۵۰ ردیف بازگشتی هر فیلتر، predicate خود را داشت ✓",
  countMismatches: "۴ مورد — همه خطای مقایسهٔ من (نه اپ): M4 از جدول ExpertProfile می‌خواند (SQL من ExpertRecord گرفته بود) · M1 مالک با LIKE کلمه‌ای متفاوت · M2 سند در ستون sanadNames ترکیبی است (ستون sanad وجود ندارد) — پس از تصحیح جدول: تطبیق کامل",
  note: "نتیجهٔ صادقانه: صفر شواهد خطای دقت در خود اپلیکیشن",
};
d6.findings = [
  "دقت سطح-ردیف ۱۹/۱۹ = ۱۰۰٪ ✓ · صفر شمارش نادرست واقعی",
  "⚠ باگ ۵۰۰ فیلتر فعال M4 (BUG-D6-1) — رفع در فاز ۵ با مجوز",
  "⚠ کندی M2 (تا ۷٫۲ ثانیه) — نامزد ارجاع به نقشهٔ سرعت فاز ۴",
  "۱۲ کاشی دیگر همه < ۳۰۰ms (میانگین کل ۳۲ probe موفق مستثنیای M1/M2: ~۱۵۰ms)",
];

writeFileSync("/home/z/my-project/download/pn026/filter-list.json", JSON.stringify(d6, null, 1));
console.log("✓ بُعد ۶ نهایی شد — باگ ۵۰۰ M4 + کندی M2 ثبت شد");
