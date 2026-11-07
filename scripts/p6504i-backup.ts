process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
export {};
async function main() {
  const { db } = await import("@/lib/db");
  const r = await db.$queryRawUnsafe<{ path: string }[]>("VACUUM INTO '/home/z/my-project/db/custom.backup-pre-p6504i.db'");
  console.log("VACUUM INTO done");
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
