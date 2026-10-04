// VACUUM INTO — اسنپ‌شات سازگار SQLite حتی حین نوشتن سرور (P6549)
// استفاده: bun scripts/snapshot-db.ts <مسیر-مقصد-مطلق>
const dest = process.argv[2];
if (!dest || !dest.startsWith("/")) { console.error("usage: bun scripts/snapshot-db.ts /abs/path.db"); process.exit(1); }
process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
export {};
async function main() {
  const { db } = await import("@/lib/db");
  await db.$executeRawUnsafe(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
