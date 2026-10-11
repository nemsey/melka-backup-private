// PN-027 · ۵-پ-۱/۲ — بنچمارک A/B زنده: فیلتر SQL نرمال در برابر مسیر JS قدیم
// (سمت مخزن — معادل سطح-بالا پس از بیلد پایانی در دروازه اندازه‌گیری می‌شود)
import { PrismaClient } from '@prisma/client';
import { normalizeFilterInput } from '../../src/lib/normalize-input';

const db = new PrismaClient();

async function p95(samples: number[]): Promise<{ p50: number; p95: number; max: number }> {
  const s = [...samples].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { p50: +at(0.5).toFixed(1), p95: +at(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1) };
}

async function benchSql(where: object, label: string, n = 20) {
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const rows = await db.requestRecord.findMany({ where, take: 50, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
    await db.requestRecord.count({ where });
    times.push(performance.now() - t0);
    if (rows.length < 0) break;
  }
  return { label, ...await p95(times) };
}

async function benchSqlProp(where: object, label: string, n = 20) {
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const rows = await db.propertyRecord.findMany({ where, take: 50, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
    await db.propertyRecord.count({ where });
    times.push(performance.now() - t0);
    if (rows.length < 0) break;
  }
  return { label, ...await p95(times) };
}

/** شبیه‌سازی مسیر قدیم: واکشی کامل + فیلتر JS (عین منطق پیش از PN-027) */
async function benchJsOld(label: string, pred: (r: any) => boolean, table: 'req' | 'prop', n = 10) {
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    let records: any[];
    if (table === 'req') {
      records = await db.requestRecord.findMany({
        where: { source: 'arm' }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 25000,
        select: { requestCode: true, actorName: true, customerName: true, rawCustomerName: true, customerMobile: true, sanadNames: true, constructTypeNames: true, sideNames: true, areaNamesJson: true, lineNamesJson: true, title: true, status: true, tradeTypeName: true, priceFrom: true, priceTo: true, urgent: true, luxury: true, changeable: true, propertyTypeName: true, buildingTypeName: true, createdAt: true, updatedAt: true },
      });
    } else {
      records = await db.propertyRecord.findMany({
        where: {}, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 25000,
        select: { propertyCode: true, ownerName: true, rawOwnerName: true, ownerMobile: true, address: true, areaName: true, lineName: true, stateName: true, title: true, status: true, price: true, tradeTypeName: true, propertyTypeName: true, meterage: true, rooms: true, createdAt: true, updatedAt: true },
      });
    }
    const matched = records.filter(pred).slice(0, 50);
    times.push(performance.now() - t0);
    if (matched.length < 0) break;
  }
  return { label, ...await p95(times) };
}

async function main() {
  console.log('=== M2 (درخواست‌ها) — A/B ===');
  const sanadN = normalizeFilterInput('شش‌دانگ');
  const r1 = await benchSql({ source: 'arm', sanadNamesNorm: { contains: sanadN } }, 'سند (شش‌دانگ) — SQL نرمال');
  const r1o = await benchJsOld('سند (شش‌دانگ) — مسیر JS قدیم', (r) => normalizeFilterInput(r.sanadNames).includes(sanadN), 'req');
  const custN = normalizeFilterInput('محمد');
  const r2 = await benchSql({ source: 'arm', customerNameNorm: { contains: custN } }, 'نام مشتری (محمد) — SQL نرمال');
  const r2o = await benchJsOld('نام مشتری (محمد) — مسیر JS قدیم', (r) => { const name = normalizeFilterInput(r.customerName ?? r.rawCustomerName); const mob = normalizeFilterInput(r.customerMobile); return name.includes(custN) || mob.includes(custN); }, 'req');
  const actN = normalizeFilterInput('رحیمی');
  const r3 = await benchSql({ source: 'arm', actorNameNorm: { contains: actN } }, 'کارشناس (رحیمی) — SQL نرمال');
  const r3o = await benchJsOld('کارشناس (رحیمی) — مسیر JS قدیم', (r) => normalizeFilterInput(r.actorName).includes(actN), 'req');

  console.log('=== M1 (آگهی‌ها) — A/B ===');
  const a1 = await benchSqlProp({ realtorNameNorm: { contains: normalizeFilterInput('رحیمی فر') } }, 'کارشناس M1 — SQL نرمال');
  const a1o = await benchJsOld('کارشناس M1 — مسیر JS قدیم', (r) => normalizeFilterInput(r.ownerName).includes(normalizeFilterInput('رحیمی فر')), 'prop');
  const a2 = await benchSqlProp({ ownerSearchNorm: { contains: normalizeFilterInput('0914') } }, 'مالک (موبایل پیش‌شماره) — SQL نرمال');
  const a3 = await benchSqlProp({ addressSearchNorm: { contains: normalizeFilterInput('میرداماد') } }, 'آدرس/محله (میرداماد) — SQL نرمال');
  const a3o = await benchJsOld('آدرس/محله — مسیر JS قدیم', (r) => { const a = normalizeFilterInput(r.address), ar = normalizeFilterInput(r.areaName), l = normalizeFilterInput(r.lineName); const q = normalizeFilterInput('میرداماد'); return a.includes(q) || ar.includes(q) || l.includes(q); }, 'prop');

  const results = { M2: [r1, r1o, r2, r2o, r3, r3o], M1: [a1, a1o, a2, a3, a3o] };
  for (const [k, v] of Object.entries(results)) {
    console.log(`\n── ${k} ──`);
    for (const x of v) console.log(`  ${x.label}: P50=${x.p50}ms · P95=${x.p95}ms · max=${x.max}ms`);
  }
  const out = { generatedAt: new Date().toISOString(), method: 'سمت مخزن (Prisma مستقیم روی تولید) · ۲۰ تکرار SQL / ۱۰ تکرار JS', M2: results.M2, M1: results.M1 };
  const fs = await import('node:fs');
  fs.writeFileSync('/home/z/my-project/download/pn027/speed-ab-bench.json', JSON.stringify(out, null, 1));
  console.log('\n✓ speed-ab-bench.json');
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
