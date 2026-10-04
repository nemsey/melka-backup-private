// scripts/pn001/db-counts.ts — وارسی آغاز جلسه (بند و) — شمار ردیف‌های کلیدی DB
// پرونده PN-001 — بلوک ۰
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db';
export {}; // ماژولی شدن

async function main() {
  const { db } = await import('@/lib/db');
  const counts: Record<string, number> = {};
  const models = [
    'transactionRecord', 'listingRecord', 'requestRecord', 'expertRecord',
    'pmPersonnelRecord', 'divarAd', 'divarFile', 'session', 'opportunityAlert',
    'outcomeRecord', 'blackboardEvent', 'graphNode', 'graphEdge', 'syncJobState',
    'agentMemory', 'modelConfig', 'featureValue', 'archiveLog',
  ] as const;
  for (const m of models) {
    try {
      // @ts-expect-error — پویا
      counts[m] = await db[m].count();
    } catch {
      counts[m] = -1; // مدل وجود ندارد
    }
  }
  console.log('=== شمار ردیف‌های کلیدی (بند و — PN-001 BLOCK 0) ===');
  const keyFive: Array<[string, string]> = [
    ['معاملات', 'transactionRecord'],
    ['آگهی', 'listingRecord'],
    ['درخواست', 'requestRecord'],
    ['کارشناس', 'expertRecord'],
    ['پرسنل PM', 'pmPersonnelRecord'],
  ];
  for (const [label, model] of keyFive) {
    const v = counts[model];
    console.log(`${label}: ${v === -1 ? 'مدل یافت نشد' : v}`);
  }
  console.log('--- سایر ---');
  for (const [k, v] of Object.entries(counts)) {
    if (!keyFive.some(([, m]) => m === k)) console.log(`${k}: ${v === -1 ? '—' : v}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
