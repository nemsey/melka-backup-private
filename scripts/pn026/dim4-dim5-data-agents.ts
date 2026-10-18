#!/usr/bin/env bun
/** PN-026 · بُعد ۴ — داده تازه (Data Freshness) + بُعد ۵ — ایجنت‌ها · فقط-خواندنی */
import { readFileSync, writeFileSync } from "node:fs";
import { Database } from "bun:sqlite";

const db = new Database("/home/z/my-project/db/custom.db", { readonly: true });
const q = (s: string) => db.query(s).all() as any[];

// ═══════════ بُعد ۴ — داده تازه ═══════════
// ۱) آخرین sync هر خانوادهٔ کاشی
const syncJobState = q("SELECT jobId, jobKind, status, lastCompletedPage, resumedFrom, totalPages, progressPercent, updatedAt FROM SyncJobState ORDER BY jobId");
const syncState = q("SELECT * FROM SyncState");
const checkpoints = q("SELECT * FROM SyncCheckpoint ORDER BY updatedAt DESC LIMIT 20");

// ۲) تازگی دادهٔ اصلی هر کاشی (بر پایهٔ جدول‌های دامنه)
const now = Date.now();
const freshnessOf = (table: string, col: string) => {
  try {
    const row = db.query(`SELECT MAX(${col}) AS m, COUNT(*) AS c FROM ${table}`).get() as any;
    const max = row?.m ? new Date(row.m + (String(row.m).length <= 10 ? 0 : 0)).getTime() : null;
    return { count: row?.c ?? 0, latest: row?.m ?? null, ageHours: max ? Math.round((now - max) / 36e5 * 10) / 10 : null };
  } catch { return { count: "ERR", latest: null, ageHours: null }; }
};

const tileData = {
  "M1 آگهی‌ها (PropertyRecord)": freshnessOf("PropertyRecord", "createdAt"),
  "M2 درخواست‌ها (RequestRecord)": freshnessOf("RequestRecord", "createdAt"),
  "M3 معاملات (TransactionRecord)": freshnessOf("TransactionRecord", "syncedAt"),
  "M4 کارشناسان (ExpertRecord)": freshnessOf("ExpertRecord", "syncedAt"),
  "M5 تطبیق (OpportunityAlert)": freshnessOf("OpportunityAlert", "emittedAt"),
  "M6 یادگیری (AgentMemory)": freshnessOf("AgentMemory", "createdAt"),
  "M7 شاخص (MarketPriceStat)": freshnessOf("MarketPriceStat", "updatedAt"),
  "M8 پوشش (SupplyDemandRecord)": freshnessOf("SupplyDemandRecord", "syncedAt"),
  "فایل‌یابی (DivarAd)": freshnessOf("DivarAd", "lastSeenAt"),
  "پرکنش (TransactionEnrichment)": freshnessOf("TransactionEnrichment", "syncedAt"),
};

// ۳) orphan records — رکوردهای یتیم (کلید خارجی شکسته)
const orphans = {
  enrichmentWithoutTransaction: (() => { try { return (db.query("SELECT COUNT(*) c FROM TransactionEnrichment te LEFT JOIN TransactionRecord tr ON te.transactionId = tr.id WHERE tr.id IS NULL").get() as any).c; } catch { return "N/A"; } })(),
  listingWithoutOwner: (() => { try { return (db.query("SELECT COUNT(*) c FROM PropertyRecord p LEFT JOIN ExpertRecord e ON p.expertId = e.id WHERE p.expertId IS NOT NULL AND e.id IS NULL").get() as any).c; } catch { return "N/A"; } })(),
  requestOrphans: (() => { try { return (db.query("SELECT COUNT(*) c FROM RequestRecord r LEFT JOIN ExpertRecord e ON r.expertId = e.id WHERE r.expertId IS NOT NULL AND e.id IS NULL").get() as any).c; } catch { return "N/A"; } })(),
};

// ۴) تناقض بین جداول
const contradictions = {
  transactionsVsEnrichment: (() => { try { return { tr: (db.query("SELECT COUNT(*) c FROM TransactionRecord").get() as any).c, te: (db.query("SELECT COUNT(DISTINCT transactionId) c FROM TransactionEnrichment").get() as any).c }; } catch { return "N/A"; } })(),
};

// ۵) حجم DB
const dbSizeMB = Math.round(readFileSync("/home/z/my-project/db/custom.db").size / 1048576 * 10) / 10;

// ۶) توزیع تازگی (۷/۳۰/۹۰ روز)
const dist = (table: string) => {
  try {
    const d7 = (db.query(`SELECT COUNT(*) c FROM ${table} WHERE createdAt > datetime('now','-7 days')`).get() as any).c;
    const d30 = (db.query(`SELECT COUNT(*) c FROM ${table} WHERE createdAt > datetime('now','-30 days')`).get() as any).c;
    const d90 = (db.query(`SELECT COUNT(*) c FROM ${table} WHERE createdAt > datetime('now','-90 days')`).get() as any).c;
    const tot = (db.query(`SELECT COUNT(*) c FROM ${table}`).get() as any).c;
    return { "7d": d7, "30d": d30, "90d": d90, total: tot };
  } catch { return "N/A"; }
};
const distribution = { PropertyRecord: dist("PropertyRecord"), RequestRecord: dist("RequestRecord"), OpportunityAlert: dist("OpportunityAlert") };

const dim4 = {
  dimension: "بُعد ۴ — داده تازه (Data Freshness)",
  syncJobState, syncState: syncState.map((s) => ({ ...s, _note: "وضعیت همگام‌سازی" })), checkpoints,
  tileData, orphans, contradictions, dbSizeMB,
  freshnessDistribution: distribution,
  findings: [] as string[],
};
// قضاوت
const st = JSON.stringify(syncJobState);
if (!/failed/.test(st)) dim4.findings.push("صفر خانوادهٔ sync در وضعیت failed ✓");
if (orphans.enrichmentWithoutTransaction === 0) dim4.findings.push("صفر enrichment یتیم ✓");
dim4.findings.push(`حجم DB: ${dbSizeMB}MB ${dbSizeMB < 500 ? "< 500MB ✓" : "⚠ ≥ 500MB"}`);
const prAge = (tileData as any)["M1 آگهی‌ها (PropertyRecord)"]?.ageHours;
dim4.findings.push(`تازه‌ترین آگهی: ${prAge ?? "?"} ساعت پیش ${prAge !== null && prAge <= 24 ? "≤ ۲۴ ساعت ✓" : "⚠ بیش از ۲۴ ساعت"}`);

// ═══════════ بُعد ۵ — ایجنت‌ها ═══════════
// از بُعد ۲: ایجنت‌های ثبت‌شده در رجیستری — ۱۵ ایجنت (۱۱ کاشی زنده + ۵ میراثی از کاشی‌های ادغام/حذف)
const agentsRegistry = [
  "transactions-contracts", "experts", "file-finder (divar)", "customer-club (میراثی)", "listings", "requests",
  "arm-listings", "arm-requests", "smart-matching", "market-index", "data-coverage", "learning-tier",
  "transactions (میراثی)", "contracts (میراثی)", "finance (میراثی)",
];
// حافظه/بازخورد/سیاست هر ایجنت واقعی
const agentTiles = ["transactions-contracts", "experts", "file-finder", "listings", "requests", "arm-listings", "arm-requests", "smart-matching", "market-index", "data-coverage", "learning-tier"];
const agentStats = agentTiles.map((t) => {
  const mem = (db.query("SELECT COUNT(*) c FROM AgentMemory WHERE tileId = ?").get(t) as any).c;
  const fb = db.query("SELECT COUNT(*) c, MAX(createdAt) latest FROM AgentFeedback WHERE tileId = ?").get(t) as any;
  const pol = db.query("SELECT COUNT(*) c, MAX(createdAt) latest FROM AgentPolicyVersion WHERE tileId = ?").get(t) as any;
  return { tile: t, memory: mem, feedback: fb, policyVersions: pol };
});
// ساختار واقعی AgentMemory را بیابیم
const memSample = db.query("SELECT * FROM AgentMemory LIMIT 2").all();

const dim5 = {
  dimension: "بُعد ۵ — ایجنت‌ها (Agents)",
  registryTotal: 15,
  tilesWithAgents: 11,
  tilesWithoutAgents: ["management-dashboard", "settings"],
  legacyAgents: ["customer-club", "transactions", "contracts", "finance"],
  note: "۱۳ کاشی → ۱۱ ایجنت فعال (management-dashboard و settings کاشی مدیریتی/پیکربندی هستند و طبق طراحی ایجنت یادگیرنده ندارند — تأیید در report)",
  agentStats, memSample,
  totalMemory: (db.query("SELECT COUNT(*) c FROM AgentMemory").get() as any).c,
  totalFeedback: (db.query("SELECT COUNT(*) c FROM AgentMemory").get() as any).c,
  feedbackTotal: (db.query("SELECT COUNT(*) c FROM AgentFeedback").get() as any).c,
  policyVersionsTotal: (db.query("SELECT COUNT(*) c FROM AgentPolicyVersion").get() as any).c,
  findings: [] as string[],
};
if (dim5.totalMemory >= 100) dim5.findings.push(`AgentMemory: ${dim5.totalMemory} ≥ ۱۰۰ ✓`);
dim5.findings.push(`بازخوردها: ${dim5.feedbackTotal} · نسخه‌های سیاست: ${dim5.policyVersionsTotal}`);

// ذخیره هر دو بُعد
writeFileSync("/home/z/my-project/download/pn026/data-freshness.json", JSON.stringify(dim4, null, 1));
writeFileSync("/home/z/my-project/download/pn026/agents.json", JSON.stringify(dim5, null, 1));
console.log("===== بُعد ۴ =====");
console.log(JSON.stringify({ syncJobState: syncJobState.map((s) => ({ id: s.jobId, status: s.status, page: s.lastCompletedPage + "/" + s.totalPages, resumedFrom: s.resumedFrom, updatedAt: s.updatedAt })), tileData, orphans, dbSizeMB, distribution }, null, 1));
console.log("===== بُعد ۵ =====");
console.log(JSON.stringify({ tilesWithAgents: dim5.tilesWithAgents, totalMemory: dim5.totalMemory, feedbackTotal: dim5.feedbackTotal, policyVersions: dim5.policyVersionsTotal, agentStats: agentStats.map((a) => ({ t: a.tile.split("-")[0], m: a.memory, f: a.feedback?.c ?? a.feedback, p: a.policyVersions?.c ?? a.policyVersions })) }, null, 1));
