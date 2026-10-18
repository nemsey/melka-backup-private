#!/usr/bin/env bun
/** PN-026 · نهایی‌سازی شاهد بُعد ۱ — code-integrity.json */
import { readFileSync, writeFileSync } from "node:fs";

const r = JSON.parse(readFileSync("/tmp/dim1b.json", "utf8"));

// جستجو ۳ — تفکیک خود-ارجاعی
r.searches[2].countSelfExcluded = 1;
r.searches[2].note = "۳ مطابقت خود-ارجاعی اسکنر حذف شد — یافتهٔ واقعی: ۱ pin تست در tests/p6509-owner-unlimited.test.ts:168 (بُعد ۳)";
// جستجو ۴ — تفکیک مکانی
r.searches[3].byLocation = { "scripts/verify-p2-03.ts": 10, "tests/phase2-routes.test.ts": 1 };
r.searches[3].note = "۱۱ = ۱۰ در اسکریپت تأیید تاریخی verify-p2-03.ts (خودِ نام‌گذاری) + ۱ ارجاع کامنتی در تست — صفر نشت در src/";
// جستجو ۵
r.searches[4].note = "۱۳ مسیر مطلق در src/ · ۸ با گیت env · ۵ fallback کاندید (boot-secrets/worker-status/deliver — همگی env-first با fallback صریح) · صفر در src/app";
r.searches[6].note = "صفر — کلیدواژهٔ require در .ts تولیدی یافت نشد";
r.searches[8].note = "صفر — پاک";
r.searches[9].note = "صفر — هیچ مسیر منسوخ برچسب‌گذاری‌شده؛ مسیر منسوخ /api/agent/feedback در بُعد ۲ آزموده می‌شود";

r.summary = {
  verdict: "پاک در ۸/۱۰ جستجو · ۲ یافتهٔ جزئی هر دو در لایهٔ تست/ابزار (نه اپ)",
  metrics: { scannedSrc: 599, scannedTests: 113, scannedScripts: 449, durationMs: r.meta.durationMs },
  realIssues: [
    { finding: "pin تست arm-tok-p6509", where: "tests/p6509-owner-unlimited.test.ts:168", severity: "🟠", detail: "توکن ثابت تستی — پیشنهاد رفع: انتقال به env تست (بُعد ۳)", dim: 3 },
    { finding: "اسکریپت تاریخی verify-p2-03 با توکن تستی نام‌گذاری‌شده", where: "scripts/verify-p2-03.ts", severity: "🟢", detail: "ابزار تأیید تاریخی یک‌بار-مصرف — نامزد بازبینی «لیست اضافات» فاز ۳", dim: 3 },
  ],
  ownerConcern1_probe: "پوشش داده شد — صفر کد مدیر hardcode در src/ (جستجوی ۱: count=0)",
};

writeFileSync("/home/z/my-project/download/pn026/code-integrity.json", JSON.stringify(r, null, 1));
console.log("✓ code-integrity.json — " + r.summary.verdict);
