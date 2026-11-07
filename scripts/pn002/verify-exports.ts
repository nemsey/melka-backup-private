// scripts/pn002/verify-exports.ts — راستی‌آزمایی زندهٔ خروجی اکسل هر چهار کاشی (گام ۶-۲)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db';
export {};

async function main() {
  const { createSession } = await import('@/lib/auth/session');
  const { token } = await createSession(
    { personnelCode: '950033', displayName: 'تست خروجی', role: 'OWNER' },
    { ip: '127.0.0.1' },
    null
  );
  const BASE = 'http://localhost:3000';
  for (const entity of ['listings', 'requests', 'transactions', 'experts']) {
    try {
      const res = await fetch(`${BASE}/api/crm/export/${entity}`, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) {
        console.log(`FAIL ${entity}: HTTP ${res.status} — ${(await res.text()).slice(0, 120)}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const zipOk = buf.subarray(0, 2).toString('latin1') === 'PK';
      const size = (buf.length / 1024).toFixed(0);
      const ctype = String(res.headers.get('content-type') ?? '');
      console.log(`${zipOk ? 'PASS' : 'FAIL'} ${entity}: xlsx ${zipOk ? 'valid (PK)' : 'INVALID'} | ${size}KB | ${ctype.slice(0, 45)}`);
    } catch (e) {
      console.log(`FAIL ${entity}: ${(e as Error).message}`);
    }
  }
  // پاکسازی نشست تست
  const { db } = await import('@/lib/db');
  await db.session.deleteMany({ where: { personnelCode: '950033' } });
  console.log('(نشست تست پاک شد)');
  process.exit(0);
}
main().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1); });
