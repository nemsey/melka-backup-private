import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
// job queue tables
const tables = await p.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%Job%' OR name LIKE '%job%')");
console.log('job tables:', tables.map(t => t.name).join(', '));
try {
  const rows = await p.$queryRawUnsafe("SELECT * FROM JobQueue ORDER BY rowid DESC LIMIT 8");
  for (const r of rows) console.log(JSON.stringify(r).slice(0, 300));
} catch (e) { console.log('JobQueue err:', e.message.slice(0, 100)); }
try {
  const locks = await p.$queryRawUnsafe("SELECT * FROM JobLock LIMIT 5");
  for (const l of locks) console.log('lock:', JSON.stringify(l).slice(0, 200));
} catch (e) { console.log('JobLock err:', e.message.slice(0, 100)); }
await p.$disconnect();
