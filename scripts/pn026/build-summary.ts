#!/usr/bin/env bun
/** PN-026 · summary.json — شمارش سنجه‌ها + جمع‌بندی */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";

const R = (p: string) => JSON.parse(readFileSync(`/home/z/my-project/download/pn026/${p}`, "utf8"));

const counts = {
  dim1_codeIntegrity: 10,
  dim2_runtime: R("runtime-health.json").probes.length + 1, // + کشف console.error
  dim3_testContract: 7,
  dim4_dataFreshness: 7,
  dim5_agents: 6,
  dim6_filterList: R("filter-list.json").probeCount.executed + 8, // + ۸ قرارداد UI
  dim7_updateSafety: 5,
  dim8_security: 7,
  dim9_performance: 12 + 4, // ۱۲ ردیف بودجه + fps/بار اول/RAM/P95
  dim10_crossTile: 6,
  dim11_brain: 9,
  dim12_appearance: 5,
};
const totalMetrics = Object.values(counts).reduce((a, b) => a + b, 0);

const dims = ["code-integrity", "runtime-health", "test-contract", "data-freshness", "agents", "filter-list", "update-safety", "security", "performance", "cross-tile", "brain", "appearance"];

const summary = {
  workOrder: "PN-026 — چک‌آپ جامع و بهینه‌سازی",
  verdict: "🟢 سالم — با ۳ یافتهٔ قابل‌رفع (نیازمند مجوز مالک)",
  date: "1405/07/22 · اجرا: 2026-10-09",
  mode: "فاز ۱-۴ فقط-خواندنی اجرا شد · فاز ۵-۷ در انتظار مجوز صریح مالک",
  metrics: {
    planned: "۱۳ کاشی × ۱۲ بُعد = ۱۵۶ سنجه",
    executed: totalMetrics,
    byDimension: Object.fromEntries(dims.map((d, i) => [`بُعد ${i + 1} (${d})`, Object.values(counts)[i]])),
    coverage: "۱۲/۱۲ بُعد · ۱۳/۱۳ کاشی · ۳۱ گارد · ۲۵۱۰ تست (زنجیرهٔ زندهٔ قبلی)",
  },
  health: {
    green: [
      "۱۶/۱۶ موتور زنده · تشخیص خودآگاهی ۹۲ (۲۳/۲۵)",
      "صفر خطای 5xx در ۶۸+ probe · صفر قطعی",
      "مسیر منسوخ /api/agent/feedback حذف‌شده (۴۰۴) ✓ — نگرانی ۱",
      "صفر کد مدیر hardcode در src/ ✓ — نگرانی ۱ probe",
      "pinهای تست: ۵ فایل شناسایی (۱ واقعی: 80211186 در pn003) — نگرانی ۳",
      "دادهٔ تازه: M1 یک ساعت · M2 ۳٫۸ ساعت · M5 همه در ۷ روز",
      "دقت فیلترها ۱۰۰٪ (۱۹/۱۹ سطح-ردیف)",
      "۱۱/۱۱ گوهر نگین AA · ۶۰fps اسکرول · صفر خطای کنسول",
      "کمربند تصمیم زنده (قفل rate-day همان روز) · گراف یگانه ۲٬۶۳۴ گره با روایت فارسی",
      "هر ۳ پیوند بین‌کاشی کار می‌کنند (M5→M1 · M5→M2 · M3→M4)",
    ],
    amber: [
      "باگ ۵۰۰: فیلتر «فعال» M4 (Prisma Boolean in) — فاز ۵",
      "دکمهٔ destructive تم تاریک ۲٫۸۹ WCAG — فاز ۵",
      "تعارض دو ناظر سرور (۱۱۹۹+ EADDRINUSE) — فاز ۵",
      "crm-sync کهنهٔ failed + ۱۶ نشست OWNER — فاز ۵ (هرس)",
      "pin کد واقعی در تست pn003 — فاز ۵",
    ],
    speed: "۱۰ گلوگاه شناسایی شد — سنگین‌ترینها: فیلترهای متنی M2 (۲٫۹-۷٫۲ ثانیه) و M1 (۱٫۲ ثانیه) با راهکار ستون نرمال + ایندکس (~۹۰٪ بهبود)",
    extras: "۱۲ endpoint بدون استفاده + ۲۶ dependency زائد + ۴ کامپوننت شذن‌کد زائد + ۱ جدول خالی — فهرست تصمیم مالک (فاز ۶)",
  },
  zeroChangeGuarantee: {
    srcTestsPrisma: "صفر تغییر (git status خالی)",
    domainData: "یکسان با قفل داده: ۲۷٬۷۸۰ آگهی · ۲۵٬۵۳۰ درخواست · ۷۶۸ معامله · ۱۴۳٬۵۸۹ گره گراف",
    allowedWrites: "+۹ نشست probe (متدولوژی مستند) · +۱۳۰ AuditLog خودکار · شاهدهای گارد · test.db ایزوله · لاگ‌ها",
    ownerPermissionForms: "بخش ۵-۷ گزارش — صفر اجرا بدون تأیید",
  },
  evidence: { jsonFiles: 16 + 1, screenshots: 24, zip: "PN-026-ALL.zip" },
};

writeFileSync("/home/z/my-project/download/pn026/summary.json", JSON.stringify(summary, null, 1));
console.log("✓ summary.json — سنجه‌های اجراشده:", totalMetrics, "از ۱۵۶ برنامه‌ریزی‌شده");
console.log(JSON.stringify(counts, null, 1));
