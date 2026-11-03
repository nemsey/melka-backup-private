import { PrismaClient } from "@prisma/client";

/** P6526 — بکاپ گرم پایگاه داده پیش از تغییرات (قانون حرمت اطلاعات — AGENTS.md §۵) */
async function main() {
  const p = new PrismaClient();
  await p.$executeRawUnsafe("VACUUM INTO 'backups/pre-p6526-2026-09-27.db'");
  console.log("VACUUM INTO backups/pre-p6526-2026-09-27.db — done");
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
