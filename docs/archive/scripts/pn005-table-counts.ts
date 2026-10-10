// PN-005: List all tables + row counts in custom.db
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

async function main() {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name"
  ) as { name: string }[];
  for (const { name } of rows) {
    try {
      const c = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as n FROM "${name}"`) as { n: number | bigint }[];
      console.log(`${name}: ${c[0].n}`);
    } catch (e) {
      console.log(`${name}: ERR ${(e as Error).message}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
