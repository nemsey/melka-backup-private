'use client'

/**
 * FourListsTileChrome — PN-086 · گام ۲ (دستور مالک ۱۴۰۵/۰۸/۲۵ ساعت ۰۷:۴۵ تهران)
 * + DIR-SUPER-UPDATE-001 (گام دوم ۱۴۰۵/۰۸/۲۶): بخش «بروزرسانی فهرست فوق پیشرفته»
 * ---------------------------------------------------------------------------
 * پس از انحلال ظرف «داشبورد ملک تبریز» و صعود M1-M4 به ریشهٔ هوم (گام ۱)،
 * المان‌های زندهٔ آن داشبورد به دستور مالک در «تمام کاشی‌های M1 تا M4» حفظ
 * می‌شوند. در گام دوم امروز (ادغام بخش بروزرسانی فهرست چهارگانه با بخش
 * بروزرسانی چهار فهرست، هماهنگ با کارهای پس‌زمینه) المان نخست جای خود را
 * به بخش فوق پیشرفتهٔ یکپارچه (SuperListUpdate) داد — همچنان اولین بخش هر کاشی:
 *   · بروزرسانی فهرست فوق پیشرفته — SuperListUpdate: نمای یکپارچهٔ چهار فهرست
 *     (SyncJobState + فاز LCPP + قفل‌های زنده + غنی‌سازی + نقطهٔ ازسرگیری) +
 *     سه مسیر اجرا + نوار کارهای پس‌زمینه — همه از همان منبع حقیقت واحد.
 *   · نوار «دسترسی سریع» M1-M5 (M1آگهی·M2درخواست·M3معاملات·M4کارشناسان·M5تطبیق)
 *     به دستور مالک ۱۴۰۵/۰۸/۳۰ DIR-DESC-CLEANUP-001/ثانیاً به‌طور کامل حذف شد.
 * به‌علاوهٔ سربرگ هویت («M1 · آگهی ملک تبریز») — منبع یگانه: tenants.ts.
 *
 * قرارداد: این قاب فقط «قاب» است — منطق هیچ صفحه‌ای تغییر نمی‌کند؛
 * تنظیمات/نقش/بازگشت عیناً از همان منابع TileShell خوانده می‌شود.
 */

import type { ComponentType } from 'react'
import { QueryProvider } from '@/components/app/QueryProvider'
import { SuperListUpdate } from '@/components/tiles/SuperListUpdate'
import type { TilePageProps } from '@/core/tiles/tile-contract'
import {
  TENANT_TILE_IDENTITY,
  tileIdentityLabel,
  type TenantTileKind,
} from '@/lib/tenants'

/** نگاشت کاشی چهارگانه → شناسهٔ فهرست (منبع یکتای بخش فوق پیشرفته) */
const LIST_OF: Partial<Record<TenantTileKind, 'm1' | 'm2' | 'm3' | 'm4'>> = {
  listings: 'm1',
  requests: 'm2',
  transactions: 'm3',
  experts: 'm4',
}

/** سربرگ هویت — «M1 · آگهی ملک تبریز» (عین PN-047/گام اول-۱؛ منبع یگانه tenants.ts) */
function TileIdentityHeader({ tenantKind }: { tenantKind: TenantTileKind }) {
  const code = TENANT_TILE_IDENTITY.tabriz[tenantKind]
  return (
    <div className="flex items-center gap-2" data-tile-identity-header={code}>
      <span
        className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 font-mono text-[11px] font-bold text-primary"
        dir="ltr"
      >
        {code}
      </span>
      <p className="text-sm font-bold">{tileIdentityLabel('tabriz', tenantKind)}</p>
    </div>
  )
}

/**
 * قاب مشترک کاشی‌های M1-M4 (گام ۲ + DIR-SUPER-UPDATE-001 + DIR-DESC-CLEANUP-001):
 * بخش بروزرسانی فوق پیشرفته + سربرگ هویت بالای خودِ صفحه — بدون هیچ تغییری در منطق صفحه.
 * نوار «دسترسی سریع» M1-M5 به دستور مالک (DIR-DESC-CLEANUP-001/ثانیاً) حذف شد.
 */
export function withFourListsChrome(
  tenantKind: TenantTileKind,
  tileId: string
): (Page: ComponentType<TilePageProps>) => ComponentType<TilePageProps> {
  const listId = LIST_OF[tenantKind] ?? 'm1'
  return (Page: ComponentType<TilePageProps>) => {
    const Wrapped: ComponentType<TilePageProps> = (props) => (
      <div className="space-y-3">
        {/* گام دوم (ادغام) — بروزرسانی فهرست فوق پیشرفته: اولین بخش هر کاشی */}
        <QueryProvider>
          <SuperListUpdate listId={listId} />
        </QueryProvider>
        {/* DIR-DESC-CLEANUP-001/ثانیاً — نوار «دسترسی سریع» M1-M5 حذف شد */}
        <TileIdentityHeader tenantKind={tenantKind} />
        <Page {...props} />
      </div>
    )
    Wrapped.displayName = `FourListsTileChrome(${tileId})`
    return Wrapped
  }
}
