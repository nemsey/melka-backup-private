'use client'

/**
 * FourListsTileChrome — PN-086 · گام ۲ (دستور مالک ۱۴۰۵/۰۸/۲۵ ساعت ۰۷:۴۵ تهران)
 * ---------------------------------------------------------------------------
 * پس از انحلال ظرف «داشبورد ملک تبریز» و صعود M1-M4 به ریشهٔ هوم (گام ۱)،
 * دو المانِ زندهٔ آن داشبورد به دستور مالک در «تمام کاشی‌های M1 تا M4» حفظ
 * می‌شوند:
 *   · بروزرسانی چهار فهرست — همان FourListsUpdateBar با همان منبع حقیقت
 *     GET /api/sync/four-lists (ادغام SyncJobState + فاز LCPP + قفل‌های زنده).
 *   · نوار لینک به کاشی‌های دیگر — M1 آگهی · M2 درخواست · M3 معاملات ·
 *     M4 کارشناسان + «تطبیق» (گام ۲/ثانیاً — به صراحت افزوده شد).
 * به‌علاوهٔ سربرگ هویت («M1 · آگهی ملک تبریز») — منبع یگانه: tenants.ts.
 *
 * قرارداد: این قاب فقط «قاب» است — منطق هیچ صفحه‌ای تغییر نمی‌کند؛
 * تنظیمات/نقش/بازگشت عیناً از همان منابع TileShell خوانده می‌شود.
 */

import type { ComponentType } from 'react'
import { QueryProvider } from '@/components/app/QueryProvider'
import { FourListsUpdateBar } from '@/components/tiles/FourListsUpdateBar'
import { useAppStore } from '@/lib/client/store'
import { haptic } from '@/lib/haptics'
import type { TilePageProps } from '@/core/tiles/tile-contract'
import {
  TENANT_TILE_IDENTITY,
  TILE_KIND_FA,
  tileIdentityLabel,
  type TenantTileKind,
} from '@/lib/tenants'

/** لینک‌های نوار — چهار فهرست + تطبیق (گام ۲/ثانیاً)؛ تطبیق=M5 (شمارهٔ سراسری — tenants.ts) */
const LINKS: Array<{ tileId: string; code: string; label: string }> = [
  { tileId: 'arm-listings', code: 'M1', label: TILE_KIND_FA.listings },
  { tileId: 'arm-requests', code: 'M2', label: TILE_KIND_FA.requests },
  { tileId: 'transactions-contracts', code: 'M3', label: TILE_KIND_FA.transactions },
  { tileId: 'experts', code: 'M4', label: TILE_KIND_FA.experts },
  { tileId: 'smart-matching', code: 'M5', label: 'تطبیق' },
]

/** نوار لینک به کاشی‌های دیگر — لینکِ کاشیِ جاری خاموش؛ نادسترس‌ها پنهان */
export function TileLinkBar({ currentTileId }: { currentTileId: string }) {
  const openTile = useAppStore((s) => s.openTile)
  const userRole = useAppStore((s) => s.user?.role ?? 'CONSULTANT')
  const tileAccess = useAppStore((s) => s.tileAccess)
  // همان فرمول دسترسی هوم (PN-008 BLOCK 7) — مرز دسترسی کاشی‌ها حفظ می‌شود
  const allowed = (id: string) =>
    userRole === 'OWNER' || !tileAccess || tileAccess.tiles.includes(id) || id === 'settings'
  const links = LINKS.filter((l) => l.tileId === currentTileId || allowed(l.tileId))

  return (
    <nav
      aria-label="لینک به کاشی‌های دیگر"
      data-testid="tile-link-bar"
      className="rounded-xl border border-border bg-card p-1.5 shadow-sm"
    >
      <ul className="grid gap-1" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
        {links.map(({ tileId, code, label }) => {
          const active = tileId === currentTileId
          return (
            <li key={tileId} className="flex">
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                disabled={active}
                onClick={() => {
                  haptic('tap')
                  openTile(tileId)
                }}
                className={`flex-1 min-h-11 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                  active
                    ? 'bg-primary/10 border border-primary/30 text-primary'
                    : 'hover:bg-accent border border-transparent text-muted-foreground'
                }`}
              >
                <span className="font-mono text-[10px] font-bold opacity-80" dir="ltr" data-tile-identity={code}>
                  {code}
                </span>
                <span className="truncate">{label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
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
 * قاب مشترک کاشی‌های M1-M4 (گام ۲): بروزرسانی چهار فهرست + نوار لینک +
 * سربرگ هویت بالای خودِ صفحه — بدون هیچ تغییری در منطق صفحه.
 */
export function withFourListsChrome(
  tenantKind: TenantTileKind,
  tileId: string
): (Page: ComponentType<TilePageProps>) => ComponentType<TilePageProps> {
  return (Page: ComponentType<TilePageProps>) => {
    const Wrapped: ComponentType<TilePageProps> = (props) => (
      <div className="space-y-3">
        {/* گام ۲/اولاً — بروزرسانی چهار فهرست (همان نوار زندهٔ PN-083) */}
        <QueryProvider>
          <FourListsUpdateBar />
        </QueryProvider>
        {/* گام ۲/ثانیاً — نوار لینک به کاشی‌های دیگر (M1-M4 + تطبیق) */}
        <TileLinkBar currentTileId={tileId} />
        <TileIdentityHeader tenantKind={tenantKind} />
        <Page {...props} />
      </div>
    )
    Wrapped.displayName = `FourListsTileChrome(${tileId})`
    return Wrapped
  }
}
