#!/usr/bin/env bun
/**
 * p6547-pm-branch-backfill.ts — بک‌فیل زندهٔ شعبهٔ پرسنل از سامانهٔ PM
 * -------------------------------------------------------------------
 * P6547/گام یک-۵ + گام چهارم-۱: «اطلاعات ستون شعبه از سامانه pm استخراج گردد»
 * برای هر ۱۴۲ پرسنل: realtors/info/personnelInfo/{id} → branchId.title → branchTitle
 * شاهد کشف: سراج میزانی → ملکی تبریزی · توحید میزانی → باغلارباغی
 * اصول: فقط GET · upsert-only · شکست نرم (ردیف خطادار در دیمون دوباره تلاش می‌شود)
 */
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { armCall } from "../src/lib/melk-api/client";
import { getMelkApiConfig } from "../src/lib/melk-api/config";
import { MELK_ENDPOINTS } from "../src/lib/melk-api/endpoints";
import { pickBranchTitle } from "../src/lib/melk-api/pm-acc-sync";
import { writeFileSync, mkdirSync } from "node:fs";

const db = new PrismaClient();

async function main() {
  const pm = await db.pmConnection.findFirst();
  const PM_TOKEN = decryptSecret(pm?.tokenEnc ?? "") ?? "";
  console.log(`PM token: ${PM_TOKEN.length} chars`);
  if (!PM_TOKEN) { console.log("NO PM TOKEN — abort"); process.exit(1); }
  const cfg = getMelkApiConfig();

  // همهٔ پرسنلِ بدون شعبه (صف P6547)
  const pending = await db.pmPersonnelRecord.findMany({
    where: { branchTitle: null },
    select: { id: true, fullName: true },
    orderBy: { updatedAt: "asc" },
  });
  console.log(`pending personnel without branch: ${pending.length}`);

  const samples: Array<{ id: string; fullName: string | null; branchTitle: string | null }> = [];
  let ok = 0, fail = 0, noBranch = 0;
  const t0 = Date.now();

  for (const p of pending) {
    try {
      const res = await armCall<unknown>({
        path: MELK_ENDPOINTS.pm.realtorPersonnelInfo(p.id),
        baseUrl: cfg.pmApiBase,
        token: PM_TOKEN,
        timeoutMs: 45_000,
        maxRetries: 1,
      });
      const d = (res.data ?? {}) as Record<string, unknown>;
      const branch = pickBranchTitle(d);
      if (branch.title) {
        await db.pmPersonnelRecord.update({
          where: { id: p.id },
          data: { branchTitle: branch.title, branchCode: branch.code },
        });
        ok += 1;
        if (samples.length < 8) samples.push({ id: p.id, fullName: p.fullName, branchTitle: branch.title });
      } else {
        noBranch += 1;
      }
    } catch {
      fail += 1;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  const total = await db.pmPersonnelRecord.count();
  const withBranch = await db.pmPersonnelRecord.count({ where: { branchTitle: { not: null } } });
  const byBranch: Record<string, number> = {};
  (await db.pmPersonnelRecord.findMany({ where: { branchTitle: { not: null } }, select: { branchTitle: true } }))
    .forEach((r) => { byBranch[r.branchTitle!] = (byBranch[r.branchTitle!] ?? 0) + 1; });

  const proof = {
    ranAt: new Date().toISOString(),
    attempted: pending.length,
    ok, fail, noBranch,
    durationMs: Date.now() - t0,
    after: { total, withBranch, byBranch },
    samples,
  };
  mkdirSync("download/p6547", { recursive: true });
  writeFileSync("download/p6547/pm-branch-backfill-proof.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
