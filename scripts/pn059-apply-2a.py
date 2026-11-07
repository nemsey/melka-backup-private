#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PN-059 — اعمال مجدد کامل حذف ملکتون (فاز ۲ · پس از حادثهٔ reset-guard)
همهٔ ویرایش‌های فایل‌های مشترک — عین محتوای اثبات‌شدهٔ چرخهٔ نخست.
"""
import re, sys

def sub(path, old, new, must=True):
    src = open(path).read()
    if old not in src:
        if must:
            print(f"✗ {path}: pattern not found: {old[:70]!r}")
            sys.exit(1)
        return
    src = src.replace(old, new, 1)
    open(path, "w").write(src)
    print(f"✓ {path}")

def sub_all(path, pairs):
    src = open(path).read()
    for old, new in pairs:
        if old not in src:
            print(f"✗ {path}: not found: {old[:70]!r}")
            sys.exit(1)
        src = src.replace(old, new, 1)
    open(path, "w").write(src)
    print(f"✓ {path} ({len(pairs)} edits)")

# ═══ ۱) bootstrap.ts ═══
sub_all("src/core/tiles/bootstrap.ts", [
("""// PN-043/فاز ۲ (شورا-ن۰۸۷): یکپارچه‌سازی داشبوردها —
// کاشی‌های M1-M4 به ظرف tenant-dashboards رفتند و درون دو داشبورد
// «داشبورد ملک تبریز» و «داشبورد ملکتون» (wrapper مشترک) رندر می‌شوند.
// ترتیب جدید هوم: فایل یابی ← تطبیق ← مغز ← تنظیمات ← داشبورد ملک تبریز ← داشبورد ملکتون.
// روت مستقیم کاشی‌های M1-M4 (رجیستری + lazyPage) دست‌نخورده باقی می‌ماند.
// دادهٔ همهٔ کاشی‌های حذف/ادغام‌شده در پایگاه ماندگار است (قانون دادهٔ مقدس).""",
"""// PN-043/فاز ۲ (شورا-ن۰۸۷): یکپارچه‌سازی داشبوردها —
// کاشی‌های M1-M4 به ظرف tenant-dashboards رفتند و درون «داشبورد ملک تبریز»
// (wrapper مشترک) رندر می‌شوند.
// ترتیب هوم: فایل یابی ← تطبیق ← مغز ← تنظیمات ← داشبورد ملک تبریز.
// روت مستقیم کاشی‌های M1-M4 (رجیستری + lazyPage) دست‌نخورده باقی می‌ماند.
// دادهٔ همهٔ کاشی‌های حذف/ادغام‌شده در پایگاه ماندگار است (قانون دادهٔ مقدس).
// PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱): کاشی «داشبورد ملکتون» به‌کلی حذف شد —
// به‌همراه همهٔ داده‌های tenant ملکتون (حکم صریح مالک؛ شاهد در AuditLog)."""),
("""// PN-043/فاز ۲+۳ (شورا-ن۰۸۷) — داشبوردهای tenant (wrapper مشترک M1-M4): یک کد، دو کاربرد
import "@/core/tiles/tiles/tenant-dashboard-tabriz";
import "@/core/tiles/tiles/tenant-dashboard-melketun";""",
"""// PN-043/فاز ۲+۳ (شورا-ن۰۸۷) — داشبورد tenant (wrapper مشترک M1-M4)
import "@/core/tiles/tiles/tenant-dashboard-tabriz";"""),
("""// PN-043/فاز ۲+۳ (شورا-ن۰۸۷) — داشبوردهای tenant
export { tenantDashboardTabrizTile } from "@/core/tiles/tiles/tenant-dashboard-tabriz";
export { tenantDashboardMelketunTile } from "@/core/tiles/tiles/tenant-dashboard-melketun";""",
"""// PN-043/فاز ۲+۳ (شورا-ن۰۸۷) — داشبورد tenant
export { tenantDashboardTabrizTile } from "@/core/tiles/tiles/tenant-dashboard-tabriz";"""),
])

# ═══ ۲) tenants.ts — بازنویسی کامل ═══
open("src/lib/tenants.ts", "w").write('''/**
 * Tenant keys — منبع یگانهٔ نگاشت کلید tenant به مقدار DB (PN-044/فاز ۴ — شورا-ن۰۸۸)
 * ---------------------------------------------------------------------------
 * مقدار DB 'melk-tabriz' از P6.5-02 (§۱۴ مصوبه شورا) از قبل موجود است.
 * قانون ۱۱ (صفر مداخله در دادهٔ تبریز): rename 'melk-tabriz' → 'tabriz' ممنوع.
 *
 * PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱) — حذف کامل ملکتون:
 * tenant «melketun» به‌همراه کاشی، مسیرها، خط‌لوله‌های سینک و همهٔ داده‌هایش
 * به حکم صریح مالک حذف شد. تنها tenant زنده: tabriz (ملک تبریز).
 */

export type TenantKey = "tabriz";

export const TENANT_DB_VALUES = {
  tabriz: "melk-tabriz",
} as const;

/** کلید tenant معتبر است؟ (ورودی API) */
export function isTenantKey(v: string | null | undefined): v is TenantKey {
  return v === "tabriz";
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PN-047/گام اول-۱ (دستور مالک ۱۴۰۵/۰۷/۲۹) — هویت مستقل کاشی‌های هر داشبورد
 * ---------------------------------------------------------------------------
 * «برای کاشی‌های موجود در داشبورد ملکتون هویت جداگانه قائل شو و شماره‌گذاری کن»:
 *   · ملک تبریز:  M1 آگهی · M2 درخواست · M3 معاملات · M4 کارشناسان
 *   · ملکتون (M7-M10): حذف کامل — PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱)
 * M5 (تطبیق هوشمند) و M6 (فایل‌یابی) کاشی‌های سراسریِ خارج از داشبورد
 * چند-مستأجری‌اند و شماره‌شان مشترک می‌ماند.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** کلید کاشی‌های چند-مستأجری (چهار فهرست هر داشبورد) */
export type TenantTileKind = "listings" | "requests" | "transactions" | "experts";

/** هویت شماره‌ای کاشی‌ها به تفکیک tenant — عین دستور مالک PN-047 */
export const TENANT_TILE_IDENTITY: Record<TenantKey, Record<TenantTileKind, string>> = {
  tabriz: { listings: "M1", requests: "M2", transactions: "M3", experts: "M4" },
};

/** برچسب فارسی هر کاشی (مشترک) */
export const TILE_KIND_FA: Record<TenantTileKind, string> = {
  listings: "آگهی",
  requests: "درخواست",
  transactions: "معاملات",
  experts: "کارشناسان",
};

/** برچسب کامل کسب‌وکار هر tenant */
export const TENANT_FA: Record<TenantKey, string> = {
  tabriz: "ملک تبریز",
};

/**
 * برچسب هویت کامل یک کاشی — «M1 · آگهی ملک تبریز».
 */
export function tileIdentityLabel(tenant: TenantKey, kind: TenantTileKind): string {
  return `${TENANT_TILE_IDENTITY[tenant][kind]} · ${TILE_KIND_FA[kind]} ${TENANT_FA[tenant]}`;
}

/** فقط کد هویت: «M1» */
export function tileIdentityCode(tenant: TenantKey, kind: TenantTileKind): string {
  return TENANT_TILE_IDENTITY[tenant][kind];
}

/**
 * پارامتر tenantId درخواست (اختیاری) → مقدار ستون DB.
 * تک-tenant پس از PN-059: همیشه 'melk-tabriz' (ملکتون حذف شد).
 */
export function tenantDbValue(_param: string | null | undefined): string {
  return TENANT_DB_VALUES.tabriz;
}
''')
print("✓ src/lib/tenants.ts (rewrite)")

# ═══ ۳) TenantDashboard.tsx — بازنویسی کامل ═══
open("src/components/tiles/TenantDashboard.tsx", "w").write(''''use client'

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
import { LcppSyncStatus } from '@/components/tiles/LcppSyncStatus'
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

      {/* PN-051 · فرمان ۴/۷ — نشانگر فاز A/B + بروزرسانی دستی (خط قرمز: هرگز صفحهٔ بی‌نشانگر) */}
      <QueryProvider>
        <LcppSyncStatus />
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
''')
print("✓ src/components/tiles/TenantDashboard.tsx (rewrite)")

print("PHASE-1 OK")
