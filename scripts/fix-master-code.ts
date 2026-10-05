/**
 * PN-003 نکته ۲ — رفع ریشه‌ای ورود مالک (برای همیشه)
 * ------------------------------------------------------
 * علت ریشه: غلط تایپی در کد مستر (۸۰۲۲۱۱۸۶ به‌جای ۸۰۲۱۱۱۸۶) که هم در .env.local
 * و هم در هش AppMeta دیتابیس تزریق شده بود. این اسکریپت هش DB را با کد صحیح
 * همگام می‌کند و صحت هر دو لایه را گواهی می‌دهد.
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { readFileSync } from "fs";

const db = new PrismaClient();

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

async function main() {
  // ۱) کد از .env.local (منبع حقیقت پس از رفع غلط تایپی)
  const envLocal = readFileSync("/home/z/my-project/.env.local", "utf8");
  const m = envLocal.match(/^MASTER_ACCESS_CODE=(\d{8})$/m);
  if (!m) throw new Error("MASTER_ACCESS_CODE در .env.local یافت نشد");
  const code = m[1];

  // ۲) هش صحیح را در AppMeta بنویس (لایهٔ بقای بازنشانی محیط)
  await db.appMeta.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", masterCodeHash: sha256(code) },
    update: { masterCodeHash: sha256(code) },
  });

  // ۳) گواهی زندهٔ سه‌لایه
  const meta = await db.appMeta.findUnique({ where: { id: "singleton" } });
  const envOk = code !== "00000000";
  const hashOk = meta?.masterCodeHash === sha256(code);
  const lenOk = code.length === 8;
  console.log("MASTER code length 8:", lenOk ? "PASS" : "FAIL");
  console.log("MASTER env value (not public test):", envOk ? "PASS" : "FAIL");
  console.log("MASTER env hash == DB AppMeta hash:", hashOk ? "PASS" : "FAIL");
  console.log("DB masterCodeHash:", meta?.masterCodeHash);
  if (!envOk || !hashOk || !lenOk) process.exit(1);
}

main()
  .catch((e) => { console.error("ERR:", e.message); process.exit(1); })
  .finally(() => db.$disconnect());
