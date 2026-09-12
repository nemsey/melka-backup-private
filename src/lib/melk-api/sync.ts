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

import { db } from "@/lib/db";
import { getMelkProvider } from "./provider";
import { MELK_ENDPOINTS } from "./endpoints";
import type { CrmExpert, CrmInteraction, CrmSupplyDemand, CrmTransaction, CrmVisit, TradedSummary } from "./types";
import { MelkApiError } from "./types";
import { mapArmInteractionRow, mapArmRealtorRow, mapArmTradedRow, mapArmTradedSummary, mapArmSupplyDemandRow, mapArmVisitRow, extractPagedList } from "./adapters";
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
 */
export async function syncFromArm(armToken: string): Promise<SyncResult> {
  const now = new Date();
  await writeSyncState({ lastSyncedAt: now });

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
    try {
      const { rows: inRows } = await fetchAllPages(MELK_ENDPOINTS.arm.realtorInteractions, armToken, 20, 200, mapArmInteractionRow);
      interactions = inRows;
    } catch {
      // تعاملات گزارش مکمل است — نبودش نباید کل همگام‌سازی را شکست بدهد
      interactions = [];
    }

    // ---------------- ۴) بازدیدها و پیگیری‌ها (غیربحرانی) ----------------
    let visits: CrmVisit[] = [];
    try {
      const { rows: viRows } = await fetchAllPages(MELK_ENDPOINTS.arm.visitsList, armToken, 20, 100, mapArmVisitRow);
      visits = viRows;
    } catch {
      visits = [];
    }

    // ---------------- ۵) گزارش عرضه و تقاضا (غیربحرانی) ----------------
    let supplyDemand: CrmSupplyDemand[] = [];
    try {
      const { rows: sdRows } = await fetchAllPages(MELK_ENDPOINTS.armReports.supplyDemand, armToken, 10, 100, mapArmSupplyDemandRow);
      supplyDemand = sdRows;
    } catch {
      supplyDemand = [];
    }

    // ---------------- ذخیره اتمیک در پایگاه محلی ----------------
    await db.$transaction([
      db.transactionRecord.deleteMany({}),
      db.expertRecord.deleteMany({}),
      db.interactionRecord.deleteMany({}),
      db.visitRecord.deleteMany({}),
      db.supplyDemandRecord.deleteMany({}),
      ...toTxCreates(transactions),
      ...toExCreates(experts),
      ...toInCreates(interactions),
      ...toViCreates(visits),
      ...toSdCreates(supplyDemand),
    ]);

    const successAt = new Date();
    await writeSyncState({
      lastSuccessAt: successAt,
      lastError: null,
      lastErrorCode: null,
      attempts: 0,
      summaryJson: summary ? JSON.stringify(summary) : null,
    });

    return {
      ok: true,
      transactions: transactions.length,
      experts: experts.length,
      interactions: interactions.length,
      visits: visits.length,
      supplyDemand: supplyDemand.length,
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
      sync = { ok: false, transactions: 0, experts: 0, interactions: 0, visits: 0, supplyDemand: 0, syncedAt: new Date().toISOString(), error: e.message, errorCode: e.code };
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

/** پاک‌سازی کامل کش و استخراج مجدد از سامانه واقعی (دکمه ریست اتصال) */
export async function resetCrmCache(armToken: string): Promise<SyncResult> {
  await db.transactionRecord.deleteMany({});
  await db.expertRecord.deleteMany({});
  await db.interactionRecord.deleteMany({});
  await db.visitRecord.deleteMany({});
  await db.supplyDemandRecord.deleteMany({});
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
