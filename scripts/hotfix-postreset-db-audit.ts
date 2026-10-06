/**
 * شمارش ردیف‌های دارای توکن رمزشده — مستندسازی اثر چرخش اجباری MELK_TOKEN_KEY
 * پس از ریست سندباکس (کلید قبلی از بین رفت). فقط خواندن — هیچ تغییری نمی‌دهد.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const s = await db.session.count({ where: { armTokenEnc: { not: null } } });
  const pm = await db.pmConnection.count({ where: { tokenEnc: { not: null } } });
  const divar = await db.divarConnection.count({ where: { tokenEnc: { not: null } } });
  const ig = await db.instagramConnection.count({ where: { tokenEnc: { not: null } } });
  const totalSessions = await db.session.count();
  const pmRows = await db.pmConnection.findMany({ select: { personnelCode: true, status: true } });
  const divarRows = await db.divarConnection.findMany({ select: { phone: true, status: true } });
  const igRows = await db.instagramConnection.findMany({ select: { username: true, status: true } });
  console.log(
    JSON.stringify(
      {
        totalSessions,
        sessionsWithArmToken: s,
        pm: { withToken: pm, rows: pmRows },
        divar: { withToken: divar, rows: divarRows },
        instagram: { withToken: ig, rows: igRows },
      },
      null,
      2,
    ),
  );
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
