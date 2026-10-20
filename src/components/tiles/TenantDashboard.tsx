'use client'

/**
 * TenantDashboard — داشبورد چند-مستأجری (PN-043/فاز ۲ — شورا-ن۰۸۷)
 * ---------------------------------------------------------------------------
 * Wrapper مشترکِ دو داشبورد (ملک تبریز + ملکتون): کاشی‌های M1-M4
 * (آگهی · درخواست · معاملات · کارشناسان) از رجیستری تزریق می‌شوند —
 * «wrapper، نه تکرار» (قانون ۱۰): یک کد، دو کاربرد.
 *
 * کاشی‌های M1-M4 prop ای با نام tenantId ندارند → عیناً بدون آن رندر می‌شوند
 * (تغییر منطق ممنوع — PN-043). تنظیمات و نقش هر کاشی از همان منابع TileShell
 * (store) خوانده می‌شود — ادغام تنظیمات پیش‌فرض + تنظیمات ذخیره‌شدهٔ کاربر.
 */

import { useState, type ComponentType } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { tileRegistry } from '@/core/tiles/tile-registry'
import { useAppStore } from '@/lib/client/store'
import type { TilePageProps } from '@/core/tiles/tile-contract'

export type TenantId = 'tabriz' | 'melketun'

interface TenantDashboardProps {
  tenantId: TenantId
}

const TENANTS = {
  tabriz:   { label: 'داشبورد ملک تبریز', badge: 'ملک تبریز' },
  melketun: { label: 'داشبورد ملکتون',   badge: 'ملکتون' },
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
  const tileAccess = useAppStore((s) => s.tileAccess)
  const goBack = useAppStore((s) => s.goBack)
  const rawSettings = useAppStore((s) => s.tileSettings)
  const setTileSettings = useAppStore((s) => s.setTileSettings)

  // فرزندان ظرف tenant-dashboards به ترتیب نمایش
  // (M1 آگهی · M2 درخواست · M3 معاملات · M4 کارشناسان — بر اساس order خود کاشی‌ها)
  const children = tileRegistry.listChildren(TENANT_CONTAINER, userRole)

  // همان فرمول دسترسی هوم (PN-008 BLOCK 7) — مرز دسترسی کاشی‌ها حفظ می‌شود
  const allowed = (id: string) =>
    userRole === 'OWNER' || !tileAccess || tileAccess.tiles.includes(id) || id === 'settings'

  // props هر کاشی فرزند — همان ادغام تنظیمات TileShell (پیش‌فرض + ذخیره‌شده)
  // PN-044/فاز ۴ (شورا-ن۰۸۸): tenantId به M1-M4 تزریق می‌شود — کاشی‌های
  // چند-مستأجری داده را با آن فیلتر می‌کنند (default 'tabriz' → صفر شکستن).
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

  const renderTile = (tile: { id: string; component: ComponentType<TilePageProps> } | undefined) =>
    tile && allowed(tile.id) ? (
      <tile.component {...childPropsFor(tile.id)} />
    ) : (
      <NoAccessCard />
    )

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{tenant.label}</h1>
        <span className="text-sm bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full">
          {tenant.badge}
        </span>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="listings">آگهی</TabsTrigger>
          <TabsTrigger value="requests">درخواست</TabsTrigger>
          <TabsTrigger value="transactions">معاملات</TabsTrigger>
          <TabsTrigger value="experts">کارشناسان</TabsTrigger>
        </TabsList>

        <TabsContent value="listings">{renderTile(listingsTile)}</TabsContent>
        <TabsContent value="requests">{renderTile(requestsTile)}</TabsContent>
        <TabsContent value="transactions">{renderTile(transactionsTile)}</TabsContent>
        <TabsContent value="experts">{renderTile(expertsTile)}</TabsContent>
      </Tabs>
    </div>
  )
}

/**
 * سازندهٔ کامپوننت ظرف برای رجیستری کاشی — همان TenantDashboard با tenantId تزریق‌شده.
 * TileShell این کامپوننت را مانند هر کاشی دیگری با TilePageProps رندر می‌کند؛
 * داده‌ها (نقش/تنظیمات/بازگشت) درون TenantDashboard از همان store خوانده می‌شوند.
 */
export function tenantDashboardTilePage(tenantId: TenantId): ComponentType<TilePageProps> {
  const C: ComponentType<TilePageProps> = () => <TenantDashboard tenantId={tenantId} />
  C.displayName = `TenantDashboardTile(${tenantId})`
  return C
}
