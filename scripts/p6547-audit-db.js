#!/usr/bin/env node
/** p6547-audit-db.js — ممیزی داده برای گام‌های جدید (P6547) */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const reqTotal = await p.requestRecord.count();
  const sampleArea = await p.requestRecord.findMany({ select: { areaNamesJson: true }, take: 8000 });
  const withNonEmpty = sampleArea.filter((s) => { try { const a = JSON.parse(s.areaNamesJson || "null"); return Array.isArray(a) && a.length > 0; } catch { return false; } }).length;
  const allAreas = {};
  sampleArea.forEach((s) => { try { const a = JSON.parse(s.areaNamesJson || "null"); if (Array.isArray(a)) a.forEach((x) => (allAreas[x] = (allAreas[x] || 0) + 1)); } catch {} });
  const top = Object.entries(allAreas).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log("requests:", { reqTotal, sampleWithNonEmptyArea: withNonEmpty, sampleSize: sampleArea.length });
  console.log("top areas:", JSON.stringify(top));

  // M2: درخواست‌ها source arm؟
  const armReq = await p.requestRecord.count({ where: { source: "arm" } });
  console.log("arm requests:", armReq);

  // M3 معاملات
  const txCount = await p.transactionRecord.count();
  console.log("transactions:", { txCount });

  // SyncJobState jobs
  const jobs = await p.syncJobState.findMany({ orderBy: { updatedAt: "desc" }, take: 8 });
  console.log("sync jobs:", jobs.map((j) => ({ jobId: j.jobId, status: j.status, page: j.lastCompletedPage, total: j.totalPages, at: j.updatedAt })));

  // PmPersonnel: branch info absent?
  const pmTotal = await p.pmPersonnelRecord.count();
  const pmHire = await p.pmPersonnelRecord.count({ where: { hireDate: { not: null } } });
  console.log("pm personnel:", { pmTotal, pmHire });

  // AppMeta branch map
  const meta = await p.appMeta.findMany({ where: { key: { contains: "branch" } } });
  console.log("appMeta branch:", JSON.stringify(meta.map((m) => ({ key: m.key, len: (m.valueJson || "").length }))));

  // ListingRecord count (P10 finding)
  const listings = await p.listingRecord.count();
  console.log("listings:", listings);

  await p.$disconnect();
}
main().catch((e) => { console.error("ERR:", e.message.slice(0, 400)); process.exit(1); });
