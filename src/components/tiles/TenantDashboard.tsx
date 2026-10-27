'use client'

/**
 * TenantDashboard — داشبورد چند-مستأجری (PN-043/فاز ۲ — شورا-ن۰۸۷)
 * ---------------------------------------------------------------------------
 * Wrapper مشترکِ دو داشبورد (ملک تبریز + ملکتون): کاشی‌های چهارگانه
 * (آگهی · درخواست · معاملات · کارشناسان) از رجیستری تزریق می‌شوند —
 * «wrapper، نه تکرار» (قانون ۱۰): یک کد، دو کاربرد.
 *
 * PN-047/گام اول-۱ (دستور مالک ۱۴۰۵/۰۷/۲۹) — هویت مستقل کاشی‌ها:
 *   · ملک تبریز:  M1 · M2 · M3 · M4
 *   · ملکتون:    M7 · M8 · M9 · M10
 * هر کاشی در هر داشبورد هویت شماره‌ای خودش را از TENANT_TILE_IDENTITY می‌گیرد.
 *
 * کاشی‌های چهارگانه prop ای با نام tenantId ندارند → عیناً بدون آن رندر می‌شوند
 * (تغییر منطق ممنوع — PN-043). تنظیمات و نقش هر کاشی از همان منابع TileShell
 * (store) خوانده می‌شود — ادغام تنظیمات پیش‌فرض + تنظیمات ذخیره‌شدهٔ کاربر.
 */

import { useEffect, useState, type ComponentType } from 'react'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { tileRegistry } from '@/core/tiles/tile-registry'
import { useAppStore } from '@/lib/client/store'
import { api } from '@/lib/client/api'
import type { TilePageProps } from '@/core/tiles/tile-contract'
import { faDigits } from '@/lib/jalali'
import {
  TENANT_TILE_IDENTITY,
  TILE_KIND_FA,
  tileIdentityLabel,
  type TenantTileKind,
} from '@/lib/tenants'

export type TenantId = 'tabriz' | 'melketun'

interface TenantDashboardProps {
  tenantId: TenantId
}

const TENANTS = {
  tabriz:   { label: 'داشبورد ملک تبریز', badge: 'ملک تبریز', identityRange: 'کاشی‌های M1 تا M4' },
  melketun: { label: 'داشبورد ملکتون',   badge: 'ملکتون',   identityRange: 'کاشی‌های M7 تا M10' },
} as const

/** ظرف مشترک کاشی‌های M1-M4 (container در تعریف خود کاشی‌ها) */
export const TENANT_CONTAINER = 'tenant-dashboards'

/**
 * PN-050 · دستور ۴ — badge تغییرات ۲۴ساعت (فقط ملکتون — خاستگاه provenance).
 * شمارش از /api/records/changes?countOnly=1 (فیلتر ۲۴h روی fieldChanges).
 * خطا/عدم ورود → badge خاموش و صادقانه مخفی (هیچ ادعای بی‌شاهد).
 */
function ChangesBadge24h() {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    const go = async () => {
      // مسیر مستقیم URL (بدون SPA): بازیابی نشست از secure storage — الگوی boot خود app
      const st = useAppStore.getState()
      if (!st.user) {
        try {
          await st.boot()
        } catch {
          /* بدون نشست → badge صادقانه مخفی */
        }
      }
      try {
        const j = await api<{ ok?: boolean; count?: number }>('/api/records/changes?range=24h&countOnly=1')
        if (alive && j?.ok) setCount(j.count ?? 0)
      } catch {
        /* خطا/عدم ورود → badge خاموش و صادقانه مخفی */
      }
    }
    void go()
    return () => {
      alive = false
    }
  }, [])
  if (count === null) return null
  return (
    <Link
      href="/dashboard/melketun/changes"
      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-bold text-primary hover:bg-primary/20 transition-colors"
      data-testid="melketun-changes-badge"
      title="پنل «تغییرات اخیر» — ویرایش متخصص، غنی‌سازی و بازگردانی"
    >
      تغییرات ۲۴ ساعت: {faDigits(count)}
    </Link>
  )
}

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
  // در SPA ریشه همین گیت با stage انجام می‌شود؛ اینجا برای مسیر مستقیم لازم است.
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

  const renderTile = (tile: { id: string; component: ComponentType<TilePageProps> } | undefined, kind: TenantTileKind) =>
    tile && allowed(tile.id) ? (
      <div className="space-y-3">
        {/* سربرگ هویت کاشی — «M7 · آگهی ملکتون» (PN-047/گام اول-۱) */}
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
          {tenantId === 'melketun' && <ChangesBadge24h />}
          <span className="text-sm bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full">
            {tenant.badge} · {tenant.identityRange}
          </span>
        </div>
      </div>

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
          {/* PN-047/گام اول-۱ — هویت مستقل: ملکتون M7-M10 · تبریز M1-M4 (منبع یگانه: TENANT_TILE_IDENTITY) */}
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
 * TileShell این کامپوننت را مانند هر کاشی دیگری با TilePageProps رندر می‌کند؛
 * داده‌ها (نقش/تنظیمات/بازگشت) درون TenantDashboard از همان store خوانده می‌شوند.
 */
export function tenantDashboardTilePage(tenantId: TenantId): ComponentType<TilePageProps> {
  const C: ComponentType<TilePageProps> = () => <TenantDashboard tenantId={tenantId} />
  C.displayName = `TenantDashboardTile(${tenantId})`
  return C
}
