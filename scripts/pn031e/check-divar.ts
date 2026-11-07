import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/test.db" } } });
const dv = await db.divarConnection.findMany();
let enc = 0; for (const d of dv) if (d.tokenEnc || d.apiKeyEnc) enc++;
console.log("divarConnection rows:", dv.length, "with enc:", enc);
const ac = await db.armConnection.findMany();
let aenc = 0; for (const a of ac) if (a.tokenEnc || a.refreshTokenEnc) aenc++;
console.log("armConnection rows:", ac.length, "with enc:", aenc);
await db.$disconnect();
