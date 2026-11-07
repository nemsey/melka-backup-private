import { PrismaClient } from '@prisma/client';
import { decryptSecret } from '../src/lib/auth/crypto';
const db = new PrismaClient();
async function main() {
  const rows = await db.armConnection.findMany({ orderBy: { updatedAt: 'desc' } });
  for (const r of rows) {
    const access = r.tokenEnc ? decryptSecret(r.tokenEnc) : null;
    const refresh = r.refreshTokenEnc ? decryptSecret(r.refreshTokenEnc) : null;
    console.log(`ownerKey=${r.ownerKey} status=${r.status} updated=${r.updatedAt.toISOString()} accessLen=${access?.length ?? 0} refreshLen=${refresh?.length ?? 0} lastRefreshed=${r.lastRefreshedAt?.toISOString() ?? '—'}`);
  }
  // آیا نشست زنده‌ای با توکن ARM هست؟
  const sessions = await db.session.findMany({ where: { armTokenEnc: { not: null } }, orderBy: { createdAt: 'desc' }, take: 3, select: { createdAt: true, expiresAt: true, personnelCode: true, role: true } });
  for (const s of sessions) console.log('SESSION', JSON.stringify(s));
}
main().finally(() => db.$disconnect());
