/**
 * TenantResolver — Placeholder چند-مستأجری (P6.5-02 / §۵.۵ طراحی + §۱۴)
 * ------------------------------------------------------
 * مصوبه شورا (بخش B.2-۲ دستور تداوم PHASE 6.5):
 *   interface TenantResolver { resolve(session): string }
 *   پیاده‌سازی پیش‌فرض: همیشه 'melk-tabriz' (placeholder)
 *
 * ⚠️ صفر منطق فعال multi-tenant در PHASE 6.5 — فقط نقطه اتصال معماری.
 * فعال‌سازی (پرش tenantId نشست به فیلتر کوئری) = تصمیم PHASE 8+ با دستور جدید شورا.
 *
 * ✅ این فایل خالص است: صفر Prisma/db — شکل نشست ساختاری (structural) تعریف شده
 *    تا ردیف Prisma Session و SessionContext هر دو را ارضا کنند.
 */

/** شناسه مستأجر پیش‌فرض — سامانه تک‌مستأجری در این فاز (ملک تبریز) */
export const DEFAULT_TENANT_ID = "melk-tabriz";

/** شکل ساختاری نشست برای حل مستأجر — بدون وابستگی به Prisma (خالص) */
export interface TenantSession {
  personnelCode?: string | null;
  branchId?: string | null;
  accessScope?: string | null;
}

/** قرارداد حل شناسه مستأجر از نشست (مصوبه شورا B.2-۲ — لایه Repository) */
export interface TenantResolver {
  resolve(session: TenantSession | null | undefined): string;
}

/** پیاده‌سازی پیش‌فرض (placeholder): همیشه tenant پیش‌فرض — تا PHASE 8+ */
export class DefaultTenantResolver implements TenantResolver {
  resolve(_session: TenantSession | null | undefined): string {
    return DEFAULT_TENANT_ID;
  }
}

/** نمونه سراسری بدون وضعیت — تزریق‌پذیر در تست‌ها با پیاده‌سازی جایگزین */
export const defaultTenantResolver: TenantResolver = new DefaultTenantResolver();

/** تابع کمکی برای مسیرهای بدون تزریق (عین طراحی §۵.۵) */
export function resolveTenantId(_session: TenantSession | null | undefined): string {
  return DEFAULT_TENANT_ID;
}
