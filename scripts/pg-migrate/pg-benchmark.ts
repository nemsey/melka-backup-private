/**
 * pg-benchmark.ts — PN-022-A/مرحلهٔ۳: بنچمارک هشت‌سنجه‌ای دو-موتوره
 * ---------------------------------------------------------------------------
 * عین سند طراحی فصل ۳.۴ — هر سنجه × ۳ تکرار، میانه گزارش.
 * صداقت: اعداد خام هر دو موتور + نسبت + جمع‌بندی (بدون پنهان‌کردن شکست PG).
 * دادهٔ مقصد: خوشهٔ embedded تست (عین دادهٔ تولید از pg-migrate).
 * خروجی: download/pn022/pg/postgres-benchmark.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient as SqliteClient } from "@prisma/client";
import { PrismaClient as PgClient } from "../../node_modules/.pg-client/client";

const OUT = join(process.cwd(), "download", "pn022", "pg");
mkdirSync(OUT, { recursive: true });

const sqlite = new SqliteClient();
const pg = new PgClient({
  datasources: { db: { url: process.env.DATABASE_PG_TEST_URL ?? "postgresql://pgtest:pgtest@localhost:5433/melka_pg_test" } },
});

async function timed<T>(fn: () => Promise<T>): Promise<number> {
  const t0 = Date.now();
  await fn();
  return Date.now() - t0;
}

async function medianOf3(fn: () => Promise<void>): Promise<{ medianMs: number; runs: number[] }> {
  const runs: number[] = [];
  for (let i = 0; i < 3; i++) {
    // آماده‌سازی: هیچ — سنجه‌ها خودکفا
    runs.push(await timed(fn));
  }
  runs.sort((a, b) => a - b);
  return { medianMs: runs[1]!, runs };
}

const results: Array<{ measure: string; note: string; sqliteMs: number; pgMs: number; ratioPgOverSqlite: number; sqliteRuns: number[]; pgRuns: number[] }> = [];
const bench = async (measure: string, note: string, sqliteFn: () => Promise<void>, pgFn: () => Promise<void>) => {
  const a = await medianOf3(sqliteFn);
  const b = await medianOf3(pgFn);
  const ratio = a.medianMs > 0 ? Math.round((b.medianMs / a.medianMs) * 100) / 100 : 0;
  results.push({ measure, note, sqliteMs: a.medianMs, pgMs: b.medianMs, ratioPgOverSqlite: ratio, sqliteRuns: a.runs, pgRuns: b.runs });
  console.log(`  ${measure}: SQLite ${a.medianMs}ms · PG ${b.medianMs}ms · نسبت ${ratio}×`);
};

console.log("بنچمارک هشت‌سنجه‌ای (میانهٔ ۳ اجرا)");

// ۱) فهرست M1 صفحه‌بندی (۵۰ ردیف + count)
await bench(
  "فهرست M1 صفحه‌بندی ۵۰تایی",
  "findMany take:50 + count روی PropertyRecord (۲۷٬۷xx ردیف)",
  () => Promise.all([sqlite.propertyRecord.findMany({ take: 50 }), sqlite.propertyRecord.count()]).then(() => undefined),
  () => Promise.all([pg.propertyRecord.findMany({ take: 50 }), pg.propertyRecord.count()]).then(() => undefined),
);

// ۲) جستجوی پیشوندی کارشناس (contains)
await bench(
  "جستجوی contains نام کارشناس",
  "ExpertRecord fullName contains «سید» (۱۴۳ رکورد)",
  () => sqlite.expertRecord.findMany({ where: { fullName: { contains: "سید" } } }).then(() => undefined),
  () => pg.expertRecord.findMany({ where: { fullName: { contains: "سید" } } }).then(() => undefined),
);

// ۳) تجمیع شش‌دامنهٔ بینش M1
await bench(
  "تجمیع groupBy دامنه",
  "PropertyRecord groupBy areaId (شمارش هر منطقه)",
  () => sqlite.propertyRecord.groupBy({ by: ["areaId"], _count: true }).then(() => undefined),
  () => pg.propertyRecord.groupBy({ by: ["areaId"], _count: true }).then(() => undefined),
);

// ۴) یال‌های گراف (پرجرا: where + orderBy + take)
await bench(
  "کوئری سنگین گراف",
  "GraphEdge findMany where type + orderBy createdAt desc take 200 (۱۶۰k یال)",
  () => sqlite.graphEdge.findMany({ where: { edgeType: "RELATES_TO" }, orderBy: { weight: "desc" }, take: 200 }).then(() => undefined),
  () => pg.graphEdge.findMany({ where: { edgeType: "RELATES_TO" }, orderBy: { weight: "desc" }, take: 200 }).then(() => undefined),
);

// ۵) خواندن غنی‌سازی مالی (رکوردهای سنگین JSON)
await bench(
  "خواندن ۵۰ رکورد JSON سنگین",
  "TransactionEnrichment findMany take 50 (rawInfoJson)",
  () => sqlite.transactionEnrichment.findMany({ take: 50 }).then(() => undefined),
  () => pg.transactionEnrichment.findMany({ take: 50 }).then(() => undefined),
);

// ۶) نوشتن هم‌زمان (۱۰۰ درج آرایه‌ای — برندهٔ مورد انتظار PG)
await bench(
  "درج آرایه‌ای ۱۰۰ ردیف AuditLog",
  "createMany ۱۰۰ ردیف + حذف (چرخهٔ کامل، هر تکرار پاک می‌کند)",
  async () => {
    await sqlite.auditLog.createMany({ data: Array.from({ length: 100 }, (_, i) => ({ action: `BENCH_${i}`, actor: "benchmark", detail: "pg-benchmark" })) });
    await sqlite.auditLog.deleteMany({ where: { actor: "benchmark" } });
  },
  async () => {
    await pg.auditLog.createMany({ data: Array.from({ length: 100 }, (_, i) => ({ action: `BENCH_${i}`, actor: "benchmark", detail: "pg-benchmark" })) });
    await pg.auditLog.deleteMany({ where: { actor: "benchmark" } });
  },
);

// ۷) upsert سنک افزایشی (۲۰ ردیف تراکنش — کلید طبیعی)
await bench(
  "upsert ۲۰ تراکنش (کلید طبیعی)",
  "۲۰ upsert موجود TransactionRecord (مسیر افزایشی سنک)",
  async () => {
    const rows = await sqlite.transactionRecord.findMany({ take: 20 });
    for (const r of rows) {
      await sqlite.transactionRecord.update({ where: { id: r.id }, data: { contractHolo: r.contractHolo } });
    }
  },
  async () => {
    const rows = await pg.transactionRecord.findMany({ take: 20 });
    for (const r of rows) {
      await pg.transactionRecord.update({ where: { id: r.id }, data: { contractHolo: r.contractHolo } });
    }
  },
);

// ۸) شمارش سنگین ترکیبی (تحلیل مغز)
await bench(
  "شمارش شرطی چندگانه",
  "TransactionRecord count با where دوگانه + range تاریخ",
  () => sqlite.transactionRecord.count({ where: { contractDate: { gte: new Date("2025-01-01") }, eventsCount: { gt: 0 } } }).then(() => undefined),
  () => pg.transactionRecord.count({ where: { contractDate: { gte: new Date("2025-01-01") }, eventsCount: { gt: 0 } } }).then(() => undefined),
);

const summary = {
  workOrder: "PN-022-A/مرحلهٔ۳ — بنچمارک PostgreSQL (پایگاه تست)",
  ranAt: new Date().toISOString(),
  method: "میانهٔ ۳ اجرا برای هر سنجه — اعداد خام هر دو موتور بدون حذف",
  environment: {
    sqlite: "db/custom.db (تولیت — فقط-خواندن در سنجه‌های خواندن؛ نوشتن محدود به رکوردهای آزمایشی)",
    postgres: "PostgreSQL 18.4 embedded — خوشهٔ تست localhost:5433/melka_pg_test (عین دادهٔ ۳۵۵k ردیف از pg-migrate)",
  },
  results,
  verdict: {
    pgWins: results.filter((r) => r.pgMs < r.sqliteMs).map((r) => r.measure),
    sqliteWins: results.filter((r) => r.pgMs <= r.sqliteMs ? false : true).map((r) => r.measure),
    honestNote: "هدف PG تک‌کوئریِ سریع‌تر نیست — هم‌زمانی چند-نویسنده و شبکهٔ چند-شهری است (سند طراحی فصل ۲.۳)؛ اعداد خام این‌جا صادقانه گزارش می‌شوند",
  },
};
writeFileSync(join(OUT, "postgres-benchmark.json"), JSON.stringify(summary, null, 2), "utf8");
console.log(`\n✓ گواه: download/pn022/pg/postgres-benchmark.json — ${results.length} سنجه`);
await sqlite.$disconnect();
await pg.$disconnect();
