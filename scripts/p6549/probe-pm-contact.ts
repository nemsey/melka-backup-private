// p6549-probe-pm-contact.ts — آیا endpoint تماس کامل پرسنل PM آدرس دارد؟ (کشف ستون آدرس M4)
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../../src/lib/auth/crypto";
import { armCall } from "../../src/lib/melk-api/client";
import { getMelkApiConfig } from "../../src/lib/melk-api/config";
import { MELK_ENDPOINTS } from "../../src/lib/melk-api/endpoints";
const db = new PrismaClient();
async function main() {
  const pm = await db.pmConnection.findFirst({ orderBy: { updatedAt: "desc" } });
  console.log("PM connection:", pm?.status, "updated:", pm?.updatedAt, "hasToken:", Boolean(pm?.tokenEnc));
  const PM_TOKEN = decryptSecret(pm?.tokenEnc ?? "") ?? "";
  if (!PM_TOKEN) { console.log("NO PM TOKEN — backfill ممکن نیست فعلاً"); process.exit(2); }
  const cfg = getMelkApiConfig();
  const people = await db.pmPersonnelRecord.findMany({ take: 3, orderBy: { code: "asc" } });
  for (const p of people) {
    try {
      const res = await armCall<unknown>({ path: MELK_ENDPOINTS.pm.realtorContactInfo(p.id), baseUrl: cfg.pmApiBase, token: PM_TOKEN, timeoutMs: 30_000, maxRetries: 0 });
      const d = (res.data ?? {}) as Record<string, unknown>;
      console.log(`\n${p.fullName} (${p.code}):`);
      console.log(JSON.stringify(d, null, 1).slice(0, 700));
    } catch (e) {
      console.log(`${p.fullName} FAILED:`, (e as Error).message?.slice(0, 140));
    }
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
