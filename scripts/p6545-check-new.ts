import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  for (const m of ['syncJobState','graphNode','graphEdge','opportunityAlert']) {
    try { console.log(m, await (db as any)[m].count()); } catch (e: any) { console.log(m, 'ERR', e.message.slice(0,80)); }
  }
}
main().finally(() => db.$disconnect());
