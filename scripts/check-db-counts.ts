process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";

export {}; // ماژولی شدن — جلوگیری از تداخل main سراسری بین اسکریپت‌ها
async function main() {
  const { db } = await import("@/lib/db");
  const [users, tx, ads] = await Promise.all([
    db.session.count(),
    db.transactionRecord.count(),
    db.divarAd.count(),
  ]);
  console.log("sessions:", users, "| transactions:", tx, "| divarAds:", ads);
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
