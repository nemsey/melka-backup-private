// PN-015 — DB provenance probe: earliest/latest timestamps of local-only tables
import { PrismaClient } from '@prisma/client';

async function main() {
  const db = new PrismaClient();
  const q = async (sql: string) => (await db.$queryRawUnsafe(sql) as any[])[0];
  const res = {
    auditOldest: await q('SELECT MIN(createdAt) v, COUNT(*) c FROM AuditLog'),
    auditNewest: await q('SELECT MAX(createdAt) v FROM AuditLog'),
    memOldest: await q('SELECT MIN(createdAt) v FROM AgentMemory'),
    policyNewest: await q('SELECT MAX(createdAt) v FROM AgentPolicyVersion'),
    appMeta: await q("SELECT id, masterCodeHash IS NOT NULL as hasHash FROM AppMeta WHERE id='singleton'"),
    syncState: await q('SELECT * FROM SyncState LIMIT 1'),
    listingRange: await q('SELECT MIN(createdAt) mn, MAX(createdAt) mx FROM PropertyRecord'),
    graphRange: await q('SELECT MIN(createdAt) mn, MAX(createdAt) mx FROM GraphNode'),
    pageCount: await q('PRAGMA page_count'),
  };
  console.log(JSON.stringify(res, (_, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
  await db.$disconnect();
}
main().catch((e) => { console.error('FAIL:', e instanceof Error ? e.message : e); process.exit(1); });
