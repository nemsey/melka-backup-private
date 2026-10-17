// PN-027 · ۵-پ-۱ — نمونه‌برداری داده برای طراحی ستون‌های نرمال (هم‌ارزی دقیق)
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  console.log('=== M2: نمونهٔ ۸ ردیف ===');
  const rows = await db.requestRecord.findMany({ take: 8, select: { requestCode: true, customerName: true, rawCustomerName: true, customerMobile: true, actorName: true, sanadNames: true, constructTypeNames: true, sideNames: true }, orderBy: { createdAt: 'desc' } });
  for (const r of rows) console.log(JSON.stringify({ code: r.requestCode, name: r.customerName, raw: r.rawCustomerName, mobile: r.customerMobile, actor: r.actorName, sanad: r.sanadNames }));

  console.log('\n=== بررسی بهداشت داده ===');
  // موبایل: ارقام فارسی؟
  const faRe = /[۰-۹]/;
  const mobiles = await db.requestRecord.findMany({ take: 3000, select: { customerMobile: true } });
  const mobileFa = mobiles.filter((m) => m.customerMobile && faRe.test(m.customerMobile)).length;
  const mobileNull = mobiles.filter((m) => !m.customerMobile).length;
  console.log('موبایل با رقم فارسی (در ۳۰۰۰ نمونه):', mobileFa, '· تهی:', mobileNull);

  // نام مشتری/کارشناس: حروف عربی ي/ك؟
  const arRe = /[\u064A\u0643]/;
  const names = await db.requestRecord.findMany({ take: 3000, select: { customerName: true, rawCustomerName: true, actorName: true, sanadNames: true } });
  console.log('نام با ي/ك عربی (در ۳۰۰۰ نمونه):', names.filter((n) => [n.customerName, n.rawCustomerName, n.actorName, n.sanadNames].some((v) => v && arRe.test(v))).length);

  // نیم‌فاصله در داده‌ها؟
  const zwnj = /\u200C/;
  console.log('نیم‌فاصله در نام‌ها (۳۰۰۰):', names.filter((n) => [n.customerName, n.actorName].some((v) => v && zwnj.test(v))).length);

  console.log('\n=== M1: نمونهٔ ۵ ردیف آگهی ===');
  const lrows = await db.propertyRecord.findMany({ take: 5, select: { realtorName: true, ownerName: true, address: true }, orderBy: { createdAt: 'desc' } });
  for (const r of lrows) console.log(JSON.stringify(r));

  const lnames = await db.propertyRecord.findMany({ take: 3000, select: { realtorName: true, ownerName: true, address: true } });
  console.log('\nM1 با ي/ك عربی (۳۰۰۰):', lnames.filter((n) => [n.realtorName, n.ownerName, n.address].some((v) => v && arRe.test(v))).length);
  console.log('M1 با نیم‌فاصله (۳۰۰۰):', lnames.filter((n) => [n.realtorName, n.ownerName, n.address].some((v) => v && zwnj.test(v))).length);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
