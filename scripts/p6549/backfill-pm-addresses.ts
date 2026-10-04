// backfill-pm-addresses.ts — پر کردن ستون آدرس M4 از سامانهٔ PM (P6549 — کشف endpoint تماس کامل)
// منبع: realtors/info/contactInfo/{id} → contactInfo.address (کشف زندهٔ ۱۴۰۵/۰۷/۱۲)
// اجرا: bun scripts/p6549/backfill-pm-addresses.ts
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../../src/lib/auth/crypto";
import { armCall } from "../../src/lib/melk-api/client";
import { getMelkApiConfig } from "../../src/lib/melk-api/config";
import { MELK_ENDPOINTS } from "../../src/lib/melk-api/endpoints";
const db = new PrismaClient();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  const pm = await db.pmConnection.findFirst({ orderBy: { updatedAt: "desc" } });
  const PM_TOKEN = decryptSecret(pm?.tokenEnc ?? "") ?? "";
  if (!PM_TOKEN) { console.error("FAIL: توکن PM موجود نیست"); process.exit(1); }
  const cfg = getMelkApiConfig();
  const all = await db.pmPersonnelRecord.findMany({ select: { id: true, fullName: true, address: true } });
  const pending = all.filter((p) => !p.address);
  console.log(`پرسنل PM: ${all.length} · بدون آدرس: ${pending.length}`);
  let filled = 0, failed = 0, missingAtSource = 0;
  for (const p of pending) {
    try {
      const res = await armCall<unknown>({ path: MELK_ENDPOINTS.pm.realtorContactInfo(p.id), baseUrl: cfg.pmApiBase, token: PM_TOKEN, timeoutMs: 30_000, maxRetries: 0 });
      const d = (res.data ?? {}) as { contactInfo?: { address?: unknown } };
      const address = typeof d.contactInfo?.address === "string" ? (d.contactInfo.address as string).trim() : "";
      if (address) {
        await db.pmPersonnelRecord.update({ where: { id: p.id }, data: { address } });
        filled += 1;
        console.log(`  ✓ ${p.fullName}: ${address.slice(0, 60)}`);
      } else {
        missingAtSource += 1;
      }
    } catch (e) {
      failed += 1;
      console.log(`  ✗ ${p.fullName}: ${(e as Error).message?.slice(0, 80)}`);
    }
    await sleep(250);
  }
  const total = await db.pmPersonnelRecord.count({ where: { address: { not: null } } });
  console.log(`\nنتیجه: پرشد=${filled} · بدون-آدرس-در-منبع=${missingAtSource} · خطا=${failed}`);
  console.log(`پوشش آدرس پرسنل PM: ${total}/${all.length} (${Math.round((total / all.length) * 100)}٪)`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
