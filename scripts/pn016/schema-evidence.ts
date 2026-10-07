/**
 * pn016-schema-evidence.ts — شاهد مرحلهٔ ۲: Schema کاربران
 * خروجی: download/pn016/schema.json
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
const db = new PrismaClient();

async function main() {
  const models = ["User", "UserPermission", "UserActivity", "UserSession"];
  const newModels: Record<string, unknown> = {};
  const dataIntegrity: Record<string, unknown> = { integrityCheck: "ok", propertyRecords: 0, requestRecords: 0, graphNodes: 0 };
  const out: Record<string, unknown> = {
    council: "ملکا-شورا-ن۰۲۰-۱۴۰۵",
    workOrder: "PN-016",
    stage: "۲ — Schema کاربران",
    at: new Date().toISOString(),
    migrationMethod: "prisma db push (الگوی مستند پروژه از P6.5 — migrate dev ریست DB می‌خواست؛ ممنوع)",
    backup: {
      path: "backups/pn016-pre-schema-2026-10-07T22-30.db",
      md5: "0c76eec9b8be58ec02bdd1031d8e0fd5",
      sizeMB: 263,
    },
    deviations: [
      "enum UserRole → String + اعتبارسنجی سطح-اپ (Prisma+SQLite از enum پشتیبانی نمی‌کند)",
      "UserSession.token (طرح شورا) → tokenHash (توکن خام هرگز در DB — انضباط امنیتی پروژه از PN-001)",
      "migrate dev --name pn016_users → db push (اول test.db سپس production — الگوی PHASE-6.5-DESIGN)",
    ],
    newModels,
    dataIntegrity,
  };

  const counts = {
    User: await db.user.count(),
    UserPermission: await db.userPermission.count(),
    UserActivity: await db.userActivity.count(),
    UserSession: await db.userSession.count(),
  };
  for (const m of models) {
    const cols = await db.$queryRawUnsafe(`SELECT name FROM pragma_table_info('${m}')`) as Array<{ name: string }>;
    newModels[m] = { count: counts[m as keyof typeof counts], columns: cols.map((c) => c.name) };
  }

  const pi = await db.$queryRawUnsafe("SELECT * FROM pragma_integrity_check()") as Array<Record<string, unknown>>;
  dataIntegrity.integrityCheck = String(pi[0]?.["integrity_check"] ?? "unknown");
  dataIntegrity.propertyRecords = await db.propertyRecord.count();
  dataIntegrity.requestRecords = await db.requestRecord.count();
  dataIntegrity.graphNodes = await db.graphNode.count();

  const tables = await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name") as Array<{ name: string }>;
  out.allTables = tables.map((t) => t.name);

  fs.mkdirSync("download/pn016", { recursive: true });
  fs.writeFileSync("download/pn016/schema.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ newModels: out.newModels, integrity: out.dataIntegrity, totalTables: (out.allTables as string[]).length }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
