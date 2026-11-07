import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/test.db" } } });
const pm = await db.pmConnection.findMany({ select: { id: true, tokenEnc: true, refreshTokenEnc: true } });
let pmEnc = 0; for (const p of pm) if (p.tokenEnc || p.refreshTokenEnc) pmEnc++;
console.log("PmConnection:", pm.length, "with enc:", pmEnc);
const ga = await db.gapConnection?.findMany?.({ select: { id: true } } as any).catch(() => null);
console.log("gapConnection?", ga ? ga.length : "n/a");
await db.$disconnect();
