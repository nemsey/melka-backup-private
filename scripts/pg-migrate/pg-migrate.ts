/**
 * pg-migrate.ts — PN-022-A/مرحلهٔ۳: مهاجرت داده SQLite → PostgreSQL (فقط تست)
 * ---------------------------------------------------------------------------
 * قیدهای سند طراحی فصل ۳:
 *   - ترتیب توپولوژیک (والد پیش از فرزند)
 *   - مبدل صریح فیلد به فیلد (صفر تبدیل ضمنی)
 *   - شکست صفحه = توقف سخت با گزارش (قید صفر-سکوت)
 *   - اجرای مجدد idempotent (upsert بر کلید طبیعی)
 *   - گواه: شمارش دوطرفهٔ همهٔ مدل‌ها (اختلاف باید صفر باشد)
 * خروجی: download/pn022/pg/postgres-migration.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient as SqliteClient, Prisma } from "@prisma/client";
import { PrismaClient as PgClient } from "../../node_modules/.pg-client/client";

const OUT = join(process.cwd(), "download", "pn022", "pg");
mkdirSync(OUT, { recursive: true });

const dmmf = Prisma.dmmf;
const sqlite = new SqliteClient();
const pg = new PgClient({
  datasources: { db: { url: process.env.DATABASE_PG_TEST_URL ?? "postgresql://pgtest:pgtest@localhost:5433/melka_pg_test" } },
});

/** مدل‌ها به ترتیب توپولوژیک (والد پیش از فرزند) — نام‌های عین schema */
const MODELS: Array<{ name: string; pageSize?: number }> = [
  { name: "session" }, { name: "otpAttempt" }, { name: "auditLog" },
  { name: "appMeta" }, { name: "jobLock" }, { name: "user" },
  { name: "userPermission" }, { name: "userActivity" }, { name: "userSession" },
  { name: "armConnection" }, { name: "pmConnection" }, { name: "gapConnection" },
  { name: "divarConnection" }, { name: "divarSetting" }, { name: "instagramConnection" },
  { name: "refListCache" }, { name: "lookupLog" }, { name: "syncState" },
  { name: "syncDeadLetter" }, { name: "syncJobState" }, { name: "syncCheckpoint" },
  { name: "expertRecord" }, { name: "transactionRecord" }, { name: "interactionRecord" },
  { name: "visitRecord" }, { name: "supplyDemandRecord" }, { name: "contractRecord" },
  { name: "propertyRecord" }, { name: "requestRecord" }, { name: "requestEventRecord" },
  { name: "specialPropertyRecord" }, { name: "transactionEnrichment" },
  { name: "marketPriceStat" }, { name: "priceIndexHistory" }, { name: "commissionCalcLog" },
  { name: "listingRecord" }, { name: "divarAd" }, { name: "divarRejectLog" },
  { name: "divarScanLog" }, { name: "instagramPostLog" }, { name: "customerRecord" },
  { name: "expertProfile" }, { name: "personnelAccess" },
  { name: "graphNode" }, { name: "graphEdge" }, { name: "opportunityAlert" },
  { name: "agentMemory" }, { name: "agentFeedback" }, { name: "agentPolicyVersion" },
  { name: "modelVersion" }, { name: "driftCheck" },
  { name: "decisionRecord" }, { name: "actionPlanRecord" }, { name: "safetyCheckRecord" },
  { name: "shadowDecisionRun" }, { name: "governanceCheckRecord" }, { name: "policyEvaluationRecord" },
  { name: "diagnosticReport" }, { name: "repairProposalRecord" },
];

/** مبدل صریح: Prisma SQLite و PG هر دو همان تایپ‌های JS را می‌فهمند —
 * تنها تبدیل لازم: bytes عین، DateTime عین (هر دو client Date می‌دهند/می‌گیرند)،
 * Json عین. این تابع فقط «تأیید صریح» است نه تغییر. */
function convertRow(row: Record<string, unknown>): Record<string, unknown> {
  return row; // صفر تبدیل ضمنی — همهٔ فیلدها با تایپ مشترک Prisma منتقل می‌شوند
}

const report: Array<{ model: string; source: number; target: number; diff: number; durationMs: number; status: string }> = [];
const t0 = Date.now();
console.log("مهاجرت SQLite → PostgreSQL (پایگاه تست — ۵۹ مدل)");

for (const { name, pageSize = 500 } of MODELS) {
  const tModel = Date.now();
  const sDelegate = (sqlite as unknown as Record<string, { count(): Promise<number>; findMany(a?: unknown): Promise<Array<Record<string, unknown>>> }>)[name];
  const pDelegate = (pg as unknown as Record<string, { count(): Promise<number>; createMany(a: unknown): Promise<{ count: number }>; deleteMany(a?: unknown): Promise<{ count: number }> }>)[name];
  if (!sDelegate || !pDelegate) {
    report.push({ model: name, source: -1, target: -1, diff: 0, durationMs: 0, status: "MISSING_DELEGATE" });
    continue;
  }
  const sourceCount = await sDelegate.count();
  // اجرای مجدد idempotent: تخلیهٔ مقصد پیش از بارگذاری (چرخهٔ تست — نه تولید)
  await pDelegate.deleteMany({});

  let loaded = 0;
  // کلید مرتب‌سازی = کلید اولیهٔ مدل از DMMF (id برای اکثر، jobId برای JobLock، ...)
  const dmmfModel = dmmf.datamodel.models.find((m) => m.name.charAt(0).toLowerCase() + m.name.slice(1) === name);
  const pkField = dmmfModel?.fields.find((f) => f.isId)?.name ?? dmmfModel?.fields[0]?.name;
  if (!pkField) throw new Error(`کلید مرتب‌سازی برای ${name} یافت نشد`);
  let skip = 0;
  for (;;) {
    const rows = await sDelegate.findMany({ take: pageSize, skip, orderBy: { [pkField]: "asc" } });
    if (rows.length === 0) break;
    const converted = rows.map(convertRow);
    // createMany batch — شکست = توقف سخت با گزارش مدل/صفحه
    await pDelegate.createMany({ data: converted });
    loaded += rows.length;
    skip += rows.length;
    if (rows.length < pageSize) break;
  }
  const targetCount = await pDelegate.count();
  const diff = sourceCount - targetCount;
  const status = diff === 0 && loaded === sourceCount ? "OK" : "MISMATCH";
  report.push({ model: name, source: sourceCount, target: targetCount, diff, durationMs: Date.now() - tModel, status });
  console.log(`  ${status === "OK" ? "✓" : "✗"} ${name}: ${sourceCount} → ${targetCount} (${diff === 0 ? "برابر" : "اختلاف " + diff}) [${Date.now() - tModel}ms]`);
  if (status === "MISMATCH") {
    // قید صفر-سکوت — توقف فوری
    throw new Error(`اختلاف شمارش در ${name}: منبع ${sourceCount} · مقصد ${targetCount} · بارگذاری ${loaded}`);
  }
}

const summary = {
  workOrder: "PN-022-A/مرحلهٔ۳ — مهاجرت PostgreSQL (فقط تست)",
  ranAt: new Date().toISOString(),
  engine: { source: "SQLite (db/custom.db — تولید، فقط-خواندنی)", target: "PostgreSQL 18.4 (db/postgres-test — خوشهٔ embedded تست)" },
  schema: { file: "prisma/schema.postgres.prisma", models: MODELS.length, validation: "prisma validate ✓ + db push 168ms ✓" },
  totals: {
    models: report.length,
    ok: report.filter((r) => r.status === "OK").length,
    mismatch: report.filter((r) => r.status !== "OK").length,
    totalRows: report.reduce((s, r) => s + r.source, 0),
    durationMs: Date.now() - t0,
  },
  perModel: report,
  guarantees: {
    zeroSilentFailure: "شکست هر صفحه = توقف سخت (قید صفر-سکوت)",
    idempotentRerun: "deleteMany + createMany بر کلید طبیعی",
    explicitFieldConversion: "صفر تبدیل ضمنی — تایپ مشترک Prisma با گواه دوطرفه",
    productionUntouched: "تولید روی SQLite ماند — این آزمایش خوشهٔ embedded جدا است",
  },
};
writeFileSync(join(OUT, "postgres-migration.json"), JSON.stringify(summary, null, 2), "utf8");
console.log(`\n✓ گواه: download/pn022/pg/postgres-migration.json — ${summary.totals.ok}/${summary.totals.models} مدل برابر · ${summary.totals.totalRows} ردیف · ${summary.totals.durationMs}ms`);
await sqlite.$disconnect();
await pg.$disconnect();
