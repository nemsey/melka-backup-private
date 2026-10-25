import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });

// extractedAt distribution for named vs unnamed melketun requests
const named = await p.requestRecord.findMany({
  where: { tenantId: 'melketun', customerName: { not: null } },
  select: { requestCode: true, extractedAt: true, extractionBatchId: true, updatedAt: true },
  orderBy: { extractedAt: 'desc' },
});
const unnamed = await p.requestRecord.findMany({
  where: { tenantId: 'melketun', customerName: null },
  select: { requestCode: true, extractedAt: true, extractionBatchId: true },
  orderBy: { extractedAt: 'desc' },
  take: 500,
});
const byDay = (rows) => {
  const m = {};
  for (const r of rows) {
    const k = r.extractedAt ? r.extractedAt.toISOString().slice(0, 10) : 'null';
    m[k] = (m[k] || 0) + 1;
  }
  return Object.entries(m).sort();
};
console.log('== NAMED (435) extractedAt by day ==');
console.log(JSON.stringify(byDay(named)));
console.log('\n== UNNAMED sample-500 extractedAt by day ==');
console.log(JSON.stringify(byDay(unnamed)));

// batch ids
const batches = {};
for (const r of named) batches[r.extractionBatchId] = (batches[r.extractionBatchId] || 0) + 1;
console.log('\nnamed extractionBatchIds:', JSON.stringify(batches, null, 1));

await p.$disconnect();
