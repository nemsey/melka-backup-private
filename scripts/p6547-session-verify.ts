/**
 * P6547 (ادامه) — وارسی آغاز جلسه (بند و قانون ۰۳۱) — نسخهٔ اصلاح‌شده
 * شمارش ردیف‌های کلیدی DB از مدل‌های درست — صرفاً خواندنی.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const prop = (db as any).propertyRecord;
  const [listings, requests, txns, experts, jobs] = await Promise.all([
    prop.count({ where: { kind: "LISTING" } }).catch(() => prop.count()),
    prop.count({ where: { kind: "REQUEST" } }).catch(() => null),
    (db as any).transactionRecord.count(),
    (db as any).expertRecord.count(),
    (db as any).syncJobState.findMany({ select: { jobId: true, status: true, updatedAt: true } }),
  ]);
  const pmModel = Object.keys(db).find((k) => /^pm/i.test(k));
  const pm = pmModel ? await (db as any)[pmModel].count() : null;
  // نمونهٔ خام برای فهم ستون kind
  const sample = await prop.findMany({ take: 2, select: { id: true } }).catch(() => null);
  const cols = Object.keys(await prop.findFirst() ?? {});
  console.log(
    JSON.stringify(
      { at: new Date().toISOString(), listings, requests, transactions: txns, experts, pmPersonnel: pm, pmModel, jobs, kindColumns: cols.filter((c) => /kind|type|record/i.test(c)), sampleCount: sample?.length },
      null,
      1,
    ),
  );
}

main()
  .catch((e) => {
    console.error("ERR", e?.message ?? e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
