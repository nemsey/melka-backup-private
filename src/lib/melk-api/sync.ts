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
import { syncMode } from "./sync-mode";
import { MELK_ENDPOINTS } from "./endpoints";
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

/** خواندن یک گزارش صفحه‌بندی‌شده تا انتها (با سقف ایمن صفحات) */
async function fetchAllPages<T>(
  path: string,
  armToken: string,
  maxPages: number,
  pageLimit: number,
  mapRow: (row: Record<string, unknown>, index: number, page: number, limit: number) => T | null
): Promise<{ rows: T[]; rawSummary: unknown }> {
  const cfg = getMelkApiConfig();
  const rows: T[] = [];
  let rawSummary: unknown = null;
  for (let page = 1; page <= maxPages; page++) {
    const res = await armCall<unknown>({
      path,
      baseUrl: cfg.armApiBase,
      token: armToken,
      query: { page, limit: pageLimit },
      timeoutMs: cfg.timeoutMs,
      maxRetries: 0, // در حلقه صفحه‌بندی تلاش مجدد نمی‌کنیم (صفحه بعدی خودش تازه می‌شود)
    });
    // خلاصه چهارگانه گزارش تطابق — خود پاسخ «data» است
    if (path === MELK_ENDPOINTS.arm.tradedTotal && res.data && typeof res.data === "object") {
      const d = res.data as Record<string, unknown>;
      if (typeof d.totalCount === "number" || typeof d.hasBoth === "number") {
        rawSummary = d;
      }
    }
    const { rows: pageRows, total, totalPages } = extractPagedList(res.data, (row, i) => mapRow(row, i, page, pageLimit));
    rows.push(...pageRows);
    const pages = totalPages ?? (total > 0 ? Math.ceil(total / pageLimit) : 1);
    if (page >= pages || pageRows.length === 0) break;
  }
  return { rows, rawSummary };
}

/**
 * استخراج کامل معاملات، کارشناسان، تعاملات، بازدیدها و عرضه/تقاضا از سامانه ARM
 * با توکن ARM. صفحه‌بندی به‌طور خودکار طی می‌شود (تا سقف ایمن صفحات).
 * (پیاده‌سازی داخلی — همیشه از syncFromArm استفاده کنید تا قفل همزمانی اعمال شود)
 */
async function doSyncFromArm(armToken: string): Promise<SyncResult> {
  const now = new Date();
  const incremental = syncMode() === "incremental";
  const runId = randomUUID();
  await writeSyncState({
    lastSyncedAt: now,
    // شناسه اجرا فقط در حالت افزایشی معنا دارد (legacy به آن دست نمی‌زند)
    ...(incremental ? { syncRunId: runId } : {}),
  });

  try {
    // ---------------- ۱) گزارش تطابق معاملات + خلاصه ----------------
    const { rows: transactions, rawSummary } = await fetchAllPages(
      MELK_ENDPOINTS.arm.tradedTotal,
      armToken,
      50,
      100,
      mapArmTradedRow
    );
    const summary = mapArmTradedSummary(rawSummary) ?? computeSummaryFromRows(transactions);

    // ---------------- ۲) فهرست کاربران/مشاوران ----------------
    const { rows: experts } = await fetchAllPages(MELK_ENDPOINTS.arm.realtorsList, armToken, 30, 100, mapArmRealtorRow);

    // ---------------- ۳) تعاملات مشاوران با یکدیگر ----------------
    let interactions: CrmInteraction[] = [];
    let interactionsFetched = false;
    try {
      const { rows: inRows } = await fetchAllPages(MELK_ENDPOINTS.arm.realtorInteractions, armToken, 20, 200, mapArmInteractionRow);
      interactions = inRows;
      interactionsFetched = true;
    } catch {
      // تعاملات گزارش مکمل است — نبودش نباید کل همگام‌سازی را شکست بدهد
      interactions = [];
    }

    // ---------------- ۴) بازدیدها و پیگیری‌ها (غیربحرانی) ----------------
    let visits: CrmVisit[] = [];
    let visitsFetched = false;
    try {
      const { rows: viRows } = await fetchAllPages(MELK_ENDPOINTS.arm.visitsList, armToken, 20, 100, mapArmVisitRow);
      visits = viRows;
      visitsFetched = true;
    } catch {
      visits = [];
    }

    // ---------------- ۵) گزارش عرضه و تقاضا (غیربحرانی) ----------------
    let supplyDemand: CrmSupplyDemand[] = [];
    let supplyDemandFetched = false;
    try {
      const { rows: sdRows } = await fetchAllPages(MELK_ENDPOINTS.armReports.supplyDemand, armToken, 10, 100, mapArmSupplyDemandRow);
      supplyDemand = sdRows;
      supplyDemandFetched = true;
    } catch {
      supplyDemand = [];
    }

    // ---------------- ۶) قراردادها و اسناد (صورت وضعیت‌ها) (غیربحرانی) ----------------
    // لیست + جزئیات هر قرارداد (خریداران، فروشندگان، حق‌السهم مشاوران)
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
      // P2-04 — مسیر افزایشی: upsert بر کلید طبیعی + نقطه ازسرگیری + نامه مرده
      await applyIncrementalSync(runId, {
        transactions, experts, interactions, visits, supplyDemand, contracts,
        interactionsFetched, visitsFetched, supplyDemandFetched, contractsFetched,
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
        ...toSdCreates(supplyDemand),
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

// ==========================================================================
// P2-04 — همگام‌سازی افزایشی (MELK_SYNC_MODE=incremental)
// ==========================================================================

/** نگاشت‌های upsert — عین فیلدهای toXxxCreates، فقط به‌جای عملیات Prisma شیء ورودی */
const toTxUpsert = (t: CrmTransaction): TransactionUpsertInput => ({
  id: t.id,
  contractDate: new Date(t.contractDate),
  propertyCode: t.propertyCode,
  propertyCustomer: t.propertyCustomer,
  requestCode: t.requestCode,
  requestCustomer: t.requestCustomer,
  contractHolo: t.contractHolo,
  suggestedPropertyCount: t.suggestedPropertyCount,
  eventsCount: t.eventsCount,
});

const toExUpsert = (e: CrmExpert): ExpertUpsertInput => ({
  id: e.id,
  personnelCode: e.personnelCode,
  fullName: e.fullName,
  mobile: e.mobile,
  role: e.role,
  businessTitle: e.businessTitle,
  creator: e.creator,
  active: e.active,
  createdAt: new Date(e.createdAt),
});

const toInUpsert = (i: CrmInteraction): InteractionUpsertInput => ({
  id: i.id,
  requestRealtorName: i.requestRealtorName,
  propertyRealtorName: i.propertyRealtorName,
  count: i.count,
});

const toViUpsert = (v: CrmVisit): VisitUpsertInput => ({
  id: v.id,
  propertyCode: v.propertyCode,
  requesterName: v.requesterName,
  checkerName: v.checkerName,
  propertyRealtorName: v.propertyRealtorName,
  checkTime: v.checkTime ? new Date(v.checkTime) : null,
  createdAt: new Date(v.createdAt),
  status: v.status,
});

const toSdUpsert = (s: CrmSupplyDemand): SupplyDemandUpsertInput => ({
  id: s.id,
  rangeTitle: s.rangeTitle,
  propertyCount: s.propertyCount,
  requestPercent: s.requestPercent,
  status: s.status,
});

const toContractUpsert = (c: CrmContract): ContractUpsertInput => ({
  id: c.id,
  status: c.status,
  contractHolo: c.contractHolo,
  propertyCode: c.propertyCode,
  requestCode: c.requestCode,
  contractType: c.contractType,
  creatorName: c.creatorName,
  createdAt: c.createdAt ? new Date(c.createdAt) : null,
  contractDate: c.contractDate ? new Date(c.contractDate) : null,
  documentDate: c.documentDate ? new Date(c.documentDate) : null,
  deliveryDate: c.deliveryDate ? new Date(c.deliveryDate) : null,
  propertyTitle: c.propertyTitle,
  propertyAddress: c.propertyAddress,
  buyerListJson: c.buyers.length > 0 ? JSON.stringify(c.buyers) : null,
  sellerListJson: c.sellers.length > 0 ? JSON.stringify(c.sellers) : null,
  realtorListJson: c.realtorShares.length > 0 ? JSON.stringify(c.realtorShares) : null,
  canAddRealtor: c.canAddRealtor,
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
  entity: "transactions" | "experts" | "interactions" | "visits" | "supplyDemand" | "contracts";
  rows: T[];
  /** واکشی این خانواده موفق بوده؟ (شکست واکشی ⇒ خانواده دست‌نخورده می‌ماند — تفاوت عمدی با legacy) */
  fetched: boolean;
  keyOf: (row: T) => string;
  upsert: (rows: T[]) => Promise<unknown>;
  /** کلیدهای موجود در پایگاه (برای جاروی سنگ‌قبرها) */
  listExistingKeys: () => Promise<string[]>;
  deleteByKeys: (keys: string[]) => Promise<unknown>;
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
  const txRepo = getTransactionRepository();
  const exRepo = getExpertRepository();
  const mkRepo = getMarketRepository();
  const ctRepo = getContractRepository();
  const viRepo = getVisitRepository();

  const families: IncrementalFamily<never>[] = [
    {
      entity: "transactions",
      rows: data.transactions.map(toTxUpsert) as never[],
      fetched: true,
      keyOf: (t) => (t as unknown as TransactionUpsertInput).id,
      upsert: (rows) => txRepo.upsertBatch(rows as unknown as TransactionUpsertInput[]),
      listExistingKeys: async () => (await db.transactionRecord.findMany({ select: { id: true } })).map((r) => r.id),
      deleteByKeys: (keys) => db.transactionRecord.deleteMany({ where: { id: { in: keys } } }),
    },
    {
      entity: "experts",
      rows: data.experts.map(toExUpsert) as never[],
      fetched: true,
      keyOf: (e) => (e as unknown as ExpertUpsertInput).personnelCode,
      upsert: (rows) => exRepo.upsertBatch(rows as unknown as ExpertUpsertInput[]),
      listExistingKeys: async () => (await db.expertRecord.findMany({ select: { personnelCode: true } })).map((r) => r.personnelCode),
      deleteByKeys: (keys) => db.expertRecord.deleteMany({ where: { personnelCode: { in: keys } } }),
    },
    {
      entity: "interactions",
      rows: data.interactions.map(toInUpsert) as never[],
      fetched: data.interactionsFetched,
      keyOf: (i) => (i as unknown as InteractionUpsertInput).id,
      upsert: (rows) => exRepo.upsertInteractionsBatch(rows as unknown as InteractionUpsertInput[]),
      listExistingKeys: async () => (await db.interactionRecord.findMany({ select: { id: true } })).map((r) => r.id),
      deleteByKeys: (keys) => db.interactionRecord.deleteMany({ where: { id: { in: keys } } }),
    },
    {
      entity: "visits",
      rows: data.visits.map(toViUpsert) as never[],
      fetched: data.visitsFetched,
      keyOf: (v) => (v as unknown as VisitUpsertInput).id,
      upsert: (rows) => viRepo.upsertBatch(rows as unknown as VisitUpsertInput[]),
      listExistingKeys: async () => (await db.visitRecord.findMany({ select: { id: true } })).map((r) => r.id),
      deleteByKeys: (keys) => db.visitRecord.deleteMany({ where: { id: { in: keys } } }),
    },
    {
      entity: "supplyDemand",
      rows: data.supplyDemand.map(toSdUpsert) as never[],
      fetched: data.supplyDemandFetched,
      keyOf: (s) => (s as unknown as SupplyDemandUpsertInput).id,
      upsert: (rows) => mkRepo.upsertSupplyDemandBatch(rows as unknown as SupplyDemandUpsertInput[]),
      listExistingKeys: async () => (await db.supplyDemandRecord.findMany({ select: { id: true } })).map((r) => r.id),
      deleteByKeys: (keys) => db.supplyDemandRecord.deleteMany({ where: { id: { in: keys } } }),
    },
    {
      entity: "contracts",
      rows: data.contracts.map(toContractUpsert) as never[],
      fetched: data.contractsFetched,
      keyOf: (c) => (c as unknown as ContractUpsertInput).id,
      upsert: (rows) => ctRepo.upsertBatch(rows as unknown as ContractUpsertInput[]),
      listExistingKeys: async () => (await db.contractRecord.findMany({ select: { id: true } })).map((r) => r.id),
      deleteByKeys: (keys) => db.contractRecord.deleteMany({ where: { id: { in: keys } } }),
    },
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

    const keys = family.rows.map(family.keyOf);
    let failedKeys: string[] = [];

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

    // جاروی سنگ‌قبرها: ردیف‌هایی که دیگر در سامانه نیستند (به‌جز نامه‌های مرده باز)
    try {
      const existing = await family.listExistingKeys();
      const fetchedSet = new Set(keys);
      const openDead = await openDeadLetterKeys(family.entity);
      const stale = existing.filter((k) => !fetchedSet.has(k) && !openDead.has(k));
      if (stale.length > 0) await family.deleteByKeys(stale);
    } catch {
      // جارو شکست خورد ⇒ اجرا همچنان موفق است؛ دفع بعد تمیز می‌کند
    }

    // نقطه ازسرگیری — پس از هر خانواده به‌روزرسانی می‌شود
    done.push({ entity: family.entity, count: family.rows.length, failed: failedKeys.length });
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

/** در صورت خالی‌بودن کش، داده‌های واقعی را با توکن ARM بارگذاری می‌کند */
export async function ensureSeeded(armToken?: string): Promise<{ transactions: number; experts: number; interactions: number; visits: number; supplyDemand: number; liveError?: string }> {
  const [txCount, exCount, inCount, viCount, sdCount] = await Promise.all([
    db.transactionRecord.count(),
    db.expertRecord.count(),
    db.interactionRecord.count(),
    db.visitRecord.count(),
    db.supplyDemandRecord.count(),
  ]);

  if ((txCount === 0 || exCount === 0) && armToken) {
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
 */
export async function clearCrmCacheTables(): Promise<void> {
  await db.transactionRecord.deleteMany({});
  await db.expertRecord.deleteMany({});
  await db.interactionRecord.deleteMany({});
  await db.visitRecord.deleteMany({});
  await db.supplyDemandRecord.deleteMany({});
  await db.contractRecord.deleteMany({});
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
        propertyCustomer: t.propertyCustomer,
        requestCode: t.requestCode,
        requestCustomer: t.requestCustomer,
        contractHolo: t.contractHolo,
        suggestedPropertyCount: t.suggestedPropertyCount,
        eventsCount: t.eventsCount,
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
        fullName: e.fullName,
        mobile: e.mobile,
        role: e.role,
        businessTitle: e.businessTitle,
        creator: e.creator,
        active: e.active,
        createdAt: new Date(e.createdAt),
      },
    })
  );
}

function toInCreates(rows: CrmInteraction[]) {
  return rows.map((i) =>
    db.interactionRecord.create({
      data: {
        id: i.id,
        requestRealtorName: i.requestRealtorName,
        propertyRealtorName: i.propertyRealtorName,
        count: i.count,
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
        requesterName: v.requesterName,
        checkerName: v.checkerName,
        propertyRealtorName: v.propertyRealtorName,
        checkTime: v.checkTime ? new Date(v.checkTime) : null,
        createdAt: new Date(v.createdAt),
        status: v.status,
      },
    })
  );
}

function toSdCreates(rows: CrmSupplyDemand[]) {
  return rows.map((s) =>
    db.supplyDemandRecord.create({
      data: {
        id: s.id,
        rangeTitle: s.rangeTitle,
        propertyCount: s.propertyCount,
        requestPercent: s.requestPercent,
        status: s.status,
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
        creatorName: c.creatorName,
        createdAt: c.createdAt ? new Date(c.createdAt) : null,
        contractDate: c.contractDate ? new Date(c.contractDate) : null,
        documentDate: c.documentDate ? new Date(c.documentDate) : null,
        deliveryDate: c.deliveryDate ? new Date(c.deliveryDate) : null,
        propertyTitle: c.propertyTitle,
        propertyAddress: c.propertyAddress,
        buyerListJson: c.buyers.length > 0 ? JSON.stringify(c.buyers) : null,
        sellerListJson: c.sellers.length > 0 ? JSON.stringify(c.sellers) : null,
        realtorListJson: c.realtorShares.length > 0 ? JSON.stringify(c.realtorShares) : null,
        canAddRealtor: c.canAddRealtor,
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
