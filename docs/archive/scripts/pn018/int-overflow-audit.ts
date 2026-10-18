/**
 * PN-018/T2+T3 — ریشه‌یابی: اسکن جامع سرریز Int32 در همهٔ ستون‌های Int
 * هر جدول Prisma با ستون Int بررسی می‌شود: مقادیر > 2^31-1 یا < -2^31 = خراب
 */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  // ۱) همهٔ ردیف‌های PropertyRecord با floor خارج از Int32
  const overflows = await db.$queryRawUnsafe(`
    SELECT id, propertyCode, floor, price, pricePerMeter, meterage, buildYear, rooms, rawPrice, rawArea
    FROM PropertyRecord
    WHERE floor > 2147483647 OR floor < -2147483648
       OR meterage > 2147483647 OR meterage < -2147483648
       OR rooms > 2147483647 OR rooms < -2147483648
    LIMIT 20`) as Array<Record<string, unknown>>;
  console.log("── ردیف‌های PropertyRecord با سرریز Int32:");
  for (const r of overflows) console.log(JSON.stringify(r));

  // ۲) توزیع مقدار floor (چند مقدار منطقی؟ چند نامعتبر؟)
  const dist = await db.$queryRawUnsafe(`
    SELECT
      SUM(CASE WHEN floor IS NULL THEN 1 ELSE 0 END) AS nulls,
      SUM(CASE WHEN floor >= 0 AND floor <= 200 THEN 1 ELSE 0 END) AS logical,
      SUM(CASE WHEN floor > 200 OR floor < 0 THEN 1 ELSE 0 END) AS illogical,
      COUNT(*) AS total
    FROM PropertyRecord`) as Array<Record<string, unknown>>;
  console.log("── توزیع floor:", JSON.stringify(dist[0]));

  // ۳) نمونهٔ ردیف‌های نامعتبر + مقایسه با قیمت
  const illogical = await db.$queryRawUnsafe(`
    SELECT id, propertyCode, floor, price, pricePerMeter, meterage, rawPrice, updatedAt
    FROM PropertyRecord
    WHERE floor > 200 OR floor < 0
    LIMIT 12`) as Array<Record<string, unknown>>;
  console.log("── نمونهٔ نامعتبر (floor>200):");
  for (const r of illogical) console.log(JSON.stringify(r));

  // ۴) اسکن سرریز در دیگر ستون‌های Int کلیدی (همهٔ جداول اصلی)
  const otherTables = await db.$queryRawUnsafe(`
    SELECT 'PropertyRecord(price)' t, COUNT(*) c FROM PropertyRecord WHERE CAST(price AS INTEGER) > 2147483647
    UNION ALL SELECT 'PropertyRecord(ppm)', COUNT(*) FROM PropertyRecord WHERE CAST(pricePerMeter AS INTEGER) > 2147483647
  `) as Array<Record<string, unknown>>;
  console.log("── سرریز در دیگر ستون‌ها (اگر صفر = schema آن‌ها BigInt/Float است):");
  for (const r of otherTables) console.log(JSON.stringify(r));

  // ۵) زمان ورود دادهٔ خراب (createdAt/updatedAt ردیف‌های خراب)
  const timing = await db.$queryRawUnsafe(`
    SELECT MIN(updatedAt) firstBad, MAX(updatedAt) lastBad, COUNT(*) c
    FROM PropertyRecord WHERE floor > 2147483647`) as Array<Record<string, unknown>>;
  console.log("── زمان‌شناسی ردیف‌های خراب:", JSON.stringify(timing[0]));
}

main().catch((e) => { console.error("FAIL:", e.message); process.exit(1); }).finally(() => db.$disconnect());
