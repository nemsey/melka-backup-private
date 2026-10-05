import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const r = await db.otpAttempt.deleteMany({ where: { personnelCode: "000000000", kind: "MASTER_LOGIN" } });
  console.log("cleared MASTER_LOGIN attempts:", r.count);
}
main().finally(() => db.$disconnect());
