process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
export {}; // ماژولی شدن
async function main() {
  const { db } = await import("@/lib/db");
  const [sessions, tx, experts, contracts, listings, requests, visits, interactions, props, customers, audit] = await Promise.all([
    db.session.count(), db.transactionRecord.count(), db.expertRecord.count(), db.contractRecord.count(),
    db.listingRecord.count(), db.requestRecord.count(), db.visitRecord.count(), db.interactionRecord.count(),
    db.propertyRecord.count(), db.customerRecord.count(), db.auditLog.count(),
  ]);
  console.log(JSON.stringify({ sessions, tx, experts, contracts, listings, requests, visits, interactions, props, customers, audit }));
  const recent = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 });
  for (const a of recent) console.log("AUDIT:", a.createdAt.toISOString(), "|", a.action, "|", a.actor, "|", (a.detail||"").slice(0,90));
  const ss = await db.session.findMany({ orderBy: { createdAt: "desc" }, take: 4 });
  for (const s of ss) console.log("SESSION:", s.createdAt.toISOString(), s.personnelCode, s.role, s.accessScope, "revoked=" + s.revoked, "arm=" + (s.armTokenEnc ? "YES" : "no"));
  const sync = await db.syncState.findUnique({ where: { id: "singleton" } });
  console.log("SYNCSTATE:", sync ? { lastSyncedAt: sync.lastSyncedAt, lastSuccessAt: sync.lastSuccessAt, syncRunId: sync.syncRunId, lastError: sync.lastError, summary: (sync.summaryJson||"").slice(0,200) } : null);
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
