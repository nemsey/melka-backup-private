/**
 * d0-env-db-audit.ts — بازرسی گیت تحویل D0 (PHASE 2)
 * ---------------------------------------------------
 * هدف: تأیید وضعیت رازهای محیطی + سلامت پایگاه داده production پیش از استقرار.
 * فقط-خواندنی — هیچ تغییری در داده ایجاد نمی‌کند.
 * اجرا: bun scripts/d0-env-db-audit.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const tables = await db.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  );
  console.log("TABLES:", tables.map((t) => t.name).join(", "));

  const counts: Record<string, number> = {};
  for (const t of tables.map((t) => t.name)) {
    try {
      const r = await db.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as c FROM "${t}"`);
      counts[t] = Number(r[0].c);
    } catch {
      counts[t] = -1;
    }
  }
  console.log("ROW COUNTS:", JSON.stringify(counts));

  try {
    const users = await db.$queryRawUnsafe<any[]>(
      "SELECT personnelCode, displayName, role FROM User LIMIT 10"
    );
    console.log("USERS:", JSON.stringify(users));
  } catch (e: any) {
    console.log("USERS ERR:", e.message.slice(0, 120));
  }

  try {
    const ss = await db.$queryRawUnsafe<any[]>("SELECT * FROM SyncState LIMIT 3");
    console.log("SYNCSTATE:", JSON.stringify(ss));
  } catch (e: any) {
    console.log("SYNCSTATE ERR:", e.message.slice(0, 120));
  }

  try {
    const t = await db.$queryRawUnsafe<any[]>(
      "SELECT id, personnelCode, createdAt, length(tokenEnc) as encLen FROM ArmToken LIMIT 10"
    );
    console.log("ARMTOKENS:", JSON.stringify(t));
  } catch (e: any) {
    console.log("ARMTOKENS ERR:", e.message.slice(0, 120));
  }

  try {
    const dl = await db.$queryRawUnsafe<any[]>(
      "SELECT entity, naturalKey, attempts, resolvedAt FROM SyncDeadLetter LIMIT 5"
    );
    console.log("DEADLETTERS:", JSON.stringify(dl));
  } catch (e: any) {
    console.log("DEADLETTERS ERR:", e.message.slice(0, 120));
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
