/**
 * PN-028/رابعاً — تشخیص زنده: چرا برای درخواست «خرید آپارتمان»، آگهی زمین/ویلا پیشنهاد می‌شود؟
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

async function main() {
  // نمونهٔ درخواست خرید آپارتمان
  const req = await db.requestRecord.findFirst({
    where: { requestCode: "14469" },
    select: { requestCode: true, title: true, tradeTypeName: true, propertyTypeName: true, status: true },
  });
  console.log("درخواست:", JSON.stringify(req, null, 2));

  // شبیه‌سازی فیلتر نوع ملک موتور فعلی
  const { parseRequestTitle } = await import("../../src/core/matching/matching-engine");
  const parsed = parseRequestTitle(req!.title);
  const wantedTypes = parsed.wantedPropertyTypes.length > 0 ? parsed.wantedPropertyTypes : req!.propertyTypeName ? [req!.propertyTypeName] : [];
  console.log("wantedTypes:", wantedTypes, "| tradeIntent:", parsed.tradeIntent);

  const listings = await db.propertyRecord.findMany({
    where: { status: "منتشر شده" },
    select: { propertyCode: true, propertyTypeName: true, tradeTypeName: true, title: true },
    take: 4000,
  });

  const normalize = (s: string) => s.replace(/\s+/g, "");
  let pass = 0;
  const samples: string[] = [];
  for (const l of listings) {
    if (wantedTypes.length > 0 && l.propertyTypeName) {
      const ok = wantedTypes.some((t) => normalize(l.propertyTypeName ?? "").includes(normalize(t)) || normalize(t).includes(normalize(l.propertyTypeName ?? "")));
      if (ok) { pass++; }
      else if (samples.length < 8 && /زمین|ویلا|کلنگی/.test(l.propertyTypeName ?? "")) {
        samples.push(`رد‌شده: ${l.propertyCode} ${l.propertyTypeName}`);
      }
    }
  }
  console.log(`از ${listings.length} آگهی منتشرشده، ${pass} از فیلتر نوع گذشت`);
  console.log(samples.join("\n"));

  // حالا در جهت مخالف (تب ۱): آگهی آپارتمان → درخواست‌ها
  const aptRequests = await db.requestRecord.findMany({
    where: { status: { in: ["سرنخ", "فرصت", "در انتظار تایید", "در انتظار معامله", "ready"] } },
    select: { requestCode: true, title: true, tradeTypeName: true, propertyTypeName: true },
    take: 3000,
  });
  const villaOrLand = aptRequests.filter((r) => /ویلا|زمین|کلنگی/.test(r.title ?? "") || /ویلا|زمین|کلنگی/.test(r.propertyTypeName ?? ""));
  console.log(`\nدرخواست‌های فعال ویلا/زمین‌خواه: ${villaOrLand.length} از ${aptRequests.length}`);
  // چند درخواست بدون هیچ سیگنال نوع؟
  const noSignal = aptRequests.filter((r) => {
    const p = parseRequestTitle(r.title);
    return p.wantedPropertyTypes.length === 0 && !r.propertyTypeName;
  });
  console.log(`درخواست‌های فعال بدون هیچ سیگنال نوع: ${noSignal.length}`);
  const noTitleSignal = aptRequests.filter((r) => parseRequestTitle(r.title).wantedPropertyTypes.length === 0 && r.propertyTypeName);
  console.log(`درخواست‌های فعال با فقط propertyTypeName ساختاری: ${noTitleSignal.length}`);
}

main().finally(() => db.$disconnect());
