// PN-015 — inspect JobLock rows (runtime:worker lock diagnosis)
import { PrismaClient } from '@prisma/client';

async function main() {
  const db = new PrismaClient();
  const locks = await (db as any).jobLock.findMany();
  const now = Date.now();
  console.log(JSON.stringify({ now: new Date(now).toISOString(), locks: locks.map((l: any) => ({
    jobId: l.jobId,
    instanceId: l.instanceId,
    acquiredAt: l.acquiredAt,
    lastHeartbeat: l.lastHeartbeat,
    expiresAt: l.expiresAt,
    expired: new Date(l.expiresAt).getTime() < now,
    ageMs: now - new Date(l.acquiredAt).getTime(),
    metadata: l.metadata,
  })) }, (_, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
  await db.$disconnect();
}
main().catch((e) => { console.error('FAIL:', e instanceof Error ? e.message : e); process.exit(1); });
