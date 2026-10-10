// scripts/pn002/env-audit.ts — ممیزی کامل محیط پس از بازنشانی (پرونده PN-002)
// هدف: شمارش همه مدل‌های داده + وضعیت اتصال‌ها + تازگی داده + وضعیت دیمن‌ها
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db';
export {};

async function main() {
  const { db } = await import('@/lib/db');
  const anyDb = db as unknown as Record<string, { count(): Promise<number> }>;

  console.log('=== PN-002 · ممیزی محیط پس از بازنشانی ===');

  // ۱) شمارش همه مدل‌های کلیدی
  const models = [
    'propertyRecord', 'requestRecord', 'transactionRecord', 'expertRecord',
    'pmPersonnelRecord', 'contractRecord', 'specialPropertyRecord', 'customerRecord',
    'graphNode', 'graphEdge', 'opportunityAlert', 'syncJobState',
    'session', 'auditLog', 'lookupLog', 'interactionRecord', 'visitRecord',
  ] as const;
  const counts: Record<string, number> = {};
  for (const m of models) {
    try { counts[m] = await anyDb[m].count(); } catch { counts[m] = -1; }
  }
  console.log('۱) شمارش‌ها:');
  for (const [k, v] of Object.entries(counts)) console.log(`   ${k}: ${v === -1 ? '—' : v}`);

  // ۲) اتصال‌های ذخیره‌شده (خزانه)
  console.log('۲) اتصال‌ها (خزانه):');
  try {
    const rows = await db.armConnection.findMany();
    console.log(`   armConnection: ${rows.length} رکورد`);
    for (const r of rows) {
      console.log(`   - ownerKey=${r.ownerKey} personnel=${r.personnelCode ?? '—'} status=${r.status} hasToken=${!!r.tokenEnc} lastRefreshed=${r.lastRefreshedAt?.toISOString?.() ?? '—'}`);
    }
  } catch (e) { console.log('   armConnection ERR:', (e as Error).message); }
  try {
    const rows = await db.pmConnection.findMany();
    console.log(`   pmConnection: ${rows.length} رکورد`);
    for (const r of rows) {
      const rec = r as Record<string, unknown>;
      console.log(`   - keys=${Object.keys(rec).slice(0, 8).join(',')} tokenFields=${Object.keys(rec).filter((k) => /enc|token|secret/i.test(k)).map((k) => `${k}=${rec[k] ? 'SET' : 'null'}`).join(' ')}`);
    }
  } catch (e) { console.log('   pmConnection ERR:', (e as Error).message); }

  // ۳) وضعیت کارهای همگام‌سازی
  console.log('۳) وضعیت کارها:');
  try {
    const jobs = await db.syncJobState.findMany();
    for (const j of jobs) {
      console.log(`   - ${j.jobId} [${j.jobKind}] status=${j.status} page=${j.lastCompletedPage}/${j.totalPages} resumedFrom=${j.resumedFrom} updatedAt=${j.updatedAt?.toISOString?.() ?? '—'}`);
    }
  } catch (e) { console.log('   ERR:', (e as Error).message); }

  // ۴) تازگی داده‌ها
  console.log('۴) تازگی داده:');
  try {
    const lastProp = await db.propertyRecord.findFirst({ orderBy: { updatedAt: 'desc' } as never, select: { propertyCode: true, updatedAt: true } as never });
    console.log(`   آخرین آگهی: ${(lastProp as { propertyCode?: string })?.propertyCode ?? '—'} @ ${(lastProp as { updatedAt?: Date })?.updatedAt?.toISOString?.() ?? '—'}`);
  } catch (e) { console.log('   propertyRecord ERR:', (e as Error).message); }
  try {
    const lastReq = await db.requestRecord.findFirst({ orderBy: { updatedAt: 'desc' } as never, select: { requestCode: true, updatedAt: true } as never });
    console.log(`   آخرین درخواست: ${(lastReq as { requestCode?: string })?.requestCode ?? '—'} @ ${(lastReq as { updatedAt?: Date })?.updatedAt?.toISOString?.() ?? '—'}`);
  } catch (e) { console.log('   requestRecord ERR:', (e as Error).message); }
  try {
    const lastTx = await db.transactionRecord.findFirst({ orderBy: { updatedAt: 'desc' } as never });
    const tx = lastTx as unknown as Record<string, unknown> | null;
    console.log(`   آخرین معامله: code=${tx?.code ?? tx?.tradeId ?? '—'} @ ${tx?.updatedAt instanceof Date ? tx.updatedAt.toISOString() : String(tx?.updatedAt ?? '—')}`);
  } catch (e) { console.log('   transactionRecord ERR:', (e as Error).message); }
  try {
    const lastEx = await db.expertRecord.findFirst({ orderBy: { updatedAt: 'desc' } as never });
    const ex = lastEx as unknown as Record<string, unknown> | null;
    console.log(`   آخرین کارشناس: code=${ex?.expertCode ?? ex?.code ?? '—'} @ ${ex?.updatedAt instanceof Date ? ex.updatedAt.toISOString() : String(ex?.updatedAt ?? '—')}`);
  } catch (e) { console.log('   expertRecord ERR:', (e as Error).message); }

  // ۵) نشست‌های فعال
  console.log('۵) نشست‌ها:');
  try {
    const sessions = await db.session.findMany({ select: { personnelCode: true, role: true, revoked: true, expiresAt: true, lastSeenAt: true } });
    for (const s of sessions) {
      console.log(`   - ${s.personnelCode} (${s.role}) revoked=${s.revoked} expires=${s.expiresAt?.toISOString?.() ?? '—'} lastSeen=${s.lastSeenAt?.toISOString?.() ?? '—'}`);
    }
  } catch (e) { console.log('   ERR:', (e as Error).message); }

  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
