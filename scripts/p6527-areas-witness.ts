/** P6527 — شاهد زندهٔ موقت دیالوگ «فایل مناطق» (کاشت + پاکسازی دقیق یک رکورد آزمایشی)
 *  رکورد با کد ۹۹۸۸۷۷ و ۷ منطقه کاشته می‌شود؛ پس از راستی‌آزمایی DOM با کلید
 *  p6527areas حذف می‌شود — وضعیت اولیهٔ داده دقیقاً بازمی‌گردد.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const ID = "p6527areas-witness";
const CODE = "998877";
const AREAS = ["خاوران", "ولیعصر", "زهیر", "اوجانی", "شهرک ولیعصر", "کوی آبفشان", "معجزات"];

async function seed() {
  await db.requestRecord.deleteMany({ where: { id: ID } });
  await db.requestRecord.create({
    data: {
      id: ID,
      requestCode: CODE,
      title: "شاهد موقت P6527 — دیالوگ فایل مناطق",
      status: "در جریان",
      actorCode: "P6527",
      actorName: "شاهد P6527",
      source: "arm",
      areaNamesJson: JSON.stringify(AREAS),
    },
  });
  console.log(`SEEDED ${CODE} areas=${AREAS.length}`);
}

async function clean() {
  const r = await db.requestRecord.deleteMany({ where: { id: ID } });
  console.log(`CLEANED count=${r.count}`);
}

const mode = process.argv[2] ?? "seed";
(mode === "clean" ? clean() : seed())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
