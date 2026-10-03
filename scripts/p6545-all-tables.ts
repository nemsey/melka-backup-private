import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const models = Object.keys(db).filter(k => !k.startsWith('_') && !k.startsWith('$'));
async function main() {
  for (const m of models.sort()) {
    try { const c = await (db as any)[m].count(); if (c > 0) console.log(`${m}: ${c}`); } catch {}
  }
}
main().finally(() => db.$disconnect());
