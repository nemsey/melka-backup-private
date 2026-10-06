/**
 * pm-acc-sync.ts — همگام‌سازی بین‌سامانه‌ای (کارگزاری‌های ARM + داشبورد مالی ACC)
 * ------------------------------------------------------------------------------------
 * PN-008 (ثانیاً): همگام‌سازی پرسنل PM به ماژول تازهٔ src/lib/experts/profile-store.ts
 * منتقل شد (بازنویسی کامل فهرست کارشناسان). این ماژول فقط کارگزاری‌ها + مالی را نگه می‌دارد.
 *
 * شواهد پروب زندهٔ ۱۴۰۵/۰۷/۰۱ (scripts/p6512-probe*.ts):
 *   · special-properties/list: ۷۷ کارگزاری با realtor/creator/details/payPercent
 *     + info هر رکورد: ملک کامل + بند قرارداد (منبع PDF کارگزاری خود سامانه)
 *   · ACC dashboard/bestRealtor?business=: [{tradeOverviewsCount, realtorId, ...}]
 *     — کل کسب‌وکار (نه فقط حساب خود کاربر)؛ توکن ARM پذیرفته می‌شود
 *
 * اصول: فقط GET به مبدأ · upsert-only (قانون دادهٔ مقدس — هیچ رکوردی حذف نمی‌شود)
 * · لایهٔ خام عین منبع در rawJson ذخیره می‌شود · شکست هر مرحله مستقل است
 */

import { db } from "@/lib/db";
import { armCall } from "./client";
import { getMelkApiConfig } from "./config";
import { MELK_ENDPOINTS } from "./endpoints";
import { logEvent } from "@/lib/logger";
import { decryptSecret } from "@/lib/auth/crypto";

/** رویداد لاگ سبک برای مراحل بین‌سامانه‌ای (بدون تراکنش سنگین) */
function logCrossSync(operation: string, status: "ok" | "fail", detail: Record<string, unknown>): void {
  logEvent({
    category: "sync",
    operation: "sync-run",
    status,
    level: status === "fail" ? "warn" : "info",
    detail: { mode: "cross-system", stage: operation, ...detail },
  });
}

/** یک ردیف کارگزاری ARM خام */
export interface SpecialPropertyRow {
  _id: string;
  realtor?: { _id?: string; fullName?: string } | string | null;
  creator?: { _id?: string; fullName?: string } | string | null;
  details?: string[];
  createdAt?: string;
  [k: string]: unknown;
}

export interface SpecialPropertiesSyncResult {
  ok: boolean;
  total: number;
  detailed: number;
  error?: string;
}

export interface AccBestRealtorEntry {
  tradeOverviewsCount: number;
  realtorId: string;
  realtorFullName: string;
  realtorImage?: string | null;
}

// ==========================================================================
// ۲) کارگزاری‌های صادره (special-properties)
// ==========================================================================

/** استخراج کارگزاری‌ها: فهرست کامل + جزئیات هر رکورد (ملک مرتبط + درصد + بندها) */
export async function syncSpecialProperties(armToken: string): Promise<SpecialPropertiesSyncResult> {
  const cfg = getMelkApiConfig();
  const pageSize = 30;
  const maxPages = 20; // ۷۷ رکورد / ۳۰ = ۳ صفحه
  const all: SpecialPropertyRow[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= Math.min(totalPages, maxPages)) {
    const res = await armCall<unknown>({
      path: MELK_ENDPOINTS.arm.specialPropertiesList,
      baseUrl: cfg.armApiBase,
      token: armToken,
      timeoutMs: 45_000,
      maxRetries: 1,
      query: { page, limit: pageSize },
    });
    const d = res.data as Record<string, unknown>;
    const list = Array.isArray(d.list) ? (d.list as SpecialPropertyRow[]) : [];
    all.push(...list.filter((r) => r && typeof r === "object" && r._id));
    totalPages = Number(d.totalPages ?? 1) || 1;
    page += 1;
  }

  let detailed = 0;
  for (const row of all) {
    // جزئیات: ملک مرتبط + درصد + قیمت — «منبع چاپ کارگزاری صادر شده» خود سامانه
    let info: Record<string, unknown> | null = null;
    try {
      const res = await armCall<unknown>({
        path: MELK_ENDPOINTS.arm.specialPropertyInfo(String(row._id)),
        baseUrl: cfg.armApiBase,
        token: armToken,
        timeoutMs: 45_000,
        maxRetries: 0,
      });
      info = res.data as Record<string, unknown>;
      detailed += 1;
    } catch {
      info = null; // جزئیات در دسترس نیست — همان ردیف فهرست
    }

    const realtor = (info?.realtor ?? row.realtor ?? null) as { _id?: string; fullName?: string } | null;
    const creator = (info?.creator ?? row.creator ?? null) as { _id?: string; fullName?: string } | null;
    const property = (info?.property ?? null) as { _id?: string; code?: string | number } | null;
    const details = Array.isArray(row.details) ? (row.details as string[]) : [];

    await db.specialPropertyRecord.upsert({
      where: { id: String(row._id) },
      create: {
        id: String(row._id),
        realtorId: realtor?._id ? String(realtor._id) : null,
        realtorName: realtor?.fullName ?? null,
        creatorId: creator?._id ? String(creator._id) : null,
        creatorName: creator?.fullName ?? null,
        payPercent: typeof info?.payPercent === "number" ? (info.payPercent as number) : null,
        sellPrice: typeof info?.sellPriceWithPercent === "number" ? (info.sellPriceWithPercent as number) : null,
        detailsJson: details.length > 0 ? JSON.stringify(details) : null,
        propertyId: property?._id ? String(property._id) : null,
        propertyCode: property?.code !== undefined && property?.code !== null ? String(property.code) : null,
        rawJson: info ? JSON.stringify(info) : JSON.stringify(row),
        createdAt: row.createdAt ? new Date(row.createdAt) : null,
      },
      update: {
        realtorId: realtor?._id ? String(realtor._id) : null,
        realtorName: realtor?.fullName ?? null,
        creatorId: creator?._id ? String(creator._id) : null,
        creatorName: creator?.fullName ?? null,
        payPercent: typeof info?.payPercent === "number" ? (info.payPercent as number) : null,
        sellPrice: typeof info?.sellPriceWithPercent === "number" ? (info.sellPriceWithPercent as number) : null,
        detailsJson: details.length > 0 ? JSON.stringify(details) : null,
        propertyId: property?._id ? String(property._id) : null,
        propertyCode: property?.code !== undefined && property?.code !== null ? String(property.code) : null,
        rawJson: info ? JSON.stringify(info) : JSON.stringify(row),
        syncedAt: new Date(),
      },
    }).catch(() => undefined);
  }

  logCrossSync("special-properties-sync", "ok", { total: all.length, detailed });
  return { ok: true, total: all.length, detailed };
}

// ==========================================================================
// ۳) داشبورد مالی — فعال‌ترین کارشناسان (کل کسب‌وکار)
// ==========================================================================

/** P6.5-12 — توکن همگام‌سازی PM (از رکورد اتصال ماندگار) — برای روت‌ها (بدون import مستقیم db) */
export async function getPmSyncToken(): Promise<string | null> {
  const pm = await db.pmConnection.findFirst();
  return pm?.tokenEnc ? decryptSecret(pm.tokenEnc) : null;
}

/** شناسهٔ کسب‌وکار ملک تبریز — از جدیدترین قرارداد ثبت‌شده (businessId مشترک سامانه‌ها) */
export async function resolveBusinessId(): Promise<string> {
  const ct = await db.contractRecord.findFirst({ where: { businessId: { not: null } }, select: { businessId: true } });
  return ct?.businessId ?? "";
}

/** استخراج بهترین کارشناسان از سامانهٔ مالی (کش در RefListCache با TTL) */
export const ACC_BEST_REALTOR_KEY = "acc-best-realtor";
const ACC_TTL_MS = 6 * 60 * 60 * 1000; // ۶ ساعت

export async function fetchAccBestRealtor(armToken: string, businessId?: string): Promise<AccBestRealtorEntry[]> {
  const cfg = getMelkApiConfig();
  const biz = businessId || (await resolveBusinessId());
  if (!biz) return [];
  const res = await armCall<unknown>({
    path: MELK_ENDPOINTS.acc.bestRealtor,
    baseUrl: cfg.accApiBase + "api/",
    token: armToken,
    timeoutMs: 30_000,
    maxRetries: 0,
    query: { business: biz },
  });
  const list = Array.isArray(res.data) ? (res.data as AccBestRealtorEntry[]) : [];
  return list.filter((r) => r && typeof r === "object" && r.realtorId);
}

/** نسخهٔ کش‌دار — پرکردن خودکار اگر کهنه/خالی باشد */
export async function getAccBestRealtor(armToken: string | null): Promise<AccBestRealtorEntry[]> {
  const cached = await db.refListCache.findUnique({ where: { key: ACC_BEST_REALTOR_KEY } });
  if (cached && Date.now() - cached.fetchedAt.getTime() < ACC_TTL_MS) {
    try {
      const parsed = JSON.parse(cached.dataJson) as AccBestRealtorEntry[];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // کش خراب — ادامه به استخراج تازه
    }
  }
  if (!armToken) return [];
  const fresh = await fetchAccBestRealtor(armToken);
  if (fresh.length > 0) {
    await db.refListCache.upsert({
      where: { key: ACC_BEST_REALTOR_KEY },
      create: { key: ACC_BEST_REALTOR_KEY, dataJson: JSON.stringify(fresh) },
      update: { dataJson: JSON.stringify(fresh) },
    }).catch(() => undefined);
    logCrossSync("acc-best-realtor-sync", "ok", { count: fresh.length });
  }
  return fresh;
}

