import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/test.db" } } });
const ac = await db.armConnection.findMany();
let enc = 0; for (const a of ac) { const vals = Object.values(a).filter(v => typeof v === "string" && v.length > 40); if (vals.length) enc++; }
console.log("armConnection:", ac.length, "rows with long enc-like values:", enc);
if (ac.length) console.log(JSON.stringify(ac[0], null, 1).slice(0, 400));
await db.$disconnect();
