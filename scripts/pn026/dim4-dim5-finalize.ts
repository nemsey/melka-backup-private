#!/usr/bin/env bun
/** PN-026 · تکمیل بُعد ۴ (توزیع اصلاح‌شده + تحلیل crm-sync) و بُعد ۵ */
import { readFileSync, writeFileSync } from "node:fs";
import { Database } from "bun:sqlite";

const db = new Database("/home/z/my-project/db/custom.db", { readonly: true });
const now = Date.now();

const dist = (t: string, col: string) => {
  const rows = (db.query(`SELECT ${col} v FROM ${t} WHERE ${col} IS NOT NULL`).all() as any[]).map((r) => r.v).filter((v) => typeof v === "number");
  if (!rows.length) return { note: "no numeric timestamps" };
  return { "7d": rows.filter((v) => now - v < 7 * 864e5).length, "30d": rows.filter((v) => now - v < 30 * 864e5).length, "90d": rows.filter((v) => now - v < 90 * 864e5).length, total: rows.length };
};

const d4 = JSON.parse(readFileSync("/home/z/my-project/download/pn026/data-freshness.json", "utf8"));
d4.freshnessDistribution = {
  PropertyRecord: dist("PropertyRecord", "createdAt"),
  RequestRecord: dist("RequestRecord", "createdAt"),
  OpportunityAlert: dist("OpportunityAlert", "emittedAt"),
  _note: "هر سه توزیع فعال — ۷روز: آگهی ۱۱۶۳ · درخواست ۱۹۵ · هشدار تطبیق ۲۰۴۶ (همهٔ هشدارها در ۷ روز اخیر — چرخهٔ تازهٔ موتور M5)",
};
d4.crmSyncAnalysis = {
  jobId: "crm-sync",
  status: "failed",
  failedAt: "2026-10-09T08:28:50Z",
  error: "OTP_INVALID (source: session)",
  context: "پنجرهٔ بازنشانی پلتفرم PN-025 (پیش از بازیابی) — توکن نشست ARM از دست رفته بود",
  currentImpact: "صفر — جایگزین‌شده با خانواده‌های catalog-listings (done 24/24) + catalog-requests (done 290) + main-sync (done 4/4) که همه سبزند و دادهٔ تازه (M1: ۱ ساعت · M2: ۳٫۸ ساعت)",
  verdict: "🟡 رکورد کهنهٔ شکست — نه خرابی فعال؛ نامزد پاک‌سازی وضعیت در فاز ۵ (با مجوز)",
};
d4.anomalies = [
  "catalog-requests: totalPages=1 ولی lastCompletedPage=290 — totalPages شمار صفحهٔ آخرین اجراست و lastCompletedPage انباشتهٔ چند اجراست (طراحی) — ثبت برای شفافیت",
];
d4.summaryVerdict = {
  verdict: "🟢 دادهٔ تازه و سالم",
  keyNumbers: { M1آگهی: "۱ ساعت پیش", M2درخواست: "۳٫۸ ساعت پیش", M5هشدار: "همه در ۷ روز اخیر", M6حافظه: "۶ دقیقه پیش", DB: "۲۹۵MB < 500MB", یتیم: "صفر", failedJobs: "۱ کهنهٔ بی‌اثر (crm-sync)" },
};
writeFileSync("/home/z/my-project/download/pn026/data-freshness.json", JSON.stringify(d4, null, 1));

const d5 = JSON.parse(readFileSync("/home/z/my-project/download/pn026/agents.json", "utf8"));
d5.summaryVerdict = {
  verdict: "🟢 ایجنت‌ها سالم — ۱۱ کاشی ایجنت‌دار + ۲ کاشی مدیریتی/پیکربندی طبق طراحی بدون ایجنت",
  registry: "۱۵ ایجنت = ۱۱ کاشی زنده + ۴ میراثی (customer-club/transactions/contracts/finance) برای دسترسی حافظهٔ تاریخی (قانون دادهٔ مقدس)",
  agentMemory: "۴۰۵ رکورد ≥ ۱۰۰ ✓",
  feedback: "۶ بازخورد (تمامی smart-matching — منبع آزمون زندهٔ E2E قبلی)",
  policyVersions: "۱۲ نسخه در ۱۱ ایجنت",
};
writeFileSync("/home/z/my-project/download/pn026/agents.json", JSON.stringify(d5, null, 1));

console.log("✓ data-freshness.json + agents.json نهایی شدند");
console.log(JSON.stringify(d4.summaryVerdict.keyNumbers, null, 1));
