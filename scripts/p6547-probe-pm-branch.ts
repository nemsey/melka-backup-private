#!/usr/bin/env bun
/**
 * p6547-probe-pm-branch.ts — کشف زندهٔ ساختار شعبه در personnelInfo سامانه PM
 * هدف: گام یک بند ۵ (ستون شعبه از سامانه pm) + گام سوم بند ۴ (شعبه در تجمیع حق‌السهم)
 * پاسخ به: شاخهٔ branchId / branch در personnelInfo چه ساختاری دارد؟
 */
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { armCall } from "../src/lib/melk-api/client";
import { getMelkApiConfig } from "../src/lib/melk-api/config";
import { MELK_ENDPOINTS } from "../src/lib/melk-api/endpoints";

const db = new PrismaClient();

async function main() {
  const pm = await db.pmConnection.findFirst();
  const PM_TOKEN = decryptSecret(pm?.tokenEnc ?? "") ?? "";
  console.log(`PM token: ${PM_TOKEN.length} chars`);
  if (!PM_TOKEN) { console.log("NO PM TOKEN — abort"); process.exit(1); }
  const cfg = getMelkApiConfig();

  // ۱) personnelInfo سراج میزانی (نمونهٔ موردی مالک: «سراج میزانی ارتش ۲۵٪»)
  const targets = await db.pmPersonnelRecord.findMany({
    where: { OR: [{ fullName: { contains: "سراج" } }, { fullName: { contains: "میزانی" } }] },
    take: 2,
  });
  // ۲) دو نمونهٔ دیگر برای تنوع
  const others = await db.pmPersonnelRecord.findMany({ take: 3, orderBy: { code: "asc" } });
  const sample = [...targets, ...others].slice(0, 5);

  for (const p of sample) {
    try {
      const res = await armCall<unknown>({
        path: MELK_ENDPOINTS.pm.realtorPersonnelInfo(p.id),
        baseUrl: cfg.pmApiBase,
        token: PM_TOKEN,
        timeoutMs: 45_000,
        maxRetries: 0,
      });
      const d = (res.data ?? {}) as Record<string, unknown>;
      console.log(`\n=== ${p.fullName} (${p.id}) ===`);
      console.log("keys:", Object.keys(d).join(", "));
      // جست‌وجوی هر چیز مرتبط با شعبه
      const str = JSON.stringify(d);
      const branchHits = str.match(/[^,{}"]*(?:branch|Branch|شعبه)[^,{}"]*/g);
      console.log("branch-ish:", JSON.stringify(branchHits?.slice(0, 6)));
      // employeementInfo کامل
      const emp = d["employeementInfo"] ?? (d["personnelInfo"] as Record<string, unknown> | undefined)?.["employeementInfo"];
      if (emp) console.log("employeementInfo:", JSON.stringify(emp).slice(0, 500));
    } catch (e) {
      console.log(`=== ${p.fullName} FAILED:`, (e as Error).message?.slice(0, 120));
    }
  }
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
