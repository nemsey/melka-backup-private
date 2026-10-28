import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
// گام ۱-الف — مناطق
const rows = await p.requestRecord.findMany({ where: { tenantId: 'melketun', areaNamesJson: { not: null } }, select: { areaNamesJson: true }, take: 4000 });
let gt3 = 0, total = 0;
for (const r of rows) { try { const a = JSON.parse(r.areaNamesJson); if (a.length > 3) gt3++; if (a.length > 0) total++; } catch {} }
// گام ۲ — پوشش ستون‌های کلیدی ملکتون
const [m7total, m7owner, m8total, m8name, m8mobile] = await Promise.all([
  p.propertyRecord.count({ where: { tenantId: 'melketun' } }),
  p.propertyRecord.count({ where: { tenantId: 'melketun', rawOwnerName: { not: null } } }),
  p.requestRecord.count({ where: { tenantId: 'melketun' } }),
  p.requestRecord.count({ where: { tenantId: 'melketun', customerName: { not: null } } }),
  p.requestRecord.count({ where: { tenantId: 'melketun', customerMobile: { not: null } } }),
]);
// گام ۳ — تازگی فهرست‌ها
const filingsFresh = await p.propertyRecord.count({ where: { tenantId: 'melketun', sourceRunId: { startsWith: 'pn049-' } } });
const reqsFresh = await p.requestRecord.count({ where: { tenantId: 'melketun', extractedAt: { gte: new Date('2026-10-22T23:00:00Z') } } });
const out = {
  step1a_areas: { rowsWithAreas: total, fileMode_gt3: gt3, split_fixed: 759 },
  step2_coverage: {
    m7_ownerColumn_filled: m7owner, m7_total: m7total,
    m8_applicant_name_filled: m8name, m8_mobile_filled: m8mobile, m8_total: m8total,
  },
  step3_freshness: { filings_pn049_run: filingsFresh, requests_fresh_tonight: reqsFresh },
};
console.log(JSON.stringify(out, null, 1));
await p.$disconnect();
