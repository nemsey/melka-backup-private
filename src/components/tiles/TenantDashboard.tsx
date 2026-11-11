'use client'

/**
 * TenantDashboard — داشبورد چند-مستأجری (PN-043/فاز ۲ — شورا-ن۰۸۷)
 * ---------------------------------------------------------------------------
 * Wrapper داشبورد «ملک تبریز»: کاشی‌های چهارگانه
 * (آگهی · درخواست · معاملات · کارشناسان) از رجیستری تزریق می‌شوند.
 *
 * PN-047/گام اول-۱ (دستور مالک ۱۴۰۵/۰۷/۲۹) — هویت مستقل کاشی‌ها:
 *   · ملک تبریز:  M1 · M2 · M3 · M4
 * هر کاشی هویت شماره‌ای خودش را از TENANT_TILE_IDENTITY می‌گیرد.
 * PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱): tenant ملکتون حذف شد — تنها tabriz زنده است.
 *
 * کاشی‌های چهارگانه prop ای با نام tenantId ندارند → عیناً بدون آن رندر می‌شوند
 * (تغییر منطق ممنوع — PN-043). تنظیمات و نقش هر کاشی از همان منابع TileShell
 * (store) خوانده می‌شود — ادغام تنظیمات پیش‌فرض + تنظیمات ذخیره‌شدهٔ کاربر.
 */

import { useEffect, useState, type ComponentType } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { QueryProvider } from '@/components/app/QueryProvider'
import { FourListsUpdateBar } from '@/components/tiles/FourListsUpdateBar'
import { tileRegistry } from '@/core/tiles/tile-registry'
import { useAppStore } from '@/lib/client/store'
import type { TilePageProps } from '@/core/tiles/tile-contract'
import {
  TENANT_TILE_IDENTITY,
  TILE_KIND_FA,
  tileIdentityLabel,
  type TenantTileKind,
} from '@/lib/tenants'

export type TenantId = 'tabriz'

interface TenantDashboardProps {
  tenantId: TenantId
}

const TENANTS = {
  tabriz:   { label: 'داشبورد ملک تبریز', badge: 'ملک تبریز', identityRange: 'کاشی‌های M1 تا M4' },
} as const

/** ظرف مشترک کاشی‌های M1-M4 (container در تعریف خود کاشی‌ها) */
export const TENANT_CONTAINER = 'tenant-dashboards'

/** کارت صادقانهٔ بدون-دسترسی — همان لحن پیام خالی هوم (PN-016) */
function NoAccessCard() {
  return (
    <div
      className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-8 text-center space-y-2"
      data-testid="tenant-tile-no-access"
    >
      <p className="text-sm font-bold">دسترسی به این بخش برای نقش شما فعال نیست.</p>
      <p className="text-xs text-muted-foreground">
        برای فعال‌سازی، از مالک سامانه بخواهید کاشی را در «مدیریت دسترسی کارشناسان ملکا» مجاز کند.
      </p>
    </div>
  )
}

export function TenantDashboard({ tenantId }: TenantDashboardProps) {
  const [activeTab, setActiveTab] = useState<'listings' | 'requests' | 'transactions' | 'experts'>('listings')
  const tenant = TENANTS[tenantId]

  // همان منابع دادهٔ TileShell — نقش، دسترسی و تنظیمات از store (بدون منطق جدید)
  const userRole = useAppStore((s) => s.user?.role ?? 'CONSULTANT')
  const hasUser = useAppStore((s) => !!s.user)
  const tileAccess = useAppStore((s) => s.tileAccess)
  const goBack = useAppStore((s) => s.goBack)
  const rawSettings = useAppStore((s) => s.tileSettings)
  const setTileSettings = useAppStore((s) => s.setTileSettings)

  // PN-050 · مسیر مستقیم URL: پیش از boot هیچ کاشی رندر نشود — گرنه fetchهای
  // بی‌نشست کاشی‌ها ۴۰۱ می‌خورند و handler جهانی، نشستِ معتبرِ در حال بازیابی را
  // با logout می‌کُشد (درس زندهٔ این جلسه: DELETE /api/auth/session از رقابت boot).
  const [sessionReady, setSessionReady] = useState(hasUser)
  useEffect(() => {
    if (hasUser) {
      setSessionReady(true)
      return
    }
    let alive = true
    void useAppStore
      .getState()
      .boot()
      .catch(() => undefined)
      .finally(() => {
        if (alive) setSessionReady(!!useAppStore.getState().user)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUser])

  // فرزندان ظرف tenant-dashboards به ترتیب نمایش
  const children = tileRegistry.listChildren(TENANT_CONTAINER, userRole)

  // همان فرمول دسترسی هوم (PN-008 BLOCK 7) — مرز دسترسی کاشی‌ها حفظ می‌شود
  const allowed = (id: string) =>
    userRole === 'OWNER' || !tileAccess || tileAccess.tiles.includes(id) || id === 'settings'

  // props هر کاشی فرزند — همان ادغام تنظیمات TileShell (پیش‌فرض + ذخیره‌شده)
  const childPropsFor = (tileId: string): TilePageProps => {
    const def = tileRegistry.get(tileId)
    const defaults: Record<string, string | number | boolean> = {}
    if (def) for (const d of def.settings) defaults[d.key] = d.defaultValue
    return {
      settings: { ...defaults, ...(rawSettings[tileId] ?? {}) },
      onSettingsChange: (patch) => setTileSettings(tileId, patch),
      userRole,
      onBack: goBack,
      tenantId,
    }
  }

  const listingsTile = children.find((t) => t.id === 'arm-listings')
  const requestsTile = children.find((t) => t.id === 'arm-requests')
  const transactionsTile = children.find((t) => t.id === 'transactions-contracts')
  const expertsTile = children.find((t) => t.id === 'experts')

  const renderTile = (tile: { id: string; component: ComponentType<TilePageProps> } | undefined, kind: TenantTileKind) =>
    tile && allowed(tile.id) ? (
      <div className="space-y-3">
        {/* سربرگ هویت کاشی — «M1 · آگهی ملک تبریز» (PN-047/گام اول-۱) */}
        <div className="flex items-center gap-2" data-tile-identity-header={TENANT_TILE_IDENTITY[tenantId][kind]}>
          <span className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 font-mono text-[11px] font-bold text-primary" dir="ltr">
            {TENANT_TILE_IDENTITY[tenantId][kind]}
          </span>
          <p className="text-sm font-bold">{tileIdentityLabel(tenantId, kind)}</p>
        </div>
        <tile.component {...childPropsFor(tile.id)} />
      </div>
    ) : (
      <NoAccessCard />
    )

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{tenant.label}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full">
            {tenant.badge} · {tenant.identityRange}
          </span>
        </div>
      </div>

      {/* PN-083 · هماهنگ‌ساز چهار فهرست — نوار یکپارچهٔ M1-M4 + بروزرسانی دستی
          (خط قرمز: هرگز صفحهٔ بی‌نشانگر؛ حالا همهٔ فهرست‌ها با تنظیمات هم‌حقیقت‌اند) */}
      <QueryProvider>
        <FourListsUpdateBar />
      </QueryProvider>

      {!sessionReady ? (
        <div
          className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-8 text-center space-y-2"
          data-testid="tenant-session-boot"
        >
          <p className="text-sm font-bold">در حال بازیابی نشست…</p>
          <p className="text-xs text-muted-foreground">
            اگر این پیام ماندگار شد، از صفحهٔ اصلی با کد مدیر وارد شوید و دوباره این داشبورد را باز کنید.
          </p>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-4">
          {/* PN-047/گام اول-۱ — هویت مستقل: تبریز M1-M4 (منبع یگانه: TENANT_TILE_IDENTITY) */}
          {(['listings', 'requests', 'transactions', 'experts'] as const).map((kind) => (
            <TabsTrigger key={kind} value={kind === 'listings' ? 'listings' : kind === 'requests' ? 'requests' : kind === 'transactions' ? 'transactions' : 'experts'}>
              <span className="flex items-center gap-1">
                <span className="font-mono text-[10px] font-bold text-primary/80" data-tile-identity={TENANT_TILE_IDENTITY[tenantId][kind]}>
                  {TENANT_TILE_IDENTITY[tenantId][kind]}
                </span>
                {TILE_KIND_FA[kind]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="listings">{renderTile(listingsTile, 'listings')}</TabsContent>
        <TabsContent value="requests">{renderTile(requestsTile, 'requests')}</TabsContent>
        <TabsContent value="transactions">{renderTile(transactionsTile, 'transactions')}</TabsContent>
        <TabsContent value="experts">{renderTile(expertsTile, 'experts')}</TabsContent>
      </Tabs>
      )}
    </div>
  )
}

/**
 * سازندهٔ کامپوننت ظرف برای رجیستری کاشی — همان TenantDashboard با tenantId تزریق‌شده.
 */
export function tenantDashboardTilePage(tenantId: TenantId): ComponentType<TilePageProps> {
  const C: ComponentType<TilePageProps> = () => <TenantDashboard tenantId={tenantId} />
  C.displayName = `TenantDashboardTile(${tenantId})`
  return C
}
