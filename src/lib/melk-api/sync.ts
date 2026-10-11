/**
 * همگام‌سازی داده CRM از سامانه‌های واقعی ملک تبریز به پایگاه محلی
 * ------------------------------------------------------
 * استراتژی: «استخراج و کش» — داده‌های خام از arus-api.melketabriz.ir
 * (توکن‌دار) کشیده و در Prisma ذخیره می‌شوند؛ تحلیل‌های ایجنت
 * و فیلترهای سنگین روی پایگاه محلی اجرا می‌شوند تا عملکرد بالا و
 * بار کم روی سامانه اصلی حفظ شود.
 *
 * ✅ فقط داده واقعی: هیچ داده دمو تولید نمی‌شود. اگر سامانه در دسترس
 * نباشد، خطای شفاف فارسی برگردانده می‌شود و کش قبلی (انقضادار) حفظ
 * می‌شود و وضعیت SyncState ثبت می‌گردد.
 *
 * سه گزارش عین خود سامانه ARM استخراج می‌شود:
 *   ۱) گزارش تطابق معاملات (traded-count-total) + خلاصه چهارگانه
 *   ۲) فهرست کاربران/مشاوران (realtors/list)
 *   ۳) تعاملات مشاوران با یکدیگر (realtor-interactions)
 *
 * نکته مهم: توکن ARM از نشست کاربر واردشده استفاده می‌شود (جریان
 * OTP واقعی)؛ اگر توکن منقضی شده باشد، با refreshToken تمدید می‌شود.
 */

import { randomUUID } from "crypto";
import { resolve as pathResolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { db } from "@/lib/db";
import {
  getContractRepository,
  getExpertRepository,
  getMarketRepository,
  getTransactionRepository,
  getVisitRepository,
  type ContractUpsertInput,
  type ExpertUpsertInput,
  type InteractionUpsertInput,
  type SupplyDemandUpsertInput,
  type TransactionUpsertInput,
  type VisitUpsertInput,
} from "@/core/repositories";
import { getMelkProvider } from "./provider";
import { logSync } from "@/lib/logger";
import { syncMode } from "./sync-mode";
import { MELK_ENDPOINTS } from "./endpoints";
import { getIntegrationRepository } from "@/core/repositories";
import type {
  CommissionCityConfig,
  CrmContract,
  CrmExpert,
  CrmInteraction,
  CrmSupplyDemand,
  CrmTransaction,
  CrmVisit,
  PriceIndexConfig,
  RefListItem,
  TradedSummary,
} from "./types";
import { MelkApiError } from "./types";
import { normalizeMobile, normalizeName } from "./normalize";
import {
  mapArmInteractionRow,
  mapArmRealtorRow,
  mapArmTradedRow,
  mapArmTradedSummary,
  mapArmSupplyDemandRow,
  mapArmVisitRow,
  extractPagedList,
  mapArmContractRow,
  mergeArmContractInfo,
  mapCommissionConfig,
  mapPriceIndexAreas,
  mapPriceIndexConfig,
  mapPriceIndexDetails,
  mapRefList,
} from "./adapters";
import { armCall } from "./client";
import { getMelkApiConfig } from "./config";

/** نتیجه همگام‌سازی با جزئیات وضعیت */
export interface SyncResult {
  ok: boolean;
  transactions: number;
  experts: number;
  interactions: number;
  visits: number;
  supplyDemand: number;
  contracts: number;
  syncedAt: string;
  error?: string;
  errorCode?: string;
}

/** آخرین وضعیت موفق همگام‌سازی (برای نمایش در UI) */
export interface SyncStateInfo {
  lastSyncedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorCode: string | null;
  transactionCount: number;
  expertCount: number;
  interactionCount: number;
  visitCount: number;
  supplyDemandCount: number;
  /** خلاصه چهارگانه گزارش تطابق (از خود سامانه ARM) */
  summary: TradedSummary | null;
  attempts: number;
}

const SYNC_STATE_ID = "singleton";

// ==========================================================================
// PN-022-A/مرحلهٔ۱ (اولاً-۳) — سنک صفحه‌ای (checkpoint) برای سنک اصلی ARM
// ==========================================================================
// ریشه (شاهد F4 گزارش PN-020/گام اول): بالادستی ARM پشت nginx است و خطاهای
// گذرای ۵۰۲/۵۰۴ وسط سنک، کل زنجیرهٔ ۷۰ثانیه‌ای را می‌کشت؛ تلاش بعدی از صفحهٔ ۱
// شروع می‌شد — «تأخیرهای مکرر». سه ترمیم:
//   ۱) تلاش مجدد گذرا درون حلقهٔ صفحه‌بندی (۵۰۲/۵۰۳/۵۰۴/تایم‌اوت — بک‌آف ۸۰۰ms×۲)
//   ۲) checkpoint صفحه‌ای (عین الگوی P6.5-11 بند ب): دادهٔ صفحه نوشته شد ⇒ مهر پیشروی؛
//      قطع برق/شبکه هیچ‌گاه حفرهٔ داده نمی‌سازد
//   ۳) ازسرگیری: اجرای بعدی از «آخرین صفحهٔ کامل + ۱» ادامه می‌یابد، نه از صفحهٔ ۱
// موجودیت‌های checkpoint سنک اصلی (افزوده بر قرارداد مدل SyncCheckpoint):

export const MAIN_SYNC_CHECKPOINT_IDS = {
  transactions: "main-sync:transactions",
  experts: "main-sync:experts",
  interactions: "main-sync:interactions",
  visits: "main-sync:visits",
  supplyDemand: "main-sync:supply-demand",
} as const;

/** نتیجهٔ واکشی صفحه‌بندی‌شده با شواهد checkpoint */
export interface PagedFetchOutcome {
  resumed: boolean;
  pagesFetched: number;
  startPage: number;
  totalPages: number;
  totalAtSource: number;
}

/** پیشبرد checkpoint سنک اصلی — پس از نوشتن دادهٔ صفحه (ترتیب حیاتی) */
async function advanceMainSyncCheckpoint(
  checkpointId: string,
  cp: { cycleId: string; pageSize: number; lastCompletedPage: number; totalPages: number; totalAtSource: number },
  phase: "in-progress" | "complete"
): Promise<void> {
  await getIntegrationRepository().upsertSyncCheckpoint({
    id: checkpointId,
    cycleId: cp.cycleId,
    pageSize: cp.pageSize,
    lastCompletedPage: cp.lastCompletedPage,
    totalPages: cp.totalPages,
    totalAtSource: cp.totalAtSource,
    phase,
    ...(phase === "complete" ? { completedAt: new Date() } : { completedAt: null }),
  });
}

/** تصمیم نقطهٔ شروع چرخهٔ خانوادهٔ سنک اصلی (عین resolveCycleStart کاتالوگ) */
export function resolveMainSyncStart(
  saved: { phase: string; pageSize: number; lastCompletedPage: number; cycleId: string } | null,
  pageLimit: number
): { startPage: number; cycleId: string; resumed: boolean } {
  if (saved && saved.phase === "in-progress" && saved.pageSize === pageLimit && saved.lastCompletedPage > 0) {
    return { startPage: saved.lastCompletedPage + 1, cycleId: saved.cycleId, resumed: true };
  }
  return { startPage: 1, cycleId: `msync-${randomUUID().slice(0, 8)}`, resumed: false };
}

// ==========================================================================
// قفل همزمانی sync — HOTFIX-05 (B6)
// ==========================================================================
// الگوی __divarScanRunning (lib/divar/scan.ts) به لایه sync منتقل شد:
// همگام‌سازی deleteMany+createMany هرگز نباید موازی اجرا شود. فراخوان‌های
// موازی به همان اجرای در-جریان «می‌پیوندند» (نتیجه مشترک، بدون شروع مجدد).

let __armSyncInFlight: Promise<SyncResult> | null = null;
let __armSyncExecutionCount = 0;

/** آیا همگام‌سازی ARM در جریان است؟ (برای مشاهده‌پذیری/تست) */
export function isArmSyncInFlight(): boolean {
  return __armSyncInFlight !== null;
}

/** تعداد اجرای واقعی sync از بالا آمدن فرایند — متریک ضد-همزمانی (HOTFIX-05) */
export function getArmSyncExecutionCount(): number {
  return __armSyncExecutionCount;
}

/** همگام‌سازی با توکن ARM — با قفل همزمانی: اجرای موازی = پیوستن به اجرای جاری */
export function syncFromArm(armToken: string): Promise<SyncResult> {
  if (__armSyncInFlight) return __armSyncInFlight; // در جریان است → صبر تا اتمام (نه شروع مجدد)
  __armSyncExecutionCount += 1;
  __armSyncInFlight = doSyncFromArm(armToken).finally(() => {
    __armSyncInFlight = null;
  });
  return __armSyncInFlight;
}

async function readSyncState() {
  let state = await db.syncState.findUnique({ where: { id: SYNC_STATE_ID } });
  if (!state) {
    state = await db.syncState.create({ data: { id: SYNC_STATE_ID } });
  }
  return state;
}

function parseSummary(json: string | null | undefined): TradedSummary | null {
  if (!json) return null;
  try {
    const s = JSON.parse(json) as TradedSummary;
    if (typeof s.totalCount === "number") return s;
    return null;
  } catch {
    return null;
  }
}

/** خواندن وضعیت همگام‌سازی برای نمایش (بدون خطا پرتاب نمی‌شود) */
export async function getSyncState(): Promise<SyncStateInfo> {
  const state = await readSyncState();
  const [txCount, exCount, inCount, viCount, sdCount] = await Promise.all([
    db.transactionRecord.count(),
    db.expertRecord.count(),
    db.interactionRecord.count(),
    db.visitRecord.count(),
    db.supplyDemandRecord.count(),
  ]);
  return {
    lastSyncedAt: state.lastSyncedAt?.toISOString() ?? null,
    lastSuccessAt: state.lastSuccessAt?.toISOString() ?? null,
    lastError: state.lastError,
    lastErrorCode: state.lastErrorCode,
    transactionCount: txCount,
    expertCount: exCount,
    interactionCount: inCount,
    visitCount: viCount,
    supplyDemandCount: sdCount,
    summary: parseSummary(state.summaryJson),
    attempts: state.attempts,
  };
}

async function writeSyncState(patch: {
  lastSyncedAt?: Date;
  lastSuccessAt?: Date;
  lastError?: string | null;
  lastErrorCode?: string | null;
  attempts?: number;
  summaryJson?: string | null;
  /** P2-04 — نقطه ازسرگیری (JSON {runId, done, counts}) */
  lastSyncCursor?: string | null;
  /** P2-04 — علامت آب آخرین داده تازه */
  lastWatermark?: Date | null;
  /** P2-04 — شناسه اجرای جاری */
  syncRunId?: string | null;
}): Promise<void> {
  await db.syncState.upsert({
    where: { id: SYNC_STATE_ID },
    update: patch,
    create: { id: SYNC_STATE_ID, ...patch },
  });
}

// ==========================================================================
// استخراج داده واقعی
// ==========================================================================

// ==========================================================================
// رفع باگ sync — ملکا-شورا-۰۰۷ بخش B.1 (کشف‌های شب ۱ Recon)
// ==========================================================================
// ریشهٔ خالی‌بودن همهٔ جدول‌های production (SyncState.lastError با attempts=7):
//  (۱) گزارش‌های realtor-reports/* بدون startDate+endDate → HTTP 400
//      «لطفا یک بازه تاریخی انتخاب کنید» — فقط startDate هم کافی نیست (s2-depth).
//  (۲) traded-count-total فقط «خلاصهٔ چهارگانه» می‌دهد (rowKeys=[] در همهٔ ۲۰۰های
//      شب ۱) — لیست ردیف‌های معامله از traded-count می‌آید (count/list/page/totalPages).
//      قبلاً لیست از total خواسته می‌شد ⇒ حتی با ۲۰۰ هم همیشه خالی.

/**
 * بازهٔ پیش‌فرض گزارش‌های realtor-reports — عین خود سامانه (کشف B.4-استاتیک):
 * صفحه‌های TradedStatistics و realtor-interactions هر دو تاریخ انتخابی را با
 * toDate().toISOString() سریال می‌کنند و لایهٔ درخواست (Qn) پارامترها را بدون
 * هیچ تبدیلی به axios می‌دهد ⇒ قالب «ISO کامل» است، نه جلالی.
 * (بازتفسیر شب ۱: 200 با totalCount=0 روی قالب جلالی — احتمال ریشهٔ قالب به‌همراه scope)
 */
export function buildReportDateRange(now: Date = new Date()): { startDate: string; endDate: string } {
  // مبدأ مستند دستور: 2018-01-01 میلادی (= 1396/10/11 جلالی)
  const startDate = "2018-01-01T00:00:00.000Z";
  // مقصد = نیمه‌شب امروز تهران به ISO (عین انتخاب تاریخ «امروز» در datepicker خود سامانه)
  const tehranToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const endDate = new Date(`${tehranToday}T00:00:00+03:30`).toISOString();
  return { startDate, endDate };
}

/** خلاصهٔ چهارگانهٔ گزارش تطابق از traded-count-total (تک‌تماس، با بازه) */
async function fetchTradedSummary(
  armToken: string,
  range: { startDate: string; endDate: string }
): Promise<TradedSummary | null> {
  try {
    const cfg = getMelkApiConfig();
    const res = await armCall<unknown>({
      path: MELK_ENDPOINTS.arm.tradedTotal,
      baseUrl: cfg.armApiBase,
      token: armToken,
      query: { ...range },
      timeoutMs: cfg.timeoutMs,
      maxRetries: 0,
    });
    return mapArmTradedSummary(res.data ?? null);
  } catch {
    return null; // خلاصهٔ غیربحرانی است — در نبودش از خود ردیف‌ها محاسبه می‌شود
  }
}

/** PN-028/خامساً-ث — بازهٔ گزارشِ پنجرهٔ اخیر: «همین چند روز گذشته تا الان»
 *  (عین قالب ISO خود سامانه — سازگار با buildReportDateRange) */
export function buildRecentReportDateRange(days: number, now: Date = new Date()): { startDate: string; endDate: string } {
  const from = new Date(now.getTime() - Math.max(1, days) * 24 * 3600 * 1000);
  return { startDate: from.toISOString(), endDate: buildReportDateRange(now).endDate };
}

/**
 * خواندن یک گزارش صفحه‌بندی‌شده تا انتها (با سقف ایمن صفحات).
 * baseQuery = پارامترهای الزامی گزارش (مثل بازهٔ تاریخی) که در همهٔ صفحات تکرار می‌شوند.
 *
 * PN-022-A/مرحلهٔ۱ (اولاً-۳) — سه قابلیت تازه:
 *   opts.checkpointId → سنک صفحه‌ای با ازسرگیری (چرخهٔ ناتمام از آخرین صفحهٔ
 *   کامل + ۱ ادامه می‌یابد — عین الگوی P6.5-11 بند ب؛ ترتیب: داده نوشته شد ⇒ مهر پیشروی)
 *   opts.onPage → اعمال بلافاصلهٔ هر صفحه (مسیر افزایشی — پیشروی نجات‌پذیر)
 *   تلاش مجدد گذرا (maxRetries=۲) — ریشهٔ «تأخیرهای مکرر»: قبلاً maxRetries=۰
 *   بود و یک لرزش ۵۰۲/۵۰۴ nginx کل زنجیرهٔ ۷۰ثانیه‌ای را می‌کشت.
 */
async function fetchAllPages<T>(
  path: string,
  armToken: string,
  maxPages: number,
  pageLimit: number,
  mapRow: (row: Record<string, unknown>, index: number, page: number, limit: number) => T | null,
  baseQuery: Record<string, string | number> = {},
  opts: { checkpointId?: string; onPage?: (rows: T[]) => Promise<void> } = {}
): Promise<{ rows: T[] } & PagedFetchOutcome> {
  const cfg = getMelkApiConfig();
  const rows: T[] = [];
  // ---- checkpoint: تصمیم نقطهٔ شروع (چرخهٔ ناتمام → ازسرگیری) ----
  const savedCp = opts.checkpointId ? await getIntegrationRepository().getSyncCheckpoint(opts.checkpointId) : null;
  const cycle = resolveMainSyncStart(savedCp, pageLimit);
  // بودجهٔ صفحات = در هر اجرا؛ چرخهٔ ناتمام در اجراهای بعدی ادامه می‌یابد
  const endPageExclusive = cycle.startPage + Math.max(1, maxPages);
  let totalPages = savedCp?.totalPages ?? 0;
  let totalAtSource = savedCp?.totalAtSource ?? 0;
  let pagesFetched = 0;
  let page = cycle.startPage;
  for (; page < endPageExclusive; page++) {
    const res = await armCall<unknown>({
      path,
      baseUrl: cfg.armApiBase,
      token: armToken,
      query: { ...baseQuery, page, limit: pageLimit },
      timeoutMs: cfg.timeoutMs,
      // PN-022-A/مرحلهٔ۱ — خطاهای گذرای ۵۰۲/۵۰۳/۵۰۴/تایم‌اوت (retryable) با
      // بک‌آف ۸۰۰/۱۶۰۰ms دوباره پرسیده می‌شوند؛ ۴xx هرگز تلاش مجدد نمی‌شود
      maxRetries: 2,
    });
    const { rows: pageRows, total, totalPages: tp } = extractPagedList(res.data, (row, i) => mapRow(row, i, page, pageLimit));
    rows.push(...pageRows);
    totalPages = tp ?? 0;
    totalAtSource = total ?? 0;
    pagesFetched += 1;
    const pages = tp || (total > 0 ? Math.ceil(total / pageLimit) : 1);
    const isLast = page >= pages || pageRows.length === 0;
    // اعمال بلافاصلهٔ صفحه (مسیر افزایشی) — پیش از مهر checkpoint (ترتیب حیاتی)
    if (opts.onPage && pageRows.length > 0) await opts.onPage(pageRows);
    if (opts.checkpointId) {
      await advanceMainSyncCheckpoint(
        opts.checkpointId,
        { cycleId: cycle.cycleId, pageSize: pageLimit, lastCompletedPage: page, totalPages: pages, totalAtSource: total },
        isLast ? "complete" : "in-progress"
      );
    }
    if (isLast) break;
    // احتیاط توصیه‌شدهٔ ملکا-شورا-۰۰۷ — فاصلهٔ کوتاه بین صفحات: rate آزاد، ولی
    // بدون burst (پیک صبح شنبهٔ شب ۱ نشان داد لبهٔ مبدأ در فشار لحظه‌ای سیاه‌چاله می‌شود)
    await new Promise((r) => setTimeout(r, 400));
  }
  return { rows, resumed: cycle.resumed, pagesFetched, startPage: cycle.startPage, totalPages, totalAtSource };
}

/**
 * استخراج کامل معاملات، کارشناسان، تعاملات، بازدیدها و عرضه/تقاضا از سامانه ARM
 * با توکن ARM. صفحه‌بندی به‌طور خودکار طی می‌شود (تا سقف ایمن صفحات).
 * (پیاده‌سازی داخلی — همیشه از syncFromArm استفاده کنید تا قفل همزمانی اعمال شود)
 *
 * PN-022-A/مرحلهٔ۱ (اولاً-۳) — در مسیر افزایشی هر خانواده «صفحه‌به-صفحه» اعمال
 * می‌شود (onPage) و checkpoint همان‌جا جلو می‌رود؛ شکستِ میانی، پیشرویِ
 * نجات‌پذیر می‌سازد و اجرای بعدی از همان صفحه ادامه می‌یابد. جاروی
 * سنگ‌قبرها فقط با کلیدهای کاملِ چرخهٔ کامل اجرا می‌شود (ازسرگیری ⇒ تعویق).
 */
async function doSyncFromArm(armToken: string): Promise<SyncResult> {
  const now = new Date();
  const incremental = syncMode() === "incremental";
  const runId = randomUUID();
  const syncStartedAt = Date.now();
  await writeSyncState({
    lastSyncedAt: now,
    // شناسه اجرا فقط در حالت افزایشی معنا دارد (legacy به آن دست نمی‌زند)
    ...(incremental ? { syncRunId: runId } : {}),
  });
  // P2-05 — رویداد الزامی همگام‌سازی: آغاز
  const rangeForLog = buildReportDateRange();
  logSync("sync-run", { status: "start", mode: incremental ? "incremental" : "legacy", detail: { runId, reportRange: rangeForLog } });

  // PN-022-A/مرحلهٔ۱ — اعمال صفحه‌به-صفحه (فقط مسیر افزایشی؛ legacy عین قبل)
  const pageApplier = <T>(entity: MainSyncFamilyEntity) => {
    if (!incremental) return undefined;
    return async (rows: T[]) => {
      await applyMainSyncFamily(runId, buildMainSyncFamily(entity, rows as never[], runId, { fetched: true }));
    };
  };
  // وضعیت هر خانواده برای جارو (تنها چرخهٔ کاملِ تازه جارو می‌شود)
  const familyCycle: Partial<Record<MainSyncFamilyEntity, { resumed: boolean; fetched: boolean }>> = {};
  const noteCycle = (entity: MainSyncFamilyEntity, o: { resumed: boolean; fetched: boolean }) => {
    familyCycle[entity] = o;
  };

  try {
    // ═══ PN-028/خامساً-ث — پنجرهٔ اخیر (Recent-Window pass) ═══
    // شاهد داده: گزارش traded-count صعودیِ تاریخ قرارداد است (قدیمی‌ترین‌اول) و
    // ادامهٔ checkpoint از میانهٔ تاریخچه می‌رفت ⇒ معاملاتِ امروز/ساعات اخیر (انتهای
    // فهرست) فقط پس از دور کامل می‌رسیدند. درمان: پیش از چرخهٔ تاریخی، یک پنجرهٔ
    // ۲۱روزهٔ اخیر (چند صفحه — سبک و بدون checkpoint) خوانده و بلافاصله اعمال
    // می‌شود؛ upsert بر کلید طبیعی idempotent است. شکستش هرگز چرخهٔ اصلی را
    // نمی‌شکند (بهترین-تلاش). فقط در مسیر افزایشی (حالت تولید).
    if (incremental) {
      try {
        const recentRange = buildRecentReportDateRange(21);
        const recentFetch = await fetchAllPages(
          MELK_ENDPOINTS.arm.tradedCount,
          armToken,
          10,
          100,
          mapArmTradedRow,
          recentRange,
          { onPage: pageApplier<CrmTransaction>("transactions") }
        );
        logSync("sync-run", {
          status: "ok",
          mode: "incremental",
          userId: "recent-window",
          detail: { recentTransactions: recentFetch.rows.length, range: recentRange, note: "PN-028/خامساً-ث — پنجرهٔ ۲۱روزهٔ اخیر، پیش از چرخهٔ تاریخی" },
        });
      } catch {
        // پنجرهٔ اخیر بهترین-تلاش است — چرخهٔ اصلی ادامه می‌یابد
      }
    }

    // ---------------- ۱) گزارش تطابق معاملات + خلاصه ----------------
    // رفع B.1: بازهٔ الزامی ارسال می‌شود و «لیست» از traded-count می‌آید
    // (traded-count-total فقط خلاصهٔ چهارگانه است — کشف شب ۱).
    const range = buildReportDateRange();
    const txFetch = await fetchAllPages(
      MELK_ENDPOINTS.arm.tradedCount,
      armToken,
      50,
      100,
      mapArmTradedRow,
      range,
      { checkpointId: incremental ? MAIN_SYNC_CHECKPOINT_IDS.transactions : undefined, onPage: pageApplier<CrmTransaction>("transactions") }
    );
    const transactions = txFetch.rows;
    noteCycle("transactions", { resumed: txFetch.resumed, fetched: true });
    const endpointSummary = await fetchTradedSummary(armToken, range);
    const summary = resolveTradedSummary(endpointSummary, transactions);

    // ---------------- ۲) فهرست کاربران/مشاوران ----------------
    const exFetch = await fetchAllPages(MELK_ENDPOINTS.arm.realtorsList, armToken, 30, 100, mapArmRealtorRow, {}, {
      checkpointId: incremental ? MAIN_SYNC_CHECKPOINT_IDS.experts : undefined, onPage: pageApplier<CrmExpert>("experts"),
    });
    const experts = exFetch.rows;
    noteCycle("experts", { resumed: exFetch.resumed, fetched: true });

    // ---------------- ۳) تعاملات مشاوران با یکدیگر ----------------
    let interactions: CrmInteraction[] = [];
    try {
      // B.4-استاتیک: صفحهٔ خود سامانه کوئری را فقط با (startDate && endDate) || realtor
      // فعال می‌کند ⇒ بازهٔ گزارش مانند خانوادهٔ realtor-reports ارسال می‌شود
      const inFetch = await fetchAllPages(MELK_ENDPOINTS.arm.realtorInteractions, armToken, 20, 200, mapArmInteractionRow, range, {
        checkpointId: incremental ? MAIN_SYNC_CHECKPOINT_IDS.interactions : undefined, onPage: pageApplier<CrmInteraction>("interactions"),
      });
      interactions = inFetch.rows;
      noteCycle("interactions", { resumed: inFetch.resumed, fetched: true });
    } catch {
      // تعاملات گزارش مکمل است — نبودش نباید کل همگام‌سازی را شکست بدهد
      // (صفحات اعمال‌شدهٔ پیشروی نجات‌پذیرند؛ چرخه در checkpoint باز می‌ماند)
      interactions = [];
      noteCycle("interactions", { resumed: true, fetched: false });
    }

    // ---------------- ۴) بازدیدها و پیگیری‌ها (غیربحرانی) ----------------
    let visits: CrmVisit[] = [];
    try {
      const viFetch = await fetchAllPages(MELK_ENDPOINTS.arm.visitsList, armToken, 20, 100, mapArmVisitRow, {}, {
        checkpointId: incremental ? MAIN_SYNC_CHECKPOINT_IDS.visits : undefined, onPage: pageApplier<CrmVisit>("visits"),
      });
      visits = viFetch.rows;
      noteCycle("visits", { resumed: viFetch.resumed, fetched: true });
    } catch {
      visits = [];
      noteCycle("visits", { resumed: true, fetched: false });
    }

    // ---------------- ۵) گزارش عرضه و تقاضا (غیربحرانی) ----------------
    let supplyDemand: CrmSupplyDemand[] = [];
    try {
      // supply-demand هم‌خانوادهٔ realtor-reports است ⇒ بازهٔ الزامی می‌گیرد
      // (حدس مستندشدهٔ B.1 — اگر سرور پارامتر اضافی را نادیده بگیرد بی‌ضرر است؛
      // بدون بازه این خانواده 400 می‌دهد. شکست همچنان ساکت-fail غیربحرانی است.)
      const sdFetch = await fetchAllPages(MELK_ENDPOINTS.armReports.supplyDemand, armToken, 10, 100, mapArmSupplyDemandRow, range, {
        checkpointId: incremental ? MAIN_SYNC_CHECKPOINT_IDS.supplyDemand : undefined, onPage: pageApplier<CrmSupplyDemand>("supplyDemand"),
      });
      supplyDemand = sdFetch.rows;
      noteCycle("supplyDemand", { resumed: sdFetch.resumed, fetched: true });
    } catch {
      supplyDemand = [];
      noteCycle("supplyDemand", { resumed: true, fetched: false });
    }

    // ---------------- ۶) قراردادها و اسناد (صورت وضعیت‌ها) (غیربحرانی) ----------------
    // لیست + جزئیات هر قرارداد (خریداران، فروشندگان، حق‌السهم مشاوران)
    // (این خانواده واکشی دو مرحله‌ای دارد — checkpoint صفحه‌ای ندارد؛
    // اعمال خانواده‌ای + جاروی کامل همان‌جا انجام می‌شود)
    let contracts: CrmContract[] = [];
    let contractsFetched = false;
    try {
      contracts = await fetchContracts(armToken);
      contractsFetched = true;
    } catch {
      contracts = [];
    }

    // ---------------- ذخیره در پایگاه محلی ----------------
    if (incremental) {
      // P2-04 — مسیر افزایشی: upsert بر کلید طبیعی + نامه مرده
      // PN-022-A/مرحلهٔ۱ — ردیف‌های خانواده‌های صفحه‌ای هم‌اکنون اعمال شده‌اند؛
      // اینجا: قراردادها + جاروی سنگ‌قبرهای چرخه‌های کامل تازه
      const ctFamily = buildMainSyncFamily("contracts", contracts as never[], runId, { fetched: contractsFetched });
      await applyMainSyncFamily(runId, ctFamily);
      const done: Array<{ entity: string; count: number; failed: number }> = [
        { entity: "transactions", count: transactions.length, failed: 0 },
        { entity: "experts", count: experts.length, failed: 0 },
        { entity: "interactions", count: interactions.length, failed: familyCycle.interactions?.fetched ? 0 : -1 },
        { entity: "visits", count: visits.length, failed: familyCycle.visits?.fetched ? 0 : -1 },
        { entity: "supplyDemand", count: supplyDemand.length, failed: familyCycle.supplyDemand?.fetched ? 0 : -1 },
      ];
      // جارو — تنها چرخهٔ کاملِ تازه (نه ازسرگیری‌شده): کلیدهای این اجرا کامل‌اند
      const sweepable: Array<[MainSyncFamilyEntity, unknown[]]> = [
        ["transactions", transactions], ["experts", experts], ["interactions", interactions],
        ["visits", visits], ["supplyDemand", supplyDemand], ["contracts", contracts],
      ];
      for (const [entity, rows] of sweepable) {
        const c = familyCycle[entity];
        const fullFreshCycle = entity === "contracts" ? contractsFetched : c?.fetched === true && c?.resumed === false;
        if (!fullFreshCycle || rows.length === 0) continue;
        await sweepFamilyStale(buildMainSyncFamily(entity, rows as never[], runId, { fetched: true }));
      }
      await writeSyncState({
        lastSyncCursor: JSON.stringify({ runId, done: done.map((d) => d.entity), detail: done }),
      });
    } else {
      // مسیر legacy — عین کد قبلی: پاک‌سازی کامل + درج اتمیک
      await db.$transaction([
        db.transactionRecord.deleteMany({}),
        db.expertRecord.deleteMany({}),
        db.interactionRecord.deleteMany({}),
        db.visitRecord.deleteMany({}),
        db.supplyDemandRecord.deleteMany({}),
        db.contractRecord.deleteMany({}),
        ...toTxCreates(transactions),
        ...toExCreates(experts),
        ...toInCreates(interactions),
        ...toViCreates(visits),
        ...toSdCreates(supplyDemand, runId),
        ...toContractCreates(contracts),
      ]);
    }

    const successAt = new Date();
    await writeSyncState({
      lastSuccessAt: successAt,
      lastError: null,
      lastErrorCode: null,
      attempts: 0,
      summaryJson: summary ? JSON.stringify(summary) : null,
      ...(incremental ? { lastWatermark: successAt } : {}),
    });
    // P2-05 — رویداد الزامی همگام‌سازی: پایان موفق
    logSync("sync-run", {
      status: "ok",
      mode: incremental ? "incremental" : "legacy",
      duration: Date.now() - syncStartedAt,
      detail: {
        runId,
        transactions: transactions.length,
        experts: experts.length,
        interactions: interactions.length,
        visits: visits.length,
        supplyDemand: supplyDemand.length,
        contracts: contracts.length,
      },
    });

    return {
      ok: true,
      transactions: transactions.length,
      experts: experts.length,
      interactions: interactions.length,
      visits: visits.length,
      supplyDemand: supplyDemand.length,
      contracts: contracts.length,
      syncedAt: successAt.toISOString(),
    };
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای نامشخص", 500, false);
    const state = await readSyncState();
    await writeSyncState({
      lastError: e.message,
      lastErrorCode: e.code,
      attempts: state.attempts + 1,
    });
    // P2-05 — رویداد الزامی همگام‌سازی: شکست
    logSync("sync-run", {
      status: "fail",
      mode: incremental ? "incremental" : "legacy",
      duration: Date.now() - syncStartedAt,
      errorCode: e.code,
      detail: { runId },
    });
    return {
      ok: false,
      transactions: 0,
      experts: 0,
      interactions: 0,
      visits: 0,
      supplyDemand: 0,
      contracts: 0,
      syncedAt: now.toISOString(),
      error: e.message,
      errorCode: e.code,
    };
  }
}

/** اگر سامانه خلاصه چهارگانه را نفرستاد، از ردیف‌ها محاسبه می‌شود */
function computeSummaryFromRows(rows: CrmTransaction[]): TradedSummary {
  return {
    totalCount: rows.length,
    hasRequestEvent: rows.filter((r) => r.eventsCount > 0).length,
    hasSuggestedProperty: rows.filter((r) => r.suggestedPropertyCount > 0).length,
    hasBoth: rows.filter((r) => r.eventsCount > 0 && r.suggestedPropertyCount > 0).length,
  };
}

/**
 * انتخاب خلاصهٔ چهارگانهٔ معاملات — شاهد شب ۲ (recon-night2، ۱۴۰۵/۰۶/۲۹):
 * خلاصهٔ endpoint (traded-count-total) برای حساب realtor حتی با بازهٔ ISO درست هم
 * totalCount=0 برمی‌گرداند (خلاصهٔ scope-محور خود آن مسیر)، در حالی که فهرست واقعی
 * (traded-count) همان لحظه ۷۲۴+ ردیف داده می‌دهد. اصل «دادهٔ صادقانه»:
 *  - خلاصهٔ endpoint معتبر و غیرصفر → همان (عین رفتار قبلی)
 *  - خلاصهٔ صفر ولی ردیف واقعی موجود → محاسبه از خود ردیف‌ها (رفع نمایش غلط صفر)
 *  - خلاصهٔ صفر و ردیف هم صفر → همان صفرِ صادقانهٔ endpoint
 *  - خطای endpoint (null) → محاسبه از ردیف‌ها (عین رفتار قبلی)
 */
export function resolveTradedSummary(
  endpointSummary: TradedSummary | null,
  transactions: CrmTransaction[]
): TradedSummary {
  if (endpointSummary === null) return computeSummaryFromRows(transactions);
  if (endpointSummary.totalCount === 0 && transactions.length > 0) {
    return computeSummaryFromRows(transactions);
  }
  return endpointSummary;
}

// ==========================================================================
// P2-04 — همگام‌سازی افزایشی (MELK_SYNC_MODE=incremental)
// ==========================================================================

/** نگاشت‌های upsert — عین فیلدهای toXxxCreates، فقط به‌جای عملیات Prisma شیء ورودی */
/**
 * B.3 (P6.5-04-v2) — نگاشت‌های upsert: لایه ۲ از لایه ۱ در «نقطهٔ نوشتن» مشتق می‌شود
 * (مسیر sync هم مثل خط لولهٔ Bulk نمایشیِ نرمال + خامِ عین منبع می‌نویسد؛
 * توابع خالص، بدون I/O؛ نتیجه idempotent با normalizeBulkRow — همان مقدار)
 */
const normName = (raw: string | null | undefined): string => {
  const s = typeof raw === "string" ? raw : "";
  return normalizeName(s) || s; // نمایشی هرگز خالی نمی‌ماند — fallback خود خام
};
const normMobile = (raw: string | null | undefined): string => {
  const s = typeof raw === "string" ? raw : "";
  return normalizeMobile(s) || s;
};

export const toTxUpsert = (t: CrmTransaction): TransactionUpsertInput => ({
  id: t.id,
  contractDate: new Date(t.contractDate),
  // P6.5-04-e-v2 — لایه ۱ حقیقت: تاریخ خام عین منبع
  rawDate: t.rawDate,
  // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام‌های خام طرفین عین منبع
  rawPropertyCustomer: t.rawPropertyCustomer ?? t.propertyCustomer,
  rawRequestCustomer: t.rawRequestCustomer ?? t.requestCustomer,
  propertyCode: t.propertyCode,
  propertyCustomer: t.propertyCustomer === null ? null : normName(t.rawPropertyCustomer ?? t.propertyCustomer),
  requestCode: t.requestCode,
  requestCustomer: t.requestCustomer === null ? null : normName(t.rawRequestCustomer ?? t.requestCustomer),
  contractHolo: t.contractHolo,
  suggestedPropertyCount: t.suggestedPropertyCount,
  eventsCount: t.eventsCount,
});

export const toExUpsert = (e: CrmExpert): ExpertUpsertInput => ({
  id: e.id,
  personnelCode: e.personnelCode,
  fullName: normName(e.rawFullName ?? e.fullName),
  mobile: normMobile(e.rawMobile ?? e.mobile),
  // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: مقادیر خام عین منبع
  rawFullName: e.rawFullName ?? e.fullName,
  rawMobile: e.rawMobile ?? e.mobile,
  rawBusinessTitle: e.rawBusinessTitle ?? e.businessTitle,
  rawCreator: e.rawCreator ?? e.creator,
  role: e.role,
  businessTitle: normName(e.rawBusinessTitle ?? e.businessTitle),
  creator: e.creator === null ? null : normName(e.rawCreator ?? e.creator),
  active: e.active,
  createdAt: new Date(e.createdAt),
});

export const toInUpsert = (i: CrmInteraction): InteractionUpsertInput => ({
  id: i.id,
  requestRealtorName: normName(i.rawRequestRealtorName ?? i.requestRealtorName),
  propertyRealtorName: normName(i.rawPropertyRealtorName ?? i.propertyRealtorName),
  // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام‌های خام (کلید طبیعی)
  rawRequestRealtorName: i.rawRequestRealtorName ?? i.requestRealtorName,
  rawPropertyRealtorName: i.rawPropertyRealtorName ?? i.propertyRealtorName,
  count: i.count,
});

export const toViUpsert = (v: CrmVisit): VisitUpsertInput => ({
  id: v.id,
  propertyCode: v.propertyCode,
  requesterName: normName(v.rawRequesterName ?? v.requesterName),
  checkerName: normName(v.rawCheckerName ?? v.checkerName),
  propertyRealtorName: normName(v.rawPropertyRealtorName ?? v.propertyRealtorName),
  // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام‌های خام عین منبع
  rawRequesterName: v.rawRequesterName ?? v.requesterName,
  rawCheckerName: v.rawCheckerName ?? v.checkerName,
  rawPropertyRealtorName: v.rawPropertyRealtorName ?? v.propertyRealtorName,
  checkTime: v.checkTime ? new Date(v.checkTime) : null,
  createdAt: new Date(v.createdAt),
  status: v.status,
});

/**
 * B.3 (P6.5-04-v2) — عرضه/تقاضا با مهر provenance:
 * extractedAt + extractionBatchId (= runId همین اجرای sync) + rawSourceVersion تهی صادقانه.
 * normalizationVersion نوشته نمی‌شود (موتور نرمال‌سازی روی این جدول اجرا نمی‌شود — عناوین بازه عین منبع می‌مانند).
 */
export const toSdUpsert = (s: CrmSupplyDemand, runId?: string): SupplyDemandUpsertInput => ({
  id: s.id,
  rangeTitle: s.rangeTitle,
  propertyCount: s.propertyCount,
  requestPercent: s.requestPercent,
  status: s.status,
  ...(runId ? { rawSourceVersion: null, extractedAt: new Date(), extractionBatchId: runId } : {}),
});

export const toContractUpsert = (c: CrmContract): ContractUpsertInput => ({
  id: c.id,
  status: c.status,
  // P6.5-04-e-v2 — لایه ۱ حقیقت: تاریخ خام عین منبع
  rawDate: c.rawDate,
  // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام ثبت‌کننده و عنوان ملک خام
  rawCreatorName: c.rawCreatorName ?? c.creatorName,
  rawPropertyTitle: c.rawPropertyTitle ?? c.propertyTitle,
  contractHolo: c.contractHolo,
  propertyCode: c.propertyCode,
  requestCode: c.requestCode,
  contractType: c.contractType,
  creatorName: c.creatorName === null ? null : normName(c.rawCreatorName ?? c.creatorName),
  createdAt: c.createdAt ? new Date(c.createdAt) : null,
  contractDate: c.contractDate ? new Date(c.contractDate) : null,
  documentDate: c.documentDate ? new Date(c.documentDate) : null,
  deliveryDate: c.deliveryDate ? new Date(c.deliveryDate) : null,
  propertyTitle: c.propertyTitle === null ? null : normName(c.rawPropertyTitle ?? c.propertyTitle),
  propertyAddress: c.propertyAddress,
  buyerListJson: c.buyers.length > 0 ? JSON.stringify(c.buyers) : null,
  sellerListJson: c.sellers.length > 0 ? JSON.stringify(c.sellers) : null,
  realtorListJson: c.realtorShares.length > 0 ? JSON.stringify(c.realtorShares) : null,
  canAddRealtor: c.canAddRealtor,
  // P6.5-12 — مبالغ مالی قرارداد (لایه ۲ عددی + لایه ۱ خام)
  contractPrice: c.contractPrice ?? null,
  rawContractPrice: c.rawContractPrice ?? null,
  comisionOfContract: c.comisionOfContract ?? null,
  taxOfContract: c.taxOfContract ?? null,
  businessId: c.businessId ?? null,
});

/** ثبت/افزایش نامه مرده برای یک ردیف ناموفق — attempts پیاپی؛ ۳+ یعنی «مرده» */
async function recordDeadLetter(runId: string, entity: string, naturalKey: string, err: unknown): Promise<void> {
  const message = ((err as Error)?.message ?? "خطای نامشخص").slice(0, 300);
  await db.syncDeadLetter
    .upsert({
      where: { entity_naturalKey: { entity, naturalKey } },
      create: { runId, entity, naturalKey, attempts: 1, lastError: message },
      update: { runId, attempts: { increment: 1 }, lastError: message, lastAttemptAt: new Date(), resolvedAt: null },
    })
    .catch(() => undefined); // خطای خود نامه مرده هرگز مسیر افزایشی را نمی‌شکند
}

/** ردیفی که این بار موفق شد → نامه مرده‌اش «حل‌شده» می‌شود */
async function resolveDeadLetters(entity: string, naturalKeys: string[]): Promise<void> {
  if (naturalKeys.length === 0) return;
  await db.syncDeadLetter
    .updateMany({ where: { entity, naturalKey: { in: naturalKeys }, resolvedAt: null }, data: { resolvedAt: new Date() } })
    .catch(() => undefined);
}

/** کلیدهای باز (حل‌نشده) یک خانواده — از جاروی سنگ‌قبرها محافظت می‌شوند */
async function openDeadLetterKeys(entity: string): Promise<Set<string>> {
  const rows = await db.syncDeadLetter.findMany({ where: { entity, resolvedAt: null }, select: { naturalKey: true } }).catch(() => []);
  return new Set(rows.map((r) => r.naturalKey));
}

/** مشخصات یک خانواده داده برای مسیر افزایشی */
interface IncrementalFamily<T> {
  entity: MainSyncFamilyEntity;
  rows: T[];
  /** واکشی این خانواده موفق بوده؟ (شکست واکشی ⇒ خانواده دست‌نخورده می‌ماند — تفاوت عمدی با legacy) */
  fetched: boolean;
  keyOf: (row: T) => string;
  upsert: (rows: T[]) => Promise<unknown>;
  /** کلیدهای موجود در پایگاه (برای جاروی سنگ‌قبرها) */
  listExistingKeys: () => Promise<string[]>;
  deleteByKeys: (keys: string[]) => Promise<unknown>;
}

/** موجودیت‌های خانوادهٔ سنک اصلی (کلید نقطهٔ ازسرگیری داده) */
type MainSyncFamilyEntity = "transactions" | "experts" | "interactions" | "visits" | "supplyDemand" | "contracts";

/**
 * PN-022-A/مرحلهٔ۱ (اولاً-۳) — کارخانهٔ خانوادهٔ افزایشی.
 * نگاشت ردیف‌های خام CRM → ورودی upsert همان‌جا انجام می‌شود تا هر دو مسیر
 * (اعمال صفحه‌به-صفحه درون fetchAllPages و اعمال خانواده‌ای applyIncrementalSync)
 * عین هم باشند — صفر انشعاب منطق.
 */
export function buildMainSyncFamily(
  entity: MainSyncFamilyEntity,
  crmRows: never[],
  runId: string,
  opts: { fetched: boolean }
): IncrementalFamily<never> {
  const txRepo = getTransactionRepository();
  const exRepo = getExpertRepository();
  const mkRepo = getMarketRepository();
  const ctRepo = getContractRepository();
  const viRepo = getVisitRepository();
  switch (entity) {
    case "transactions":
      return {
        entity,
        rows: (crmRows as unknown as CrmTransaction[]).map(toTxUpsert) as never[],
        fetched: opts.fetched,
        keyOf: (t) => (t as unknown as TransactionUpsertInput).id,
        upsert: (rows) => txRepo.upsertBatch(rows as unknown as TransactionUpsertInput[]),
        listExistingKeys: async () => (await db.transactionRecord.findMany({ where: { sourceRunId: null }, select: { id: true } })).map((r) => r.id),
        deleteByKeys: (keys) => db.transactionRecord.deleteMany({ where: { id: { in: keys } } }),
      };
    case "experts":
      return {
        entity,
        rows: (crmRows as unknown as CrmExpert[]).map(toExUpsert) as never[],
        fetched: opts.fetched,
        keyOf: (e) => (e as unknown as ExpertUpsertInput).personnelCode,
        upsert: (rows) => exRepo.upsertBatch(rows as unknown as ExpertUpsertInput[]),
        listExistingKeys: async () => (await db.expertRecord.findMany({ where: { sourceRunId: null }, select: { personnelCode: true } })).map((r) => r.personnelCode),
        deleteByKeys: (keys) => db.expertRecord.deleteMany({ where: { personnelCode: { in: keys } } }),
      };
    case "interactions":
      return {
        entity,
        rows: (crmRows as unknown as CrmInteraction[]).map(toInUpsert) as never[],
        fetched: opts.fetched,
        keyOf: (i) => (i as unknown as InteractionUpsertInput).id,
        upsert: (rows) => exRepo.upsertInteractionsBatch(rows as unknown as InteractionUpsertInput[]),
        listExistingKeys: async () => (await db.interactionRecord.findMany({ where: { sourceRunId: null }, select: { id: true } })).map((r) => r.id),
        deleteByKeys: (keys) => db.interactionRecord.deleteMany({ where: { id: { in: keys } } }),
      };
    case "visits":
      return {
        entity,
        rows: (crmRows as unknown as CrmVisit[]).map(toViUpsert) as never[],
        fetched: opts.fetched,
        keyOf: (v) => (v as unknown as VisitUpsertInput).id,
        upsert: (rows) => viRepo.upsertBatch(rows as unknown as VisitUpsertInput[]),
        listExistingKeys: async () => (await db.visitRecord.findMany({ where: { sourceRunId: null }, select: { id: true } })).map((r) => r.id),
        deleteByKeys: (keys) => db.visitRecord.deleteMany({ where: { id: { in: keys } } }),
      };
    case "supplyDemand":
      return {
        entity,
        rows: (crmRows as unknown as CrmSupplyDemand[]).map((s) => toSdUpsert(s, runId)) as never[],
        fetched: opts.fetched,
        keyOf: (s) => (s as unknown as SupplyDemandUpsertInput).id,
        upsert: (rows) => mkRepo.upsertSupplyDemandBatch(rows as unknown as SupplyDemandUpsertInput[]),
        listExistingKeys: async () => (await db.supplyDemandRecord.findMany({ select: { id: true } })).map((r) => r.id),
        deleteByKeys: (keys) => db.supplyDemandRecord.deleteMany({ where: { id: { in: keys } } }),
      };
    case "contracts":
    default:
      return {
        entity: "contracts",
        rows: (crmRows as unknown as CrmContract[]).map(toContractUpsert) as never[],
        fetched: opts.fetched,
        keyOf: (c) => (c as unknown as ContractUpsertInput).id,
        upsert: (rows) => ctRepo.upsertBatch(rows as unknown as ContractUpsertInput[]),
        listExistingKeys: async () => (await db.contractRecord.findMany({ where: { sourceRunId: null }, select: { id: true } })).map((r) => r.id),
        deleteByKeys: (keys) => db.contractRecord.deleteMany({ where: { id: { in: keys } } }),
      };
  }
}

/**
 * اعمال یک خانواده: تلاش دسته‌ای → تک‌تک در شکست (نامهٔ مرده) → حل نامه‌های موفق.
 * (بدون جارو — جارو فقط با کلیدهای کامل چرخهٔ کامل اجرا می‌شود: sweepFamilyStale)
 */
export async function applyMainSyncFamily(runId: string, family: IncrementalFamily<never>): Promise<{ count: number; failed: number }> {
  if (!family.fetched) return { count: 0, failed: -1 }; // -1 = skipped
  const keys = family.rows.map(family.keyOf);
  const failedKeys: string[] = [];
  try {
    // تلاش دسته‌ای (مسیر سریع — اکثر اجراها موفق‌اند)
    await family.upsert(family.rows);
  } catch {
    // شکست دسته‌ای ⇒ تک‌تک برای ایزوله کردن ردیف‌های خراب (upsertها idempotentند)
    for (let i = 0; i < family.rows.length; i++) {
      try {
        await family.upsert([family.rows[i]]);
      } catch (err) {
        failedKeys.push(keys[i]);
        await recordDeadLetter(runId, family.entity, keys[i], err);
      }
    }
  }
  // ردیف‌های موفق این خانواده که قبلاً نامه مرده بودند → حل‌شده
  await resolveDeadLetters(family.entity, keys.filter((k) => !failedKeys.includes(k)));
  return { count: family.rows.length, failed: failedKeys.length };
}

/**
 * جاروی سنگ‌قبرها: ردیف‌هایی که دیگر در سامانه نیستند (به‌جز نامه‌های مرده باز).
 * P6.5-03 — رکوردهای Bulk (sourceRunId غیرتهی) از جارو محافظت می‌شوند:
 * داده تاریخیِ خارج از پوشش واکشی sync است؛ حذفش = حفره داده غیرقابل ترمیم (کشف §۱.۹).
 *
 * PN-022-A/مرحلهٔ۱ — قید صحت: تنها با «کلیدهای کامل یک چرخهٔ کاملِ تازه» صدا
 * زده می‌شود؛ چرخهٔ ازسرگیری‌شده کلیدهای ناقص دارد و جارو تا چرخهٔ کامل بعد تعویق
 * می‌خورد (حذف نادرست = حفرهٔ داده).
 */
export async function sweepFamilyStale(family: IncrementalFamily<never>): Promise<number> {
  try {
    const keys = family.rows.map(family.keyOf);
    const existing = await family.listExistingKeys();
    const fetchedSet = new Set(keys);
    const openDead = await openDeadLetterKeys(family.entity);
    const stale = existing.filter((k) => !fetchedSet.has(k) && !openDead.has(k));
    if (stale.length > 0) await family.deleteByKeys(stale);
    return stale.length;
  } catch {
    // جارو شکست خورد ⇒ اجرا همچنان موفق است؛ دفع بعد تمیز می‌کند
    return 0;
  }
}

/**
 * اعمال افزایشی: به‌جای پاک‌سازی کامل، upsert بر کلید طبیعی + جاروی
 * ردیف‌های محو‌شده (با محافظت نامه‌های مرده باز) + نقطه ازسرگیری پس از
 * هر خانواده. شکست ردیف منفرد کل اجرا را نمی‌شکند (نامه مرده می‌شود).
 */
/** صادرات برای تست (tests/phase2-sync.test.ts) — در کد محصول از syncFromArm استفاده کنید */
export async function applyIncrementalSync(
  runId: string,
  data: {
    transactions: CrmTransaction[];
    experts: CrmExpert[];
    interactions: CrmInteraction[];
    visits: CrmVisit[];
    supplyDemand: CrmSupplyDemand[];
    contracts: CrmContract[];
    interactionsFetched: boolean;
    visitsFetched: boolean;
    supplyDemandFetched: boolean;
    contractsFetched: boolean;
  }
): Promise<void> {
  const families: IncrementalFamily<never>[] = [
    buildMainSyncFamily("transactions", data.transactions as never[], runId, { fetched: true }),
    buildMainSyncFamily("experts", data.experts as never[], runId, { fetched: true }),
    buildMainSyncFamily("interactions", data.interactions as never[], runId, { fetched: data.interactionsFetched }),
    buildMainSyncFamily("visits", data.visits as never[], runId, { fetched: data.visitsFetched }),
    buildMainSyncFamily("supplyDemand", data.supplyDemand as never[], runId, { fetched: data.supplyDemandFetched }),
    buildMainSyncFamily("contracts", data.contracts as never[], runId, { fetched: data.contractsFetched }),
  ];

  const done: Array<{ entity: string; count: number; failed: number }> = [];

  // شناسه اجرا از همان ابتدا ثبت می‌شود (خودکفا بودن applier برای تست/فراخوانی مستقیم)
  await writeSyncState({ syncRunId: runId });

  for (const family of families) {
    // واکشی ناموفق ⇒ این خانواده در این اجرا دست‌نخورده می‌ماند (از دست رفتن داده نداریم)
    if (!family.fetched) {
      done.push({ entity: family.entity, count: 0, failed: -1 }); // -1 = skipped
      continue;
    }
    const applied = await applyMainSyncFamily(runId, family);
    await sweepFamilyStale(family);
    // نقطه ازسرگیری — پس از هر خانواده به‌روزرسانی می‌شود
    done.push({ entity: family.entity, count: applied.count, failed: applied.failed });
    await writeSyncState({
      lastSyncCursor: JSON.stringify({ runId, done: done.map((d) => d.entity), detail: done }),
    });
  }
}

/**
 * همگام‌سازی با توکن ARM نشست جاری — اگر توکن منقضی شده باشد
 * ابتدا با refreshToken تمدید می‌شود.
 */
export async function syncWithRefresh(
  armToken: string,
  armRefreshToken: string
): Promise<{ sync: SyncResult; newArmToken?: string }> {
  const provider = getMelkProvider();
  let token = armToken;
  let newArmToken: string | undefined;

  // تلاش اول؛ در صورت انقضا، تمدید و تلاش مجدد
  let sync = await syncFromArm(token);
  if (!sync.ok && (sync.errorCode === "UNAUTHORIZED" || sync.errorCode === "OTP_INVALID") && armRefreshToken) {
    try {
      const refreshed = await provider.refreshArmToken(armRefreshToken);
      token = refreshed.accessToken;
      newArmToken = refreshed.accessToken;
      sync = await syncFromArm(token);
    } catch (refreshErr) {
      const e = refreshErr instanceof MelkApiError ? refreshErr : new MelkApiError("UNKNOWN", "تمدید توکن ناموفق", 401, false);
      sync = { ok: false, transactions: 0, experts: 0, interactions: 0, visits: 0, supplyDemand: 0, contracts: 0, syncedAt: new Date().toISOString(), error: e.message, errorCode: e.code };
    }
  }
  return { sync, newArmToken };
}

/**
 * در صورت خالی‌بودن کش، داده‌های واقعی را با توکن ARM بارگذاری می‌کند.
 *
 * PN-020/گام اول-ج۲ — ریشه‌یابی خطای ۵۰۴ بروزرسانی فهرست معاملات:
 *   پیش از این، «خالی‌بودن کش + وجود توکن» یعنی اجرای زنجیرهٔ کامل
 *   همگام‌سازی «درونِ همان درخواست فهرست» — زنجیرهٔ کامل (۱۳۰+ صفحهٔ ARM ×
 *   ۴۰۰ms + غنی‌سازی) در شواهد زنده ۷۰.۸ ثانیه طول کشیده ← دروازهٔ proxy
 *   پیش‌باز / مرورگر در ۶۰-۹۰ ثانیه می‌بُرد ← ۵۰۴ تکرارشونده تا پرشدن کش.
 *   از این‌پس حالت «background» (که همهٔ روت‌های GET فهرست‌ها استفاده می‌کنند)
 *   کار را در پس‌زمینه آغاز می‌کند (قفل HOTFIX-05 فراخوان‌های موازی را به همان
 *   اجرا می‌پیوندد) و پاسخ فوری برمی‌گردد؛ روت صریحاً همگام (تست‌ها) دست‌نخورده است.
 */
export async function ensureSeeded(
  armToken?: string,
  opts: { background?: boolean } = {}
): Promise<{ transactions: number; experts: number; interactions: number; visits: number; supplyDemand: number; liveError?: string; seedPending?: boolean }> {
  const [txCount, exCount, inCount, viCount, sdCount] = await Promise.all([
    db.transactionRecord.count(),
    db.expertRecord.count(),
    db.interactionRecord.count(),
    db.visitRecord.count(),
    db.supplyDemandRecord.count(),
  ]);

  if ((txCount === 0 || exCount === 0) && armToken) {
    // PN-020/گام اول-ج۲ — مسیر غیرمسدود: شروع پس‌زمینه‌ای + پاسخ فوری
    if (opts.background) {
      void syncWithRefresh(armToken, "").catch(() => undefined);
      return { transactions: txCount, experts: exCount, interactions: inCount, visits: viCount, supplyDemand: sdCount, seedPending: true };
    }
    const { sync } = await syncWithRefresh(armToken, "");
    if (sync.ok) return { transactions: sync.transactions, experts: sync.experts, interactions: sync.interactions, visits: sync.visits, supplyDemand: sync.supplyDemand };
    return { transactions: txCount, experts: exCount, interactions: inCount, visits: viCount, supplyDemand: sdCount, liveError: sync.error };
  }
  return { transactions: txCount, experts: exCount, interactions: inCount, visits: viCount, supplyDemand: sdCount };
}

/**
 * پاک‌سازی کامل کش CRM — تابع واحد شش‌جدولی (HOTFIX-05)
 * هم connection/reset و هم resetCrmCache از همین تابع استفاده می‌کنند تا
 * «ریست» در کل سیستم فقط یک تعریف داشته باشد (قبلاً: ۳ جدول در روت vs ۶ جدول اینجا).
 *
 * P6527 — بکاپ خودکار پیش از پاک‌سازی (رفع دائمی حادثهٔ ۱۴۰۵/۰۷/۰۴):
 * «ریست اتصال» مالک با توکن مرده، ۷۳۹ معامله + ۲۹۱ کارشناس را بدون مسیر
 * بازیابی از بین برد (شاهد: backups/pre-p6525 = ۷39 معامله، pre-p6526 = صفر).
 * از این پس پیش از هر پاک‌سازیِ غیرخالی، یک snapshot کامل (VACUUM INTO) در
 * backups/pre-reset-<زمان>.db ساخته می‌شود — بهترین-تلاش: شکست بکاپ هرگز
 * خود ریست را نمی‌شکند؛ نام فایل در خروجی و رخداد حسابرسی برمی‌گردد.
 */
export interface ClearCrmResult {
  cleared: boolean;
  /** فایل بکاپ خودکار (اگر داده‌ای برای بکاپ بود و ساخت موفق بود) */
  backupFile?: string;
}

function resolveBackupsDir(): string {
  // db/custom.db → دو سطح بالا = ریشهٔ پروژه/backups
  const dbUrl = process.env.DATABASE_URL ?? "file:db/custom.db";
  const dbFile = dbUrl.replace(/^file:/, "");
  return pathResolve(dirname(dbFile), "..", "backups");
}

export async function clearCrmCacheTables(): Promise<ClearCrmResult> {
  const [txCount, exCount, inCount, viCount, sdCount, ctCount] = await Promise.all([
    db.transactionRecord.count(),
    db.expertRecord.count(),
    db.interactionRecord.count(),
    db.visitRecord.count(),
    db.supplyDemandRecord.count(),
    db.contractRecord.count(),
  ]);
  const hasData = txCount + exCount + inCount + viCount + sdCount + ctCount > 0;

  let backupFile: string | undefined;
  if (hasData) {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const suffix = Math.random().toString(36).slice(2, 8);
      const dir = resolveBackupsDir();
      mkdirSync(dir, { recursive: true });
      backupFile = `${dir}/pre-reset-${stamp}-${suffix}.db`;
      // ENGINE: sqlite-only (dbHealth شاخهٔ موتور — سوییچ PN-022-C)
      await db.$executeRawUnsafe(`VACUUM INTO '${backupFile}'`);
    } catch {
      // بکاپ بهترین-تلاش است — پاک‌سازی درخواست‌شده همچنان اجرا می‌شود
      backupFile = undefined;
    }
  }

  await db.transactionRecord.deleteMany({});
  await db.expertRecord.deleteMany({});
  await db.interactionRecord.deleteMany({});
  await db.visitRecord.deleteMany({});
  await db.supplyDemandRecord.deleteMany({});
  await db.contractRecord.deleteMany({});
  return { cleared: true, backupFile };
}

/** پاک‌سازی کامل کش و استخراج مجدد از سامانه واقعی (دکمه ریست اتصال) */
export async function resetCrmCache(armToken: string): Promise<SyncResult> {
  await clearCrmCacheTables();
  return syncFromArm(armToken);
}

function toTxCreates(rows: CrmTransaction[]) {
  return rows.map((t) =>
    db.transactionRecord.create({
      data: {
        id: t.id,
        contractDate: new Date(t.contractDate),
        propertyCode: t.propertyCode,
        propertyCustomer: t.propertyCustomer === null ? null : normName(t.rawPropertyCustomer ?? t.propertyCustomer),
        requestCode: t.requestCode,
        requestCustomer: t.requestCustomer === null ? null : normName(t.rawRequestCustomer ?? t.requestCustomer),
        contractHolo: t.contractHolo,
        suggestedPropertyCount: t.suggestedPropertyCount,
        eventsCount: t.eventsCount,
        // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: خام‌ها عین منبع
        ...(t.rawDate !== undefined ? { rawDate: t.rawDate } : {}),
        ...(t.rawPropertyCustomer !== undefined ? { rawPropertyCustomer: t.rawPropertyCustomer ?? t.propertyCustomer } : {}),
        ...(t.rawRequestCustomer !== undefined ? { rawRequestCustomer: t.rawRequestCustomer ?? t.requestCustomer } : {}),
      },
    })
  );
}

function toExCreates(rows: CrmExpert[]) {
  return rows.map((e) =>
    db.expertRecord.create({
      data: {
        id: e.id,
        personnelCode: e.personnelCode,
        fullName: normName(e.rawFullName ?? e.fullName),
        mobile: normMobile(e.rawMobile ?? e.mobile),
        role: e.role,
        businessTitle: normName(e.rawBusinessTitle ?? e.businessTitle),
        creator: e.creator === null ? null : normName(e.rawCreator ?? e.creator),
        active: e.active,
        createdAt: new Date(e.createdAt),
        // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: خام‌ها عین منبع
        ...(e.rawFullName !== undefined ? { rawFullName: e.rawFullName ?? e.fullName } : {}),
        ...(e.rawMobile !== undefined ? { rawMobile: e.rawMobile ?? e.mobile } : {}),
        ...(e.rawBusinessTitle !== undefined ? { rawBusinessTitle: e.rawBusinessTitle ?? e.businessTitle } : {}),
        ...(e.rawCreator !== undefined ? { rawCreator: e.rawCreator ?? e.creator } : {}),
      },
    })
  );
}

function toInCreates(rows: CrmInteraction[]) {
  return rows.map((i) =>
    db.interactionRecord.create({
      data: {
        id: i.id,
        requestRealtorName: normName(i.rawRequestRealtorName ?? i.requestRealtorName),
        propertyRealtorName: normName(i.rawPropertyRealtorName ?? i.propertyRealtorName),
        count: i.count,
        // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام‌های خام (کلید طبیعی)
        ...(i.rawRequestRealtorName !== undefined ? { rawRequestRealtorName: i.rawRequestRealtorName ?? i.requestRealtorName } : {}),
        ...(i.rawPropertyRealtorName !== undefined ? { rawPropertyRealtorName: i.rawPropertyRealtorName ?? i.propertyRealtorName } : {}),
      },
    })
  );
}

function toViCreates(rows: CrmVisit[]) {
  return rows.map((v) =>
    db.visitRecord.create({
      data: {
        id: v.id,
        propertyCode: v.propertyCode,
        requesterName: normName(v.rawRequesterName ?? v.requesterName),
        checkerName: normName(v.rawCheckerName ?? v.checkerName),
        propertyRealtorName: normName(v.rawPropertyRealtorName ?? v.propertyRealtorName),
        checkTime: v.checkTime ? new Date(v.checkTime) : null,
        createdAt: new Date(v.createdAt),
        status: v.status,
        // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام‌های خام
        ...(v.rawRequesterName !== undefined ? { rawRequesterName: v.rawRequesterName ?? v.requesterName } : {}),
        ...(v.rawCheckerName !== undefined ? { rawCheckerName: v.rawCheckerName ?? v.checkerName } : {}),
        ...(v.rawPropertyRealtorName !== undefined ? { rawPropertyRealtorName: v.rawPropertyRealtorName ?? v.propertyRealtorName } : {}),
      },
    })
  );
}

/** B.3 (P6.5-04-v2) — عرضه/تقاضا با مهر provenance (عین toSdUpsert — مسیر legacy) */
function toSdCreates(rows: CrmSupplyDemand[], runId?: string) {
  return rows.map((s) =>
    db.supplyDemandRecord.create({
      data: {
        id: s.id,
        rangeTitle: s.rangeTitle,
        propertyCount: s.propertyCount,
        requestPercent: s.requestPercent,
        status: s.status,
        ...(runId ? { rawSourceVersion: null, extractedAt: new Date(), extractionBatchId: runId } : {}),
      },
    })
  );
}

// ==========================================================================
// قراردادها و اسناد — استخراج لیست + جزئیات
// ==========================================================================

/**
 * استخراج قراردادها (صورت وضعیت‌ها): ابتدا لیست صفحه‌بندی‌شده، سپس
 * جزئیات کامل هر قرارداد (خریداران/فروشندگان/حق‌السهم مشاوران).
 * جزئیات فقط برای ۴۰۰ قرارداد نخست گرفته می‌شود (حفاظت از بار سامانه).
 */
export async function fetchContracts(armToken: string): Promise<CrmContract[]> {
  const cfg = getMelkApiConfig();
  const { rows } = await fetchAllPages(MELK_ENDPOINTS.arm.tradeOverviewsList, armToken, 30, 100, mapArmContractRow);
  const detailed: CrmContract[] = [];
  for (const c of rows.slice(0, 400)) {
    try {
      const info = await armCall<unknown>({
        path: MELK_ENDPOINTS.arm.tradeOverviewInfo(c.id),
        baseUrl: cfg.armApiBase,
        token: armToken,
        timeoutMs: cfg.timeoutMs,
        maxRetries: 0,
      });
      detailed.push(mergeArmContractInfo(c, info.data));
    } catch {
      // جزئیات این قرارداد در دسترس نیست — همان ردیف لیست نگه داشته می‌شود
      detailed.push(c);
    }
  }
  return detailed;
}

function toContractCreates(rows: CrmContract[]) {
  return rows.map((c) =>
    db.contractRecord.create({
      data: {
        id: c.id,
        status: c.status,
        contractHolo: c.contractHolo,
        propertyCode: c.propertyCode,
        requestCode: c.requestCode,
        contractType: c.contractType,
        creatorName: c.creatorName === null ? null : normName(c.rawCreatorName ?? c.creatorName),
        createdAt: c.createdAt ? new Date(c.createdAt) : null,
        contractDate: c.contractDate ? new Date(c.contractDate) : null,
        documentDate: c.documentDate ? new Date(c.documentDate) : null,
        deliveryDate: c.deliveryDate ? new Date(c.deliveryDate) : null,
        propertyTitle: c.propertyTitle === null ? null : normName(c.rawPropertyTitle ?? c.propertyTitle),
        propertyAddress: c.propertyAddress,
        buyerListJson: c.buyers.length > 0 ? JSON.stringify(c.buyers) : null,
        sellerListJson: c.sellers.length > 0 ? JSON.stringify(c.sellers) : null,
        realtorListJson: c.realtorShares.length > 0 ? JSON.stringify(c.realtorShares) : null,
        canAddRealtor: c.canAddRealtor,
        // P6.5-12 — مبالغ مالی قرارداد
        ...(c.contractPrice !== undefined && c.contractPrice !== null ? { contractPrice: c.contractPrice } : {}),
        ...(c.rawContractPrice ? { rawContractPrice: c.rawContractPrice } : {}),
        ...(c.comisionOfContract !== undefined && c.comisionOfContract !== null ? { comisionOfContract: c.comisionOfContract } : {}),
        ...(c.taxOfContract !== undefined && c.taxOfContract !== null ? { taxOfContract: c.taxOfContract } : {}),
        ...(c.businessId ? { businessId: c.businessId } : {}),
        // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: خام‌ها عین منبع
        ...(c.rawDate !== undefined ? { rawDate: c.rawDate } : {}),
        ...(c.rawCreatorName !== undefined ? { rawCreatorName: c.rawCreatorName ?? c.creatorName } : {}),
        ...(c.rawPropertyTitle !== undefined ? { rawPropertyTitle: c.rawPropertyTitle ?? c.propertyTitle } : {}),
      },
    })
  );
}

// ==========================================================================
// فهرست‌های مرجع عمومی — بدون توکن (لایه عمومی سامانه ARM و مالی fm)
// ==========================================================================

/** کلیدهای کش فهرست‌های عمومی */
export const REF_KEYS = {
  characters: "user-characters",
  jobs: "user-jobs",
  roles: "user-roles",
  seriousness: "user-seriousness",
  priceIndices: "price-indices",
  commissionConfig: "commission-config",
} as const;

/** عمر مفید کش فهرست‌های عمومی — ۶ ساعت */
const REF_TTL_MS = 6 * 60 * 60 * 1000;

/** خواندن کش فهرست عمومی — null اگر نیست یا کهنه است */
async function readRefCache<T>(key: string): Promise<T | null> {
  const row = await db.refListCache.findUnique({ where: { key } });
  if (!row) return null;
  const age = Date.now() - row.fetchedAt.getTime();
  if (age > REF_TTL_MS) return null;
  try {
    return JSON.parse(row.dataJson) as T;
  } catch {
    return null;
  }
}

/** نوشتن کش فهرست عمومی */
async function writeRefCache(key: string, data: unknown): Promise<void> {
  await db.refListCache.upsert({
    where: { key },
    update: { dataJson: JSON.stringify(data), fetchedAt: new Date() },
    create: { key, dataJson: JSON.stringify(data) },
  });
}

/**
 * فهرست‌های مرجع باشگاه مشتریان — عمومی (بدون توکن) با کش ۶ ساعته:
 * شخصیت‌ها، شغل‌ها، نقش‌ها و جدیت مشتریان.
 */
export async function getCustomerRefLists(forceRefresh = false): Promise<{
  characters: RefListItem[];
  jobs: RefListItem[];
  roles: RefListItem[];
  seriousness: RefListItem[];
  liveError: string | null;
}> {
  const cfg = getMelkApiConfig();
  if (!forceRefresh) {
    const [characters, jobs, roles, seriousness] = await Promise.all([
      readRefCache<RefListItem[]>(REF_KEYS.characters),
      readRefCache<RefListItem[]>(REF_KEYS.jobs),
      readRefCache<RefListItem[]>(REF_KEYS.roles),
      readRefCache<RefListItem[]>(REF_KEYS.seriousness),
    ]);
    if (characters && jobs && roles && seriousness) {
      return { characters, jobs, roles, seriousness, liveError: null };
    }
  }

  try {
    const [charRes, jobRes, roleRes, seriousRes] = await Promise.all(
      [
        MELK_ENDPOINTS.arm.userCharacters,
        MELK_ENDPOINTS.arm.userJobs,
        MELK_ENDPOINTS.arm.userRoles,
        MELK_ENDPOINTS.arm.userSeriousness,
      ].map(async (path) => {
        const r = await armCall<unknown>({
          path,
          baseUrl: cfg.armApiBase,
          timeoutMs: cfg.timeoutMs,
          maxRetries: 1,
        });
        return r.data;
      })
    );
    const characters = mapRefList(charRes);
    const jobs = mapRefList(jobRes);
    const roles = mapRefList(roleRes);
    const seriousness = mapRefList(seriousRes);
    // ذخیره کش حتی ناقص — هر فهرست جداگانه
    await Promise.all([
      writeRefCache(REF_KEYS.characters, characters),
      writeRefCache(REF_KEYS.jobs, jobs),
      writeRefCache(REF_KEYS.roles, roles),
      writeRefCache(REF_KEYS.seriousness, seriousness),
    ]);
    return { characters, jobs, roles, seriousness, liveError: null };
  } catch (err) {
    // بازگشت کش کهنه (اگر هست) با پیام خطا
    const [characters, jobs, roles, seriousness] = await Promise.all([
      db.refListCache.findUnique({ where: { key: REF_KEYS.characters } }),
      db.refListCache.findUnique({ where: { key: REF_KEYS.jobs } }),
      db.refListCache.findUnique({ where: { key: REF_KEYS.roles } }),
      db.refListCache.findUnique({ where: { key: REF_KEYS.seriousness } }),
    ]);
    const parse = (row: { dataJson: string } | null): RefListItem[] => {
      if (!row) return [];
      try { return JSON.parse(row.dataJson) as RefListItem[]; } catch { return []; }
    };
    return {
      characters: parse(characters),
      jobs: parse(jobs),
      roles: parse(roles),
      seriousness: parse(seriousness),
      liveError: err instanceof MelkApiError ? err.message : "خطا در دریافت فهرست‌های مرجع مشتریان.",
    };
  }
}

/**
 * پیکربندی تعرفه کمیسیون از سامانه مالی (fm) — عمومی با کش ۶ ساعته.
 */
export async function getCommissionConfig(forceRefresh = false): Promise<{
  configs: CommissionCityConfig[];
  liveError: string | null;
}> {
  const cfg = getMelkApiConfig();
  if (!forceRefresh) {
    const cached = await readRefCache<CommissionCityConfig[]>(REF_KEYS.commissionConfig);
    if (cached && cached.length > 0) return { configs: cached, liveError: null };
  }
  try {
    // پوشه سامانه مالی متفاوت است (بدون /api/apm استاندارد) — فراخوانی مستقیم
    const res = await armCall<unknown>({
      path: MELK_ENDPOINTS.acc.commissionConfigList,
      baseUrl: cfg.accApiBase,
      timeoutMs: cfg.timeoutMs,
      maxRetries: 1,
    });
    const configs = mapCommissionConfig(res.data ?? res);
    if (configs.length > 0) await writeRefCache(REF_KEYS.commissionConfig, configs);
    return { configs, liveError: null };
  } catch (err) {
    const cached = await readRefCache<CommissionCityConfig[]>(REF_KEYS.commissionConfig);
    return {
      configs: cached ?? [],
      liveError: err instanceof MelkApiError ? err.message : "خطا در دریافت تعرفه کمیسیون.",
    };
  }
}

/**
 * فقط-کش تعرفه کمیسیون — بدون هیچ HTTP زنده (E.2 دستور PHASE 2):
 * مسیر رندر بینش ایجنت مالی هرگز I/O شبکه ندارد؛ کش را روت‌ها/همگام‌سازی
 * پر می‌کنند و اگر خالی/کهنه باشد بینش با هشدار «در دسترس نیست» ساخته می‌شود.
 */
export async function getCachedCommissionConfig(): Promise<{
  configs: CommissionCityConfig[];
  liveError: string | null;
}> {
  const cached = await readRefCache<CommissionCityConfig[]>(REF_KEYS.commissionConfig);
  if (cached && cached.length > 0) return { configs: cached, liveError: null };
  return {
    configs: [],
    liveError: "تعرفه کمیسیون در کش محلی موجود نیست — با باز کردن صفحه مالی یا همگام‌سازی بعدی تازه می‌شود.",
  };
}

/**
 * فقط-کش پیکربندی شاخص قیمت — بدون هیچ HTTP زنده (E.2 دستور PHASE 2).
 */
export async function getCachedPriceIndexConfigs(): Promise<{
  indices: PriceIndexConfig[];
  liveError: string | null;
}> {
  const cached = await readRefCache<PriceIndexConfig[]>(REF_KEYS.priceIndices);
  if (cached && cached.length > 0) return { indices: cached, liveError: null };
  return {
    indices: [],
    liveError: "پیکربندی شاخص قیمت در کش محلی موجود نیست — با باز کردن صفحه شاخص قیمت یا همگام‌سازی بعدی تازه می‌شود.",
  };
}

/**
 * شاخص‌های قیمت روز سامانه ARM — عمومی با کش ۶ ساعته:
 * فهرست + مناطق هر شاخص + مشخصات فنی.
 */
export async function getPriceIndexConfigs(forceRefresh = false): Promise<{
  indices: PriceIndexConfig[];
  liveError: string | null;
}> {
  const cfg = getMelkApiConfig();
  if (!forceRefresh) {
    const cached = await readRefCache<PriceIndexConfig[]>(REF_KEYS.priceIndices);
    if (cached && cached.length > 0) return { indices: cached, liveError: null };
  }
  try {
    const listRes = await armCall<unknown>({
      path: MELK_ENDPOINTS.arm.currentPricesList,
      baseUrl: cfg.armApiBase,
      query: { returnList: "true" },
      timeoutMs: cfg.timeoutMs,
      maxRetries: 1,
    });
    const { rows } = extractPagedList<Record<string, unknown>>(listRes.data, (row) => (row && typeof row === "object" ? (row as Record<string, unknown>) : null));
    const indices: PriceIndexConfig[] = [];
    for (const row of rows) {
      const base = mapPriceIndexConfig(row);
      if (!base) continue;
      // مناطق و مشخصات فنی هر شاخص — عمومی
      const [areasRes, detailsRes] = await Promise.all([
        armCall<unknown>({
          path: MELK_ENDPOINTS.arm.currentPriceAreas(base.id),
          baseUrl: cfg.armApiBase,
          timeoutMs: cfg.timeoutMs,
          maxRetries: 0,
        }).catch(() => null),
        armCall<unknown>({
          path: MELK_ENDPOINTS.arm.currentPriceDetails(base.id),
          baseUrl: cfg.armApiBase,
          timeoutMs: cfg.timeoutMs,
          maxRetries: 0,
        }).catch(() => null),
      ]);
      indices.push({
        ...base,
        areas: areasRes ? mapPriceIndexAreas(areasRes.data) : [],
        details: detailsRes ? mapPriceIndexDetails(detailsRes.data) : [],
      });
    }
    if (indices.length > 0) await writeRefCache(REF_KEYS.priceIndices, indices);
    return { indices, liveError: null };
  } catch (err) {
    const cached = await readRefCache<PriceIndexConfig[]>(REF_KEYS.priceIndices);
    return {
      indices: cached ?? [],
      liveError: err instanceof MelkApiError ? err.message : "خطا در دریافت شاخص‌های قیمت روز.",
    };
  }
}
