/**
 * verify-p6504-schema.ts — شاهد مهاجرت افزودنی P6.5-04-e-v2
 * ----------------------------------------------------------------
 * راستی‌آزمایی صفر-آسیب مهاجرت سه‌لایه حقیقت روی پایگاه مقصد (DATABASE_URL محیط):
 *   ۱) همه ستون‌های افزودنی (raw + provenance) روی ۷ جدول Bulk موجودند
 *   ۲) داده موجود حفظ شده (شمارش ردیف‌ها >= ۰ و integrity ok)
 *   ۳) تمام ستون‌های جدید برای ردیف‌های موجود تهی‌اند (صفر تغییر رفتار v1)
 *
 * خروجی: PASS/FAIL + گزارش عددی؛ exit code 1 در شکست.
 * استفاده: DATABASE_URL=file:.../custom.db bun scripts/verify-p6504-schema.ts
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

async function main() {
  let failures = 0;

  const integrity = await db.$queryRawUnsafe<{ integrity_check: string }[]>("PRAGMA integrity_check");
  console.log("integrity_check:", integrity[0]?.integrity_check);
  if (integrity[0]?.integrity_check !== "ok") {
    console.error("✗ integrity check ناموفق");
    process.exit(1);
  }

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

    // ۲) شمارش ردیف‌ها + ۳) تهی‌بودن ستون‌های جدید برای ردیف‌های موجود
    const countRow = await db.$queryRawUnsafe<{ c: number }[]>(`SELECT COUNT(*) as c FROM ${table}`);
    const count = Number(countRow[0].c);
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

  await db.$disconnect();
  if (failures > 0) {
    console.error(`\n✗ VERIFY FAIL: ${failures} جدول مشکل دارد`);
    process.exit(1);
  }
  console.log("\n=== VERIFY PASS: مهاجرت P6.5-04-e-v2 افزودنی و صفر-آسیب تأیید شد ===");
}

main().catch((e) => {
  console.error("✗ خطای شاهد:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
