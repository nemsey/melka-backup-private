/**
 * بررسی و چرخش روی کپی دیتابیس واقعی — شاهد HOTFIX-01
 * اجرا: bun scripts/rotation-evidence.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.rotation-test.db" } } });

async function main() {
  const [sessions, syncState, pm, divar, ig] = await Promise.all([
    db.session.count({ where: { armTokenEnc: { not: null } } }),
    Promise.resolve(0), // ستون armTokenEnc در HOTFIX-02 حذف شد — همیشه صفر
    db.pmConnection.count({ where: { tokenEnc: { not: null } } }),
    db.divarConnection.count({ where: { OR: [{ tokenEnc: { not: null } }, { apiKeyEnc: { not: null } }] } }),
    db.instagramConnection.count({ where: { tokenEnc: { not: null } } }),
  ]);
  console.log("رکوردهای رمزنگاری‌شده در کپی دیتابیس واقعی:");
  console.log(`  Session.armTokenEnc:          ${sessions}`);
  console.log(`  SyncState.armTokenEnc:        ${syncState}`);
  console.log(`  PmConnection.tokenEnc:        ${pm}`);
  console.log(`  DivarConnection (token|key):  ${divar}`);
  console.log(`  InstagramConnection.tokenEnc: ${ig}`);

  // اجرای چرخش: قدیم = fallback حذف‌شده، جدید = کلید dev تولیدشده
  const newKey = process.env.MELK_TOKEN_KEY!;

  // تزریق توکن نمونه رمزنگاری‌شده با «کلید قدیمی fallback» (عین داده پیش از HOTFIX-01)
  const { __internal } = await import("@/lib/auth/key-rotation");
  const oldKeyBuf = __internal.keyFromSecret("melk-tabriz-fallback-key");
  const samplePlain = "sample-arm-token-encrypted-with-old-fallback-key";
  const encOld = __internal.encryptWith(samplePlain, oldKeyBuf);
  await db.session.create({
    data: {
      tokenHash: "rotation-evidence-" + Date.now(),
      personnelCode: "999999",
      displayName: "شاهد چرخش کلید",
      role: "CONSULTANT",
      armTokenEnc: encOld,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  console.log(`\nتوکن نمونه با کلید قدیمی تزریق شد (طول=${encOld.length})`);

  const { rotateEncryptionKeys } = await import("@/lib/auth/key-rotation");
  console.log("چرخش با: OLD=<melk-tabriz-fallback-key حذف‌شده> → NEW=<کلید dev جدید>");
  const report = await rotateEncryptionKeys("melk-tabriz-fallback-key", newKey);
  console.table(
    Object.entries(report.tables).map(([t, v]) => ({ جدول: t, ...v }))
  );
  console.log(`ok=${report.ok} rotated=${report.rotated} already=${report.alreadyRotated} unreadable=${report.unreadable}`);

  // راستی‌آزمایی نهایی: توکن نمونه با کلید جدید قابل رمزگشایی و برابر مقدار اصلی است
  const row = await db.session.findFirst({ where: { personnelCode: "999999" }, orderBy: { createdAt: "desc" } });
  const newKeyBuf = __internal.keyFromSecret(newKey);
  const decoded = row?.armTokenEnc ? __internal.decryptWith(row.armTokenEnc, newKeyBuf) : null;
  console.log(`\nverify: decrypt(نمونه چرخیده، کلید جدید) = ${decoded}`);
  console.log(decoded === samplePlain ? "✅ شاهد کامل: چرخش روی کپی DB واقعی کار می‌کند" : "❌ ناکام");
  await db.session.deleteMany({ where: { personnelCode: "999999" } });
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
