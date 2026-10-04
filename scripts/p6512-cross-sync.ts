#!/usr/bin/env bun
/**
 * p6512-cross-sync.ts — اجرای زندهٔ همگام‌سازی بین‌سامانه‌ای P6.5-12
 * -------------------------------------------------------------------
 * ۱) sync اصلی ARM (رفع باگ موبایل کارشناسان — mobileNumber)
 * ۲) پرسنل PM (کد پرسنلی + موبایل — ۱۴۲ نفر)
 * ۳) کارگزاری‌های ARM (۷۷ رکورد + جزئیات)
 * ۴) قراردادها با مبالغ مالی (contractPrice از trade-overviews/info)
 * ۵) بهترین کارشناسان ACC (کل کسب‌وکار)
 *
 * توکن‌ها: ARM از صندوقچهٔ ماندگار مالک · PM از رکورد اتصال PM — صفر پیامک
 * اصول: فقط GET · upsert-only · شکست هر مرحله مستقل
 */
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { syncFromArm } from "../src/lib/melk-api/sync";
import { syncPmPersonnel, syncSpecialProperties, getAccBestRealtor } from "../src/lib/melk-api/pm-acc-sync";

const db = new PrismaClient();

async function main() {
  const arm = await db.armConnection.findFirst({ where: { ownerKey: "master" } });
  const pm = await db.pmConnection.findFirst();
  const ARM_TOKEN = decryptSecret(arm?.tokenEnc ?? "") ?? "";
  const PM_TOKEN = decryptSecret(pm?.tokenEnc ?? "") ?? "";
  console.log(`ARM token: ${ARM_TOKEN.length} chars · PM token: ${PM_TOKEN.length} chars`);
  if (!ARM_TOKEN) { console.log("NO ARM TOKEN — abort"); process.exit(1); }

  // ۱) sync اصلی (معاملات + کارشناسان با موبایل + قراردادها با مبالغ)
  console.log("\n[1/5] syncFromArm …");
  const t0 = Date.now();
  const main = await syncFromArm(ARM_TOKEN);
  console.log(`  ok=${main.ok} tx=${main.transactions} experts=${main.experts} contracts=${main.contracts} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

  // ۲) پرسنل PM
  if (PM_TOKEN) {
    console.log("\n[2/5] syncPmPersonnel …");
    try {
      const pmRes = await syncPmPersonnel(PM_TOKEN);
      console.log(`  ok=${pmRes.ok} personnel=${pmRes.personnel}`, pmRes.error ?? "");
    } catch (e) {
      console.log("  PM sync failed:", (e as Error).message?.slice(0, 100));
    }
  } else {
    console.log("\n[2/5] PM token missing — skip");
  }

  // ۳) کارگزاری‌ها
  console.log("\n[3/5] syncSpecialProperties …");
  try {
    const sp = await syncSpecialProperties(ARM_TOKEN);
    console.log(`  ok=${sp.ok} total=${sp.total} detailed=${sp.detailed}`, sp.error ?? "");
  } catch (e) {
    console.log("  SP sync failed:", (e as Error).message?.slice(0, 100));
  }

  // ۴) بهترین کارشناسان ACC
  console.log("\n[4/5] getAccBestRealtor …");
  try {
    const best = await getAccBestRealtor(ARM_TOKEN);
    console.log(`  count=${best.length} · top=${best[0]?.realtorFullName} (${best[0]?.tradeOverviewsCount})`);
  } catch (e) {
    console.log("  ACC failed:", (e as Error).message?.slice(0, 100));
  }

  // ۵) شمارش نهایی
  console.log("\n[5/5] final counts:");
  const experts = await db.expertRecord.count();
  const expertsWithMobile = await db.expertRecord.count({ where: { mobile: { not: "—" } } });
  const pmCount = await db.pmPersonnelRecord.count();
  const pmWithCode = await db.pmPersonnelRecord.count({ where: { code: { not: null } } });
  const spCount = await db.specialPropertyRecord.count();
  const contracts = await db.contractRecord.count();
  const withPrice = await db.contractRecord.count({ where: { contractPrice: { not: null } } });
  console.log(`  experts: ${experts} (mobile filled: ${expertsWithMobile})`);
  console.log(`  pmPersonnel: ${pmCount} (with code: ${pmWithCode})`);
  console.log(`  specialProperties: ${spCount}`);
  console.log(`  contracts: ${contracts} (with price: ${withPrice})`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); }).finally(() => db.$disconnect());
