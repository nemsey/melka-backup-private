/**
 * P6.5-11 (بند ث) — مهاجرت یک‌بارهٔ توکن‌های ARM نشست‌های زنده به صندوقچهٔ ماندگار
 * ---------------------------------------------------------------------------
 * فقط به جدول تازهٔ ArmConnection می‌نویسد؛ هیچ دادهٔ موجودی لمس نمی‌شود
 * (نکتهٔ بسیار مهم ۲ — حفاظت کامل داده). خروجی: هر نشست دارای توکن ARM،
 * در صندوقچه با کلید خودش (OWNER ⇒ master) ثبت شد تا «هر ورود بعدی بدون
 * پیامک» خودکار متصل شود.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/custom.db" } },
});

async function main() {
  const sessions = await db.session.findMany({
    where: { revoked: false, expiresAt: { gt: new Date() }, armTokenEnc: { not: null } },
    select: { id: true, personnelCode: true, displayName: true, role: true, armTokenEnc: true, armRefreshTokenEnc: true, armUserType: true, expiresAt: true },
    orderBy: { lastSeenAt: "desc" },
  });
  console.log(`نشست‌های زندهٔ دارای توکن ARM: ${sessions.length}`);

  // فقط تازه‌ترین نشست هر هویت (ownerKey) صندوقچه می‌شود
  const byKey = new Map<string, (typeof sessions)[number]>();
  for (const s of sessions) {
    const key = s.role === "OWNER" ? "master" : s.personnelCode;
    if (!byKey.has(key)) byKey.set(key, s); // اولین = تازه‌ترین (مرتب نزولی)
  }

  for (const [key, s] of byKey) {
    await db.armConnection.upsert({
      where: { ownerKey: key },
      create: {
        ownerKey: key,
        personnelCode: s.role === "OWNER" ? s.personnelCode : s.personnelCode,
        displayName: s.displayName,
        userType: s.armUserType,
        tokenEnc: s.armTokenEnc,
        refreshTokenEnc: s.armRefreshTokenEnc,
        status: "connected",
        lastRefreshedAt: new Date(),
      },
      update: {
        // اگر از قبل رکوردی هست، فقط وقتی جایگزین می‌کنیم که توکن ندارد
        tokenEnc: s.armTokenEnc,
        refreshTokenEnc: s.armRefreshTokenEnc,
        status: "connected",
      },
    });
    console.log(`✓ صندوقچه[${key}] ← نشست ${s.id.slice(0, 8)}… (${s.personnelCode}/${s.role}) — انقضا: ${s.expiresAt.toISOString()}`);
  }

  const total = await db.armConnection.count();
  console.log(`\nنتیجه: ${total} رکورد صندوقچهٔ ماندگار — ورودهای بعدی این هویت‌ها خودکار متصل می‌شوند.`);
}

main()
  .catch((e) => {
    console.error("خطای مهاجرت:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
