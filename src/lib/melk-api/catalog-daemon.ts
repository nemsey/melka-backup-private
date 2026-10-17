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
import { getPmSyncToken } from "./pm-acc-sync";
import { syncExpertDeepInfo } from "@/lib/experts/profile-store";
import { syncMelkPublicCatalog } from "./melk-public";
// P6547/گام دوم — همگام‌سازی ساعتی فهرست‌های مرجع انواع ARM (شناسه→نام)
import { syncTypeRegistries } from "./type-registry";
// PN-010 — کانال وضعیت مشترک Worker (فقط fs/path — بدون چرخهٔ وابستگی)
import { readWorkerStatus } from "@/core/runtime/worker-status";
// PN-029 — حالت آفلینی ملک تبریز (توقف تلاشهای خودکار)

/** فاصلهٔ پیش‌فرض تیک‌ها — دقیقه (PN-002 نکته ۵: لغو محدودیت — ۳→۱) */
const DEFAULT_INTERVAL_MINUTES = 1;
/** سقف صفحات فهرست در هر تیک (نکته ۵: ۲→۱۲) */
const PAGES_PER_TICK = 12;
/** سقف ردیف غنی‌سازی هر موجودیت در هر تیک (نکته ۵: ۲۵→۱۲۰) */
const ENRICH_ROWS_PER_TICK = 120;
/** PN-002 — برش تکمیل ستون‌های ناقص M2 در هر تیک (نکته ۵: ۶۰→۲۴۰) */
const COMPLETION_ROWS_PER_TICK = 240;
/** P6546 — سقف ردیف غنی‌سازی صورت‌وضعیت معاملات در هر تیک (نکته ۵: ۱۰→۴۰) */
const TX_INFO_ROWS_PER_TICK = 40;
/** P6546 — سقف پرسنل PM (استخدام) در هر تیک (نکته ۵: ۵→۲۰) */
const PM_INFO_ROWS_PER_TICK = 20;
/** P6546 — هر چند تیک، یک چرخهٔ کامل سامانهٔ عمومی (نکته ۵: ۲۰→۱۰) */
const PUBLIC_EVERY_N_TICKS = 10;
/** PN-002 گام ۳ — هر چند تیک، همگام‌سازی کامل CRM (معاملات/کارشناسان/قراردادها/بازدیدها)
 *  با توکن خزانهٔ ماندگار — ریشهٔ «بروزرسانی ناقص فهرست معاملات»: پیش از این sync معاملات
 *  فقط دستی/نشست‌محور بود و هیچ‌گاه به‌صورت پیوسته اجرا نمی‌شد. */
const CRM_SYNC_EVERY_N_TICKS = 5;
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
    /** PN-002 گام ۳ — نتیجهٔ همگام‌سازی CRM (معاملات/کارشناسان/...) با توکن خزانه */
    crmSync?: { ok: boolean; transactions: number; experts: number; source: "vault" | "session" };
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

/** وضعیت فعلی دیمن (برای endpoint شفافیت) — PN-010: منبع حقیقت = Worker */
export function catalogDaemonStatus(): CatalogDaemonStatus {
  // ۱) کانال مشترک Worker — اگر چرخهٔ کاتالوگ آنجا اجرا می‌شود، وضعیت او مبناست
  try {
    const status = readWorkerStatus();
    const entry = status?.jobs?.["catalog-cycle"];
    if (entry) {
      const d = (entry.domain ?? {}) as Partial<CatalogDaemonStatus>;
      const fallback = { ...state().status };
      return {
        enabled: d.enabled ?? fallback.enabled,
        // حین اجرای اول (قبل از نخستین domain) هم «در حال اجرا» صادقانه گزارش شود
        running: entry.running || (d.running ?? false),
        lastTickAt: d.lastTickAt ?? (entry.lastRunAt ? new Date(entry.lastRunAt).getTime() : fallback.lastTickAt),
        lastSuccessAt: d.lastSuccessAt ?? fallback.lastSuccessAt,
        lastError: entry.lastError ?? d.lastError ?? fallback.lastError,
        ticks: d.ticks ?? fallback.ticks,
        lastResult: (d.lastResult as CatalogDaemonStatus["lastResult"]) ?? fallback.lastResult,
      };
    }
  } catch {
    // کانال در دسترس نیست → مسیر قدیمی
  }
  // ۲) میراث: درون‌حافظه‌ای (اجرای در-جا در همین فرایند)
  return { ...state().status };
}

/**
 * PN-002 گام ۳ — توکن ماندگار خزانه (ArmConnection): آخرین اتصالِ زندهٔ مالک.
 * پیش از این، دیمن فقط با «نشست زندهٔ دارای توکن» کار می‌کرد و با خروج/انقضای نشست
 * (یا بازنشانی محیط) کل خط لوله می‌خوابید. خزانه فراتر از چرخهٔ عمر نشست است
 * (عین P6.5-11 بند ث) و این همان «تداوم و استمرار» است که مالک الزام کرده.
 */
async function getVaultArmTokens(db: PrismaClient): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const row = await db.armConnection.findFirst({
      orderBy: { lastRefreshedAt: "desc" },
    });
    if (!row?.tokenEnc) return null;
    const { decryptSecret } = await import("@/lib/auth/crypto");
    const accessToken = decryptSecret(row.tokenEnc);
    if (!accessToken) return null;
    const refreshToken = row.refreshTokenEnc ? decryptSecret(row.refreshTokenEnc) ?? "" : "";
    return { accessToken, refreshToken };
  } catch {
    return null;
  }
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
  const result: NonNullable<CatalogDaemonStatus["lastResult"]> = { listingsPages: 0, requestsPages: 0, listingsEnriched: 0, requestsEnriched: 0, txInfoEnriched: 0, pmInfoEnriched: 0, melkPublicNewCodes: 0, typeRegistriesSynced: 0, cooldownSkip: false };
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
    // نشست زندهٔ دارای توکن ARM (اخیرترین) — و در نبودش، خزانهٔ ماندگار (PN-002 گام ۳)
    const live = await db.session.findFirst({
      where: { revoked: false, expiresAt: { gt: new Date() }, armTokenEnc: { not: null } },
      orderBy: { lastSeenAt: "desc" },
    });
    let armAccessToken: string | null = null;
    let crmSyncSource: "vault" | "session" = "vault";
    if (live) {
      const armTokens = sessionToArmTokens(live);
      if (armTokens?.accessToken) {
        armAccessToken = armTokens.accessToken;
        crmSyncSource = "session";
      }
    }
    if (!armAccessToken) {
      const vault = await getVaultArmTokens(db);
      if (vault?.accessToken) armAccessToken = vault.accessToken;
    }
    if (armAccessToken) {
      const armTokens = { accessToken: armAccessToken } as { accessToken: string; refreshToken?: string };
      // PN-002 گام ۳ — همگام‌سازی پیوستهٔ CRM (معاملات/کارشناسان/قراردادها/بازدیدها/عرضه-تقاضا)
      // هر CRM_SYNC_EVERY_N_TICKS تیک — ریشهٔ «بروزرسانی ناقص معاملات» که مالک گزارش کرد.
      if (s.status.ticks > 0 && s.status.ticks % CRM_SYNC_EVERY_N_TICKS === 0) {
        try {
          const { syncWithRefresh } = await import("./sync");
          const vaultForRefresh = await getVaultArmTokens(db);
          const { sync, newArmToken } = await syncWithRefresh(
            armAccessToken,
            vaultForRefresh?.refreshToken ?? ""
          );
          result.crmSync = {
            ok: sync.ok,
            transactions: sync.transactions,
            experts: sync.experts,
            source: crmSyncSource,
          };
          // توکن تمدیدشده را در خزانه بنویس (زنجیرهٔ ماندگاری هرگز نمی‌شکند)
          if (newArmToken && vaultForRefresh) {
            try {
              const { encryptSecret } = await import("@/lib/auth/crypto");
              const latest = await db.armConnection.findFirst({ orderBy: { lastRefreshedAt: "desc" } });
              if (latest) {
                await db.armConnection.update({
                  where: { id: latest.id },
                  data: {
                    tokenEnc: encryptSecret(newArmToken),
                    lastRefreshedAt: new Date(),
                    status: "connected",
                    lastError: null,
                  },
                });
              }
            } catch {
              /* بهترین-تلاش — توکن فعلی تا انقضا کار می‌کند */
            }
          }
          await jobs.upsert({
            jobId: "crm-sync",
            jobKind: "sync",
            status: sync.ok ? "done" : "failed",
            detail: {
              transactions: sync.transactions,
              experts: sync.experts,
              interactions: sync.interactions,
              visits: sync.visits,
              supplyDemand: sync.supplyDemand,
              contracts: sync.contracts,
              source: crmSyncSource,
              ...(sync.errorCode ? { error: sync.errorCode } : {}),
            },
          }).catch(() => {});
          if (!sync.ok) s.status.lastError = `CRM_SYNC_${sync.errorCode ?? "FAILED"}`;
        } catch (e) {
          s.status.lastError = (e as { code?: string })?.code ?? "CRM_SYNC_FAILED";
          await jobs.upsert({ jobId: "crm-sync", jobKind: "sync", status: "failed", detail: { error: s.status.lastError } }).catch(() => {});
        }
      }
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
        // P6549 — برش «تکمیل ستون‌های ناقص M2» (نکته ۳ استمرار): ردیف‌های غنی‌شدهٔ قبلی که
        // موبایل متقاضی / دسته‌بندی / نوع ملک / بازهٔ قیمت ندارند، هدفمند re-enrich می‌شوند
        // (rowIds از فیلتر pending عبور می‌کند — رفع ریشهٔ ۸٫۹٪ ماندن موبایل متقاضی).
        try {
          const incomplete = await db.requestRecord.findMany({
            where: {
              source: "arm",
              customerMobile: null,
              OR: [
                { tradeTypeName: null },
                { buildingTypeName: null },
                { priceFrom: null },
                { rawCustomerMobile: null },
              ],
            },
            orderBy: { updatedAt: "asc" }, // round-robin: تلاش‌شده‌ها به انتهای صف می‌روند
            take: COMPLETION_ROWS_PER_TICK,
            select: { id: true },
          });
          if (incomplete.length > 0) {
            const ce = await enrichArmRequests(armTokens.accessToken, {
              maxRows: COMPLETION_ROWS_PER_TICK,
              rowIds: incomplete.map((r) => r.id),
            });
            result.requestsEnriched += ce.enriched;
          }
        } catch {
          s.status.lastError = "M2_COMPLETION_SLICE_FAILED"; // نرم — تیک بعدی ادامه می‌دهد
        }
        // P6546/گام سوم + پ-۴ — برش غنی‌سازی صورت‌وضعیت‌های معاملات (نوع/مبلغ/طرفین)
        try {
          const tx = await enrichTransactionsInfo(armTokens.accessToken, { maxRows: TX_INFO_ROWS_PER_TICK, throttleMs: 400 });
          result.txInfoEnriched = tx.enriched;
        } catch {
          s.status.lastError = "TX_INFO_SLICE_FAILED"; // نرم — تیک بعدی ادامه می‌دهد
        }
    }
    // PN-008 (ثانیاً) — برش عمق پروفایل کارشناسان PM (توکن ماندگار PM؛ مستقل از نشست)
    try {
      const pmToken = await getPmSyncToken();
      if (pmToken) {
        const pm = await syncExpertDeepInfo(pmToken, { maxRows: PM_INFO_ROWS_PER_TICK });
        result.pmInfoEnriched = pm.enriched;
      }
    } catch {
      s.status.lastError = "PM_INFO_SLICE_FAILED"; // نرم
    }
    // P6547/گام دوم — چرخهٔ ساعتی فهرست‌های مرجع انواع ARM (tradeType/buildingType/propertyType/…)
    if (s.status.ticks % PUBLIC_EVERY_N_TICKS === 0 && armAccessToken) {
      try {
        // PN-002 گام ۳ — هم‌اکنون توکن خزانه/نشست مستقیماً در دسترس است (بدون نشست‌گرایی)
        const reg = await syncTypeRegistries(armAccessToken);
        result.typeRegistriesSynced = reg.synced.length;
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
