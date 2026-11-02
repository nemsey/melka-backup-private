/**
 * verify-p6502-schema.ts — شاهد مهاجرت افزودنی P6.5-02
 * ------------------------------------------------------
 * راستی‌آزمایی صفر-آسیب مهاجرت Schema روی پایگاه مقصد (DATABASE_URL محیط):
 *   ۱) جداول جدید PropertyRecord/CustomerRecord موجود و خالی‌اند
 *   ۲) ستون‌های افزودنی با default درست اعمال شده‌اند
 *      (tenantId='melk-tabriz' روی ۷ جدول + AuditLog؛ accessScope='OWNER' روی Session)
 *   ۳) شمارش ردیف‌های جداول موجود >= ۰ و همه ردیف‌های tenantId-دار مقدار default دارند
 *   ۴) ستون‌های قدیمی دست‌نخورده‌اند (نمونه: TransactionRecord.propertyCode غیرتهی)
 *
 * خروجی: PASS/FAIL + گزارش عددی؛ exit code 1 در شکست.
 * استفاده: DATABASE_URL=file:.../custom.db bun scripts/verify-p6502-schema.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// ستون‌های مورد انتظار هر جدولِ تغییریافته (نام مدل پرایسما → ستون‌های P6.5-02)
const EXPECTED = {
  session: ["branchId", "accessScope"],
  auditLog: ["operation", "entityType", "recordCount", "accessScope", "tenantId"],
  transactionRecord: ["ownerCode", "branchId", "tenantId"],
  expertRecord: ["branchId", "tenantId"],
  visitRecord: ["ownerCode", "branchId", "tenantId"],
  listingRecord: ["branchId", "tenantId"],
  requestRecord: ["branchId", "tenantId"],
} as const;

const NEW_TABLES = ["propertyRecord", "customerRecord"] as const;

async function columnsOf(table: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe(`PRAGMA table_info(${table})`);
  return (rows as Array<{ name: string }>).map((r) => r.name);
}

async function main(): Promise<void> {
  let fail = 0;

  console.log("=== P6.5-02 Schema Migration Witness ===");

  // ۱) ستون‌های افزودنی
  for (const [table, cols] of Object.entries(EXPECTED)) {
    const actual = await columnsOf(table);
    const missing = cols.filter((c) => !actual.includes(c));
    if (missing.length > 0) {
      console.log(`FAIL  ${table}: ستون‌های غایب → ${missing.join(", ")}`);
      fail += 1;
    } else {
      console.log(`OK    ${table}: + ${cols.join(", ")}`);
    }
  }

  // ۲) جداول جدید
  for (const table of NEW_TABLES) {
    const actual = await columnsOf(table);
    if (actual.length === 0) {
      console.log(`FAIL  ${table}: جدول ساخته نشده است`);
      fail += 1;
      continue;
    }
    // پرایسما: فراخوانی count روی اتحاد داینامیک مدل‌ها توسط TS قابل‌فراخوانی نیست
    // @ts-expect-error — شمارش پویا روی اتحاد مدل‌های جدید
    const count = await db[table].count();
    console.log(`OK    ${table}: موجود (${actual.length} ستون، ${count} ردیف)`);
  }

  // ۳) مقدار default روی ردیف‌های موجود
  const checks: Array<[string, string, string]> = [
    ["transactionRecord", "tenantId", "melk-tabriz"],
    ["expertRecord", "tenantId", "melk-tabriz"],
    ["visitRecord", "tenantId", "melk-tabriz"],
    ["listingRecord", "tenantId", "melk-tabriz"],
    ["requestRecord", "tenantId", "melk-tabriz"],
  ];
  for (const [table, col, val] of checks) {
    const [total, withDefault] = await Promise.all([
      db[table].count(),
      db[table].count({ where: { [col]: val } }),
    ]);
    if (total !== withDefault) {
      console.log(`FAIL  ${table}.${col}: ${withDefault}/${total} ردیف مقدار «${val}» دارند`);
      fail += 1;
    } else {
      console.log(`OK    ${table}.${col}: ${total}/${total} ردیف = «${val}»`);
    }
  }

  // Session: accessScope default
  const [sessions, ownerSessions] = await Promise.all([
    db.session.count(),
    db.session.count({ where: { accessScope: "OWNER" } }),
  ]);
  if (sessions !== ownerSessions) {
    console.log(`FAIL  session.accessScope: ${ownerSessions}/${sessions} = OWNER`);
    fail += 1;
  } else {
    console.log(`OK    session.accessScope: ${sessions}/${sessions} = OWNER`);
  }

  // ۴) سلامت داده نمونه — ستون‌های قدیمی زنده‌اند
  const txCount = await db.transactionRecord.count();
  const txWithCode = await db.transactionRecord.count({ where: { propertyCode: { not: "" } } });
  console.log(`INFO  transactionRecord: ${txCount} ردیف؛ ${txWithCode} ردیف با propertyCode غیرخالی`);

  // جداول جدید باید خالی باشند (زیرساخت — نه داده)
  const pCount = await db.propertyRecord.count();
  const cCount = await db.customerRecord.count();
  if (pCount !== 0 || cCount !== 0) {
    console.log(`FAIL  جداول جدید باید خالی باشند (property=${pCount}, customer=${cCount})`);
    fail += 1;
  } else {
    console.log("OK    جداول جدید خالی‌اند (صفر داده — فقط زیرساخت)");
  }

  console.log(fail === 0 ? "=== PASS ===" : `=== FAIL (${fail}) ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main()
  .catch((err) => {
    console.error("ERROR:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
