// PN-027 · ۵-الف-۵ — شناسایی نشست‌های probe و crm-sync کهنه (قبل از اقدام)
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  console.log('=== نشست‌ها (گروه‌بندی) ===');
  const sessions = await db.session.findMany({
    select: { id: true, personnelCode: true, displayName: true, role: true, ip: true, createdAt: true, expiresAt: true, revoked: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log('کل نشست‌ها:', sessions.length);

  // الگوهای probe: displayName/IP مشخص
  const probePatterns = [/probe/i, /تست/i, /PN-?\d/i, /p65\d/i, /debug/i, /witness/i, /e2e/i];
  const probe: typeof sessions = [];
  const real: typeof sessions = [];
  for (const s of sessions) {
    const hay = `${s.displayName ?? ''}|${s.personnelCode ?? ''}`;
    if (probePatterns.some((p) => p.test(hay))) probe.push(s);
    else real.push(s);
  }
  console.log('کاندید probe (الگو):', probe.length);
  for (const s of probe) console.log('  ·', s.id.slice(0, 8), s.personnelCode, `"${s.displayName}"`, s.role, s.ip, s.createdAt?.toISOString().slice(0, 16));

  console.log('\n=== نقش‌ها/کدها در نشست‌های باقی‌مانده ===');
  const byKey: Record<string, number> = {};
  for (const s of real) {
    const k = `${s.role}|${s.personnelCode}|${s.displayName}|${s.ip}`;
    byKey[k] = (byKey[k] ?? 0) + 1;
  }
  for (const [k, n] of Object.entries(byKey)) console.log(`  ${n}× ${k}`);

  console.log('\n=== نشست‌های منقضی/باطل در باقی‌مانده ===');
  const now = new Date();
  const expired = real.filter((s) => s.expiresAt < now || s.revoked);
  console.log('منقضی/باطل:', expired.length, '· فعال:', real.length - expired.length);

  console.log('\n=== CrmSyncRun (جدول) ===');
  const models = Object.keys(db as unknown as Record<string, unknown>).filter((k) => /sync/i.test(k));
  console.log('مدل‌های sync:', models.join(' · '));
  try {
    const runs = await (db as any).crmSyncRun.findMany({ orderBy: { startedAt: 'asc' } });
    console.log('crmSyncRun کل:', runs.length);
    for (const r of runs) console.log('  ·', r.id, r.status, r.startedAt?.toISOString?.().slice(0, 16), JSON.stringify(r.meta ?? r.details ?? '').slice(0, 80));
  } catch (e: any) {
    console.log('crmSyncRun خطا:', e.message?.slice(0, 100));
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
