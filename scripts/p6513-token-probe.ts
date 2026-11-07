import { PrismaClient } from '@prisma/client';
import { decryptSecret } from '../src/lib/auth/crypto';
const db = new PrismaClient();
async function main() {
  const row = await db.armConnection.findFirst({ where: { ownerKey: 'master' } });
  const access = row?.tokenEnc ? decryptSecret(row.tokenEnc) ?? '' : '';
  const refresh = row?.refreshTokenEnc ? decryptSecret(row.refreshTokenEnc) ?? '' : '';
  console.log(`access=${access.length}B refresh=${refresh.length}B`);
  // ۱) آیا access هنوز زنده است؟
  const { getMelkProvider } = await import('../src/lib/melk-api/provider');
  const provider = getMelkProvider();
  try {
    const realtors = await provider.listExperts(access, { limit: 1, offset: 0 });
    console.log(`ACCESS ALIVE: experts total=${realtors.total}`);
  } catch (e) {
    console.log('ACCESS DEAD:', (e as Error).message?.slice(0, 80));
    // ۲) تمدید با refresh
    try {
      const fresh = await provider.refreshArmToken(refresh);
      console.log(`REFRESH OK: new access=${fresh.accessToken.length}B`);
      // ۳) توکن تازه کار می‌کند؟
      try {
        const realtors = await provider.listExperts(fresh.accessToken, { limit: 1, offset: 0 });
        console.log(`NEW ACCESS ALIVE: experts total=${realtors.total}`);
      } catch (e2) {
        console.log('NEW ACCESS DEAD:', (e2 as Error).message?.slice(0, 80));
      }
    } catch (e2) {
      console.log('REFRESH FAILED:', (e2 as Error).message?.slice(0, 120));
    }
  }
}
main().finally(() => db.$disconnect());
