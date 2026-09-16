import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const sessions = await db.session.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
  for (const s of sessions) console.log(s.id.slice(0,8), s.personnelCode, s.role, 'revoked:', s.revoked, 'hasArmToken:', !!s.armTokenEnc, 'expires:', s.expiresAt.toISOString());
  const st = await db.syncState.findFirst();
  console.log('syncState:', st ? { lastSuccessAt: st.lastSuccessAt, lastError: st.lastError?.slice(0,80), counts: JSON.parse(st.summaryJson ?? 'null') } : null);
  const [t, e, i] = await Promise.all([db.transactionRecord.count(), db.expertRecord.count(), db.interactionRecord.count()]);
  console.log('records: tx', t, 'experts', e, 'interactions', i);
}
main().finally(() => db.$disconnect());
