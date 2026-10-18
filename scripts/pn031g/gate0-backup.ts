// PN-031-G · دروازهٔ ۰ — بکاپ گرم VACUUM (الگوی p6527-vacuum-backup — بدون CLI sqlite3)
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { statSync } from "node:fs";

const SRC = "/home/z/my-project/db/custom.db";
const STAMP = new Date().toISOString().replace(/[:T]/g, "-").replace(/\..+/, "Z");
const dest = `/home/z/my-project/db/pre-pn031g-${STAMP}.db`;

const db = new PrismaClient({ datasources: { db: { url: `file:${SRC}` } } });

async function main() {
  await db.$executeRawUnsafe(`VACUUM INTO '${dest}'`);
  const probe = new PrismaClient({ datasources: { db: { url: `file:${dest}` } } });
  const check = (await probe.$queryRawUnsafe(`PRAGMA integrity_check;`) as { integrity_check: string }[])[0]?.integrity_check;
  await probe.$disconnect();
  const md5 = execSync(`md5sum ${dest} | awk '{print $1}'`).toString().trim();
  const size = (statSync(dest).size / 1024 / 1024).toFixed(1);
  console.log(JSON.stringify({ dest, sizeMB: size, md5, integrity: check }));
}
main().finally(() => db.$disconnect());
