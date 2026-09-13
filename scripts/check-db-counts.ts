process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
async function main() {
  const { db } = await import("@/lib/db");
  const [users, tx, ads] = await Promise.all([
    db.user.count(),
    db.transaction.count(),
    db.divarAd.count(),
  ]);
  console.log("users:", users, "| transactions:", tx, "| divarAds:", ads);
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
