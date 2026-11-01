/**
 * PN-021 — پاک‌سازی کاربران آزمایشی E2E از DB تولید (custom.db)
 * کاربران 960598 / 960599 صرفاً برای گواه کلیک واقعی مرورگر ساخته شدند.
 * الگوی پاک‌سازی: همان beforeAll/afterAll سوئیت تست (پیشوند ۹۶۰۰).
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

const CODES = ["960598", "960599"];

async function main() {
  for (const code of CODES) {
    const u = await db.user.findUnique({ where: { personnelCode: code } });
    if (!u) { console.log(`- ${code}: وجود ندارد (قبلاً پاک شده)`); continue; }
    await db.userActivity.deleteMany({ where: { userId: u.id } });
    await db.userPermission.deleteMany({ where: { userId: u.id } });
    await db.userSession.deleteMany({ where: { userId: u.id } });
    await db.user.delete({ where: { id: u.id } });
    console.log(`- ${code}: حذف شد (${u.fullName})`);
  }
  const left = await db.user.findMany({ where: { personnelCode: { startsWith: "9600" } }, select: { personnelCode: true } });
  console.log(`باقی‌ماندهٔ پیشوند ۹۶۰۰: ${left.length === 0 ? "صفر ✓" : left.map((x) => x.personnelCode).join(",")}`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
