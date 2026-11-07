import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });

// ---- fill-rate overview for all relevant fields ----
const total = await p.requestRecord.count({ where: { tenantId: 'melketun' } });
const filled = async (field) => {
  const r = await p.requestRecord.findMany({
    where: { tenantId: 'melketun', [field]: { not: null } },
    select: { id: true },
    take: 6000,
  });
  return r.length;
};
const fields = ['customerName', 'customerMobile', 'rawCustomerName', 'rawCustomerMobile', 'title', 'customerDescription', 'actorName', 'armRegistrationJson', 'customerNameNorm'];
console.log(`total melketun requests: ${total}`);
for (const f of fields) {
  // count with raw SQL for speed
  const cnt = await p.$queryRawUnsafe(`SELECT COUNT(*) as c FROM RequestRecord WHERE tenantId='melketun' AND ${f} IS NOT NULL AND ${f} != ''`);
  console.log(`${f}: ${cnt[0].c}`);
}

// ---- sample: what does a request look like raw? ----
const sample = await p.requestRecord.findMany({
  where: { tenantId: 'melketun', customerName: null },
  select: { requestCode: true, title: true, customerDescription: true, rawCustomerName: true, rawCustomerMobile: true, actorName: true, status: true, tradeTypeName: true, areaNamesJson: true, createdAt: true, armRegistrationJson: true },
  take: 4,
  orderBy: { createdAt: 'desc' },
});
console.log('\n== samples without customerName ==');
console.log(JSON.stringify(sample, (k, v) => (typeof v === 'string' && v.length > 120 ? v.slice(0, 120) + '…' : v), 1));

// ---- named samples: where did names come from? ----
const named = await p.requestRecord.findMany({
  where: { tenantId: 'melketun', customerName: { not: null } },
  select: { requestCode: true, customerName: true, customerMobile: true, rawCustomerName: true, actorName: true, createdAt: true },
  take: 6,
});
console.log('\n== named samples ==');
console.log(JSON.stringify(named, null, 1));

// ---- title pattern: does title contain a name? ----
const withTitle = await p.$queryRawUnsafe(`SELECT title, COUNT(*) as c FROM RequestRecord WHERE tenantId='melketun' AND title IS NOT NULL AND title != '' GROUP BY title LIMIT 12`);
console.log('\n== title values (top) ==');
console.log(JSON.stringify(withTitle, null, 1));

await p.$disconnect();
