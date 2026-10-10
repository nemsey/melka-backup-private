#!/usr/bin/env bun
/**
 * p6514-tx-info-run.ts — اجرای BLOCK C (ملکا-شورا-۱۴۰۵-۰۱۷)
 * ------------------------------------------------------------
 * تکمیل غنی‌سازی معامله‌محور همهٔ معاملات فاقد اطلاعات:
 *   برش‌های ۲۰۰تایی از enrichTransactionsInfo (checkpoint هر ۵۰ داخل ماژول) ·
 *   توکن تازه از صندوقچه در هر برش · تمدید در انقضا · گزارش پیشرفت.
 *
 * اجرا: bun scripts/p6514-tx-info-run.ts [--max-minutes N]
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/custom.db" } } });

const args = process.argv.slice(2);
const mmIdx = args.indexOf("--max-minutes");
const MAX_MINUTES = mmIdx >= 0 ? Number(args[mmIdx + 1] ?? 25) : 25;

function tehranClock(d: Date): string {
  const shifted = d.getUTCHours() * 60 + d.getUTCMinutes() + 210;
  return `${String(Math.floor(shifted / 60) % 24).padStart(2, "0")}:${String(shifted % 60).padStart(2, "0")}`;
}
const ts = () => tehranClock(new Date());

async function vaultCreds() {
  const { decryptSecret } = await import("../src/lib/auth/crypto");
  const row = await db.armConnection.findFirst({ where: { status: "connected", tokenEnc: { not: null } }, orderBy: { updatedAt: "desc" } });
  if (!row?.tokenEnc) return null;
  const accessToken = decryptSecret(row.tokenEnc);
  const refreshToken = row.refreshTokenEnc ? decryptSecret(row.refreshTokenEnc) ?? "" : "";
  return accessToken ? { accessToken, refreshToken } : null;
}

async function main() {
  const started = Date.now();
  const deadline = () => Date.now() - started > MAX_MINUTES * 60_000;
  const { enrichTransactionsInfo } = await import("../src/lib/melk-api/tx-info-enrichment");
  const { persistArmTokensToVault } = await import("../src/lib/auth/arm-vault");

  console.log(`[${ts()}] BLOCK C — غنی‌سازی معامله‌محور معاملات (سقف ${MAX_MINUTES} دقیقه)`);
  let round = 0;
  let unauthorizedStreak = 0;

  while (!deadline()) {
    round += 1;
    let creds = await vaultCreds();
    if (!creds) { console.error(`[${ts()}] صندوقچهٔ ARM خالی است.`); process.exit(1); }

    const res = await enrichTransactionsInfo(creds.accessToken, { maxRows: 200, throttleMs: 400 });
    console.log(
      `[${ts()}] برش ${round}: +${res.enriched} غنی‌شده · ${res.notFound} ناموجود در مبدأ · ${res.failed} خطا · مانده ${res.remaining}${res.errorCode ? ` · err=${res.errorCode}` : ""}`
    );

    if (res.remaining === 0) {
      const total = await db.transactionEnrichment.count();
      const enrichedRows = await db.transactionEnrichment.count({ where: { contractType: { not: null } } });
      console.log(`\n[${ts()}] ✓✓ تکمیل BLOCK C: ${total} ردیف غنی‌سازی (${enrichedRows} دارای نوع قرارداد)`);
      break;
    }

    if (res.errorCode === "UNAUTHORIZED") {
      unauthorizedStreak += 1;
      // تمدید
      const { getMelkProvider } = await import("../src/lib/melk-api/provider");
      try {
        const provider = getMelkProvider();
        const fresh = await provider.refreshArmToken(creds.refreshToken);
        if (fresh.accessToken) {
          await persistArmTokensToVault({ ownerKey: "master", armTokens: fresh, personnelCode: "master" });
          console.log(`[${ts()}][token] ✓ تمدید شد و در صندوقچه ذخیره شد`);
          unauthorizedStreak = 0;
          continue;
        }
      } catch (e) {
        console.error(`[${ts()}][token] تمدید ناموفق:`, (e as Error).message?.slice(0, 80));
      }
      if (unauthorizedStreak >= 3) {
        console.error(`[${ts()}] توکن مرده — checkpoint محفوظ؛ پس از اتصال مالک دوباره اجرا کنید.`);
        process.exit(2);
      }
      await new Promise((r) => setTimeout(r, 15_000));
    } else {
      unauthorizedStreak = 0;
    }
  }
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); }).finally(() => db.$disconnect());
