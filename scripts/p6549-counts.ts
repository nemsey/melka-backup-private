process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
export {}; // ماژولی شدن — جلوگیری از تداخل main سراسری بین اسکریپت‌ها
async function main() {
  const { db } = await import("@/lib/db");
  const [prop, req, tx, expert, pm, session, contract, visit] = await Promise.all([
    db.propertyRecord.count(),
    db.requestRecord.count(),
    db.transactionRecord.count(),
    db.expertRecord.count(),
    db.pmPersonnelRecord.count(),
    db.session.count(),
    db.contractRecord.count(),
    db.visitRecord.count(),
  ]);
  console.log(JSON.stringify({ آگهی: prop, درخواست: req, معامله: tx, کارشناس: expert, پرسنلPM: pm, نشست: session, قرارداد: contract, بازدید: visit }, null, 0));
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
