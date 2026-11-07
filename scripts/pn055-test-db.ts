import { db } from "@/lib/db";
const n = await db.refListCache.count();
console.log("refListCache count:", n);
process.exit(0);
