/**
 * p6510-catalog-sync.ts — نخستین استخراج کامل کاتالوگ‌های ARM (P6.5-10)
 * ---------------------------------------------------------------------------
 * پرکردن داده واقعی کاشی‌های «آگهی‌های ملک تبریز» و «درخواست‌های ملک تبریز»:
 *
 *   لایه ۱ — فهرست کامل (سریع): properties/list + requests/list تا سقف صفحه،
 *            pageSize=500، نرخ‌محدود ۲۰۰ms ⇒ ~۶۴ فراخوانی برای ۳۱٬۷۵۵ رکورد
 *   لایه ۲ — برش اول غنی‌سازی: تماس مالک/درخواست‌دهنده برای جدیدترین رکوردها
 *
 * حالت‌ها:
 *   --slice N   فقط برش غنی‌سازی (پیش‌فرض ۱۵۰ از هر موجودیت)
 *   --night     حالت شبانهٔ کامل: پنجرهٔ ۲۲:۰۰–۰۶:۰۰ تهران + غنی‌سازی پیوسته
 *               تا ۰۵:۵۰ یا اتمام رکوردها (عین انضباط sync شبانهٔ پروژه)
 *
 * شاهد: ARM_CATALOG_SYNC در AuditLog با personnelCode نشست توکن‌دار.
 */
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { armCall } from "../src/lib/melk-api/client";
import { getMelkApiConfig } from "../src/lib/melk-api/config";
import {
  enrichArmListings,
  enrichArmRequests,
  syncArmListingsCatalog,
  syncArmRequestsCatalog,
} from "../src/lib/melk-api/arm-catalog";

const prisma = new PrismaClient();

function log(o: unknown) {
  console.log(JSON.stringify(o));
}

function inNightWindow(): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", hour: "numeric", hour12: false }).format(new Date()));
  return hour >= 22 || hour < 6;
}

function hoursUntilWindowEnd(): number {
  const now = new Date();
  const tehran = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tehran" }));
  const end = new Date(tehran);
  end.setHours(5, 50, 0, 0);
  if (tehran.getHours() >= 22) end.setDate(end.getDate() + 1);
  return Math.max(0, (end.getTime() - tehran.getTime()) / 3_600_000);
}

async function getArmToken(): Promise<{ token: string; code: string; sessionId: string } | null> {
  const sessions = await prisma.session.findMany({
    where: { revoked: false, armTokenEnc: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, personnelCode: true, armTokenEnc: true, armRefreshTokenEnc: true },
  });
  const cfg = getMelkApiConfig();
  for (const s of sessions) {
    if (!s.armTokenEnc || s.armTokenEnc.length < 50) continue;
    const plain = decryptSecret(s.armTokenEnc);
    if (!plain || plain === "null" || plain.length < 20) continue;
    // آزمون زندهٔ توکن (یک GET سبک) + تمدید در صورت انقضا
    try {
      await armCall({ path: "count/badge", baseUrl: cfg.armApiBase, token: plain, timeoutMs: cfg.timeoutMs, maxRetries: 0 });
      return { token: plain, code: s.personnelCode, sessionId: s.id };
    } catch (err) {
      const e = err as { code?: string };
      if (e?.code === "UNAUTHORIZED" && s.armRefreshTokenEnc) {
        const refresh = decryptSecret(s.armRefreshTokenEnc);
        if (refresh && refresh.length > 20) {
          try {
            const rt = await armCall<Record<string, unknown>>({
              path: "authentication/refresh-token",
              baseUrl: cfg.armApiBase,
              method: "POST",
              body: { refreshToken: refresh },
              timeoutMs: cfg.timeoutMs,
              maxRetries: 0,
            });
            const data = rt.data as { token?: string; refreshToken?: string } | null;
            if (data?.token) {
              log({ event: "token-refreshed", session: s.id });
              return { token: data.token, code: s.personnelCode, sessionId: s.id };
            }
          } catch {
            /* نشست بعدی */
          }
        }
      }
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const nightMode = args.includes("--night");
  const sliceOnly = args.includes("--slice");
  // انتخاب موجودیت: --entity=listings|requests|both (پیش‌فرض both)
  const entityArg = args.find((a) => a.startsWith("--entity="));
  const entity = entityArg?.split("=")[1] === "listings" ? "listings" : entityArg?.split("=")[1] === "requests" ? "requests" : "both";
  // سقف صفحات هر اجرا: --pages=N (اجراهای کوتاه مقاوم به محیط کم‌حافظه؛ idempotent)
  const pagesArg = args.find((a) => a.startsWith("--pages="));
  const maxPages = pagesArg ? Math.max(1, Number(pagesArg.split("=")[1]) || 1) : undefined;
  // صفحهٔ شروع: --from-page=N (ازسرگیری برش‌های قبلی؛ upsert همپوشانی مرزی بی‌ضرر است)
  const fromPageArg = args.find((a) => a.startsWith("--from-page="));
  const fromPage = fromPageArg ? Math.max(1, Number(fromPageArg.split("=")[1]) || 1) : undefined;
  const sliceArg = args.find((a) => a.startsWith("--slice="));
  const sliceRows = sliceArg ? Number(sliceArg.split("=")[1]) || 150 : 150;

  log({ event: "start", mode: nightMode ? "night" : sliceOnly ? "slice" : "initial", tehranHour: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", hour: "numeric", hour12: false }).format(new Date()) });

  const auth = await getArmToken();
  if (!auth) {
    console.error("ABORT: نشست دارای توکن ARM معتبر در پایگاه نیست.");
    process.exit(2);
  }
  log({ event: "session-auth", ok: true, code: auth.code });

  // ---- لایه ۱ — فهرست کامل (در حالت initial/night) ----
  if (!sliceOnly) {
    if (entity !== "requests") {
      const before = await Promise.all([
        prisma.propertyRecord.count(),
        prisma.requestRecord.count({ where: { source: "arm" } }),
      ]);
      log({ event: "before", propertyRecords: before[0], armRequestRecords: before[1] });

      const listingsRes = await syncArmListingsCatalog(auth.token, { pageSize: 500, ...(maxPages ? { maxPages } : {}) });
      log({ event: "listings-list-sync", ...listingsRes });

      if (entity === "listings") {
        await prisma.auditLog.create({
          data: {
            action: "ARM_CATALOG_SYNC",
            actor: auth.code,
            detail: `listings: fetched=${listingsRes.fetched}/${listingsRes.totalAtSource} created=${listingsRes.created} updated=${listingsRes.updated} errors=${listingsRes.errors}`,
            operation: "READ",
            entityType: "arm-catalog",
            recordCount: listingsRes.fetched,
          },
        }).catch(() => undefined);
      }
    }

    if (entity !== "listings") {
      const requestsRes = await syncArmRequestsCatalog(auth.token, { pageSize: 100, ...(maxPages ? { maxPages } : {}), ...(fromPage ? { startPage: fromPage } : {}) }); // پروب: هزینهٔ سرور تقریباً ثابت — صفحهٔ ۱۰۰تایی ۲-۴ برابر کارآتر
      log({ event: "requests-list-sync", ...requestsRes });
      await prisma.auditLog.create({
        data: {
          action: "ARM_CATALOG_SYNC",
          actor: auth.code,
          detail: `requests: fetched=${requestsRes.fetched}/${requestsRes.totalAtSource} created=${requestsRes.created} updated=${requestsRes.updated} errors=${requestsRes.errors}`,
          operation: "READ",
          entityType: "arm-catalog",
          recordCount: requestsRes.fetched,
        },
      }).catch(() => undefined);
    }
  }

  // ---- لایه ۲ — غنی‌سازی ----
  if (nightMode) {
    if (!inNightWindow()) {
      console.error("ABORT: حالت --night فقط در پنجرهٔ ۲۲:۰۰–۰۶:۰۰ تهران (قاعده ۲ §۱.۱۲-ب).");
      process.exit(2);
    }
    const budgetHours = hoursUntilWindowEnd();
    log({ event: "night-budget", hours: Math.round(budgetHours * 10) / 10 });
    const started = Date.now();
    let round = 0;
    while (Date.now() - started < budgetHours * 3_600_000) {
      round += 1;
      const l = await enrichArmListings(auth.token, { maxRows: 250 });
      const r = await enrichArmRequests(auth.token, { maxRows: 250 });
      log({ event: "night-slice", round, listings: l, requests: r });
      await prisma.auditLog.create({
        data: {
          action: "ARM_CATALOG_SYNC",
          actor: auth.code,
          detail: `night slice ${round}: listings +${l.enriched} (remaining=${l.remaining}); requests +${r.enriched} (remaining=${r.remaining})`,
          operation: "READ",
          entityType: "arm-catalog",
          recordCount: l.enriched + r.enriched,
        },
      }).catch(() => undefined);
      if (l.remaining === 0 && r.remaining === 0) {
        log({ event: "night-complete", round });
        break;
      }
      if (l.attempted === 0 && r.attempted === 0 && l.remaining === 0 && r.remaining === 0) break;
    }
  } else {
    const l = await enrichArmListings(auth.token, { maxRows: sliceRows });
    log({ event: "listings-enrich-slice", ...l });
    const r = await enrichArmRequests(auth.token, { maxRows: sliceRows });
    log({ event: "requests-enrich-slice", ...r });
    await prisma.auditLog.create({
      data: {
        action: "ARM_CATALOG_SYNC",
        actor: auth.code,
        detail: `enrich slice: listings +${l.enriched}/${l.attempted} (remaining=${l.remaining}); requests +${r.enriched}/${r.attempted} (remaining=${r.remaining})`,
        operation: "READ",
        entityType: "arm-catalog",
        recordCount: l.enriched + r.enriched,
      },
    }).catch(() => undefined);
  }

  const after = await Promise.all([
    prisma.propertyRecord.count(),
    prisma.requestRecord.count({ where: { source: "arm" } }),
    prisma.propertyRecord.count({ where: { extractionBatchId: null } }),
    prisma.requestRecord.count({ where: { source: "arm", extractionBatchId: null } }),
  ]);
  log({
    event: "after",
    propertyRecords: after[0],
    armRequestRecords: after[1],
    propertyPendingEnrich: after[2],
    requestPendingEnrich: after[3],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
