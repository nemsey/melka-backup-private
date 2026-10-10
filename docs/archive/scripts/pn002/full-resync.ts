// scripts/pn002/full-resync.ts — همگام‌سازی کامل فوری کاتالوگ‌ها با توکن خزانه (پرکردن ستون‌های تازه PN-002)
// نکته ۵ مالک: سرعت + لغو محدودیت‌ها — این اجرای یک‌بارهٔ دستی همهٔ صفحات را تازه می‌کند
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db';
export {};

async function main() {
  const { applyPlatformEnvFallbacks } = await import('@/lib/platform-env');
  applyPlatformEnvFallbacks();
  const { getIntegrationRepository } = await import('@/core/repositories');
  const { decryptSecret } = await import('@/lib/auth/crypto');
  const repo = getIntegrationRepository();
  const conn = await repo.getArmConnection('410031320');
  const token = conn?.tokenEnc ? decryptSecret(conn.tokenEnc) : null;
  if (!token) { console.log('NO VAULT TOKEN'); process.exit(1); }
  console.log('توکن خزانه ✓');

  const { syncArmListingsCatalog, syncArmRequestsCatalog } = await import('@/lib/melk-api/arm-catalog');

  console.log('\n=== ۱) همگام‌سازی کامل آگهی‌ها (تا ۵۰۰ صفحه) ===');
  const t1 = Date.now();
  const lres = await syncArmListingsCatalog(token, { pageSize: 500, maxPages: 500 });
  console.log(`ok=${lres.ok} pages=${lres.pages} fetched=${lres.fetched} created=${lres.created} updated=${lres.updated} dup=${lres.duplicates} err=${lres.errors} total=${lres.totalAtSource} ${((Date.now() - t1) / 1000).toFixed(1)}s`);

  console.log('\n=== ۲) همگام‌سازی کامل درخواست‌ها (تا ۵۰۰ صفحه) ===');
  const t2 = Date.now();
  const rres = await syncArmRequestsCatalog(token, { pageSize: 100, maxPages: 500 });
  console.log(`ok=${rres.ok} pages=${rres.pages} fetched=${rres.fetched} created=${rres.created} updated=${rres.updated} dup=${rres.duplicates} err=${rres.errors} total=${rres.totalAtSource} ${((Date.now() - t2) / 1000).toFixed(1)}s`);

  // شمارش ستون‌های تازه در DB
  const { db } = await import('@/lib/db');
  const [withBranch, withView, withInputs, totalP, totalR] = await Promise.all([
    db.propertyRecord.count({ where: { armBranchTitle: { not: null } } }),
    db.propertyRecord.count({ where: { viewCount: { not: null } } }),
    db.requestRecord.count({ where: { spaceFrom: { not: null } } }),
    db.propertyRecord.count(),
    db.requestRecord.count({ where: { source: 'arm' } }),
  ]);
  console.log(`\n=== شاهد پرشدگی ستون‌های تازه ===`);
  console.log(`آگهی: کل=${totalP} · شعبهARM=${withBranch} · بازدید=${withView}`);
  console.log(`درخواست: کل=${totalR} · متراژ از=${withInputs}`);
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1); });
