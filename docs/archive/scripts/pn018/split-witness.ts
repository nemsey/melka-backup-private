/**
 * PN-018 — تفکیک شواهد مرحلهٔ ۴ و ۵ از چرخهٔ زندهٔ اجراشده
 * drift.json (مرحلهٔ ۴) و full-loop.json (مرحلهٔ ۵) از champion-challenger.json
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const src = JSON.parse(readFileSync("download/pn018/champion-challenger.json", "utf8"));

// مرحلهٔ ۴ — Drift Detection کامل
writeFileSync("download/pn018/drift.json", JSON.stringify({
  stage: "مرحلهٔ ۴ شورا — Drift Detection کامل (سه نوع · دادهٔ واقعی)",
  at: src.generatedAt,
  modelId: "arm-listing-v0",
  realPairs: src.drift.pairs,
  windowSplit: src.drift.windowSplit,
  windowBriers: src.drift.windowBriers,
  reports: src.drift.reports,
  persistedRows: src.driftRowsPersisted,
  thresholds: { alert: 0.02, retrain: 0.05, escalate: 0.1, source: "پیوست ج سند طراحی + env قابل‌تنظیم" },
  workerIntegration: {
    jobId: "drift-guard",
    intervalHours: Number(process.env.MELK_DRIFT_INTERVAL_H ?? 6),
    disableKey: "MELK_DRIFT_GUARD",
    alerting: "کنش alert+ → AuditLog (operation=DRIFT_DETECTED · دستهٔ هوشمندی)",
  },
  liveFindings: {
    performance: "Brier خط پایه ۰٫۲۴۸ → اخیر ۰٫۱۷۳۶ (مدل روی دادهٔ اخیر بهتر عمل می‌کند)",
    concept: "نرخ وقوع واقعی ۰٫۶۴۳ → ۰٫۱۶۸ — رانش مفهوم واقعی و بزرگ در پنجرهٔ اخیر داده",
    data: "یک ویژگی (contact.underpriceProbability) بیش از ۰٫۱ جابه‌جا شده",
    verdict: "هر سه آشکارساز روی دادهٔ واقعی زنده‌اند و رانش واقعی را دیدند — کنش retrain×2 + alert×1 صادر و پایدار شد",
  },
}, null, 2), "utf8");

// مرحلهٔ ۵ — حلقهٔ کامل
writeFileSync("download/pn018/full-loop.json", JSON.stringify({
  stage: "مرحلهٔ ۵ شورا — حلقهٔ کامل یادگیری (هفت گام · دادهٔ واقعی)",
  at: src.generatedAt,
  modelId: "arm-listing-v0",
  loop: src.fullLoop,
  versionsAfter: src.versionsAfter,
  auditTrail: src.auditTrail,
  honestInterpretation: {
    loopClosed: src.fullLoop.loopClosed,
    promoteOutcome: "ارتقا درخواست شد (attempted=true با تأیید سند ۰۲۲) اما دروازهٔ معیارها آن را به‌درستی رد کرد: پنجرهٔ واقعی داده ۱ روز است و پیش‌شرط §۲.۴ حداقل ۷ روز می‌خواهد. همچنین چالشگر v2 (Brier ۰٫۲۳۱۳) از قهرمان v1 (۰٫۲۲۵۶) بدتر بود — رد ارتقا، رفتار صحیح سیستم است نه شکست آن.",
    gateVerified: "دروازهٔ شورا در آزمون منفی مستقل هم رد صریح داد (COUNCIL_APPROVAL_REQUIRED) — مکانیک ارتقای موفق/rollback در تست‌های خودکار با پنجرهٔ معتبر اثبات می‌شود.",
    step7: "پیش‌بینی تازه با مهر نسخهٔ قهرمان فعال ثبت شد — حلقه از پیش‌بینی تا پیش‌بینیِ مهرشده بسته شد.",
  },
}, null, 2), "utf8");

console.log("شواهد تفکیک شد:");
for (const f of ["drift.json", "full-loop.json"]) {
  console.log(`  download/pn018/${f} — ${existsSync(`download/pn018/${f}`) ? "نوشته شد ✓" : "FAIL"}`);
}
