// PN-027 · ۵-پ-۱/۲ — بک‌فیل ستون‌های نرمال (افزودنی · rollback = حذف ستون‌ها)
import { PrismaClient } from '@prisma/client';
import { normalizeFilterInput } from '../../src/lib/normalize-input';

const db = new PrismaClient();
const SEP = '\u001F';
const norm = (v: string | null | undefined) => normalizeFilterInput(v ?? '');
const joinSep = (parts: (string | null | undefined)[]) => {
  const j = parts.map((p) => norm(p)).join(SEP);
  return j.replaceAll(SEP, '') === '' ? null : j;
};

async function backfill(table: 'requestRecord' | 'propertyRecord', total: number) {
  const CHUNK = 2000;
  let done = 0, updated = 0;
  const t0 = Date.now();
  while (done < total) {
    const rows: any[] = table === 'requestRecord'
      ? await (db as any).requestRecord.findMany({
          skip: done, take: CHUNK, orderBy: { id: 'asc' },
          select: { id: true, customerName: true, rawCustomerName: true, customerMobile: true, sanadNames: true, actorName: true },
        })
      : await (db as any).propertyRecord.findMany({
          skip: done, take: CHUNK, orderBy: { id: 'asc' },
          select: { id: true, ownerName: true, rawOwnerName: true, ownerMobile: true, address: true, areaName: true, lineName: true },
        });
    if (rows.length === 0) break;
    for (const r of rows) {
      if (table === 'requestRecord') {
        const c = joinSep([r.customerName ?? r.rawCustomerName, r.customerMobile]);
        const s = norm(r.sanadNames) || null;
        const a = norm(r.actorName) || null;
        await db.$executeRawUnsafe(
          `UPDATE RequestRecord SET customerNameNorm=?, sanadNamesNorm=?, actorNameNorm=? WHERE id=?`, c, s, a, r.id
        );
      } else {
        const rn = norm(r.ownerName) || null;
        const os = joinSep([r.rawOwnerName, r.ownerMobile]);
        const as_ = joinSep([r.address, r.areaName, r.lineName]);
        await db.$executeRawUnsafe(
          `UPDATE PropertyRecord SET realtorNameNorm=?, ownerSearchNorm=?, addressSearchNorm=? WHERE id=?`, rn, os, as_, r.id
        );
      }
      updated++;
    }
    done += rows.length;
    console.log(`  ${table}: ${done}/${total} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  return { updated, ms: Date.now() - t0 };
}

async function main() {
  const reqTotal = await db.requestRecord.count();
  const propTotal = await db.propertyRecord.count();
  console.log(`بک‌فیل: ${reqTotal} درخواست (M2) + ${propTotal} آگهی (M1)`);
  const r1 = await backfill('requestRecord', reqTotal);
  const r2 = await backfill('propertyRecord', propTotal);
  console.log(`✓ M2: ${r1.updated} ردیف در ${(r1.ms / 1000).toFixed(1)}s · M1: ${r2.updated} ردیف در ${(r2.ms / 1000).toFixed(1)}s`);

  // راستی‌آزمایی نمونه‌ای
  const sample = await db.requestRecord.findMany({ take: 3, where: { customerNameNorm: { not: null } }, select: { customerName: true, customerNameNorm: true, sanadNames: true, sanadNamesNorm: true } });
  for (const s of sample) console.log('نمونه:', JSON.stringify(s));
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
