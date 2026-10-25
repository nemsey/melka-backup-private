#!/usr/bin/env bun
/**
 * p6513-complete-transfer.ts — تکمیل کامل انتقال ناتمام دو مرحلهٔ اخیر (P6.5-11/12)
 * ------------------------------------------------------------------------------------
 * مأموریت (دستور مالک ۱۴۰۵/۰۷/۱): پروسهٔ مرحلهٔ قبل و دو مرحلهٔ قبل که ناقص مانده،
 * به طور کامل و تمام انجام و تکمیل شود — عین زیرساخت P6.5-11 (نکتهٔ ۳) اما:
 *
 *   · توکن هر برش از صندوقچهٔ ماندگار تازه خوانده می‌شود (نه یک‌بار در شروع)
 *   · انقضای توکن ⇒ تمدید خودکار + ذخیرهٔ خودکار در صندوقچه (persistArmTokensToVault)
 *   · --wait-for-token: توکن مرده ⇒ نظارت بر صندوقچه تا اتصال تازهٔ مالک
 *     (هر ۳۰ ثانیه؛ به‌محض اتصال از تنظیمات، انتقال به‌طور خودکار کامل می‌شود)
 *   · تشخیص «بی‌پیشرفتی»: ۵ برش پیاپی بدون هیچ پیشرفت ⇒ توقف با پیام شفاف
 *   · خروجی نهایی: گزارش کامل وضعیت (لایه ۱ + غنی‌سازی هر دو کاتالوگ)
 *
 * ترتیب هر برش (عین p6511-night-transfer.ts):
 *   ۱) لایهٔ ۱ درخواست‌ها — از checkpoint تا تکمیل (۲۰ صفحه در هر فراخوانی)
 *   ۲) غنی‌سازی تماس آگهی‌ها + درخواست‌ها (موازی، ۲۰۰ ردیف هرکدام)
 *
 * اجرا: bun scripts/p6513-complete-transfer.ts [--max-minutes N] [--wait-for-token]
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/custom.db" } },
});

const args = process.argv.slice(2);
const maxMinutesIdx = args.indexOf("--max-minutes");
const MAX_MINUTES = maxMinutesIdx >= 0 ? Number(args[maxMinutesIdx + 1] ?? 320) : 320;
const WAIT_FOR_TOKEN = args.includes("--wait-for-token");

// ---------- پنجرهٔ شبانه (تهران = UTC+3:30) — فقط برای لاگ، سخت‌گیری نمی‌کنیم ----------
function tehranClock(d: Date): string {
  const shifted = d.getUTCHours() * 60 + d.getUTCMinutes() + 210; // UTC+3:30
  const h = Math.floor(shifted / 60) % 24;
  const m = shifted % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function ts(): string {
  return tehranClock(new Date());
}

// ---------- توکن ARM از صندوقچهٔ ماندگار — هر برش تازه ----------
async function vaultCreds(): Promise<{ accessToken: string; refreshToken: string; updatedAt: Date } | null> {
  const { decryptSecret } = await import("../src/lib/auth/crypto");
  const row = await db.armConnection.findFirst({
    where: { status: "connected", tokenEnc: { not: null } },
    orderBy: { updatedAt: "desc" },
  });
  if (!row?.tokenEnc) return null;
  const accessToken = decryptSecret(row.tokenEnc);
  const refreshToken = row.refreshTokenEnc ? decryptSecret(row.refreshTokenEnc) ?? "" : "";
  return accessToken ? { accessToken, refreshToken, updatedAt: row.updatedAt } : null;
}

/** پروب ارزان: آیا توکن زنده است؟ (تک‌GET سبک) */
async function probeToken(accessToken: string): Promise<boolean> {
  try {
    const { getMelkProvider } = await import("../src/lib/melk-api/provider");
    const provider = getMelkProvider();
    await provider.listExperts(accessToken, { limit: 1, offset: 0 });
    return true;
  } catch {
    return false;
  }
}

/** تمدید توکن + ذخیرهٔ خودکار در صندوقچه — خروجی توکن تازه یا null */
async function refreshAndPersist(refreshToken: string): Promise<string | null> {
  if (!refreshToken) return null;
  try {
    const { getMelkProvider } = await import("../src/lib/melk-api/provider");
    const { persistArmTokensToVault } = await import("../src/lib/auth/arm-vault");
    const provider = getMelkProvider();
    const fresh = await provider.refreshArmToken(refreshToken);
    if (!fresh.accessToken) return null;
    await persistArmTokensToVault({ ownerKey: "master", armTokens: fresh, personnelCode: "master" });
    console.log(`[${ts()}][token] ✓ تمدید شد و در صندوقچه ذخیره شد (${fresh.accessToken.length}B)`);
    return fresh.accessToken;
  } catch (e) {
    console.error(`[${ts()}][token] تمدید ناموفق:`, e instanceof Error ? e.message?.slice(0, 80) : e);
    return null;
  }
}

/**
 * نظارت بر صندوقچه تا اتصال تازهٔ مالک — هر ۳۰ ثانیه امضای توکن بررسی می‌شود؛
 * تغییر امضا + پروب زنده ⇒ بازگشت توکن تازه. مهلت = deadline کلی.
 */
async function waitForReconnection(
  deadSignature: string,
  deadline: () => boolean
): Promise<{ accessToken: string; refreshToken: string } | null> {
  console.log(`[${ts()}][wait] توکن ARM مرده است (دسترسی + تمدید). نظارت بر صندوقچه آغاز شد.`);
  console.log(`[${ts()}][wait] ⚠️ مالک محترم: از «تنظیمات عمومی → اتصال به سامانه ملک تبریز» با کد دسترسی خود وارد شوید.`);
  console.log(`[${ts()}][wait] به‌محض اتصال، تکمیل انتقال (۱۳هزار+ درخواست + غنی‌سازی ۱۰هزار+ آگهی) خودکار ادامه می‌یابد.`);
  let lastNotice = 0;
  while (!deadline()) {
    await sleep(30_000);
    const creds = await vaultCreds();
    if (!creds) continue;
    const signature = `${creds.accessToken.length}:${creds.updatedAt.toISOString()}`;
    if (signature === deadSignature) continue;
    // توکن تغییر کرده — پروب زنده بودن
    if (await probeToken(creds.accessToken)) {
      console.log(`[${ts()}][wait] ✓ اتصال تازهٔ ARM شناسایی شد (${creds.accessToken.length}B در ${creds.updatedAt.toISOString()}) — ادامهٔ انتقال`);
      return { accessToken: creds.accessToken, refreshToken: creds.refreshToken };
    }
    // تغییر کرده ولی هنوز مرده (مثلاً رکورد دیگری) — امضای تازه را ملاک قرار بده
    if (Date.now() - lastNotice > 300_000) {
      console.log(`[${ts()}][wait] هنوز در انتظار اتصال زندهٔ ARM… (checkpoint محفوظ است)`);
      lastNotice = Date.now();
    }
  }
  console.error(`[${ts()}][wait] مهلت تمام شد — اتصال ARM برقرار نشد. checkpoint محفوظ؛ این اسکریپت را بعد از اتصال دوباره اجرا کنید.`);
  return null;
}

async function main() {
  const startedAt = Date.now();
  console.log(`[${ts()}] تکمیل انتقال P6.5-11/12 — سقف ${MAX_MINUTES} دقیقه · ازسرگیری از checkpoint${WAIT_FOR_TOKEN ? " · نظارت اتصال فعال" : ""}`);
  const deadline = () => Date.now() - startedAt > MAX_MINUTES * 60_000;

  const creds0 = await vaultCreds();
  if (!creds0) {
    console.error(`[${ts()}] صندوقچهٔ ARM خالی است — ابتدا از تنظیمات عمومی به ARM متصل شوید.`);
    process.exit(1);
  }

  // ماژول‌های خط لوله (پس از آماده‌شدن DB)
  const { syncWithRefresh } = await import("../src/lib/melk-api/sync");
  const { syncArmRequestsCatalog, enrichArmListings, enrichArmRequests } = await import("../src/lib/melk-api/arm-catalog");
  const { persistArmTokensToVault } = await import("../src/lib/auth/arm-vault");

  // ---- ۰) بررسی توکن اولیه + همگام‌سازی اصلی ----
  let creds = { accessToken: creds0.accessToken, refreshToken: creds0.refreshToken };
  if (!(await probeToken(creds.accessToken))) {
    console.log(`[${ts()}][main] توکن فعلی مرده است — تلاش برای تمدید…`);
    const fresh = await refreshAndPersist(creds.refreshToken);
    if (fresh) {
      creds = { accessToken: fresh, refreshToken: creds.refreshToken };
    } else if (WAIT_FOR_TOKEN) {
      const reconnected = await waitForReconnection(`${creds.accessToken.length}:${creds0.updatedAt.toISOString()}`, deadline);
      if (!reconnected) process.exit(2);
      creds = reconnected;
    } else {
      console.error(`[${ts()}] توکن ARM منقضی و تمدید ناموفق — با --wait-for-token اجرا کنید یا از تنظیمات متصل شوید.`);
      process.exit(2);
    }
  }

  try {
    const r = await syncWithRefresh(creds.accessToken, creds.refreshToken);
    console.log(`[${ts()}][main] ok=${r.sync.ok} tx=${r.sync.transactions} ex=${r.sync.experts} ct=${r.sync.contracts}${r.sync.errorCode ? ` err=${r.sync.errorCode}` : ""}`);
    if (r.newArmToken) {
      await persistArmTokensToVault({ ownerKey: "master", armTokens: { accessToken: r.newArmToken, refreshToken: creds.refreshToken }, personnelCode: "master" });
      creds = { accessToken: r.newArmToken, refreshToken: creds.refreshToken };
      console.log(`[${ts()}][main] توکن تازه در صندوقچه ذخیره شد`);
    }
  } catch (e) {
    console.error(`[${ts()}][main] خطا (ادامه با کاتالوگ):`, e instanceof Error ? e.message : e);
  }

  // ---- حلقهٔ برش‌ها ----
  let noProgress = 0;
  let chunk = 0;
  let requestsComplete = false;

  while (!deadline()) {
    chunk += 1;
    // توکن تازه از صندوقچه (اگر جایی دیگر تمدید شده باشد)
    const freshCreds = await vaultCreds();
    if (freshCreds) creds = { accessToken: freshCreds.accessToken, refreshToken: freshCreds.refreshToken };

    let progressed = false;
    let unauthorized = false;

    // ---- ۱) لایهٔ ۱ درخواست‌ها (تا تکمیل) ----
    if (!requestsComplete) {
      const cp = await db.syncCheckpoint.findUnique({ where: { id: "requests" } });
      const done = cp?.phase === "complete" && (cp.lastCompletedPage ?? 0) >= (cp.totalPages ?? 0);
      if (done) {
        requestsComplete = true;
        console.log(`[${ts()}][requests] ✓ لایهٔ ۱ از پیش کامل است (${cp?.lastCompletedPage}/${cp?.totalPages} صفحه، ${cp?.totalAtSource} رکورد)`);
      } else {
        const res = await syncArmRequestsCatalog(creds.accessToken, { maxPages: 20 }).catch((e) => {
          console.error(`[${ts()}][requests] استثنا:`, e instanceof Error ? e.message?.slice(0, 80) : e);
          return null;
        });
        if (res) {
          if (res.errorCode === "UNAUTHORIZED") unauthorized = true;
          console.log(
            `[${ts()}][requests] صفحه ${res.checkpoint?.lastCompletedPage ?? "?"}/${res.checkpoint?.totalPages ?? "?"} · +${res.fetched} رکورد${res.resumedFromPage ? ` (ازسرگیری از ${res.resumedFromPage})` : ""}${res.errorCode ? ` err=${res.errorCode}` : ""}`
          );
          if (res.fetched > 0) progressed = true;
          if (res.checkpoint?.phase === "complete") {
            requestsComplete = true;
            console.log(`[${ts()}][requests] ✓ چرخهٔ لایهٔ ۱ کامل شد — ${res.totalAtSource} رکورد در مبدأ`);
          }
        }
      }
    }

    // ---- ۲) غنی‌سازی تماس (هر دو کاتالوگ، موازی) ----
    const [el, er] = await Promise.all([
      enrichArmListings(creds.accessToken, { maxRows: 200 }).catch((e) => {
        const code = (e as { code?: string })?.code;
        if (code === "UNAUTHORIZED") unauthorized = true;
        return null;
      }),
      enrichArmRequests(creds.accessToken, { maxRows: 200 }).catch((e) => {
        const code = (e as { code?: string })?.code;
        if (code === "UNAUTHORIZED") unauthorized = true;
        return null;
      }),
    ]);
    console.log(
      `[${ts()}][enrich] آگهی‌ها +${el?.enriched ?? 0}/بی‌داده ${el?.missingAtSource ?? 0} (ماند ${el?.remaining ?? "?"}) · درخواست‌ها +${er?.enriched ?? 0}/بی‌داده ${er?.missingAtSource ?? 0} (ماند ${er?.remaining ?? "?"})`
    );
    if ((el?.enriched ?? 0) + (el?.missingAtSource ?? 0) > 0 || (er?.enriched ?? 0) + (er?.missingAtSource ?? 0) > 0) progressed = true;

    // ---- انقضای توکن ⇒ تمدید / انتظار اتصال تازه ----
    if (unauthorized) {
      const fresh = await refreshAndPersist(creds.refreshToken);
      if (fresh) {
        creds = { accessToken: fresh, refreshToken: creds.refreshToken };
        continue; // برش بعدی با توکن تازه
      }
      if (WAIT_FOR_TOKEN) {
        const deadSig = `${creds.accessToken.length}:${new Date().toISOString()}`;
        const reconnected = await waitForReconnection(deadSig, deadline);
        if (reconnected) {
          creds = reconnected;
          continue;
        }
        break;
      }
      console.error(`[${ts()}] توکن منقضی و تمدید ناموفق — checkpoint محفوظ؛ دوباره اجرا کنید یا از تنظیمات متصل شوید.`);
      break;
    }

    // ---- پایان کامل؟ ----
    const enrichDoneL = el ? el.remaining === 0 : false;
    const enrichDoneR = er ? er.remaining === 0 : false;
    if (requestsComplete && enrichDoneL && enrichDoneR) {
      console.log(`[${ts()}] ✓✓ تکمیل کامل: لایهٔ ۱ درخواست‌ها + غنی‌سازی هر دو کاتالوگ انجام شد`);
      break;
    }

    // ---- بی‌پیشرفتی ⇒ احتمالاً سرور/توکن مرده ----
    noProgress = progressed ? 0 : noProgress + 1;
    if (noProgress >= 5) {
      console.error(`[${ts()}] ۵ برش پیاپی بدون پیشرفت — توقف (سرور ARM کند/مرده). checkpoint محفوظ؛ دوباره اجرا کنید.`);
      break;
    }
  }

  // ---- گزارش نهایی ----
  const [reqCp, propTotal, propPending, reqTotal, reqPending] = await Promise.all([
    db.syncCheckpoint.findUnique({ where: { id: "requests" } }),
    db.propertyRecord.count(),
    db.propertyRecord.count({ where: { extractionBatchId: null } }),
    db.requestRecord.count({ where: { source: "arm" } }),
    db.requestRecord.count({ where: { source: "arm", extractionBatchId: null } }),
  ]);
  const mins = Math.round((Date.now() - startedAt) / 60_000);
  console.log(`\n[${ts()}] ===== گزارش نهایی (${mins} دقیقه · ${chunk} برش) =====`);
  console.log(`درخواست‌ها (لایه ۱): ${reqTotal} رکورد · checkpoint=${reqCp?.phase} صفحه ${reqCp?.lastCompletedPage}/${reqCp?.totalPages} · مبدأ=${reqCp?.totalAtSource}`);
  console.log(`درخواست‌ها (غنی‌سازی): ${reqTotal - reqPending}/${reqTotal} تکمیل · مانده=${reqPending}`);
  console.log(`آگهی‌ها (غنی‌سازی): ${propTotal - propPending}/${propTotal} تکمیل · مانده=${propPending}`);
  const allDone = reqCp?.phase === "complete" && reqPending === 0 && propPending === 0;
  console.log(`وضعیت نهایی: ${allDone ? "✓ کامل" : "⏳ ناتمام — اجرای مجدد همین اسکریپت از همان نقطه ادامه می‌یابد"}`);
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
