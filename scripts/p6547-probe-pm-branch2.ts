import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { armCall } from "../src/lib/melk-api/client";
import { getMelkApiConfig } from "../src/lib/melk-api/config";
import { MELK_ENDPOINTS } from "../src/lib/melk-api/endpoints";
const db = new PrismaClient();
async function main() {
  const pm = await db.pmConnection.findFirst();
  const PM_TOKEN = decryptSecret(pm?.tokenEnc ?? "") ?? "";
  const cfg = getMelkApiConfig();
  const targets = await db.pmPersonnelRecord.findMany({
    where: { OR: [{ fullName: { contains: "سراج" } }, { fullName: { contains: "میزانی" } }] }, take: 2,
  });
  const others = await db.pmPersonnelRecord.findMany({ take: 4, orderBy: { code: "asc" } });
  for (const p of [...targets, ...others].slice(0, 6)) {
    try {
      const res = await armCall<unknown>({ path: MELK_ENDPOINTS.pm.realtorPersonnelInfo(p.id), baseUrl: cfg.pmApiBase, token: PM_TOKEN, timeoutMs: 45_000, maxRetries: 0 });
      const d = (res.data ?? {}) as Record<string, unknown>;
      console.log(`${p.fullName} :: branchId=${JSON.stringify(d.branchId)} :: headRealtor=${JSON.stringify(d.headRealtor)?.slice(0,80)} :: role=${JSON.stringify(d.role)?.slice(0,60)}`);
    } catch (e) { console.log(`${p.fullName} FAILED:`, (e as Error).message?.slice(0, 80)); }
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
