/**
 * P6.5-04-i — تعمیر یک‌بارهٔ کلیدهای مصنوعی کارشناسان (پیش از sync دوم)
 * ---------------------------------------------------------------------------
 * ردیف‌های موجود با کد «بدون-کد-N» (اندیس داخل-صفحه‌ای — باگ چند-صفحه‌ای)
 * به کلید پایدار «بدون-کد-<ARM _id>» مهاجرت داده می‌شوند تا upsert دومین sync
 * همان ردیف‌ها را بی‌تعارض به‌روزرسانی کند (به‌جای حذف/بازسازی).
 * بدون-کد-N فقط از realtors/list می‌آید (id همان _id است) ⇒ نگاشت ۱:۱ امن.
 */
process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
export {};
async function main() {
  const { db } = await import("@/lib/db");
  const synthetic = await db.expertRecord.findMany({ where: { personnelCode: { startsWith: "بدون-کد-" } }, select: { id: true, personnelCode: true } });
  let migrated = 0;
  for (const row of synthetic) {
    // کد جدید = بدون-کد-<id> — فقط اگر id خودِ شناسهٔ ARM باشد (نه fallback)
    if (row.id && !row.id.startsWith("arm-realtor-")) {
      await db.expertRecord.update({ where: { id: row.id }, data: { personnelCode: `بدون-کد-${row.id}` } });
      migrated++;
    }
  }
  const total = await db.expertRecord.count();
  console.log(JSON.stringify({ syntheticFound: synthetic.length, migrated, expertsAfter: total }));
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
