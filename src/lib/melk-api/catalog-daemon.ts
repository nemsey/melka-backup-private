/**
 * دیمن پایدارساز بروزرسانی — P6530/گام ۶ + P6546/گام پنجم-پ-۴ و گام ششم-۲
 * ---------------------------------------------------------------------------
 * «برای پایداری و استمرار استخراج اطلاعات در بخش بروزرسانی فهرست، دیمن پایداری
 * بروزرسانی را طراحی و پیاده سازی و اجرا کن» — الگوی درون‌فرایندی مغز (فاز ۹).
 *
 * هر تیک (پیش‌فرض ۳ دقیقه؛ MELK_CATALOG_DAEMON_INTERVAL_MINUTES):
 *   ۱) برش محدود کاتالوگ آگهی‌ها + درخواست‌ها (checkpointدار) + غنی‌سازی برشی
 *   ۲) P6546: برش غنی‌سازی صورت‌وضعیت‌های معاملات (tx-info — نوع/مبلغ/طرفین)
 *   ۳) P6546: برش غنی‌سازی استخدام پرسنل PM (personnelInfo — تاریخ استخدام/نقش)
 *   ۴) P6546: هر ۲۰ تیک (~ساعتی) — چرخهٔ کامل سامانهٔ عمومی (melketabriz.com/apu):
 *      یافتن کدهای ملکِ غایب از فهرست آگهی و افزودنشان + غنی‌سازی جزئیات عمومی
 *   ۵) P6546: خنک‌ساز تطبیقی — پس از ۳ شکست پیاپی سمت مبدأ، یک تیک استراحت
 *      (خطاهای گذرای 502/504 هرگز دیمن را نمی‌کشند؛ تیک بعدی از همان نقطه).
 *   · ازسرگیری از آخرین صفحهٔ کامل (checkpoint) + گارد پوشش ۹۰٪ — خوددرمانی.
 *   · هم‌پوشانی ممنوع: قفل درون‌فرایندی.
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
// P6546/گام پنجم-پ-۴ و گام ششم-۲ — پایدارساز بروزرسانی جامع
import { enrichTransactionsInfo } from "./tx-info-enrichment";
import { getPmSyncToken, syncPmPersonnelInfo } from "./pm-acc-sync";
import { syncMelkPublicCatalog } from "./melk-public";
// P6547/گام دوم — همگام‌سازی ساعتی فهرست‌های مرجع انواع ARM (شناسه→نام)
import { syncTypeRegistries } from "./type-registry";

/** فاصلهٔ پیش‌فرض تیک‌ها — دقیقه */
const DEFAULT_INTERVAL_MINUTES = 3;
/** سقف صفحات فهرست در هر تیک (کار کوچک و سریع) */
const PAGES_PER_TICK = 2;
/** سقف ردیف غنی‌سازی هر موجودیت در هر تیک */
const ENRICH_ROWS_PER_TICK = 25;
/** P6546 — سقف ردیف غنی‌سازی صورت‌وضعیت معاملات در هر تیک */
const TX_INFO_ROWS_PER_TICK = 10;
/** P6546 — سقف پرسنل PM (استخدام) در هر تیک */
const PM_INFO_ROWS_PER_TICK = 5;
/** P6546 — هر چند تیک، یک چرخهٔ کامل سامانهٔ عمومی (۳ دقیقه × ۲۰ ≈ ساعتی) */
const PUBLIC_EVERY_N_TICKS = 20;
/** P6546 — خنک‌ساز تطبیقی: پس از این تعداد شکست پیاپی، یک تیک استراحت */
const CONSECUTIVE_FAIL_COOLDOWN = 3;

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
    /** P6546 — برش‌های پایدارساز */
    txInfoEnriched?: number;
    pmInfoEnriched?: number;
    melkPublicNewCodes?: number;
    /** P6547 — تعداد رجیستری‌های مرجع همگام‌شده در این تیک */
    typeRegistriesSynced?: number;
    cooldownSkip?: boolean;
  } | null;
}

interface DaemonGlobal {
  __melkCatalogDaemon?: {
    started: boolean;
    lock: boolean;
    status: CatalogDaemonStatus;
    /** P6546 — شمار شکست‌های پیاپی برای خنک‌ساز تطبیقی */
    consecutiveFails: number;
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
      consecutiveFails: 0,
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
  const result = { listingsPages: 0, requestsPages: 0, listingsEnriched: 0, requestsEnriched: 0, txInfoEnriched: 0, pmInfoEnriched: 0, melkPublicNewCodes: 0, typeRegistriesSynced: 0, cooldownSkip: false };
  // P6545/BLOCK 1.1 — وضعیت کار در DB (پایدار در برابر ری‌استارت)
  const jobs = new JobStateService(db);
  try {
    // P6546/گام پنجم-پ-۴ — خنک‌ساز تطبیقی: پس از شکست‌های پیاپی، یک تیک نفس‌کشیدن
    if (s.consecutiveFails >= CONSECUTIVE_FAIL_COOLDOWN) {
      s.consecutiveFails = 0;
      result.cooldownSkip = true;
      s.status.lastResult = result;
      s.status.lastSuccessAt = Date.now();
      logEvent({
        level: "info",
        category: "sync",
        operation: "update-stabilizer-cooldown",
        status: "ok",
        detail: { message: "خنک‌ساز تطبیقی: یک تیک استراحت پس از شکست‌های پیاپی سمت مبدأ" },
      });
      return { ...s.status };
    }
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
          s.consecutiveFails += 1;
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
          s.consecutiveFails += 1;
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
        // P6546/گام سوم + پ-۴ — برش غنی‌سازی صورت‌وضعیت‌های معاملات (نوع/مبلغ/طرفین)
        try {
          const tx = await enrichTransactionsInfo(armTokens.accessToken, { maxRows: TX_INFO_ROWS_PER_TICK, throttleMs: 400 });
          result.txInfoEnriched = tx.enriched;
        } catch {
          s.status.lastError = "TX_INFO_SLICE_FAILED"; // نرم — تیک بعدی ادامه می‌دهد
        }
      }
    }
    // P6546/گام چهارم — برش استخدام پرسنل PM (توکن ماندگار PM؛ مستقل از نشست)
    try {
      const pmToken = await getPmSyncToken();
      if (pmToken) {
        const pm = await syncPmPersonnelInfo(pmToken, { maxRows: PM_INFO_ROWS_PER_TICK });
        result.pmInfoEnriched = pm.enriched;
      }
    } catch {
      s.status.lastError = "PM_INFO_SLICE_FAILED"; // نرم
    }
    // P6547/گام دوم — چرخهٔ ساعتی فهرست‌های مرجع انواع ARM (tradeType/buildingType/propertyType/…)
    if (s.status.ticks % PUBLIC_EVERY_N_TICKS === 0 && live) {
      try {
        const armTokensForRegistries = sessionToArmTokens(live);
        if (armTokensForRegistries?.accessToken) {
          const reg = await syncTypeRegistries(armTokensForRegistries.accessToken);
          result.typeRegistriesSynced = reg.synced.length;
        }
      } catch {
        s.status.lastError = "TYPE_REGISTRIES_SYNC_FAILED"; // نرم — چرخهٔ بعدی
      }
    }
    // P6546/گام صفر-۱ — چرخهٔ ساعتی سامانهٔ عمومی: یافتن کدهای غایب + افزودن (بدون توکن)
    if (s.status.ticks % PUBLIC_EVERY_N_TICKS === 0) {
      try {
        const pub = await syncMelkPublicCatalog({ maxPages: 40, enrichDetails: true });
        result.melkPublicNewCodes = pub.newCodes.length;
        if (pub.newCodes.length > 0) {
          await emitEvent("listing.created", { created: pub.newCodes.length, source: "melk-public", cycleId: `apu-${Date.now()}` });
        }
      } catch {
        s.status.lastError = "MELK_PUBLIC_CYCLE_FAILED"; // نرم — چرخهٔ ساعتی بعدی
      }
    }
    s.status.lastResult = result;
    s.status.lastSuccessAt = Date.now();
    if (!s.status.lastError) s.consecutiveFails = 0;
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
