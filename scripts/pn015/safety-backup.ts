// PN-015 احیای مبنای سفارش — بکاپ ایمنی DB پیش از هر تغییری (VACUUM INTO)
import { PrismaClient } from '@prisma/client';

async function main() {
  const db = new PrismaClient();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = `backups/pn015-pre-recovery-${stamp}.db`;
  await db.$executeRawUnsafe(`VACUUM INTO '${target}'`);
  const integ = await db.$queryRawUnsafe('PRAGMA integrity_check') as any;
  console.log(JSON.stringify({ target, integrity: integ?.[0]?.integrity_check, at: new Date().toISOString() }));
  await db.$disconnect();
}
main().catch((e) => { console.error('FAIL:', e instanceof Error ? e.message : e); process.exit(1); });
