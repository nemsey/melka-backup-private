'use client'

/**
 * /dashboard/melketun/changes — پنل «تغییرات اخیر» (PN-050 · دستور ۴)
 * ---------------------------------------------------------------------------
 * تب «تغییرات اخیر» با فیلترها:
 *   · نوع: همه | expert_override (ویرایش متخصص) | enrichment (غنی‌سازی) | manual_revert (بازگردانی)
 *   · بازه: ۲۴ساعت | ۷روز | ۳۰روز
 * ردیف‌ها از fieldChanges رکوردهای ملکتون (provenance دستور ۲) ساخته می‌شوند.
 * دکمهٔ «بازگردانی» → POST /api/records/{id}/revert (با دیالوگ تأیید — دستور ۴).
 * دکمهٔ «جزئیات» → GET /api/records/{id}/changes (تاریخچهٔ کامل + provenance).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { api, ApiClientError } from '@/lib/client/api'
import { useAppStore } from '@/lib/client/store' // bindAuth — نشست Bearer از ذخیرهٔ SPA
import { faJalaliShortDateTime } from '@/lib/format'
import { faDigits } from '@/lib/jalali'

type ChangeKind = 'expert_override' | 'enrichment' | 'manual_revert'
type RangeKey = '24h' | '7d' | '30d'

interface RecentChangeRow {
  entity: 'property' | 'request'
  id: string
  code: string | null
  title: string | null
  field: string
  from: unknown
  to: unknown
  kind: ChangeKind
  at: string
  runId?: string
  by: string | null
}

interface RecordChangesResponse {
  ok: boolean
  entity: 'property' | 'request'
  id: string
  code: string | null
  title: string | null
  current: Record<string, unknown>
  fieldChanges: { field: string; from: unknown; to: unknown; kind: ChangeKind; at: string; runId?: string }[]
  lastSyncedValue: Record<string, { value: unknown; source: string; confidence: number; at: string }>
  lastSyncedAt: string | null
  lastModifiedBy: string | null
  lastModifiedAt: string | null
}

const KIND_META: Record<ChangeKind, { label: string; cls: string }> = {
  expert_override: { label: 'ویرایش متخصص', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  enrichment: { label: 'غنی‌سازی', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  manual_revert: { label: 'بازگردانی', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
}

const FIELD_FA: Record<string, string> = {
  ownerMobile: 'موبایل مالک',
  rawOwnerName: 'نام مالک (خام)',
  rawOwnerMobile: 'موبایل مالک (خام)',
  ownerName: 'کارشناس مسئول',
  address: 'آدرس',
  customerName: 'نام متقاضی',
  rawCustomerName: 'نام متقاضی (خام)',
  customerMobile: 'موبایل متقاضی',
  rawCustomerMobile: 'موبایل متقاضی (خام)',
  title: 'عنوان',
  status: 'وضعیت',
  price: 'قیمت',
  meterage: 'متراژ',
  areaName: 'منطقه',
  depositPrice: 'رهن',
  rentPrice: 'اجاره',
  priceFrom: 'قیمت (از)',
  priceTo: 'قیمت (تا)',
  depositBudget: 'بودجهٔ رهن',
  rentBudget: 'بودجهٔ اجاره',
  actorName: 'کارشناس ثبت‌کننده',
  armBranchTitle: 'شعبه',
}

function fieldFa(f: string): string {
  return FIELD_FA[f] ?? f
}

function showValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'number') return faDigits(v)
  const s = String(v)
  return s.length > 48 ? `${s.slice(0, 48)}…` : s
}

export default function MelketunChangesPage() {
  const { toast } = useToast()
  const userRole = useAppStore((s) => s.user?.role ?? null) // همچنین bindAuth را فعال می‌کند
  const [range, setRange] = useState<RangeKey>('24h')
  const [kind, setKind] = useState<ChangeKind | 'all'>('all')
  const [rows, setRows] = useState<RecentChangeRow[] | null>(null)
  const [count24h, setCount24h] = useState<number | null>(null)
  const [authError, setAuthError] = useState(false)
  const [busyRevert, setBusyRevert] = useState<string | null>(null)
  const [confirmRow, setConfirmRow] = useState<RecentChangeRow | null>(null)
  const [detail, setDetail] = useState<RecordChangesResponse | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const loadList = useCallback(async () => {
    try {
      const q = new URLSearchParams({ range })
      if (kind !== 'all') q.set('type', kind)
      const json = await api<{ ok: boolean; items?: RecentChangeRow[] }>(`/api/records/changes?${q.toString()}`)
      setRows(json.items ?? [])
      setAuthError(false)
    } catch (e) {
      if (e instanceof ApiClientError && (e.status === 401 || e.status === 403)) {
        setAuthError(true)
        setRows([])
        return
      }
      setRows([])
    }
  }, [range, kind])

  // badge ۲۴ساعت — همیشه، مستقل از فیلتر
  const loadBadge = useCallback(async () => {
    try {
      const json = await api<{ ok: boolean; count?: number }>('/api/records/changes?range=24h&countOnly=1')
      setCount24h(json.count ?? 0)
    } catch {
      /* badge صادقانه خالی می‌ماند */
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    void loadBadge()
  }, [loadBadge])

  const openDetail = useCallback(async (row: RecentChangeRow) => {
    try {
      const json = await api<RecordChangesResponse>(`/api/records/${encodeURIComponent(row.id)}/changes?entity=${row.entity}`)
      setDetail(json)
      setDetailOpen(true)
    } catch {
      toast({ title: 'بارگیری جزئیات ناموفق بود.' })
    }
  }, [toast])

  const doRevert = useCallback(async (row: RecentChangeRow) => {
    setBusyRevert(row.id + row.field)
    try {
      const json = await api<{ ok?: boolean; message?: string; error?: string }>(`/api/records/${encodeURIComponent(row.id)}/revert`, {
        method: 'POST',
        body: { entity: row.entity, field: row.field, confirm: true },
      })
      toast({ title: 'بازگردانی شد ✓', description: `${fieldFa(row.field)} → مقدار پیشین` })
      await Promise.all([loadList(), loadBadge()])
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.message : 'خطای شبکه'
      toast({ title: 'بازگردانی نشد', description: msg })
    } finally {
      setBusyRevert(null)
      setConfirmRow(null)
    }
  }, [toast, loadList, loadBadge])

  const summary = useMemo(() => {
    if (!rows) return null
    const byKind: Record<string, number> = { expert_override: 0, enrichment: 0, manual_revert: 0 }
    for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
    return byKind
  }, [rows])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl space-y-4 p-4 pb-16">
        {/* سربرگ */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">تغییرات اخیر — داشبورد ملکتون</h1>
            <p className="text-xs text-muted-foreground mt-1">
              تاریخچهٔ اثبات‌شدهٔ تغییرات فیلدها (provenance) — ویرایش متخصص، غنی‌سازی و بازگردانی
              {userRole === 'OWNER' ? ' · نمای مالک' : userRole ? '' : ' · بدون نشست'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary font-bold" data-testid="changes-badge-24h">
              تغییرات ۲۴ ساعت: {count24h === null ? '…' : faDigits(count24h)}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/melketun">بازگشت به داشبورد</Link>
            </Button>
          </div>
        </div>

        {authError ? (
          <Card className="p-6 text-center space-y-2">
            <p className="text-sm font-bold">برای دیدن این پنل باید با کد دسترسی وارد شوید.</p>
            <p className="text-xs text-muted-foreground">
              از صفحهٔ اصلی سامانه وارد شوید و سپس دوباره این صفحه را باز کنید.
            </p>
            <Button asChild size="sm" className="mx-auto">
              <Link href="/">رفتن به صفحهٔ ورود</Link>
            </Button>
          </Card>
        ) : (
          <Tabs defaultValue="recent" className="space-y-3">
            <TabsList className="grid w-full grid-cols-1 sm:w-fit sm:grid-cols-1">
              <TabsTrigger value="recent">تغییرات اخیر</TabsTrigger>
            </TabsList>
            <TabsContent value="recent" className="space-y-3">
              {/* فیلترها — نوع + بازه (دستور ۴) */}
              <Card className="flex flex-wrap items-center gap-3 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">نوع:</span>
                  <Select value={kind} onValueChange={(v) => setKind(v as ChangeKind | 'all')}>
                    <SelectTrigger className="h-8 w-36 text-xs" aria-label="فیلتر نوع تغییر">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">همه</SelectItem>
                      <SelectItem value="expert_override">ویرایش متخصص</SelectItem>
                      <SelectItem value="enrichment">غنی‌سازی</SelectItem>
                      <SelectItem value="manual_revert">بازگردانی</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">بازه:</span>
                  <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
                    <SelectTrigger className="h-8 w-28 text-xs" aria-label="فیلتر بازه زمانی">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">۲۴ ساعت</SelectItem>
                      <SelectItem value="7d">۷ روز</SelectItem>
                      <SelectItem value="30d">۳۰ روز</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {summary && (
                  <div className="ms-auto flex flex-wrap items-center gap-1.5 text-[11px]">
                    {Object.entries(KIND_META).map(([k, meta]) => (
                      <span key={k} className={`rounded-full border px-2 py-0.5 font-bold ${meta.cls}`}>
                        {meta.label}: {faDigits(summary[k] ?? 0)}
                      </span>
                    ))}
                  </div>
                )}
              </Card>

              {/* جدول تغییرات */}
              <Card className="overflow-hidden">
                {rows === null ? (
                  <div className="space-y-2 p-4">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : rows.length === 0 ? (
                  <div className="p-8 text-center space-y-1" data-testid="changes-empty">
                    <p className="text-sm font-bold">در این بازه تغییری ثبت نشده است.</p>
                    <p className="text-xs text-muted-foreground">
                      تغییرات پس از اولین هماهنگ‌سازی ملکتون با موتور provenance جدید اینجا ظاهر می‌شوند.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40 text-muted-foreground">
                          <th className="p-2 text-start font-bold">زمان</th>
                          <th className="p-2 text-start font-bold">موجودیت</th>
                          <th className="p-2 text-start font-bold">کد</th>
                          <th className="p-2 text-start font-bold">فیلد</th>
                          <th className="p-2 text-start font-bold">قبل → بعد</th>
                          <th className="p-2 text-start font-bold">نوع</th>
                          <th className="p-2 text-end font-bold">عملیات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={`${row.id}-${row.field}-${row.at}-${i}`} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="p-2 whitespace-nowrap text-muted-foreground">{faJalaliShortDateTime(row.at)}</td>
                            <td className="p-2 whitespace-nowrap">
                              {row.entity === 'property' ? 'آگهی' : 'درخواست'}
                            </td>
                            <td className="p-2 whitespace-nowrap font-mono" dir="ltr">{row.code ?? '—'}</td>
                            <td className="p-2 whitespace-nowrap">{fieldFa(row.field)}</td>
                            <td className="p-2 max-w-64">
                              <span className="text-muted-foreground line-through decoration-rose-300">{showValue(row.from)}</span>
                              <span className="mx-1 text-muted-foreground">→</span>
                              <span className="font-bold text-emerald-700">{showValue(row.to)}</span>
                            </td>
                            <td className="p-2 whitespace-nowrap">
                              <span className={`rounded-full border px-2 py-0.5 font-bold ${KIND_META[row.kind].cls}`}>
                                {KIND_META[row.kind].label}
                              </span>
                            </td>
                            <td className="p-2 whitespace-nowrap text-end">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() => void openDetail(row)}
                                >
                                  جزئیات
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  disabled={busyRevert === row.id + row.field}
                                  onClick={() => setConfirmRow(row)}
                                  data-testid={`revert-btn-${row.id}`}
                                >
                                  بازگردانی
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* دیالوگ تأیید بازگردانی — «بازگردانی با تأیید» (دستور ۴) */}
      <AlertDialog open={confirmRow !== null} onOpenChange={(o) => !o && setConfirmRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>بازگردانی {confirmRow ? fieldFa(confirmRow.field) : ''}؟</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  مقدار فعلی <b>{confirmRow ? showValue(confirmRow.to) : ''}</b> به مقدار پیشین{' '}
                  <b>{confirmRow ? showValue(confirmRow.from) : ''}</b> برمی‌گردد.
                </p>
                <p className="text-xs text-muted-foreground">
                  رد حسابرسی manual_revert ثبت می‌شود؛ سینک بعدی اگر CRM همچنان مقدار جدید را دهد، دوباره آن را می‌نویسد (قانون برتری متخصص).
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmRow && void doRevert(confirmRow)} data-testid="confirm-revert">
              تأیید بازگردانی
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* دیالوگ جزئیات رکورد — تاریخچهٔ کامل + provenance */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>تاریخچهٔ تغییرات</span>
              {detail?.code && (
                <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs" dir="ltr">
                  {detail.code}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="space-y-4">
              {detail.title && <p className="text-sm font-bold">{detail.title}</p>}
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>
                  آخرین منبع تغییر: <b>{detail.lastModifiedBy ?? '—'}</b> · آخرین سینک: {detail.lastSyncedAt ? faJalaliShortDateTime(detail.lastSyncedAt) : '—'}
                </p>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground">
                      <th className="p-2 text-start font-bold">زمان</th>
                      <th className="p-2 text-start font-bold">فیلد</th>
                      <th className="p-2 text-start font-bold">قبل → بعد</th>
                      <th className="p-2 text-start font-bold">نوع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...detail.fieldChanges].reverse().map((c, i) => (
                      <tr key={`${c.field}-${c.at}-${i}`} className="border-b last:border-0">
                        <td className="p-2 whitespace-nowrap text-muted-foreground">{faJalaliShortDateTime(c.at)}</td>
                        <td className="p-2 whitespace-nowrap">{fieldFa(c.field)}</td>
                        <td className="p-2">
                          <span className="text-muted-foreground">{showValue(c.from)}</span>
                          <span className="mx-1">→</span>
                          <span className="font-bold">{showValue(c.to)}</span>
                        </td>
                        <td className="p-2 whitespace-nowrap">{KIND_META[c.kind].label}</td>
                      </tr>
                    ))}
                    {detail.fieldChanges.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-muted-foreground">
                          این رکورد هنوز تغییر provenance-داری ندارد.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
