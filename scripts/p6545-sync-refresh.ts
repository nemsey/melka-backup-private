/**
 * P6545 / BLOCK 0.2 — تصمیم ۴ شورا (جلسه ۰۳۳): همگام‌سازی فوری داده
 * ---------------------------------------------------------------------------
 * · کهنگی دادهٔ کشف‌شده توسط P10: ~۸۷ ساعت (latestProp.syncedAt = ۱۴۰۵/۰۷/۷)
 * · دیمن همگام‌سازی فوری: بازیابی توکن ARM از خزانهٔ ماندگار (master)
 * · checkpoint + resumedFrom — صفر شروع از صفر
 * · شاهد: download/p6545/sync-refresh.json
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { restoreArmTokensFromVault } from "../src/lib/auth/arm-vault";
import { syncArmListingsCatalog, syncArmRequestsCatalog } from "../src/lib/melk-api/arm-catalog";

const db = new PrismaClient();
const OUT = "/home/z/my-project/download/p6545";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const startedAt = new Date().toISOString();

  // ۱) وضعیت پیش از همگام‌سازی (شاهد قبل)
  const before = {
    latestPropertySyncedAt: (await db.propertyRecord.findFirst({ orderBy: { syncedAt: "desc" }, select: { syncedAt: true } }))?.syncedAt,
    propertyCount: await db.propertyRecord.count(),
    requestCount: await db.requestRecord.count(),
    listingsCheckpoint: await db.syncCheckpoint.findUnique({ where: { id: "listings" } }),
    requestsCheckpoint: await db.syncCheckpoint.findUnique({ where: { id: "requests" } }),
  };
  const stalenessHoursBefore = before.latestPropertySyncedAt
    ? Math.round(((Date.now() - new Date(before.latestPropertySyncedAt).getTime()) / 3_600_000) * 10) / 10
    : null;

  // ۲) بازیابی توکن ARM از خزانهٔ ماندگار (کلید master — SEC-3: فقط همان هویت)
  //    restoreArmTokensFromVault نیازمند repository است؛ مستقیم از ArmConnection می‌خوانیم
  const { decryptSecret } = await import("../src/lib/auth/crypto");
  const conn = await db.armConnection.findFirst({ where: { ownerKey: "master" }, orderBy: { updatedAt: "desc" as any } });
  let token = conn ? decryptSecret(conn.tokenEnc) : null;
  const refreshToken = conn?.refreshTokenEnc ? decryptSecret(conn.refreshTokenEnc) : null;

  // ۴-الف) اگر توکن منقضی بود → تمدید با refresh token (زنجیرهٔ ماندگاری P6.5-11)
  let tokenRefreshed = false;
  let refreshError: string | null = null;
  if (token) {
    // پروب سریع اعتبار توکن: صفحهٔ ۱ کاتالوگ آگهی‌ها
    const probe = await syncArmListingsCatalog(token, { pageSize: 1, maxPages: 1 });
    if (!probe.ok && probe.errorCode === "UNAUTHORIZED" && refreshToken) {
      try {
        const { getMelkProvider } = await import("../src/lib/melk-api/provider");
        const refreshed = await getMelkProvider().refreshArmToken(refreshToken);
        token = refreshed.accessToken;
        tokenRefreshed = true;
        // ذخیرهٔ توکن تازه در خزانه (زنجیره هرگز نشکند)
        const { encryptSecret } = await import("../src/lib/auth/crypto");
        await db.armConnection.update({
          where: { id: conn!.id },
          data: {
            tokenEnc: encryptSecret(refreshed.accessToken),
            refreshTokenEnc: refreshed.refreshToken ? encryptSecret(refreshed.refreshToken) : undefined,
            updatedAt: new Date(),
          },
        });
      } catch (e: unknown) {
        refreshError = e instanceof Error ? e.message : String(e);
      }
    }
  }

  const result: Record<string, unknown> = {
    case: "P6545-sync-refresh",
    councilDecision: "جلسه ۰۳۳ — تصمیم ۴: تأیید فوری همگام‌سازی با قید دادهٔ مقدس (checkpoint + resumedFrom)",
    startedAt,
    stalenessHoursBefore,
    vaultTokenAvailable: Boolean(token),
    tokenRefreshed,
    refreshError,
    before: {
      latestPropertySyncedAt: before.latestPropertySyncedAt,
      propertyCount: before.propertyCount,
      requestCount: before.requestCount,
      listingsCheckpoint: before.listingsCheckpoint
        ? { phase: (before.listingsCheckpoint as any).phase, lastCompletedPage: (before.listingsCheckpoint as any).lastCompletedPage }
        : null,
      requestsCheckpoint: before.requestsCheckpoint
        ? { phase: (before.requestsCheckpoint as any).phase, lastCompletedPage: (before.requestsCheckpoint as any).lastCompletedPage }
        : null,
    },
  };

  if (!token) {
    result.ok = false;
    result.error = "هیچ توکن ARM در خزانهٔ ماندگار (master) موجود نیست — ورود OTP مالک لازم است؛ صفر شروع از صفر رخ نداده (چک‌پوینت‌ها دست‌نخورده‌اند)";
  } else {
    // ۳) همگام‌سازی کاتالوگ با ادامه از چک‌پوینت (resumedFromPage در نتیجه)
    try {
      const listings = await syncArmListingsCatalog(token, { pageSize: 500, maxPages: 6 });
      result.listings = listings;
    } catch (e: unknown) {
      result.listings = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    try {
      const requests = await syncArmRequestsCatalog(token, { pageSize: 500, maxPages: 6 });
      result.requests = requests;
    } catch (e: unknown) {
      result.requests = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // ۴) وضعیت پس از همگام‌سازی (شاهد بعد)
  const afterProp = (await db.propertyRecord.findFirst({ orderBy: { syncedAt: "desc" }, select: { syncedAt: true } }))?.syncedAt;
  result.after = {
    latestPropertySyncedAt: afterProp,
    propertyCount: await db.propertyRecord.count(),
    requestCount: await db.requestRecord.count(),
    listingsCheckpoint: await db.syncCheckpoint.findUnique({ where: { id: "listings" } }),
    requestsCheckpoint: await db.syncCheckpoint.findUnique({ where: { id: "requests" } }),
  };
  result.stalenessHoursAfter = afterProp
    ? Math.round(((Date.now() - new Date(afterProp).getTime()) / 3_600_000) * 10) / 10
    : null;
  result.finishedAt = new Date().toISOString();

  writeFileSync(`${OUT}/sync-refresh.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ok: result.ok ?? true, stalenessHoursBefore, stalenessHoursAfter: result.stalenessHoursAfter, listings: (result.listings as any)?.ok, requests: (result.requests as any)?.ok }, null, 2));
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); }).finally(() => db.$disconnect());
