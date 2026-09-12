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
 * نکته مهم: توکن ARM از نشست کاربر واردشده استفاده می‌شود (جریان
 * OTP واقعی)؛ اگر توکن منقضی شده باشد، با refreshToken تمدید می‌شود.
 */

import { db } from "@/lib/db";
import { getMelkProvider } from "./provider";
import { MELK_ENDPOINTS } from "./endpoints";
import type { CrmExpert, CrmTransaction } from "./types";
import { MelkApiError } from "./types";
import { mapArmRealtorRow, mapArmTradedRow, extractPagedList } from "./adapters";
import { armCall } from "./client";
import { getMelkApiConfig } from "./config";

/** نتیجه همگام‌سازی با جزئیات وضعیت */
export interface SyncResult {
  ok: boolean;
  transactions: number;
  experts: number;
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

/** خواندن وضعیت همگام‌سازی برای نمایش (بدون خطا پرتاب نمی‌شود) */
export async function getSyncState(): Promise<SyncStateInfo> {
  const state = await readSyncState();
  const [txCount, exCount] = await Promise.all([
    db.transactionRecord.count(),
    db.expertRecord.count(),
  ]);
  return {
    lastSyncedAt: state.lastSyncedAt?.toISOString() ?? null,
    lastSuccessAt: state.lastSuccessAt?.toISOString() ?? null,
    lastError: state.lastError,
    lastErrorCode: state.lastErrorCode,
    transactionCount: txCount,
    expertCount: exCount,
    attempts: state.attempts,
  };
}

async function writeSyncState(patch: {
  lastSyncedAt?: Date;
  lastSuccessAt?: Date;
  lastError?: string | null;
  lastErrorCode?: string | null;
  attempts?: number;
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

/**
 * استخراج کامل معاملات و کارشناسان از سامانه ARM با توکن ARM.
 * صفحه‌بندی به‌طور خودکار طی می‌شود (تا سقف ایمن ۵۰ صفحه).
 */
export async function syncFromArm(armToken: string): Promise<SyncResult> {
  const provider = getMelkProvider();
  const cfg = getMelkApiConfig();
  const now = new Date();
  await writeSyncState({ lastSyncedAt: now });

  try {
    // ---------------- معاملات (گزارش تطابق معاملات) ----------------
    const transactions: CrmTransaction[] = [];
    const TX_PAGE = 100;
    for (let page = 1; page <= 50; page++) {
      const res = await armCall<unknown>({
        path: MELK_ENDPOINTS.arm.tradedTotal,
        baseUrl: cfg.armApiBase,
        token: armToken,
        query: { page, limit: TX_PAGE },
        timeoutMs: cfg.timeoutMs,
        maxRetries: 0, // در حلقه صفحه‌بندی تلاش مجدد نمی‌کنیم (صفحه بعدی خودش تازه می‌شود)
      });
      const { rows, total, totalPages } = extractPagedList(res.data, (row, i) =>
        mapArmTradedRow(row, i, page, TX_PAGE)
      );
      transactions.push(...rows);
      const pages = totalPages ?? (total > 0 ? Math.ceil(total / TX_PAGE) : 1);
      if (page >= pages || rows.length === 0) break;
    }

    // ---------------- کارشناسان (realtors) ----------------
    const experts: CrmExpert[] = [];
    const EX_PAGE = 100;
    for (let page = 1; page <= 30; page++) {
      const res = await armCall<unknown>({
        path: MELK_ENDPOINTS.arm.realtorsList,
        baseUrl: cfg.armApiBase,
        token: armToken,
        query: { page, limit: EX_PAGE },
        timeoutMs: cfg.timeoutMs,
        maxRetries: 0,
      });
      const { rows, total, totalPages } = extractPagedList(res.data, (row, i) => mapArmRealtorRow(row, i));
      experts.push(...rows);
      const pages = totalPages ?? (total > 0 ? Math.ceil(total / EX_PAGE) : 1);
      if (page >= pages || rows.length === 0) break;
    }

    // ---------------- ذخیره اتمیک در پایگاه محلی ----------------
    await db.$transaction([
      db.transactionRecord.deleteMany({}),
      db.expertRecord.deleteMany({}),
      ...toTxCreates(transactions),
      ...toExCreates(experts),
    ]);

    const successAt = new Date();
    await writeSyncState({
      lastSuccessAt: successAt,
      lastError: null,
      lastErrorCode: null,
      attempts: 0,
    });

    return {
      ok: true,
      transactions: transactions.length,
      experts: experts.length,
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
      syncedAt: now.toISOString(),
      error: e.message,
      errorCode: e.code,
    };
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
      sync = { ok: false, transactions: 0, experts: 0, syncedAt: new Date().toISOString(), error: e.message, errorCode: e.code };
    }
  }
  return { sync, newArmToken };
}

/** در صورت خالی‌بودن کش، داده‌های واقعی را با توکن ARM بارگذاری می‌کند */
export async function ensureSeeded(armToken?: string): Promise<{ transactions: number; experts: number; liveError?: string }> {
  const [txCount, exCount] = await Promise.all([
    db.transactionRecord.count(),
    db.expertRecord.count(),
  ]);

  if ((txCount === 0 || exCount === 0) && armToken) {
    const { sync } = await syncWithRefresh(armToken, "");
    if (sync.ok) return { transactions: sync.transactions, experts: sync.experts };
    return { transactions: txCount, experts: exCount, liveError: sync.error };
  }
  return { transactions: txCount, experts: exCount };
}

/** پاک‌سازی کامل کش و استخراج مجدد از سامانه واقعی (دکمه ریست اتصال) */
export async function resetCrmCache(armToken: string): Promise<SyncResult> {
  await db.transactionRecord.deleteMany({});
  await db.expertRecord.deleteMany({});
  return syncFromArm(armToken);
}

function toTxCreates(rows: CrmTransaction[]) {
  return rows.map((t) =>
    db.transactionRecord.create({
      data: {
        id: t.id,
        dealDate: new Date(t.dealDate),
        listingCode: t.listingCode,
        requestCode: t.requestCode,
        expertCode: t.expertCode,
        expertName: t.expertName,
        price: t.price,
        district: t.district,
        propertyType: t.propertyType,
        area: t.area,
        commission: t.commission,
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
        address: e.address,
        branch: e.branch,
        active: e.active,
        joinedAt: new Date(e.joinedAt),
      },
    })
  );
}
