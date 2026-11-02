import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
const rows = await p.$queryRawUnsafe("SELECT * FROM SyncJobState ORDER BY rowid DESC LIMIT 10");
for (const r of rows) console.log(JSON.stringify(r).slice(0, 400));
await p.$disconnect();
