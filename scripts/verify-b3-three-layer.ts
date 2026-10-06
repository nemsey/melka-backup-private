/**
 * verify-b3-three-layer.ts — شاهد مهاجرت افزودنی B.3 (نرمال‌سازی سه‌لایه — ملکا-شورا-۰۰۷ بخش B.3)
 * ----------------------------------------------------------------
 * راستی‌آزمایی صفر-آسیب ادامهٔ سه‌لایه حقیقت روی پایگاه مقصد (DATABASE_URL محیط):
 *   ۱) همهٔ ستون‌های افزودنی B.3 موجودند:
 *      · ۱۷ ستون لایهٔ خام نام/موبایل (raw*) روی ۷ جدول Bulk
 *      · ۴ ستون provenance روی SupplyDemandRecord (جدول هشتم — تنها نویسنده‌اش sync است)
 *   ۲) دادهٔ موجود حفظ شده (integrity ok)
 *   ۳) تمام ستون‌های جدید برای ردیف‌های موجود تهی‌اند (صفر تغییر رفتار v1)
 *
 * خروجی: PASS/FAIL + گزارش عددی؛ exit code 1 در شکست.
 * استفاده: DATABASE_URL=file:.../custom.db bun scripts/verify-b3-three-layer.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** ستون‌های مورد انتظار هر جدولِ تغییریافته (جدول SQLite → ستون‌های B.3) */
const EXPECTED: Record<string, string[]> = {
  TransactionRecord: ["rawPropertyCustomer", "rawRequestCustomer"],
  ExpertRecord: ["rawFullName", "rawMobile", "rawBusinessTitle", "rawCreator"],
  InteractionRecord: ["rawRequestRealtorName", "rawPropertyRealtorName"],
  VisitRecord: ["rawRequesterName", "rawCheckerName", "rawPropertyRealtorName"],
  ContractRecord: ["rawCreatorName", "rawPropertyTitle"],
  PropertyRecord: ["rawOwnerName", "rawOwnerMobile"],
  RequestRecord: ["rawCustomerName", "rawCustomerMobile"],
  // جدول هشتم — provenance از مسیر sync (مسیر Bulk ندارد)
  SupplyDemandRecord: ["rawSourceVersion", "extractedAt", "extractionBatchId", "normalizationVersion"],
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
      console.log(`✓ ${table}: ${columns.length} ستون افزودنی B.3 موجود · ${count} ردیف · همه تهی (صفر تغییر v1)`);
    }
  }

  await db.$disconnect();
  if (failures > 0) {
    console.error(`\n✗ VERIFY FAIL: ${failures} جدول مشکل دارد`);
    process.exit(1);
  }
  console.log("\n=== VERIFY PASS: مهاجرت B.3 (سه‌لایه کامل — ۲۱ ستون افزودنی) صفر-آسیب تأیید شد ===");
}

main().catch((e) => {
  console.error("✗ خطای شاهد:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
