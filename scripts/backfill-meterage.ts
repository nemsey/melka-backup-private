/**
 * PN-003 گام ۵ — تکمیل معکوس متراژ (backfill)
 * ------------------------------------------------------
 * علت ریشهٔ خاموشی حلقهٔ سرنوشت (گام ۵ مالک: «چرا در ورژن فعلی موجود نیستند»):
 * ستون meterage تنها برای ~۸۱۹ رکورد پر بود (در انتظار غنی‌سازی جزئیات)؛
 * حلقهٔ یادگیری برای نمونه‌گیری به متراژ نیاز دارد → ۰ پیش‌بینی → شاهدها
 * (outcomes.jsonl) پس از بازنشانی محیط دیگر تولید نمی‌شدند.
 *
 * تکمیل معکوس دقیق: meterage = price ÷ pricePerMeter (هر دو ستون پر)
 * — فقط برای رکوردهای تهی، در بازهٔ معقول ۱..۱۵٬۰۰۰ متر، گرد به عدد صحیح.
 * قانون: مقدار تازهٔ غیرتهی جایگزین/تکمیل — بدون حذف هیچ داده‌ای.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

async function main() {
  const candidates = await db.propertyRecord.findMany({
    where: {
      OR: [{ meterage: null }, { meterage: { lte: 0 } }],
      price: { gt: 0 },
      pricePerMeter: { gt: 0 },
    },
    select: { id: true, propertyCode: true, price: true, pricePerMeter: true },
  });

  let filled = 0;
  const batchSize = 500;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    await db.$transaction(
      batch
        .filter((r) => {
          const m = Math.round((r.price as number) / (r.pricePerMeter as number));
          return m >= 1 && m <= 15_000;
        })
        .map((r) => {
          const m = Math.round((r.price as number) / (r.pricePerMeter as number));
          return db.propertyRecord.update({
            where: { propertyCode: r.propertyCode },
            data: { meterage: m },
          });
        })
    );
    filled += Math.min(batch.filter((r) => {
      const m = Math.round((r.price as number) / (r.pricePerMeter as number));
      return m >= 1 && m <= 15_000;
    }).length, batch.length);
  }

  const after = await db.propertyRecord.count({ where: { meterage: { gt: 0 } } });
  console.log(`candidates: ${candidates.length} · filled: ${filled}`);
  console.log(`meterage filled now: ${after} / 11501`);
}

main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => db.$disconnect());
