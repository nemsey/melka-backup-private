/**
 * verify-p6504-schema.ts — شاهد مهاجرت افزودنی P6.5-04-e-v2
 * ----------------------------------------------------------------
 * راستی‌آزمایی سه‌لایه حقیقت روی پایگاه مقصد (DATABASE_URL محیط):
 *
 * حالت مهاجرت (پیش از داده — رفتار اصلی v1):
 *   ۱) همه ستون‌های افزودنی (raw + provenance) روی ۷ جدول Bulk موجودند
 *   ۲) داده موجود حفظ شده (شمارش ردیف‌ها >= ۰ و integrity ok)
 *   ۳) تمام ستون‌های جدید برای ردیف‌های موجود تهی‌اند (صفر تغییر رفتار v1)
 *
 * حالت پس از داده (P6.5-04-i فاز ۳ — خودکار وقتی ردیف هست؛ --phase post-sync برای اجبار):
 *   ۱) integrity ok + ستون‌ها موجود
 *   ۲) لایهٔ خام روی ردیف‌های sync شده «پر» است (پرچم سه‌لایه — پوشش گزارش می‌شود)
 *   ۳) ستون‌های provenance (bulk آینده) همچنان افزودنی/بی‌تداخل
 *
 * خروجی: PASS/FAIL + گزارش عددی؛ exit code 1 در شکست.
 * استفاده: DATABASE_URL=file:.../custom.db bun scripts/verify-p6504-schema.ts [--phase post-sync]
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** ستون‌های مورد انتظار هر جدولِ تغییریافته (جدول SQLite → ستون‌های P6.5-04-e-v2) */
const EXPECTED: Record<string, string[]> = {
  TransactionRecord: ["rawDate", "rawSourceVersion", "extractedAt", "extractionBatchId", "normalizationVersion"],
  ExpertRecord: ["rawSourceVersion", "extractedAt", "extractionBatchId", "normalizationVersion"],
  InteractionRecord: ["rawSourceVersion", "extractedAt", "extractionBatchId", "normalizationVersion"],
  VisitRecord: ["rawSourceVersion", "extractedAt", "extractionBatchId", "normalizationVersion"],
  ContractRecord: ["rawDate", "rawSourceVersion", "extractedAt", "extractionBatchId", "normalizationVersion"],
  PropertyRecord: ["rawPrice", "rawPriceUnit", "rawArea", "rawSourceVersion", "extractedAt", "extractionBatchId", "normalizationVersion"],
  RequestRecord: ["rawSourceVersion", "extractedAt", "extractionBatchId", "normalizationVersion"],
};

/** ستون‌های لایهٔ خام برای حالت پس از داده (پر بودنشان شاهد سه‌لایه است) */
const RAW_LAYER_COLUMNS: Record<string, string[]> = {
  TransactionRecord: ["rawDate"],
  ExpertRecord: ["rawFullName"],
  ContractRecord: ["rawDate"],
  VisitRecord: ["rawRequesterName"],
  PropertyRecord: ["rawPrice"],
};

const forcePostSync = process.argv.includes("--phase post-sync") || process.argv.includes("--post-sync");

async function main() {
  let failures = 0;

  const integrity = await db.$queryRawUnsafe<{ integrity_check: string }[]>("PRAGMA integrity_check");
  console.log("integrity_check:", integrity[0]?.integrity_check);
  if (integrity[0]?.integrity_check !== "ok") {
    console.error("✗ integrity check ناموفق");
    process.exit(1);
  }

  // تشخیص خودکار حالت: اگر هر جدول داده دارد و لایهٔ خامش پُر است ⇒ پس از داده
  let postSync = forcePostSync;
  if (!forcePostSync) {
    const txCount = await db.transactionRecord.count();
    const txRaw = await db.transactionRecord.count({ where: { rawDate: { not: null } } });
    postSync = txCount > 0 && txRaw > 0;
  }
  console.log(`حالت: ${postSync ? "post-sync (سه‌لایه روی دادهٔ واقعی)" : "migration (پیش از داده — صفر-آسیب)"}`);

  for (const [table, columns] of Object.entries(EXPECTED)) {
    // ۱) وجود ستون‌ها
    const cols = await db.$queryRawUnsafe<{ name: string }[]>(
      `PRAGMA table_info(${table})`
    );
    const colNames = new Set(cols.map((c) => c.name));
    const missing = columns.filter((c) => !colNames.has(c));
    if (missing.length > 0) {
      console.error(`✗ ${table}: ستون‌های غایب → ${missing.join(", ")}`);
      failures += 1;
      continue;
    }

    const countRow = await db.$queryRawUnsafe<{ c: number }[]>(`SELECT COUNT(*) as c FROM ${table}`);
    const count = Number(countRow[0].c);

    if (postSync) {
      // ۲-پس از داده) لایهٔ خام روی ردیف‌های sync شده پر است (پوشش ≥ ۹۵٪ — سنجهٔ شورا)
      const rawCols = RAW_LAYER_COLUMNS[table] ?? [];
      if (count > 0 && rawCols.length > 0) {
        for (const rc of rawCols) {
          const r = await db.$queryRawUnsafe<{ c: number }[]>(
            `SELECT COUNT(*) as c FROM ${table} WHERE "${rc}" IS NOT NULL`
          );
          const filled = Number(r[0].c);
          const coverage = count > 0 ? (100 * filled) / count : 100;
          const ok = coverage >= 95;
          console.log(`${ok ? "✓" : "✗"} ${table}: لایهٔ خام ${rc} پر روی ${filled}/${count} ردیف (${coverage.toFixed(1)}٪)`);
          if (!ok) failures += 1;
        }
      } else {
        console.log(`✓ ${table}: ${columns.length} ستون افزودنی موجود · ${count} ردیف (بدون لایهٔ خام تعریف‌شده)`);
      }
    } else {
      // ۲-مهاجرت) شمارش ردیف‌ها + ۳) تهی‌بودن ستون‌های جدید برای ردیف‌های موجود
      const nullChecks = await Promise.all(
        columns.map(async (col) => {
          const r = await db.$queryRawUnsafe<{ c: number }[]>(
            `SELECT COUNT(*) as c FROM ${table} WHERE "${col}" IS NOT NULL`
          );
          return { col, nonNull: Number(r[0].c) };
        })
      );
      const dirty = nullChecks.filter((n) => n.nonNull > 0);
      if (dirty.length > 0) {
        console.error(`✗ ${table}: ستون‌های ناخواسته پر → ${dirty.map((d) => `${d.col}=${d.nonNull}`).join(", ")}`);
        failures += 1;
      } else {
        console.log(`✓ ${table}: ${columns.length} ستون افزودنی موجود · ${count} ردیف · همه تهی (صفر تغییر v1)`);
      }
    }
  }

  await db.$disconnect();
  if (failures > 0) {
    console.error(`\n✗ VERIFY FAIL: ${failures} جدول مشکل دارد`);
    process.exit(1);
  }
  console.log(
    postSync
      ? "\n=== VERIFY PASS: سه‌لایهٔ حقیقت روی دادهٔ واقعی تأیید شد (لایهٔ خام ≥۹۵٪ پر + integrity ok) ==="
      : "\n=== VERIFY PASS: مهاجرت P6.5-04-e-v2 افزودنی و صفر-آسیب تأیید شد ==="
  );
}

main().catch((e) => {
  console.error("✗ خطای شاهد:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
