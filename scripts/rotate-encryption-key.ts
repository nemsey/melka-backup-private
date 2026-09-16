/**
 * اسکریپت یک‌باره چرخش کلید رمزنگاری — HOTFIX-01 / SEC-2
 * ------------------------------------------------------
 * اجرا:
 *   MELK_TOKEN_KEY_OLD=<کلید قدیم> MELK_TOKEN_KEY=<کلید جدید> bun scripts/rotate-encryption-key.ts
 *
 * یا روی نسخه کپی از دیتابیس (پیشنهادی برای اولین بار):
 *   cp db/custom.db db/custom.backup.db
 *   DATABASE_URL=file:./db/custom.backup.db MELK_TOKEN_KEY_OLD=... MELK_TOKEN_KEY=... bun scripts/rotate-encryption-key.ts
 *
 * پس از چرخش موفق روی DB اصلی:
 *   ۱) MELK_TOKEN_KEY_OLD را از محیط حذف کنید
 *   ۲) ROTATION_PENDING را حذف/false کنید
 *   ۳) سرور را ری‌استرت کنید
 *
 * خروجی: گزارش جدولی rotated/already/unreadable + AuditLog با اثر انگشت کلید جدید.
 */

import { rotateFromEnv } from "@/lib/auth/key-rotation";
import { db } from "@/lib/db";

async function main() {
  console.log("=== چرخش کلید رمزنگاری توکن‌ها (AES-256-GCM) ===");
  console.log(`پایگاه داده: ${process.env.DATABASE_URL ?? "(پیش‌فرض prisma)"}\n`);

  const report = await rotateFromEnv();

  console.table(
    Object.entries(report.tables).map(([table, t]) => ({
      جدول: table,
      بررسی‌شده: t.scanned,
      چرخیده: t.rotated,
      قبلاً_چرخیده: t.already,
      ناخوانا: t.unreadable,
    }))
  );
  console.log(`جمع: scanned=${report.scanned} rotated=${report.rotated} already=${report.alreadyRotated} unreadable=${report.unreadable}`);

  if (!report.ok) {
    console.error(`\n⚠️  ${report.error}`);
    console.error("   مقادیر ناخوانا دستکاری نشده‌اند — با کلید قدیمی‌تر رمز شده‌اند یا خراب‌اند.");
    process.exitCode = 2;
  } else {
    console.log("\n✅ چرخش کامل شد — رد حسابرسی KEY_ROTATION ثبت شد (بدون افشای کلید).");
    console.log("   یادآوری: MELK_TOKEN_KEY_OLD را از محیط حذف و ROTATION_PENDING را false کنید.");
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error("خطای چرخش کلید:", err);
  process.exitCode = 1;
});
