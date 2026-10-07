// PN-015 — DB probe 2: remaining key tables (read-only)
import { PrismaClient } from '@prisma/client';

async function main() {
  const db = new PrismaClient();
  const models: Record<string, string> = {
    PropertyRecord: 'propertyRecord', TransactionRecord: 'transactionRecord', ContractRecord: 'contractRecord',
    PredictionRecord: 'predictionRecord', OutcomeRecord: 'outcomeRecord', JobLock: 'jobLock',
    AgentFeedback: 'agentFeedback', AgentPolicyVersion: 'agentPolicyVersion', VisitRecord: 'visitRecord',
    CustomerRecord: 'customerRecord', SyncState: 'syncState', SpecialPropertyRecord: 'specialPropertyRecord',
  };
  const counts: Record<string, number> = {};
  for (const [label, m] of Object.entries(models)) {
    try { counts[label] = await (db as any)[m].count(); } catch { counts[label] = -1; }
  }
  const lastPrediction = await (db as any).predictionRecord?.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }).catch(() => null);
  const lastProperty = await (db as any).propertyRecord.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  console.log(JSON.stringify({ counts, lastPredictionCreatedAt: lastPrediction?.createdAt ?? null, lastPropertyCreatedAt: lastProperty?.createdAt ?? null }, null, 2));
  await db.$disconnect();
}
main().catch((e) => { console.error('PROBE_FAIL:', e instanceof Error ? e.message : e); process.exit(1); });
