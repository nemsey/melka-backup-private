import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const st = await db.syncState.findMany();
for (const s of st) {
  console.log(JSON.stringify({ entity: s.entity, status: s.status, attempts: s.attempts, lastError: s.lastError, lastSuccessAt: s.lastSuccessAt?.toISOString(), lastSyncedAt: s.lastSyncedAt?.toISOString(), recordsFetched: s.recordsFetched, meta: s.meta?.slice(0, 200) }));
}
console.log("=== recent audit logs ===");
const logs = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 18 });
for (const l of logs) console.log(JSON.stringify({ action: l.action, actor: l.actor, detail: l.detail?.slice(0, 200), at: l.createdAt.toISOString(), op: l.operation, entity: l.entityType, count: l.recordCount }));
console.log("=== sample transaction provenance ===");
const t = await db.transactionRecord.findFirst({ orderBy: { syncedAt: "desc" } });
console.log(JSON.stringify({ id: t?.id, contractDate: t?.contractDate?.toISOString(), syncedAt: t?.syncedAt?.toISOString(), sourceRunId: t?.sourceRunId?.slice(0, 20), extractedAt: t?.extractedAt?.toISOString(), extractionBatchId: t?.extractionBatchId?.slice(0, 20), normalizationVersion: t?.normalizationVersion, hasRaw: !!t?.rawDate }));
const exp = await db.expertRecord.count();
const expWithRaw = await db.expertRecord.count({ where: { rawFullName: { not: null } } });
console.log(`experts total=${exp} withRaw=${expWithRaw}`);
await db.$disconnect();
