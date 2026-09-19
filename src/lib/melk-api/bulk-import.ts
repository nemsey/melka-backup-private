/**
 * Bulk Import Pipeline — P6.5-03 (طراحی §۱ PHASE-6.5 + دستور شورا P6.5-03)
 * ------------------------------------------------------
 * خط لوله دریافت داده انبوه از ARM/PM با چهار ستون فنی:
 *   ۱) Checkpoint/Resume — ادامه از آخرین صفحهٔ «کامل-ذخیره‌شده» (SyncState.bulkImportCheckpoint)
 *   ۲) Idempotency — upsert بر کلید طبیعی + merge non-null (§۲.۴) ⇒ اجرای دوباره = بی‌ضرر
 *   ۳) Rate Limiting — حداقل فاصله «پایان پاسخ قبلی تا شروع درخواست بعدی» (§۱.۸)
 *   ۴) Retry — ۵ تلاش با backoff نمایی 2s→4s→8s→16s→30s روی 5xx/429/شبکه (§۱.۷)
 *
 * اصول حاکم (قواعد بخش C دستور):
 *   · صفر LLM call · صفر cost · صفر fetch مستقیم (فقط melk-api/client) · صفر Prisma مستقیم (فقط Repository)
 *   · صفر فشار به سامانه مبدأ — rate limiting اجباری (default 200ms)
 *   · Bulk هرگز deleteMany صادر نمی‌کند (§۱.۹) و فیلدهای sync منظم را لمس نمی‌کند (§۱.۵)
 *
 * معماری پورت‌ها (تست‌پذیری کامل با موک — §۱.۱۰: توسعه با موک، صفر فشار به API مبدأ):
 *   BulkPageFetcher  = سازگار منبع (ARM/PM → ردیف‌های نگاشت‌شده UpsertInput)
 *   BulkRecordSink   = ماندگاری (Repositoryهای upsertBulk با merge non-null)
 *   BulkCheckpointStore = نقطه ازسرگیری (SyncState از طریق IntegrationRepository)
 *
 * انحراف صادقانه مستند (۱): پس از اتمام retryهای یک صفحه، نتیجه FAILED بازگردانده می‌شود و
 * صفحه‌های بعدی طی نمی‌شوند — بند «continue به صفحه بعد» دستور با بند ۳ همان دستور
 * (ذخیره checkpoint + توقف) در تعارض است و ادامۀ صفحه‌ها حفره داده می‌سازد که checkpoint
 * قادر به ترمیمش نیست (نقض صفر حذف داده). انتخاب: مسیر طراحی مصوب §۱.۴-۳.
 * status=PARTIAL برای خطاهای «رکورد-منفرد» درون صفحات موفق رزرو شده است.
 */

import { randomUUID } from "crypto";
import type { PrismaClient } from "@prisma/client";
import {
  getContractRepository,
  getExpertRepository,
  getIntegrationRepository,
  getPropertyRecordRepository,
  getRequestRepository,
  getTransactionRepository,
  getVisitRepository,
  PrismaContractRepository,
  PrismaExpertRepository,
  PrismaIntegrationRepository,
  PrismaPropertyRecordRepository,
  PrismaRequestRepository,
  PrismaTransactionRepository,
  PrismaVisitRepository,
  type ArmRequestBulkRow,
  type BulkUpsertOptions,
  type BulkWriteStats,
  type ContractUpsertInput,
  type ExpertUpsertInput,
  type InteractionUpsertInput,
  type PropertyBulkInput,
  type TransactionUpsertInput,
  type VisitUpsertInput,
} from "@/core/repositories";
import { MelkApiError } from "./types";
import { armCall } from "./client";
import { getMelkApiConfig } from "./config";
import { MELK_ENDPOINTS } from "./endpoints";
import { extractPagedList } from "./adapters";
// P6.5-04 — نرمال‌سازی لایه ۲ + رجیستری محله (سه‌لایه حقیقت: Raw → Normalized → Derived)
import { NORMALIZATION_VERSION, normalizeBulkRow, type LocationRegistry } from "./normalize";
import { getDefaultLocationRegistry } from "./location-registry";
import {
  mapArmContractRow,
  mapArmInteractionRow,
  mapArmRealtorRow,
  mapArmTradedRow,
  mapArmVisitRow,
} from "./adapters";
import {
  toContractUpsert,
  toExUpsert,
  toInUpsert,
  toTxUpsert,
  toViUpsert,
} from "./sync";

// ==========================================================================
// قراردادها — عین بخش B.1 دستور شورا (افزودنی مجاز، حذف ممنوع)
// ==========================================================================

export type BulkEntity =
  | 'transaction'    // ARM: traded-count-total
  | 'expert'         // ARM: realtors/list
  | 'listing'        // ARM: properties (رجیستری PropertyRecord — §۲.۲)
  | 'request'        // ARM: requests (RequestRecord با source='arm' — §۱.۲)
  | 'visit'          // ARM: visits/list
  | 'contract'       // ARM: trade-overviews/list
  | 'interaction';   // ARM: realtor-interactions

export interface BulkImportOptions {
  entity: BulkEntity;
  startDate?: Date;
  endDate?: Date;
  pageSize?: number;        // default: 100 — clamp به [100, 500]
  batchSize?: number;       // default: 1000 — clamp به [100, 2000]
  /** حداقل فاصله پایان-پاسخ تا درخواست بعدی — default: 200 (اجباری > 0) */
  rateLimitMs?: number;
  maxRetries?: number;      // default: 5
  onProgress?: (progress: BulkImportProgress) => void;
}

export interface BulkImportProgress {
  entity: BulkEntity;
  totalFetched: number;
  totalSaved: number;
  totalDuplicates: number;
  totalErrors: number;
  currentPage: number;
  currentBatch: number;
  checkpoint: BulkImportCheckpoint;
  startedAt: Date;
  updatedAt: Date;
}

export interface BulkImportCheckpoint {
  entity: BulkEntity;
  /** آخرین صفحهٔ «کامل-ذخیره‌شده» (۰ = هیچ) — نقطه ادامه = lastPage + 1 */
  lastPage: number;
  /** شناسه آخرین رکورد صفحهٔ کامل‌شده (دیاگنوستیک) */
  lastRecordId: string;
  totalProcessed: number;
  startedAt: string;        // ISO
  version: string;          // سازگاری آینده
  // ---- افزوده‌های طراحی §۱.۵ (مجاز طبق دستور) ----
  runId?: string;
  updatedAt?: string;
  dateRange?: { from: string; to: string } | null;
  totals?: { fetched: number; saved: number; duplicates: number; errors: number };
}

export interface BulkImportResult {
  entity: BulkEntity;
  status: 'COMPLETED' | 'FAILED' | 'PARTIAL';
  progress: BulkImportProgress;
  error?: string;
  durationMs: number;
  /** P6.5-04 — آمار نرمال‌سازی این اجرا (لایه ۲ سه‌لایه حقیقت) */
  normalization?: NormalizationStats;
}

/**
 * آمار نرمال‌سازی یک اجرا — P6.5-04 (گزارش نرخ‌ها در P6.5-10):
 * نرخ نرمال‌سازی = (rowsSeen − ردیف‌های با invalidValues) / rowsSeen
 * نرخ تطبیق محله = areaMatched / (areaMatched + areaUnmatched)
 */
export interface NormalizationStats {
  rowsSeen: number;
  rowsChanged: number;
  fieldsChanged: number;
  invalidValues: number;
  areaMatched: number;
  areaUnmatched: number;
}

// ==========================================================================
// پورت‌ها (تزریق وابستگی — تست با موک، تولید با ARM)
// ==========================================================================

/** یک صفحه نتیجه از سازگار منبع — ردیف‌ها «نگاشت‌شده به ورودی مخزن» هستند */
export interface BulkFetchPage {
  rows: unknown[];
  hasMore: boolean;
}

export interface BulkPageFetcher {
  fetchPage(req: {
    entity: BulkEntity;
    page: number;
    pageSize: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<BulkFetchPage>;
}

export interface BulkRecordSink {
  /** ذخیره دسته — خطای رکورد منفرد سد دسته نیست (errors شمرده می‌شود) */
  saveBatch(rows: unknown[], meta: { sourceRunId: string; entity: BulkEntity }): Promise<BulkWriteStats>;
}

export interface BulkCheckpointStore {
  load(entity: BulkEntity): Promise<BulkImportCheckpoint | null>;
  save(checkpoint: BulkImportCheckpoint): Promise<void>;
}

export interface BulkImportDeps {
  fetcher: BulkPageFetcher;
  sink: BulkRecordSink;
  checkpointStore: BulkCheckpointStore;
  /** تزریق برای تست backoff بدون انتظار واقعی — پیش‌فرض خواب واقعی */
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  newRunId?: () => string;
  /** P6.5-04 — رجیستری محله تزریقی (تست)؛ پیش‌فرض: رجیستری ۹۲۶ پیش‌فرض lazy */
  registry?: LocationRegistry;
}

// ==========================================================================
// توابع خالص — سیاست retry / اعتبارسنجی / طبقه‌بندی خطا (بدون I/O)
// ==========================================================================

/** نسخهٔ قرارداد checkpoint (سازگاری آینده — تغییر = نادیده‌گرفتن checkpoint قدیمی) */
export const BULK_CHECKPOINT_VERSION = "p65-03-v1";

/** عین دستور: 2s→4s→8s→16s→30s (سقف 30s برای تلاش‌های بیشتر) */
export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [2000, 4000, 8000, 16000, 30000];

/** تأخیر پیش از تلاش retry شماره n (1-based) — null یعنی «دیگر retry نکن» */
export function retryDelayFor(retryNumber: number, maxRetries: number): number | null {
  if (retryNumber < 1) return null;
  if (retryNumber > maxRetries) return null;
  const idx = Math.min(retryNumber - 1, DEFAULT_RETRY_DELAYS_MS.length - 1);
  return DEFAULT_RETRY_DELAYS_MS[idx];
}

/** خطای شبکه‌ای/HTTP با حمایت Retry-After — قابل‌تزریق در تست */
export class BulkFetchError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  constructor(message: string, opts: { status?: number; retryable: boolean; retryAfterMs?: number } = { retryable: false }) {
    super(message);
    this.name = "BulkFetchError";
    this.status = opts.status;
    this.retryable = opts.retryable;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

/** §۱.۷ — قابل‌retry: 5xx/429/شبکه (پرچم retryable)؛ 4xx غیر 429 = فوری؛ ناشناخته = فوری */
export function classifyFetchError(err: unknown): { retryable: boolean; retryAfterMs: number | null } {
  if (err instanceof BulkFetchError) {
    return { retryable: err.retryable, retryAfterMs: err.retryAfterMs ?? null };
  }
  if (err instanceof MelkApiError) {
    const retryable = err.retryable === true || err.httpStatus >= 500 || err.httpStatus === 429;
    return { retryable, retryAfterMs: null };
  }
  return { retryable: false, retryAfterMs: null };
}

/** §۱.۳ — clamp بازه‌های مجاز (fail-fast معکوس: مقدار نامعتبر → default امن) */
export function clampPageSize(raw?: number): number {
  const n = Number.isFinite(raw) ? Math.floor(raw as number) : 100;
  return Math.min(500, Math.max(100, n));
}

export function clampBatchSize(raw?: number): number {
  const n = Number.isFinite(raw) ? Math.floor(raw as number) : 1000;
  return Math.min(2000, Math.max(100, n));
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==========================================================================
// RateLimiter — §۱.۸: فاصله از «پایان پاسخ قبلی» تا «شروع درخواست بعدی»
// ==========================================================================

export class RateLimiter {
  private lastCompletedAt = 0;

  constructor(private readonly minIntervalMs: number) {}

  /** پیش از هر درخواست — نخستین درخواست آزاد است */
  async wait(): Promise<void> {
    if (this.lastCompletedAt === 0) return;
    const elapsed = Date.now() - this.lastCompletedAt;
    const remaining = this.minIntervalMs - elapsed;
    if (remaining > 0) await defaultSleep(remaining);
  }

  /** پس از پایان هر پاسخ (موفق یا ناموفق) */
  complete(): void {
    this.lastCompletedAt = Date.now();
  }
}

// ==========================================================================
// موتور خط لوله
// ==========================================================================

/** سقف ایمنی صفحات (حلقه بی‌نهایت منبع خراب را نمی‌پذیرد) — additive option */
const DEFAULT_MAX_PAGES = 10_000;

class BulkImportRunner {
  private readonly opts: BulkImportOptions;
  private readonly pageSize: number;
  private readonly batchSize: number;
  private readonly maxRetries: number;
  private readonly deps: BulkImportDeps;
  private readonly limiter: RateLimiter;
  private readonly sleep: (ms: number) => Promise<void>;
  private registry: LocationRegistry | null = null;

  constructor(options: BulkImportOptions, deps: BulkImportDeps) {
    this.opts = options;
    this.pageSize = clampPageSize(options.pageSize);
    this.batchSize = clampBatchSize(options.batchSize);
    this.maxRetries = options.maxRetries ?? 5;
    this.deps = deps;
    this.limiter = new RateLimiter(Math.max(1, options.rateLimitMs ?? 200));
    this.sleep = deps.sleep ?? defaultSleep;
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  /** رجیستری محله — تزریقی تست یا پیش‌فرض ۹۲۶ (lazy + cache) */
  private resolveRegistry(): LocationRegistry {
    if (this.deps.registry) return this.deps.registry;
    if (!this.registry) this.registry = getDefaultLocationRegistry();
    return this.registry;
  }

  /**
   * P6.5-04-e/e-v2 — نرمال‌سازی لایه ۲ + مهر provenance (سه‌لایه حقیقت):
   * لایه ۱ (Raw) توسط نگاشت آداپتور عین منبع پر شده؛ اینجا لایه ۲ فیلدهای
   * نرمال را از خام مشتق می‌کند (amount/area/jalaliDate + نام‌ها/کدها) و
   * مهر extractedAt/extractionBatchId/normalizationVersion روی هر ردیف می‌نشیند.
   * نرمال‌سازی هرگز مقادیر خام را بازنویسی نمی‌کند.
   */
  private normalizeAndStamp(
    entity: BulkEntity,
    rows: readonly unknown[],
    batchRunId: string | undefined,
    stats: NormalizationStats
  ): unknown[] {
    const registry = this.resolveRegistry();
    const extractedAt = this.now();
    const out: unknown[] = [];
    for (const row of rows) {
      const { row: normalized, stats: rowStats } = normalizeBulkRow(
        entity,
        (row ?? {}) as Record<string, unknown>,
        registry
      );
      const stamped = normalized as Record<string, unknown>;
      stamped.extractedAt = extractedAt;
      stamped.extractionBatchId = batchRunId ?? null;
      stamped.normalizationVersion = NORMALIZATION_VERSION;
      // rawSourceVersion: ARM فعلاً نسخه داده منتشر نمی‌کند — تهی صادقانه (کشف در Reconnaissance §۶)
      if (stamped.rawSourceVersion === undefined) stamped.rawSourceVersion = null;
      stats.rowsSeen += 1;
      if (rowStats.changedFields.length > 0) stats.rowsChanged += 1;
      stats.fieldsChanged += rowStats.changedFields.length;
      stats.invalidValues += rowStats.invalidFields.length;
      if (rowStats.areaMatched) stats.areaMatched += 1;
      if (rowStats.areaUnmatched) stats.areaUnmatched += 1;
      out.push(stamped);
    }
    return out;
  }

  async run(): Promise<BulkImportResult> {
    const t0 = this.now().getTime();
    const entity = this.opts.entity;
    const range =
      this.opts.startDate || this.opts.endDate
        ? {
            from: (this.opts.startDate ?? this.opts.endDate)!.toISOString(),
            to: (this.opts.endDate ?? this.opts.startDate)!.toISOString(),
          }
        : null;

    // ---- ۱) بارگذاری checkpoint (تطبیق entity + بازه + نسخه) ----
    const saved = await this.deps.checkpointStore.load(entity);
    const resumable =
      saved !== null &&
      saved.version === BULK_CHECKPOINT_VERSION &&
      sameDateRange(saved.dateRange ?? null, range);

    const cp: BulkImportCheckpoint = resumable
      ? { ...saved, runId: saved.runId ?? this.deps.newRunId?.() ?? randomUUID() }
      : {
          entity,
          lastPage: 0,
          lastRecordId: "",
          totalProcessed: 0,
          startedAt: this.now().toISOString(),
          version: BULK_CHECKPOINT_VERSION,
          runId: this.deps.newRunId?.() ?? randomUUID(),
          updatedAt: this.now().toISOString(),
          dateRange: range,
          totals: { fetched: 0, saved: 0, duplicates: 0, errors: 0 },
        };

    const progress: BulkImportProgress = {
      entity,
      totalFetched: cp.totals?.fetched ?? 0,
      totalSaved: cp.totals?.saved ?? 0,
      totalDuplicates: cp.totals?.duplicates ?? 0,
      totalErrors: cp.totals?.errors ?? 0,
      currentPage: cp.lastPage,
      currentBatch: 0,
      checkpoint: cp,
      startedAt: new Date(cp.startedAt),
      updatedAt: this.now(),
    };

    let status: BulkImportResult["status"] = "COMPLETED";
    let error: string | undefined;

    // P6.5-04 — آمار نرمال‌سازی این اجرا (سه‌لایه حقیقت)
    const normStats: NormalizationStats = {
      rowsSeen: 0,
      rowsChanged: 0,
      fieldsChanged: 0,
      invalidValues: 0,
      areaMatched: 0,
      areaUnmatched: 0,
    };

    // ---- ۲) حلقه صفحات ----
    let page = cp.lastPage + 1; // نقطه ادامه = آخرین صفحه کامل + ۱
    let pagesRan = 0;

    while (true) {
      if (pagesRan >= DEFAULT_MAX_PAGES) {
        // سقف ایمنی — از سر رفتن حلقه منبع خراب؛ داده‌های تا اینجا سالم‌اند
        status = "PARTIAL";
        error = `سقف ایمنی صفحات (${DEFAULT_MAX_PAGES}) رسید؛ داده تا صفحه ${cp.lastPage} سالم ذخیره شد.`;
        break;
      }

      let fetched: BulkFetchPage;
      try {
        fetched = await this.fetchPageWithRetry(page);
      } catch (err) {
        // §۱.۴-۳ — checkpoint (آخرین صفحه کامل) ذخیره + توقف با خطای صریح فارسی
        await this.deps.checkpointStore.save(cp);
        status = "FAILED";
        error = fetchFailureMessage(err, entity, page, cp.lastRecordId);
        break;
      }

      progress.totalFetched += fetched.rows.length;
      pagesRan += 1;

      if (fetched.rows.length === 0) break; // پایان داده

      // ---- P6.5-04: نرمال‌سازی لایه ۲ + مهر provenance (پیش از ذخیره) ----
      const normalizedRows = this.normalizeAndStamp(entity, fetched.rows, cp.runId, normStats);

      // ---- ذخیره: برش‌های batchSize + فلاش اجباری پیش از پیشروی checkpoint ----
      for (let offset = 0; offset < normalizedRows.length; offset += this.batchSize) {
        const chunk = normalizedRows.slice(offset, offset + this.batchSize);
        const stats = await this.deps.sink.saveBatch(chunk, { sourceRunId: cp.runId!, entity });
        progress.totalSaved += stats.created + stats.updated;
        progress.totalDuplicates += stats.duplicates;
        progress.totalErrors += stats.errors;
        progress.currentBatch += 1;
      }

      // نا-تکرارپذیری فلاش/چک‌پوینت: صفحه کامل شد → داده نوشته شد → حالا checkpoint جلو می‌رود
      const lastRow = normalizedRows[normalizedRows.length - 1] as Record<string, unknown> | undefined;
      cp.lastRecordId = String(lastRow?.id ?? lastRow?.propertyCode ?? lastRow?.requestCode ?? lastRow?.personnelCode ?? "");
      cp.totalProcessed = progress.totalFetched;
      cp.lastPage = page;
      cp.updatedAt = this.now().toISOString();
      cp.totals = {
        fetched: progress.totalFetched,
        saved: progress.totalSaved,
        duplicates: progress.totalDuplicates,
        errors: progress.totalErrors,
      };
      await this.deps.checkpointStore.save(cp);

      progress.currentPage = page;
      progress.checkpoint = { ...cp };
      progress.updatedAt = this.now();
      this.opts.onProgress?.({ ...progress, checkpoint: { ...cp, totals: cp.totals ? { ...cp.totals } : undefined } });

      if (!fetched.hasMore) break;
      page += 1;
    }

    // خطای رکورد-منفرد درون صفحات موفق ⇒ PARTIAL (نه FAILED)
    if (status === "COMPLETED" && progress.totalErrors > 0) {
      status = "PARTIAL";
      error = `${progress.totalErrors} رکورد در حین ذخیره خطا خورد (صفحات طی شد؛ از اجرای مجدد idempotent استفاده کنید).`;
    }

    return {
      entity,
      status,
      progress,
      ...(error !== undefined ? { error } : {}),
      durationMs: this.now().getTime() - t0,
      normalization: normStats,
    };
  }

  /** واکشی یک صفحه با retry طبقه‌بندی‌شده + احترام کامل به rate limit و Retry-After */
  private async fetchPageWithRetry(page: number): Promise<BulkFetchPage> {
    let retryNumber = 0;
    while (true) {
      await this.limiter.wait();
      try {
        const res = await this.deps.fetcher.fetchPage({
          entity: this.opts.entity,
          page,
          pageSize: this.pageSize,
          ...(this.opts.startDate ? { startDate: this.opts.startDate } : {}),
          ...(this.opts.endDate ? { endDate: this.opts.endDate } : {}),
        });
        this.limiter.complete();
        return res;
      } catch (err) {
        this.limiter.complete(); // درخواست (ناموفق) هم «تمام شد» — فاصله از پایان آن
        const { retryable, retryAfterMs } = classifyFetchError(err);
        const policyDelay = retryDelayFor(retryNumber + 1, this.maxRetries);
        if (!retryable || policyDelay === null) throw err;
        // 429: احترام به Retry-After مبدأ — هرگز کمتر از سیاست، هرچه بیشتر خواست شکیبایی
        await this.sleep(Math.max(policyDelay, retryAfterMs ?? 0));
        retryNumber += 1;
      }
    }
  }
}

function sameDateRange(a: BulkImportCheckpoint["dateRange"], b: BulkImportCheckpoint["dateRange"]): boolean {
  return (a?.from ?? null) === (b?.from ?? null) && (a?.to ?? null) === (b?.to ?? null);
}

function fetchFailureMessage(err: unknown, entity: BulkEntity, page: number, lastRecordId: string): string {
  const reason = err instanceof Error ? err.message : String(err);
  return `خطای قطعی در واکشی صفحه ${page} از «${entity}»: ${reason} — checkpoint در آخرین صفحه کامل ذخیره شد (آخرین رکورد: ${lastRecordId || "—"}).`;
}

// ==========================================================================
// نقطه ورود — سیم‌کشی پیش‌فرض (تولید) یا تزریق کامل (تست)
// ==========================================================================

export async function bulkImport(
  options: BulkImportOptions,
  deps: Partial<BulkImportDeps> & { armToken?: string; repoClient?: PrismaClient } = {}
): Promise<BulkImportResult> {
  const engineOpts: BulkImportOptions = {
    ...options,
    pageSize: clampPageSize(options.pageSize),
    batchSize: clampBatchSize(options.batchSize),
    rateLimitMs: Math.max(1, options.rateLimitMs ?? 200),
    maxRetries: options.maxRetries ?? 5,
  };
  const fetcher =
    deps.fetcher ??
    createArmBulkFetcher({ entity: options.entity, armToken: deps.armToken ?? "" });
  const sink = deps.sink ?? createRepositorySink(options.entity, { client: deps.repoClient });
  const checkpointStore = deps.checkpointStore ?? new SyncStateBulkCheckpointStore({ client: deps.repoClient });
  return new BulkImportRunner(engineOpts, {
    fetcher,
    sink,
    checkpointStore,
    ...(deps.sleep ? { sleep: deps.sleep } : {}),
    ...(deps.now ? { now: deps.now } : {}),
    ...(deps.newRunId ? { newRunId: deps.newRunId } : {}),
    ...(deps.registry ? { registry: deps.registry } : {}),
  }).run();
}

// ==========================================================================
// سازگار منبع ARM — تمام درخواست از client.ts موجود (صفر fetch مستقیم)
// ==========================================================================

/** نگاشت ردیف خام → ورودی مخزن برای هر موجودیت (listing/request = stub تا P6.5-04) */
type RawRow = Record<string, unknown>;

function pickRaw(row: RawRow, keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function pickRawStr(row: RawRow, keys: string[]): string | null {
  const v = pickRaw(row, keys);
  if (typeof v === "string") return v;
  if (v === undefined || v === null) return null;
  if (typeof v === "object") return null; // شیء تو در تو ([object Object] نه!) — نگاشت تو در تو در آداپتور کامل
  return String(v);
}

/**
 * آگهی ARM → PropertyBulkInput — نگاشت با لایه ۱ حقیقت (P6.5-04-e-v2):
 * مقادیر خام عین منبع (rawPrice/rawPriceUnit/rawArea) نگاشته می‌شوند و
 * لایه ۲ (normalizeBulkRow با kind=amount/area) در خط لوله آن‌ها را به
 * price (ریال) و meterage مشتق می‌کند — خود خام هرگز تغییر نمی‌کند.
 * کلیدهای کاندید قیمت/متراژ: تطبیق نهایی با داده زنده در D0/Reconnaissance.
 */
function stubMapPropertyRow(row: RawRow): PropertyBulkInput | null {
  const id = pickRawStr(row, ["id", "_id", "objectId"]);
  const propertyCode = pickRawStr(row, ["code", "propertyCode"]);
  if (!id && !propertyCode) return null;
  return {
    id: id ?? propertyCode!,
    propertyCode: propertyCode ?? id!,
    title: pickRawStr(row, ["title"]),
    status: pickRawStr(row, ["status"]),
    ownerName: pickRawStr(row, ["relatedRealtorName", "realtorName", "ownerName"]),
    ownerMobile: pickRawStr(row, ["ownerMobile", "mobileNumber", "mobile"]),
    // مکان — کلیدهای کاندید (تطبیق نهایی با داده زنده در D0/Reconnaissance)
    areaName: pickRawStr(row, ["areaName", "areaTitle", "area"]),
    lineName: pickRawStr(row, ["lineName", "lineTitle", "line"]),
    // P6.5-04-e-v2 — لایه ۱ حقیقت (Raw) — عین منبع، بدون هیچ تبدیلی
    // (کلیدهای متراژ عمداً جدا از کلیدهای نام محله — «area» نام محله است، نه متراژ)
    rawPrice: pickRawStr(row, ["price", "priceLabel", "priceText", "totalPrice", "priceFa"]),
    rawPriceUnit: pickRawStr(row, ["priceUnit", "unit", "currencyLabel"]),
    rawArea: pickRawStr(row, ["meterage", "metrage", "meterageLabel", "areaMeterage", "propertyMeterage"]),
  };
}

/** STUB P6.5-04 — درخواست ARM → ArmRequestBulkRow (نگاشت حداقلی) */
function stubMapRequestRow(row: RawRow): ArmRequestBulkRow | null {
  const id = pickRawStr(row, ["id", "_id"]);
  const requestCode = pickRawStr(row, ["code", "requestCode"]);
  if (!id && !requestCode) return null;
  return {
    id: id ?? requestCode!,
    requestCode: requestCode ?? id!,
    customerName: pickRawStr(row, ["applicantName", "customerName", "fullName"]),
    customerMobile: pickRawStr(row, ["applicantMobile", "customerMobile", "mobileNumber"]),
  };
}

export function createArmBulkFetcher(init: { entity: BulkEntity; armToken: string }): BulkPageFetcher {
  return {
    fetchPage: async (req) => {
      if (!init.armToken) {
        throw new BulkFetchError("توکن ARM برای Bulk Import لازم است — نشست کاربر واردشده را تمدید کنید.", { status: 401, retryable: false });
      }
      const cfg = getMelkApiConfig();
      const path = armEntityPath(req.entity);
      const res = await armCall<unknown>({
        path,
        baseUrl: cfg.armApiBase,
        token: init.armToken,
        query: {
          page: req.page,
          limit: req.pageSize,
          // نام پارامترهای بازه تاریخ در P6.5-04/D0 با تست زنده نهایی می‌شود (نگاشت صادقانه)
          ...(req.startDate ? { from: req.startDate.toISOString().slice(0, 10) } : {}),
          ...(req.endDate ? { to: req.endDate.toISOString().slice(0, 10) } : {}),
        },
        timeoutMs: cfg.timeoutMs,
        maxRetries: 0, // مدیریت retry با موتور خود خط لوله (نه client)
      });

      const mapped = extractPagedList(res.data, (row, i) =>
        mapArmRowToInput(req.entity, (row ?? {}) as RawRow, i, req.page, req.pageSize)
      );
      const totalPages =
        mapped.totalPages ?? (mapped.total > 0 ? Math.ceil(mapped.total / req.pageSize) : 1);
      return {
        rows: mapped.rows,
        hasMore: mapped.rows.length > 0 && req.page < totalPages,
      };
    },
  };
}

function armEntityPath(entity: BulkEntity): string {
  switch (entity) {
    case "transaction": return MELK_ENDPOINTS.arm.tradedTotal;
    case "expert": return MELK_ENDPOINTS.arm.realtorsList;
    case "interaction": return MELK_ENDPOINTS.arm.realtorInteractions;
    case "visit": return MELK_ENDPOINTS.arm.visitsList;
    case "contract": return MELK_ENDPOINTS.arm.tradeOverviewsList;
    case "listing": return MELK_ENDPOINTS.arm.propertiesList;
    case "request": return MELK_ENDPOINTS.arm.requestsList;
  }
}

/** نگاشت ردیف خام ARM → ورودی مخزن هر موجودیت (صادرشده برای تست مسیر واقعی mapping) */
export function mapArmRowToInput(entity: BulkEntity, row: RawRow, index: number, page: number, pageSize: number): unknown | null {
  switch (entity) {
    case "transaction": {
      const crm = mapArmTradedRow(row, index, page, pageSize);
      return crm ? toTxUpsert(crm) : null;
    }
    case "expert": {
      const crm = mapArmRealtorRow(row, index);
      return crm ? toExUpsert(crm) : null;
    }
    case "interaction": {
      const crm = mapArmInteractionRow(row, index);
      return crm ? toInUpsert(crm) : null;
    }
    case "visit": {
      const crm = mapArmVisitRow(row, index);
      return crm ? toViUpsert(crm) : null;
    }
    case "contract": {
      // فهرست صورت‌وضعیت‌ها — غنی‌سازی مرحله دوم (info/{id}) در P6.5-04
      const crm = mapArmContractRow(row);
      return crm ? toContractUpsert(crm) : null;
    }
    case "listing": return stubMapPropertyRow(row);
    case "request": return stubMapRequestRow(row);
  }
}

// ==========================================================================
// سینکِ مخزن — هر موجودیت به Repository خود (صفر Prisma مستقیم)
// ==========================================================================

export function createRepositorySink(entity: BulkEntity, opts: { client?: PrismaClient } = {}): BulkRecordSink {
  // مخازن یک‌بار ساخته می‌شوند — پیش‌فرض تولید (db از env) یا کلاینت تزریقی تست (E.3)
  const txRepo = opts.client ? new PrismaTransactionRepository({ client: opts.client }) : getTransactionRepository();
  const exRepo = opts.client ? new PrismaExpertRepository({ client: opts.client }) : getExpertRepository();
  const viRepo = opts.client ? new PrismaVisitRepository({ client: opts.client }) : getVisitRepository();
  const ctRepo = opts.client ? new PrismaContractRepository({ client: opts.client }) : getContractRepository();
  const rqRepo = opts.client ? new PrismaRequestRepository({ client: opts.client }) : getRequestRepository();
  const prRepo = opts.client ? new PrismaPropertyRecordRepository({ client: opts.client }) : getPropertyRecordRepository();

  return {
    saveBatch: async (rows, meta) => {
      const up: BulkUpsertOptions = { sourceRunId: meta.sourceRunId };
      switch (entity) {
        case "transaction":
          return txRepo.upsertBulk(rows as TransactionUpsertInput[], up);
        case "expert":
          return exRepo.upsertBulk(rows as ExpertUpsertInput[], up);
        case "interaction":
          return exRepo.upsertInteractionsBulk(rows as InteractionUpsertInput[], up);
        case "visit":
          return viRepo.upsertBulk(rows as VisitUpsertInput[], up);
        case "contract":
          return ctRepo.upsertBulk(rows as ContractUpsertInput[], up);
        case "request":
          return rqRepo.upsertArmBulk(rows as ArmRequestBulkRow[], up);
        case "listing":
          return prRepo.upsertBulk(rows as PropertyBulkInput[], up);
      }
    },
  };
}

// ==========================================================================
// انبار checkpoint — SyncState.singleton از طریق IntegrationRepository (§۱.۵)
// ==========================================================================

export class SyncStateBulkCheckpointStore implements BulkCheckpointStore {
  private readonly repo;

  constructor(deps: { client?: PrismaClient } = {}) {
    // IntegrationRepository با کلاینت تزریقی (الگوی تست E.3)
    this.repo = deps.client ? new PrismaIntegrationRepository({ client: deps.client }) : getIntegrationRepository();
  }

  async load(entity: BulkEntity): Promise<BulkImportCheckpoint | null> {
    const raw = await this.repo.getBulkImportCheckpoint();
    if (!raw) return null;
    try {
      const cp = JSON.parse(raw) as BulkImportCheckpoint;
      if (cp && cp.entity === entity && cp.version === BULK_CHECKPOINT_VERSION) return cp;
      return null; // موجودیت/نسخه متفاوت — نادیده (شروع تازه)
    } catch {
      return null; // JSON خراب — شروع تازه (fail-safe)
    }
  }

  async save(checkpoint: BulkImportCheckpoint): Promise<void> {
    await this.repo.setBulkImportCheckpoint(JSON.stringify(checkpoint));
  }
}
