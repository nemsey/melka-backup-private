// PN-015 — Section 0.2 prerequisite: DB state probe (read-only)
import { PrismaClient } from '@prisma/client';

async function main() {
  const db = new PrismaClient();
  const models: Record<string, string> = {
    Listing: 'listingRecord', Request: 'requestRecord', GraphNode: 'graphNode', GraphEdge: 'graphEdge',
    OpportunityAlert: 'opportunityAlert', Prediction: 'prediction', Interaction: 'interactionRecord',
    ExpertProfile: 'expertProfile', AgentMemory: 'agentMemory', AuditLog: 'auditLog',
  };
  const counts: Record<string, number> = {};
  for (const [label, m] of Object.entries(models)) {
    try { counts[label] = await (db as any)[m].count(); } catch { counts[label] = -1; }
  }
  const integrity = await db.$queryRawUnsafe('PRAGMA integrity_check') as any;
  const latestListing = await (db as any).listingRecord.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  const latestGraph = await (db as any).graphNode.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  console.log(JSON.stringify({
    counts,
    integrity: integrity?.[0]?.integrity_check ?? String(integrity),
    latestListingCreatedAt: latestListing?.createdAt ?? null,
    latestGraphCreatedAt: latestGraph?.createdAt ?? null,
  }, null, 2));
  await db.$disconnect();
}
main().catch((e) => { console.error('PROBE_FAIL:', e instanceof Error ? e.message : e); process.exit(1); });
