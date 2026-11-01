import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });

// 435 named: distribution by source / actorName / createdAt
const named = await p.requestRecord.findMany({
  where: { tenantId: 'melketun', customerName: { not: null } },
  select: { requestCode: true, source: true, actorName: true, actorCode: true, createdAt: true, sourceRunId: true, normalizationVersion: true, customerName: true, customerMobile: true },
});
const bySource = {}, byActor = {}, byMonth = {}, byVersion = {};
for (const r of named) {
  bySource[r.source] = (bySource[r.source] || 0) + 1;
  byActor[r.actorName] = (byActor[r.actorName] || 0) + 1;
  const m = r.createdAt ? r.createdAt.toISOString().slice(0, 7) : 'null';
  byMonth[m] = (byMonth[m] || 0) + 1;
  byVersion[r.normalizationVersion] = (byVersion[r.normalizationVersion] || 0) + 1;
}
console.log('by source:', JSON.stringify(bySource));
console.log('by actor (top):', Object.entries(byActor).sort((a, b) => b[1] - a[1]).slice(0, 8));
console.log('by month:', JSON.stringify(byMonth));
console.log('by normVersion:', JSON.stringify(byVersion));

// what do the named ones look like vs. melk-tabriz tenant (which is the reference)?
const tb = await p.requestRecord.count({ where: { tenantId: 'melk-tabriz' } });
const tbNamed = await p.requestRecord.count({ where: { tenantId: 'melk-tabriz', customerName: { not: null } } });
console.log(`\nmelk-tabriz requests: total=${tb} named=${tbNamed} (${(100 * tbNamed / tb).toFixed(1)}%)`);

// check armCustomerId on melketun
const withArmCustomer = await p.requestRecord.count({ where: { tenantId: 'melketun', armCustomerId: { not: null } } });
console.log('melketun with armCustomerId:', withArmCustomer);

// ContactRecord-like tables?
const tables = await p.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%ontact%' OR name LIKE '%ustomer%')`);
console.log('\ncontact/customer tables:', JSON.stringify(tables));

await p.$disconnect();
