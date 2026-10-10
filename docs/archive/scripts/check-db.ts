import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
const db = new PrismaClient();
async function main() {
  const meta = await (db as any).appMeta.findUnique({ where: { id: 'singleton' } });
  console.log('AppMeta masterCodeHash:', meta?.masterCodeHash ?? '(none)');
  console.log('hash(80211186) =', createHash('sha256').update('80211186','utf8').digest('hex'));
  console.log('hash(80221186) =', createHash('sha256').update('80221186','utf8').digest('hex'));
  const counts: Record<string, number> = {};
  const models: Record<string,string> = { PropertyRecord:'propertyRecord', RequestRecord:'requestRecord', TransactionRecord:'transactionRecord', RealtorRecord:'realtorRecord', GraphNode:'graphNode', GraphEdge:'graphEdge', OpportunityAlert:'opportunityAlert', Session:'session' };
  for (const [label, m] of Object.entries(models)) {
    try { counts[label] = await (db as any)[m].count(); } catch (e: any) { counts[label] = -1; }
  }
  console.log('COUNTS:', JSON.stringify(counts));
  // check graphs + engines existence
  try { const s = await (db as any).syncJobState.findMany(); console.log('SyncJobState:', s.map((x:any)=>x.jobId+':'+x.status).join(', ') || '(empty)'); } catch { console.log('SyncJobState: NO TABLE'); }
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); }).finally(() => db.$disconnect());
