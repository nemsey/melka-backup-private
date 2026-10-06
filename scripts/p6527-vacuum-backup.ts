import { PrismaClient } from "@prisma/client";
const url = process.argv[2];
const out = process.argv[3];
const db = new PrismaClient({ datasources: { db: { url: `file:${url}` } } });
await db.$executeRawUnsafe(`VACUUM INTO '${out}'`);
console.log("BACKUP-OK", out);
await db.$disconnect();
process.exit(0);
