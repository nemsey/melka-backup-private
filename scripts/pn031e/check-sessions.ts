import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/test.db" } } });
const sessions = await db.session.findMany({ select: { id: true, armTokenEnc: true, armRefreshTokenEnc: true } });
let withEnc = 0;
for (const s of sessions) if (s.armTokenEnc || s.armRefreshTokenEnc) withEnc++;
console.log("total sessions:", sessions.length, "with encrypted tokens:", withEnc);
await db.$disconnect();
