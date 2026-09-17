/**
 * پایه مشترک پیاده‌سازی‌های Prisma — PHASE 2 (P2-01)
 * ------------------------------------------------------
 * اصول:
 *  ۱) تنها لایه‌ای که db (PrismaClient) را لمس می‌کند.
 *  ۲) نمونه PrismaClient تزریق‌پذیر است — تست‌ها پایگاه ایزوله
 *     (db/test-repository.db طبق E.3) تزریق می‌کنند؛ پیش‌فرض = db تولید.
 *  ۳) خواندن‌ها ردیف Prisma را عیناً برمی‌گردانند ( typing ساختاری با DTO) —
 *     بدون نگاشت runtime ⇒ خروجی JSON روت‌ها بایت‌به‌بایت یکسان می‌ماند.
 */
import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

/** نوع سازنده با تزریق کلاینت اختیاری */
export interface PrismaRepoDeps {
  client?: PrismaClient;
}

/** کلاینت پیش‌فرض (تولید) یا تزریقی (تست) */
export function resolveClient(deps?: PrismaRepoDeps): PrismaClient {
  return deps?.client ?? db;
}

// ==========================================================================
// P6.5-03 — ابزارهای مشترک نوشتار انبوه (Bulk Import)
// ==========================================================================

/** آمار یک دسته نوشتار انبوه — عین قرارداد interfaces/bulk-write.repository.ts */
export interface BulkWriteStats {
  created: number;
  updated: number;
  duplicates: number;
  errors: number;
}

/** هم‌ارزی مقدار با حمایت Date (مقایسه زمانی، نه مرجعی) */
export function sameBulkValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) return false;
  return a === b;
}

/**
 * §۲.۴ طراحی — merge non-null: کلیدهای تهی/undefined از update-payload حذف می‌شوند
 * تا مقدار موجود بازنویسی نشود («جدیدترین داده غیرتهی برنده»).
 */
export function mergeNonNullUpdate(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * قلب الگوی upsertBulk مشترک همه مخازن:
 *  · رکورد جدید → create (با sourceRunId)
 *  · رکورد موجود → update با merge non-null + syncedAt/sourceRunId همیشه تازه
 *  · محتوای تغییرنیافته → duplicates (فقط فیلدهای حسابرسی جابه‌جا می‌شوند)
 *  · خطای رکورد منفرد → errors (دسته را نمی‌شکند — PARTIAL در سطح خط لوله)
 */
export async function runBulkUpsert<TInput>(params: {
  rows: readonly TInput[];
  toData: (row: TInput) => Record<string, unknown>;
  findExisting: (row: TInput) => Promise<Record<string, unknown> | null>;
  createRow: (data: Record<string, unknown>) => Promise<unknown>;
  updateRow: (data: Record<string, unknown>) => Promise<unknown>;
  sourceRunId: string;
}): Promise<BulkWriteStats> {
  const stats: BulkWriteStats = { created: 0, updated: 0, duplicates: 0, errors: 0 };
  for (const row of params.rows) {
    try {
      const mapped = params.toData(row);
      const existing = await params.findExisting(row);
      if (!existing) {
        await params.createRow({ ...mapped, sourceRunId: params.sourceRunId });
        stats.created += 1;
      } else {
        const payload = mergeNonNullUpdate(mapped);
        // آیا محتوای معنوی تغییر کرده؟ (id/syncedAt/sourceRunId از تصمیم مستثنی‌اند)
        const changed = Object.entries(payload).some(([k, v]) => !sameBulkValue(existing[k], v));
        await params.updateRow({ ...payload, syncedAt: new Date(), sourceRunId: params.sourceRunId });
        if (changed) stats.updated += 1;
        else stats.duplicates += 1;
      }
    } catch {
      stats.errors += 1;
    }
  }
  return stats;
}
