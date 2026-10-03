/**
 * دیمن پایدار اتصال و انتقال داده — P6530 / گام ۶ (نکتهٔ بسیار مهم ۱)
 * ---------------------------------------------------------------------------
 * «قراردادن دمون پایدار برای اتصالات و افزایش سرعت انتقال اطلاعات بویژه
 * برای اتصالات سامانه‌های ملک تبریز برای بروزرسانی سریع داده‌ها»
 *
 * الگوی دیمن مغز هوشمند (فاز ۹ — درون‌فرایندی، بدون پورت مجزا):
 *   · هر تیک (پیش‌فرض ۳ دقیقه؛ MELK_CATALOG_DAEMON_INTERVAL_MINUTES):
 *       ۱) اگر نشست زندهٔ دارای توکن ARM وجود داشته باشد، یک «برش محدود»
 *          از همگام‌سازی کاتالوگ آگهی‌ها و درخواست‌ها (چرخ‌های checkpointدار)
 *          و یک برش غنی‌سازی اجرا می‌شود — کار هر تیک کوچک و سریع است.
 *       ۲) بدون توکن زنده → فقط بررسی اتصال (heartbeat)؛ به‌محض اتصال تازهٔ
 *          مالک از «تنظیمات عمومی»، تیک بعدی خودکار انتقال را ادامه می‌دهد.
 *   · ازسرگیری از آخرین صفحهٔ کامل (checkpoint) + گارد پوشش ۹۰٪ (گام ۲) —
 *     شکست‌های 502/504 سامانه مبدأ در تیک بعدی ادامه می‌یابند (خوددرمانی).
 *   · هم‌پوشانی ممنوع: قفل درون‌فرایندی — اگر تیک قبلی هنوز کار می‌کند،
 *     تیک جدید رد می‌شود (هرگز دو انتقال موازی به سامانه مبدأ نمی‌رود).
 *   · خطا: هرگز بوت/درخواست را نمی‌شکند؛ در وضعیت دیمن گزارش می‌شود.
 *
 * فعال‌سازی: پیش‌فرض روشن (MELK_CATALOG_DAEMON=disabled برای خاموشی)؛
 * شاهد وضعیت: /api/intelligence/status → daemon.catalog
 */

import type { PrismaClient } from "@prisma/client";
import { syncArmListingsCatalog, syncArmRequestsCatalog, enrichArmListings, enrichArmRequests } from "./arm-catalog";
import { sessionToArmTokens } from "@/lib/auth/session";
import { logEvent } from "@/lib/logger";
// P6545/گام۱ — افزودنی: وضعیت کار پایدار در DB (BLOCK 1.1) + رویدادهای فرصت (BLOCK 1.4)
import { JobStateService, JOB_IDS } from "./job-state";
import { emitEvent } from "@/lib/intelligence/blackboard";

/** فاصلهٔ پیش‌فرض تیک‌ها — دقیقه */
const DEFAULT_INTERVAL_MINUTES = 3;
/** سقف صفحات فهرست در هر تیک (کار کوچک و سریع) */
const PAGES_PER_TICK = 2;
/** سقف ردیف غنی‌سازی هر موجودیت در هر تیک */
const ENRICH_ROWS_PER_TICK = 25;

export interface CatalogDaemonStatus {
  enabled: boolean;
  running: boolean;
  lastTickAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  ticks: number;
  /** آخرین نتیجهٔ برش‌ها (برای شفافیت UI) */
  lastResult: {
    listingsPages: number;
    requestsPages: number;
    listingsEnriched: number;
    requestsEnriched: number;
  } | null;
}

interface DaemonGlobal {
  __melkCatalogDaemon?: {
    started: boolean;
    lock: boolean;
    status: CatalogDaemonStatus;
  };
}

const g = globalThis as unknown as DaemonGlobal;

function state() {
  if (!g.__melkCatalogDaemon) {
    g.__melkCatalogDaemon = {
      started: false,
      lock: false,
      status: {
        enabled: true,
        running: false,
        lastTickAt: null,
        lastSuccessAt: null,
        lastError: null,
        ticks: 0,
        lastResult: null,
      },
    };
  }
  return g.__melkCatalogDaemon;
}

/** وضعیت فعلی دیمن (برای endpoint شفافیت) */
export function catalogDaemonStatus(): CatalogDaemonStatus {
  return { ...state().status };
}

/** تیک واحد دیمن — قابل فراخوانی مستقیم در تست */
export async function catalogDaemonTick(db: PrismaClient): Promise<CatalogDaemonStatus> {
  const s = state();
  if (s.lock) {
    // تیک قبلی هنوز کار می‌کند — رد (هم‌پوشانی ممنوع)
    return { ...s.status };
  }
  s.lock = true;
  s.status.running = true;
  s.status.lastTickAt = Date.now();
  s.status.ticks += 1;
  const result = { listingsPages: 0, requestsPages: 0, listingsEnriched: 0, requestsEnriched: 0 };
  // P6545/BLOCK 1.1 — وضعیت کار در DB (پایدار در برابر ری‌استارت)
  const jobs = new JobStateService(db);
  try {
    // نشست زندهٔ دارای توکن ARM (اخیرترین)
    const live = await db.session.findFirst({
      where: { revoked: false, expiresAt: { gt: new Date() }, armTokenEnc: { not: null } },
      orderBy: { lastSeenAt: "desc" },
    });
    if (live) {
      const armTokens = sessionToArmTokens(live);
      if (armTokens?.accessToken) {
        // برش محدود فهرست آگهی‌ها + درخواست‌ها (هر دو checkpointدار — ازسرگیری خودکار)
        try {
          const lres = await syncArmListingsCatalog(armTokens.accessToken, { maxPages: PAGES_PER_TICK });
          result.listingsPages = lres.pages;
          await jobs.upsert({
            jobId: JOB_IDS.catalogListings,
            jobKind: "catalog",
            status: lres.checkpoint?.phase === "complete" ? "done" : "running",
            lastCompletedPage: lres.checkpoint?.lastCompletedPage ?? 0,
            totalPages: lres.checkpoint?.totalPages ?? 0,
            detail: { pages: lres.pages, created: lres.created, updated: lres.updated, resumedFromPage: lres.resumedFromPage, cycleId: lres.cycleId },
          });
          // P6545/BLOCK 1.4 — رویداد فرصت برای آگهی‌های تازه (صفر اجرای خودکار)
          if (lres.created > 0) await emitEvent("listing.created", { created: lres.created, pages: lres.pages, cycleId: lres.cycleId });
        } catch (e) {
          s.status.lastError = (e as { code?: string })?.code ?? "LISTINGS_SLICE_FAILED";
          await jobs.upsert({ jobId: JOB_IDS.catalogListings, jobKind: "catalog", status: "failed", detail: { error: s.status.lastError } }).catch(() => {});
        }
        try {
          const rres = await syncArmRequestsCatalog(armTokens.accessToken, { maxPages: PAGES_PER_TICK });
          result.requestsPages = rres.pages;
          await jobs.upsert({
            jobId: JOB_IDS.catalogRequests,
            jobKind: "catalog",
            status: rres.checkpoint?.phase === "complete" ? "done" : "running",
            lastCompletedPage: rres.checkpoint?.lastCompletedPage ?? 0,
            totalPages: rres.checkpoint?.totalPages ?? 0,
            detail: { pages: rres.pages, created: rres.created, updated: rres.updated, resumedFromPage: rres.resumedFromPage, cycleId: rres.cycleId },
          });
          if (rres.created > 0) await emitEvent("request.created", { created: rres.created, pages: rres.pages, cycleId: rres.cycleId });
        } catch (e) {
          s.status.lastError = (e as { code?: string })?.code ?? "REQUESTS_SLICE_FAILED";
          await jobs.upsert({ jobId: JOB_IDS.catalogRequests, jobKind: "catalog", status: "failed", detail: { error: s.status.lastError } }).catch(() => {});
        }
        // برش غنی‌سازی (تماس مالک/متقاضی + مناطق + قیمت + دسته‌بندی)
        try {
          const le = await enrichArmListings(armTokens.accessToken, { maxRows: ENRICH_ROWS_PER_TICK });
          result.listingsEnriched = le.enriched;
        } catch (e) {
          s.status.lastError = (e as { code?: string })?.code ?? "ENRICH_LISTINGS_FAILED";
        }
        try {
          const re = await enrichArmRequests(armTokens.accessToken, { maxRows: ENRICH_ROWS_PER_TICK });
          result.requestsEnriched = re.enriched;
        } catch (e) {
          s.status.lastError = (e as { code?: string })?.code ?? "ENRICH_REQUESTS_FAILED";
        }
      }
    }
    s.status.lastResult = result;
    s.status.lastSuccessAt = Date.now();
    s.status.lastError = null;
  } catch (err) {
    s.status.lastError = (err as Error)?.message?.slice(0, 120) ?? "UNKNOWN";
    logEvent({
      level: "warn",
      category: "sync",
      operation: "catalog-daemon-tick",
      status: "fail",
      errorCode: "DAEMON_TICK_FAILED",
      detail: { error: s.status.lastError },
    });
  } finally {
    s.lock = false;
    s.status.running = false;
  }
  return { ...s.status };
}

/** راه‌اندازی دیمن — یک‌بار در عمر پروسه (از instrumentation) */
export function startCatalogDaemon(db: PrismaClient): void {
  const s = state();
  if (s.started) return;
  if (process.env.MELK_CATALOG_DAEMON === "disabled") {
    s.status.enabled = false;
    s.started = true;
    return;
  }
  s.started = true;
  const minutes = Number(process.env.MELK_CATALOG_DAEMON_INTERVAL_MINUTES ?? String(DEFAULT_INTERVAL_MINUTES));
  const intervalMs = (Number.isFinite(minutes) && minutes >= 1 ? minutes : DEFAULT_INTERVAL_MINUTES) * 60 * 1000;
  // اجرای اولیه پس از ۶۰ ثانیه (پس از آماده‌شدن کامل سرور) و سپس دوره‌ای
  setTimeout(() => void catalogDaemonTick(db), 60_000);
  setInterval(() => void catalogDaemonTick(db), intervalMs);
  logEvent({
    category: "sync",
    operation: "catalog-daemon-start",
    status: "ok",
    detail: { intervalMinutes: Number.isFinite(minutes) ? minutes : DEFAULT_INTERVAL_MINUTES, inProcess: true },
  });
}
