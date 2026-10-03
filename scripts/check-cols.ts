import { PrismaClient } from "@prisma/client";
for (const url of ["file:/home/z/my-project/db/custom.db", "file:/home/z/my-project/db/test.db"]) {
  const p = new PrismaClient({ datasources: { db: { url } } });
  try {
    const adCols = await p.$queryRawUnsafe("PRAGMA table_info(DivarAd);") as { name: string }[];
    const logCols = await p.$queryRawUnsafe("PRAGMA table_info(DivarScanLog);") as { name: string }[];
    const setCols = await p.$queryRawUnsafe("PRAGMA table_info(DivarSetting);") as { name: string }[];
    console.log(url, {
      otherScore: adCols.some(c => c.name === "otherScore"),
      publisherType: adCols.some(c => c.name === "publisherType"),
      autoRejected: logCols.some(c => c.name === "autoRejected"),
      outOfArea: logCols.some(c => c.name === "outOfArea"),
      locFilterInit: setCols.some(c => c.name === "locFilterInit"),
    });
  } finally { await p.$disconnect(); }
}
