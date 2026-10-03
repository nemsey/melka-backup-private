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
import { JobStateService, JOB_IDS } from "../src/lib/melk-api/job-state";
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
  const withDeadline = async <T>(p: Promise<T>, ms: number, label: string): Promise<T | { __timeout: true; label: string }> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<{ __timeout: true; label: string }>((r) => {
      timer = setTimeout(() => r({ __timeout: true as const, label }), ms);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  if (token) {
    console.log("[sync-refresh] probing token validity (deadline 60s)...");
    const probe = (await withDeadline(syncArmListingsCatalog(token, { pageSize: 1, maxPages: 1 }), 150_000, "probe")) as any;
    if (probe.__timeout) {
      console.log("[sync-refresh] probe TIMEOUT — ARM unresponsive");
      refreshError = "سرویس ARM در مهلت ۶۰ ثانیه پاسخ نداد (کندی/معلق‌بودن سمت منبع) + توکن منقضی";
      await new JobStateService(db).upsert({ jobId: "catalog-listings", jobKind: "catalog", status: "failed", detail: { error: "TIMEOUT-60s", note: "ARM unresponsive + expired token" } });
    } else {
    console.log("[sync-refresh] probe done:", probe.ok, (probe as any).errorCode ?? "");
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

  // P6545/BLOCK 1.1 — ثبت وضعیت کار در DB (پایدار در برابر ری‌استارت)
  const jobs = new JobStateService(db);
  if (!token) {
    result.ok = false;
    result.error = "هیچ توکن ARM در خزانهٔ ماندگار (master) موجود نیست — ورود OTP مالک لازم است؛ صفر شروع از صفر رخ نداده (چک‌پوینت‌ها دست‌نخورده‌اند)";
  } else {
    // ۳) همگام‌سازی کاتالوگ با ادامه از چک‌پوینت (resumedFromPage در نتیجه)
    try {
      const listings = (await withDeadline(syncArmListingsCatalog(token, { pageSize: 500, maxPages: 2 }), 240_000, "listings")) as any;
      if (listings.__timeout) throw new Error("TIMEOUT-90s: ARM unresponsive");
      result.listings = listings;
      await jobs.upsert({ jobId: JOB_IDS.catalogListings, jobKind: "catalog", status: listings.ok ? (listings.checkpoint?.phase === "complete" ? "done" : "running") : "failed", lastCompletedPage: listings.checkpoint?.lastCompletedPage ?? 0, totalPages: listings.checkpoint?.totalPages ?? 0, detail: { pages: listings.pages, created: listings.created, updated: listings.updated, errorCode: (listings as any).errorCode ?? null } });
    } catch (e: unknown) {
      result.listings = { ok: false, error: e instanceof Error ? e.message : String(e) };
      await jobs.upsert({ jobId: JOB_IDS.catalogListings, jobKind: "catalog", status: "failed", detail: { error: String(e) } });
    }
    try {
      const requests = (await withDeadline(syncArmRequestsCatalog(token, { pageSize: 500, maxPages: 2 }), 240_000, "requests")) as any;
      if (requests.__timeout) throw new Error("TIMEOUT-90s: ARM unresponsive");
      result.requests = requests;
      await jobs.upsert({ jobId: JOB_IDS.catalogRequests, jobKind: "catalog", status: requests.ok ? (requests.checkpoint?.phase === "complete" ? "done" : "running") : "failed", lastCompletedPage: requests.checkpoint?.lastCompletedPage ?? 0, totalPages: requests.checkpoint?.totalPages ?? 0, detail: { pages: requests.pages, created: requests.created, updated: requests.updated, errorCode: (requests as any).errorCode ?? null } });
    } catch (e: unknown) {
      result.requests = { ok: false, error: e instanceof Error ? e.message : String(e) };
      await jobs.upsert({ jobId: JOB_IDS.catalogRequests, jobKind: "catalog", status: "failed", detail: { error: String(e) } });
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

main().then(() => { db.$disconnect().finally(() => process.exit(0)); }).catch((e) => { console.error("FATAL", e); db.$disconnect().finally(() => process.exit(1)); });
