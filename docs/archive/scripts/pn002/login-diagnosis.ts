// scripts/pn002/login-diagnosis.ts — ریشه‌یابی کامل ورود مالک (نکته ۱) + پاکسازی نشست تست
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db';
export {};

async function main() {
  const { db } = await import('@/lib/db');
  console.log('=== PN-002 · ریشه‌یابی ورود مالک (نکته ۱) ===');

  // ۱) رخدادهای حسابرسی اخیر (داستان تلاش‌های ورود)
  const logs = await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 30 });
  console.log(`۱) ${logs.length} رخداد اخیر حسابرسی:`);
  for (const l of logs) {
    const d = l.detail ? ` | ${String(l.detail).slice(0, 100)}` : '';
    console.log(`   ${l.createdAt.toISOString()} ${l.action} actor=${l.actor ?? '—'}${d}`);
  }

  // ۲) نشست‌های فعلی
  const sessions = await db.session.findMany({ orderBy: { createdAt: 'desc' } });
  console.log(`\n۲) ${sessions.length} نشست:`);
  for (const s of sessions) {
    console.log(`   id=${s.id} personnel=${s.personnelCode} role=${s.role} revoked=${s.revoked} created=${s.createdAt.toISOString()} expires=${s.expiresAt.toISOString()} lastSeen=${s.lastSeenAt?.toISOString?.() ?? '—'}`);
  }

  // ۳) تازگی معاملات/کارشناسان (زمان همگام‌سازی واقعی)
  try {
    const lastTx = await db.transactionRecord.findFirst({ orderBy: { syncedAt: 'desc' }, select: { syncedAt: true, propertyCode: true } });
    console.log(`\n۳) آخرین معامله همگام‌شده: propertyCode=${lastTx?.propertyCode ?? '—'} @ ${lastTx?.syncedAt?.toISOString?.() ?? '—'}`);
  } catch (e) { console.log('۳) ERR tx:', (e as Error).message); }
  try {
    const ex = await db.expertRecord.findFirst({ orderBy: { syncedAt: 'desc' } as never });
    const exRec = ex as unknown as Record<string, unknown> | null;
    console.log(`   آخرین کارشناس همگام‌شده: code=${exRec?.expertCode ?? exRec?.code ?? '—'} @ ${exRec?.syncedAt instanceof Date ? exRec.syncedAt.toISOString() : String(exRec?.syncedAt ?? '—')}`);
  } catch (e) { console.log('   ERR expert:', (e as Error).message); }

  // ۴) پاکسازی نشست تست (نشست OWNER ای که همین حالا با curl تست کردیم)
  const TEST_SESSION_ID = process.argv[2];
  if (TEST_SESSION_ID) {
    const del = await db.session.deleteMany({ where: { id: TEST_SESSION_ID } });
    console.log(`\n۴) نشست تست ${TEST_SESSION_ID} پاک شد: ${del.count} ردیف`);
  } else {
    console.log('\n۴) (شناسه نشست تست داده نشد — بدون پاکسازی)');
  }

  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
